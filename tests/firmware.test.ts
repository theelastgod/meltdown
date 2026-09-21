/**
 * A flashed firmware reaching the round it fires (Stage 170).
 *
 * `createProjectile` read `WEAPONS.phage` — the stock manifest entry — so every property a firmware
 * changes was thrown away between the trigger and the round. PHAGE CLUSTER, a rank-20 unlock,
 * patches the blast's radius, damage and edge damage, and the sim made a stock round every time.
 */
import { describe, expect, it } from "vitest";
import { World } from "../shared/sim/world";
import { drainageYard } from "../shared/sim/level";
import { Btn, withSlot, type InputFrame } from "../shared/sim/input";
import { DEFAULT_LOADOUT, type Loadout } from "../shared/manifest/loadout";
import { weaponDefOf } from "../shared/sim/player";
import { falloff, WEAPONS } from "../shared/weapons/manifest";
import { FIRMWARES } from "../shared/manifest/firmwares";
import { BASE_HEALTH, BASE_SHIELD } from "../shared/sim/player";
import { SIM_DT } from "../shared/sim/constants";
import type { Projectile } from "../shared/sim/projectiles";

const SLOT = WEAPONS.phage.slot;

/** fire one phage round with this firmware flashed and return the round the sim actually made */
function roundFiredWith(firmwareId: string | null): { made: Projectile; def: NonNullable<(typeof WEAPONS)["phage"]["projectile"]> } {
  const level = drainageYard();
  level.dummies = [];
  const w = new World(level, { ai: false });
  const lo: Loadout = { ...DEFAULT_LOADOUT, primary: "phage", ...(firmwareId ? { firmware: { phage: firmwareId } } : {}) };
  const p = w.addPlayer(1, "BLANK", 1, lo);
  for (let i = 0; i < 5; i++) w.step(new Map([[1, { tick: w.tick, buttons: withSlot(0, SLOT), yaw: p.yaw, pitch: 0 } as InputFrame]]));
  const aim = w.aimAt(p, { x: p.pos.x, y: p.pos.y + 1, z: p.pos.z - 30 });
  w.step(new Map([[1, { tick: w.tick, buttons: Btn.Fire, yaw: aim.yaw, pitch: aim.pitch } as InputFrame]]));
  const made = w.projectiles[0];
  expect(made, "the phage did not fire").toBeTruthy();
  return { made: made!, def: weaponDefOf(p, SLOT).projectile! };
}

describe("a flashed firmware reaches the round it fires", () => {
  it("CLUSTER's wider, weaker blast is the blast the sim makes", () => {
    const stock = WEAPONS.phage.projectile!;
    const { made, def } = roundFiredWith("phage:cluster");
    // the firmware really does change these, so the test is not asserting a no-op
    expect(def.radius).toBeGreaterThan(stock.radius);
    expect(def.damage).toBeLessThan(stock.damage);
    expect(made.radius).toBe(def.radius);
    expect(made.damage).toBe(def.damage);
    expect(made.edgeDamage).toBe(def.edgeDamage);
  });

  it("LONG FUSE's fuse and gravity reach the round, not only its speed", () => {
    const stock = WEAPONS.phage.projectile!;
    const { made, def } = roundFiredWith("phage:long_fuse");
    expect(def.fuse).toBeGreaterThan(stock.fuse);
    expect(def.gravity).toBeLessThan(stock.gravity);
    expect(made.fuse).toBeCloseTo(def.fuse, 1);
    expect(made.gravity).toBeCloseTo(def.gravity, 6);
    expect(made.damage).toBe(def.damage);
  });

  it("a file with nothing flashed still fires the stock round", () => {
    const stock = WEAPONS.phage.projectile!;
    const { made } = roundFiredWith(null);
    expect(made.radius).toBe(stock.radius);
    expect(made.damage).toBe(stock.damage);
    expect(made.gravity).toBe(stock.gravity);
  });

  it("a line that names a second shot past a range actually needs that shot", () => {
    // CAPACITOR said "two shots past 25 m". The rail has no falloff, 102 ≥ 100 at 259 m.
    const hp = BASE_HEALTH + BASE_SHIELD;
    const named = FIRMWARES.filter((f) => /two shots past (\d+)\s*m/i.test(f.line));
    for (const f of named) {
      const m = f.line.match(/two shots past (\d+)\s*m/i)!;
      const past = Number(m[1]) + 1;
      const def = f.patch(WEAPONS[f.weapon]);
      const dmg = def.charge?.damage ?? def.damage;
      const dealt = Math.round(dmg * falloff(def.range, past));
      expect(dealt, `${f.id} still one-shots at ${past} m (${dealt} ≥ ${hp})`).toBeLessThan(hp);
    }
  });

  it("CAPACITOR does not advertise a second shot the rail cannot need", () => {
    const f = FIRMWARES.find((x) => x.id === "longwave:capacitor")!;
    const def = f.patch(WEAPONS.longwave);
    expect(f.line).not.toMatch(/two shots/i);
    expect(Math.round(def.charge!.damage)).toBeGreaterThanOrEqual(100);
  });

  it("a line that sells piercing cover must grant pierce the stock weapon does not have", () => {
    // OVERCHARGE said "pierces cover". Stock LONGWAVE already has charge.pierce, and pierce
    // never passes a level box — it only continues through bodies in front of the wall.
    for (const f of FIRMWARES.filter((x) => /pierces cover/i.test(x.line))) {
      const stock = WEAPONS[f.weapon];
      const patched = f.patch(stock);
      expect(stock.charge?.pierce, `${f.id} sells cover pierce the stock rail already has`).not.toBe(true);
      expect(patched.charge?.pierce, `${f.id} does not actually set pierce`).toBe(true);
    }
  });

  it("OVERCHARGE does not sell a pierce the stock rail already has", () => {
    const f = FIRMWARES.find((x) => x.id === "longwave:overcharge")!;
    expect(WEAPONS.longwave.charge!.pierce).toBe(true);
    expect(f.line).not.toMatch(/pierce/i);
  });

  it("every firmware in the manifest that patches a projectile gets that projectile", () => {
    // the structural guard: not these two firmwares, but the rule. A firmware added later that
    // changes a projectile property, or a property added to the spec, is covered without anyone
    // remembering to come back here.
    const patching = FIRMWARES.filter((f) => f.weapon === "phage" && f.patch(WEAPONS.phage).projectile);
    expect(patching.length).toBeGreaterThan(0);
    for (const f of patching) {
      const { made, def } = roundFiredWith(f.id);
      for (const k of ["radius", "damage", "edgeDamage", "gravity", "direct"] as const) {
        expect(made[k], `${f.id}: ${k} did not reach the round`).toBe(def[k]);
      }
      // the fuse has ticked once by the time the round exists
      expect(made.fuse, `${f.id}: fuse did not reach the round`).toBeCloseTo(def.fuse - SIM_DT, 5);
    }
  });
});
