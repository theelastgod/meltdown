/**
 * TTK harness: perfect-accuracy body shots at a given range against a
 * stationary 100 hp target, from trigger press to kill. Used by CI (Stage 4)
 * and by the Fairness Lint (Stage 6).
 */
import { Btn, withSlot, type InputFrame } from "./input";
import { drainageYard } from "./level";
import { World } from "./world";
import { WEAPONS, type WeaponId } from "../weapons/manifest";
import { v3 } from "../math/vec3";

export interface TTKResult {
  weapon: WeaponId;
  mode: "primary" | "alt";
  range: number;
  seconds: number;
  ticks: number;
  shots: number;
  killed: boolean;
}

export function measureTTK(weapon: WeaponId, mode: "primary" | "alt", range: number, maxSeconds = 6): TTKResult {
  const level = drainageYard();
  // the clear lane along z=0 from the west wall: shooter at x=-29, target down +x
  level.dummies = [{ id: 1, pos: v3(-29 + range, 0, 0) }];
  const world = new World(level, { ai: false, seed: 42 });
  const p = world.addPlayer(1, "HARNESS");
  p.pos.x = -29;
  p.pos.y = 0;
  p.pos.z = 0;
  p.yaw = -Math.PI / 2;
  const def = WEAPONS[weapon];
  const chest = { x: -29 + range, y: 0.95, z: 0 };
  const stepWith = (buttons: number) => {
    // perfect accuracy: a mastered player compensates both the visible view kick and the learned pattern
    const aim = world.aimAt(p, chest);
    const wst = p.weapon;
    const f: InputFrame = { tick: world.tick, buttons, yaw: aim.yaw - (wst.kickYaw + wst.patX), pitch: aim.pitch - (wst.kickPitch + wst.patY) };
    world.step(new Map([[1, f]]));
    return world.drainEvents();
  };
  // settle, select the weapon, wait out the swap
  for (let i = 0; i < 20; i++) stepWith(0);
  stepWith(withSlot(0, def.slot));
  for (let i = 0; i < 30; i++) stepWith(0);
  let firstTick = -1;
  let shots = 0;
  let killed = false;
  let killTick = -1;
  const maxTicks = Math.round(maxSeconds * 60);
  for (let i = 0; i < maxTicks && !killed; i++) {
    let buttons = 0;
    if (def.cls === "charge") {
      // primary: hold to full charge then release; alt: tap quickshot
      if (mode === "alt") buttons = i % 2 === 0 ? Btn.Alt : 0;
      else buttons = p.weapon.charge >= 1 ? 0 : Btn.Fire;
    } else if (def.cls === "melee" && mode === "alt") {
      buttons = i === 0 ? Btn.Alt : Btn.Fire;
    } else if (def.alt.kind === "slug" && mode === "alt") {
      buttons = i === 0 ? Btn.Alt | Btn.Fire : Btn.Fire;
    } else if (def.alt.kind === "sticky" && mode === "alt") {
      buttons = i % 2 === 0 ? Btn.Alt : 0;
    } else if ((def.alt.kind === "ads" || def.alt.kind === "brace") && mode === "alt") {
      buttons = Btn.Fire | Btn.Alt;
    } else buttons = Btn.Fire;
    const events = stepWith(buttons);
    for (const e of events) {
      if (e.type === "fire" || (e.type === "throw")) {
        shots++;
        if (firstTick < 0) firstTick = world.tick - 1;
      }
      if (e.type === "chargeStart" && firstTick < 0) firstTick = world.tick - 1;
      if (e.type === "lunge" && firstTick < 0) firstTick = world.tick - 1;
      if (e.type === "kill" && e.victimKind === "dummy") {
        killed = true;
        killTick = world.tick - 1;
      }
    }
  }
  const ticks = killed ? killTick - firstTick : maxTicks;
  return { weapon, mode, range, seconds: ticks / 60, ticks, shots, killed };
}

export function ttkTable(): TTKResult[] {
  const out: TTKResult[] = [];
  for (const def of Object.values(WEAPONS)) {
    out.push(measureTTK(def.id, "primary", def.range.ideal));
    out.push(measureTTK(def.id, "alt", def.range.ideal));
  }
  return out;
}
