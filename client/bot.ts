import { Btn, type InputFrame } from "@shared/sim/input";
import type { PlayerState } from "@shared/sim/player";
import type { World } from "@shared/sim/world";
import { eyePos } from "@shared/sim/player";
import { wrapAngle, yawTo, pitchTo, type Vec3 } from "@shared/math/vec3";

export type BotStep =
  | { kind: "goto"; x: number; z: number; sprint?: boolean; radius?: number; timeoutTicks?: number }
  | { kind: "hold"; ticks: number; buttons?: number }
  | { kind: "look"; yaw: number; pitch?: number; ticks?: number }
  | { kind: "slide"; ticks: number; jumpAt?: number }
  | { kind: "mantle"; x: number; z: number; timeoutTicks?: number }
  | { kind: "kill"; dummyId: number; zone?: "head" | "body" | "legs"; timeoutTicks?: number }
  | { kind: "strafe"; ticks: number; period?: number; sprint?: boolean }
  | { kind: "killPlayer"; targetId: number; ticks: number; zone?: "head" | "body" | "legs" };

export interface BotTarget {
  id: number;
  x: number;
  y: number;
  z: number;
  height: number;
  alive: boolean;
}

/**
 * Deterministic scripted driver that produces InputFrames from a plan. Used by
 * the headless probe (and later by soak/netcode tests) instead of a human.
 */
export class Bot {
  private plan: BotStep[];
  private idx = 0;
  private stepTicks = 0;
  private yaw: number;
  private pitch = 0;
  readonly log: string[] = [];
  killed = false;
  private lastKills = 0;

  constructor(plan: BotStep[], startYaw: number) {
    this.plan = plan;
    this.yaw = startYaw;
  }

  get done(): boolean {
    return this.idx >= this.plan.length;
  }
  get current(): BotStep | undefined {
    return this.plan[this.idx];
  }

  private advance(reason: string): void {
    this.log.push(`t+${this.stepTicks} ${this.plan[this.idx]?.kind} → ${reason}`);
    this.idx++;
    this.stepTicks = 0;
  }

  private turnToward(targetYaw: number, targetPitch: number, rate = 0.25): void {
    this.yaw += wrapAngle(targetYaw - this.yaw) * rate;
    this.pitch += (targetPitch - this.pitch) * rate;
  }

  /** Shots fired while a killPlayer step was aimed (probe bookkeeping). */
  aimedShots = 0;

  sample(world: World, p: PlayerState, tick: number, remotes: readonly BotTarget[] = []): InputFrame {
    const step = this.current;
    let buttons = 0;
    if (!step) return { tick, buttons, yaw: this.yaw, pitch: this.pitch };
    this.stepTicks++;
    switch (step.kind) {
      case "goto": {
        const target: Vec3 = { x: step.x, y: p.pos.y, z: step.z };
        const dx = step.x - p.pos.x;
        const dz = step.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        this.turnToward(yawTo(p.pos, target), 0, 0.35);
        buttons |= Btn.Forward;
        if (step.sprint !== false) buttons |= Btn.Sprint;
        if (d < (step.radius ?? 0.6)) this.advance(`reached (${p.pos.x.toFixed(1)},${p.pos.z.toFixed(1)})`);
        else if (this.stepTicks > (step.timeoutTicks ?? 600)) this.advance("TIMEOUT");
        break;
      }
      case "hold":
        buttons |= step.buttons ?? 0;
        if (this.stepTicks >= step.ticks) this.advance("held");
        break;
      case "look":
        this.turnToward(step.yaw, step.pitch ?? 0, 0.4);
        if (this.stepTicks >= (step.ticks ?? 12)) this.advance("looked");
        break;
      case "slide":
        buttons |= Btn.Forward | Btn.Sprint | Btn.Crouch;
        if (step.jumpAt !== undefined && this.stepTicks === step.jumpAt) buttons |= Btn.Jump;
        if (this.stepTicks >= step.ticks) this.advance(`slid (stance ${p.stance})`);
        break;
      case "mantle": {
        const target: Vec3 = { x: step.x, y: p.pos.y, z: step.z };
        this.turnToward(yawTo(p.pos, target), 0, 0.4);
        buttons |= Btn.Forward;
        // jump as soon as we are close to the ledge, keep forward held so the mantle catches
        const d = Math.hypot(step.x - p.pos.x, step.z - p.pos.z);
        if (d < 1.6 && p.grounded && p.stance !== "mantle") buttons |= Btn.Jump;
        if (p.stats.mantles > 0 && p.stance === "stand" && p.grounded && this.stepTicks > 5) this.advance("mantled");
        else if (this.stepTicks > (step.timeoutTicks ?? 400)) this.advance("TIMEOUT");
        break;
      }
      case "kill": {
        const d = world.dummies.find((x) => x.id === step.dummyId);
        if (!d) {
          this.advance("no dummy");
          break;
        }
        const zoneY = step.zone === "head" ? 1.65 : step.zone === "legs" ? 0.35 : 1.0;
        const target: Vec3 = { x: d.pos.x, y: d.pos.y + zoneY, z: d.pos.z };
        const e = eyePos(p);
        this.turnToward(yawTo(e, target), pitchTo(e, target), 0.5);
        const err = Math.abs(wrapAngle(yawTo(e, target) - this.yaw)) + Math.abs(pitchTo(e, target) - this.pitch);
        if (err < 0.01 && this.stepTicks > 6) buttons |= Btn.Fire;
        if (p.stats.kills > this.lastKills) {
          this.lastKills = p.stats.kills;
          this.killed = true;
          this.advance("killed");
        } else if (this.stepTicks > (step.timeoutTicks ?? 300)) this.advance("TIMEOUT");
        break;
      }
      case "strafe": {
        const period = step.period ?? 60;
        const phase = Math.floor(this.stepTicks / period) % 2;
        buttons |= phase === 0 ? Btn.Left : Btn.Right;
        if (step.sprint) buttons |= Btn.Sprint;
        if (this.stepTicks >= step.ticks) this.advance("strafed");
        break;
      }
      case "killPlayer": {
        const t = remotes.find((r) => r.id === step.targetId);
        if (t && t.alive) {
          const zoneY = step.zone === "head" ? t.height * 0.9 : step.zone === "legs" ? t.height * 0.2 : t.height * 0.55;
          const target: Vec3 = { x: t.x, y: t.y + zoneY, z: t.z };
          const e = eyePos(p);
          const wantYaw = yawTo(e, target);
          const wantPitch = pitchTo(e, target);
          this.turnToward(wantYaw, wantPitch, 0.6);
          const err = Math.abs(wrapAngle(wantYaw - this.yaw)) + Math.abs(wantPitch - this.pitch);
          if (err < 0.015 && p.alive) {
            buttons |= Btn.Fire;
            this.aimedShots++;
          }
        }
        if (this.stepTicks >= step.ticks) this.advance(`engaged (kills ${p.stats.kills})`);
        break;
      }
    }
    return { tick, buttons, yaw: this.yaw, pitch: this.pitch };
  }
}
