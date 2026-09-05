import { MAX_CATCHUP_TICKS, SIM_DT, SIM_HZ } from "@shared/sim/constants";
import type { InputFrame } from "@shared/sim/input";
import { drainageYard } from "@shared/sim/level";
import { eyeHeight, type PlayerState } from "@shared/sim/player";
import { hashWorld, World, type SimEvent } from "@shared/sim/world";
import { lenXZ } from "@shared/math/vec3";
import { GameAudio } from "./audio";
import { Bot, type BotStep } from "./bot";
import { Hud } from "./hud/hud";
import { InputController } from "./input";
import { Renderer, type ViewState } from "./render/renderer";

interface Snapshot {
  x: number;
  y: number;
  z: number;
  eye: number;
  yaw: number;
  pitch: number;
  kickPitch: number;
  kickYaw: number;
}

const snap = (p: PlayerState): Snapshot => ({
  x: p.pos.x,
  y: p.pos.y,
  z: p.pos.z,
  eye: eyeHeight(p),
  yaw: p.yaw,
  pitch: p.pitch,
  kickPitch: p.kickPitch,
  kickYaw: p.kickYaw,
});

const lerpAngle = (a: number, b: number, t: number): number => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/**
 * Client game: fixed-timestep simulation (SIM_HZ) decoupled from rendering
 * (rAF), with render-time interpolation between the last two sim states.
 */
export class Game {
  readonly world: World;
  readonly player: PlayerState;
  readonly input: InputController;
  readonly renderer: Renderer;
  readonly hud: Hud;
  readonly audio = new GameAudio();
  private bot: Bot | null = null;
  private prev: Snapshot;
  private cur: Snapshot;
  private acc = 0;
  private last = -1;
  /** When false the rAF loop only renders; the sim advances via advance(). `?headless=1` starts paused. */
  realtime = !new URLSearchParams(location.search).has("headless");
  hitmarkers = false;
  readonly recentEvents: SimEvent[] = [];
  readonly stats = { ticks: 0, frames: 0, droppedTime: 0, fps: 0, simHz: 0, wallStart: 0, realtimeWall: 0, realtimeTicks: 0, maxFrameDt: 0, catchupHits: 0 };
  private stepDist = 0;
  private stepSide = 1;
  private fpsWindow = { t: 0, frames: 0, ticks: 0 };

  constructor(canvas: HTMLCanvasElement, hudRoot: HTMLElement) {
    this.world = new World(drainageYard());
    this.player = this.world.addPlayer(1, "BLANK");
    this.input = new InputController(canvas);
    this.input.yaw = this.player.yaw;
    this.renderer = new Renderer(canvas, this.world.level);
    this.hud = new Hud(hudRoot);
    this.prev = snap(this.player);
    this.cur = snap(this.player);
    this.input.onGesture = () => this.audio.resume();
    this.input.onLockChange = (l) => this.hud.setLocked(l);
    this.renderer.syncDummies(this.world.dummies);
  }

