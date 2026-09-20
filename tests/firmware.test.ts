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
import { WEAPONS } from "../shared/weapons/manifest";
import { FIRMWARES } from "../shared/manifest/firmwares";
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