  start(): void {
    this.stats.wallStart = performance.now();
    const loop = (now: number) => {
      this.frame(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Attach a scripted driver; passing null returns control to the keyboard. */
  setBot(plan: BotStep[] | null): void {
    this.bot = plan ? new Bot(plan, this.player.yaw) : null;
    this.hud.setLocked(!!plan || this.input.isLocked);
    if (!plan) {
      this.input.yaw = this.player.yaw;
      this.input.pitch = this.player.pitch;
    }
  }

  get botStatus(): { done: boolean; log: string[]; killed: boolean; current: BotStep | undefined } | null {
    return this.bot ? { done: this.bot.done, log: this.bot.log, killed: this.bot.killed, current: this.bot.current } : null;
  }

  /** Run exactly n ticks now (deterministic; used by probes). */
  advance(n: number): void {
    for (let i = 0; i < n; i++) this.tick();
  }

  hash(): string {
    return hashWorld(this.world);
  }

  private tick(): void {
    const t = this.world.tick;
    const frame: InputFrame = this.bot ? this.bot.sample(this.world, this.player, t) : this.input.sample(t);
    this.world.step(new Map([[this.player.id, frame]]));
    this.stats.ticks++;
    this.prev = this.cur;
    this.cur = snap(this.player);
    for (const ev of this.world.drainEvents()) this.onEvent(ev);
    this.footsteps();
    this.renderer.syncDummies(this.world.dummies);
  }

  private footsteps(): void {
    const p = this.player;
    const sp = lenXZ(p.vel);
    if (p.grounded && sp > 0.8 && p.stance !== "slide") {
      this.stepDist += sp * SIM_DT;
      const stride = p.stance === "crouch" ? 1.2 : 1.9 + sp * 0.06;
      if (this.stepDist >= stride) {
        this.stepDist = 0;
        this.stepSide = -this.stepSide;
        this.audio.footstep(sp, this.stepSide * 0.25);
      }
    } else this.stepDist = Math.min(this.stepDist, 0.5);
  }

  private onEvent(ev: SimEvent): void {
    this.recentEvents.push(ev);
    if (this.recentEvents.length > 200) this.recentEvents.shift();
    switch (ev.type) {
      case "shot":
        this.audio.shot();
        this.renderer.tracer(ev.from, ev.to, ev.hit.kind === "world");
        if (ev.hit.kind === "dummy" || ev.hit.kind === "player") {
          this.audio.hit(ev.hit.zone ?? "body");
          if (ev.hit.kind === "dummy") this.renderer.flashDummy(ev.hit.id);
          if (this.hitmarkers) this.hud.flashHit();
        }
        break;
      case "kill":
        this.audio.kill();
        this.hud.killStamp();
        this.renderer.post.kick(1);
        this.hud.push(`BLANK ⟶ DUMMY-${String(ev.victimId).padStart(2, "0")} · TTK ${ev.ttkSeconds.toFixed(2)}s`, "mg");
        break;
      case "slide":
        this.audio.slide();
        break;
      case "slideJump":
        this.audio.jump();
        this.hud.push("SLIDE-JUMP", "k");
        break;
      case "jump":
        this.audio.jump();
        break;
      case "land":
        this.audio.land(ev.speed);
        break;
      case "mantle":
        this.audio.mantle();
        this.hud.push("MANTLE", "k");
        break;
      case "reloadStart":
        this.audio.reload("start");
        break;
      case "reloadEnd":
        this.audio.reload("end");
        break;
      case "dryFire":
        this.audio.dryFire();
        break;
      case "dummyRespawn":
        this.hud.push(`DUMMY-${String(ev.dummyId).padStart(2, "0")} RE-LEASED`, "am");
        this.hud.alert(`◆ VANTAGE RE-LEASE — DUMMY-${String(ev.dummyId).padStart(2, "0")} back on the ledger`, true);
        break;
      case "mantleEnd":
      case "slideEnd":
      case "death":
      case "respawn":
        break;
      default:
        break;
    }
  }

  private frame(now: number): void {
    if (this.last < 0) this.last = now;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.5) {
      // a tab switch or a very long hitch: drop the excess rather than simulate it
      this.stats.droppedTime += dt - 0.5;
      dt = 0.5;
    }
    if (this.realtime) {
      this.acc += dt;
      this.stats.realtimeWall += dt;
      if (dt > this.stats.maxFrameDt) this.stats.maxFrameDt = dt;
      let n = 0;
      while (this.acc >= SIM_DT && n < MAX_CATCHUP_TICKS) {
        this.tick();
        this.acc -= SIM_DT;
        n++;
      }
      this.stats.realtimeTicks += n;
      if (n === MAX_CATCHUP_TICKS && this.acc > SIM_DT) {
        this.stats.catchupHits++;
        this.stats.droppedTime += this.acc;
        this.acc = 0;
      }
    }
    const alpha = this.realtime ? Math.min(1, this.acc / SIM_DT) : 1;
    const a = this.prev;
    const b = this.cur;
    const p = this.player;
    const view: ViewState = {
      x: a.x + (b.x - a.x) * alpha,
      y: a.y + (b.y - a.y) * alpha,
      z: a.z + (b.z - a.z) * alpha,
      eye: b.eye,
      yaw: lerpAngle(a.yaw, b.yaw, alpha),
      pitch: a.pitch + (b.pitch - a.pitch) * alpha,
      kickPitch: a.kickPitch + (b.kickPitch - a.kickPitch) * alpha,
      kickYaw: a.kickYaw + (b.kickYaw - a.kickYaw) * alpha,
      speed: lenXZ(p.vel),
      grounded: p.grounded,
      stance: p.stance,
      reloading: p.reloadTimer > 0 ? 1 - p.reloadTimer / 1.9 : 0,
    };
    // Local view is not interpolated when the keyboard drives it: mouse look
    // must feel immediate, so use the live input angles.
    if (!this.bot && this.input.isLocked) {
      view.yaw = this.input.yaw;
      view.pitch = this.input.pitch;
    }
    this.renderer.render(view, dt);
    this.stats.frames++;
    this.fpsWindow.frames++;
    this.fpsWindow.t += dt;
    if (this.fpsWindow.t >= 0.5) {
      this.stats.fps = this.fpsWindow.frames / this.fpsWindow.t;
      this.stats.simHz = (this.stats.ticks - this.fpsWindow.ticks) / this.fpsWindow.t;
      this.fpsWindow = { t: 0, frames: 0, ticks: this.stats.ticks };
    }
    this.hud.update(p, view.speed, this.stats.fps, this.realtime ? this.stats.simHz : SIM_HZ, this.world.dummies);
  }
}
