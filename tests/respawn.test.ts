/**
 * What a file comes back from its own death holding (Stage 168).
 *
 * `respawnPlayer` calls `resetWeaponState`, which assigns a whole fresh `createWeaponState()` over
 * the live one — and that fresh state hardcodes `slot: 1` and the stock magazines. The chosen
 * primary and the firmware magazines were applied once, at `setLoadout`, and never again.
 */
import { describe, expect, it } from "vitest";
import { World } from "../shared/sim/world";
import { levelById } from "../shared/sim/level";
import { WEAPONS } from "../shared/weapons/manifest";
import { DEFAULT_LOADOUT, type Loadout } from "../shared/manifest/loadout";
import { weaponDefOf, type PlayerState } from "../shared/sim/player";

const level = () => levelById("drainage_yard");

/** spawn a file with this loadout, kill it, and run the sim until it is back */
function died(loadout: Loadout): PlayerState {
  const w = new World(level(), { ai: false });
  const p = w.addPlayer(1, "BLANK", 1, loadout);
  p.alive = false;
  p.respawnTimer = 0.1;
  for (let i = 0; i < 600 && !p.alive; i++) w.step(new Map());
  expect(p.alive).toBe(true);
  return p;
}

/** the same loadout, spawned and never killed */
function fresh(loadout: Loadout): PlayerState {
  return new World(level(), { ai: false }).addPlayer(1, "BLANK", 1, loadout);
}

describe("a file comes back with the gun it attested", () => {
  for (const primary of ["lease_breaker", "stack_smg", "repo_hammer", "longwave", "phage"] as const) {
    it(`keeps ${primary} through its own death`, () => {
      const want = WEAPONS[primary].slot;
      const lo: Loadout = { ...DEFAULT_LOADOUT, primary };
      expect(fresh(lo).weapon.slot).toBe(want);
      expect(died(lo).weapon.slot).toBe(want);
    });
  }
});

describe("a firmware's magazine is a cost, not a deposit", () => {
  for (const [primary, firmwareId, stock, flashed] of [
    ["stack_smg", "stack_smg:dump_stage", 40, 34],
    ["repo_hammer", "repo_hammer:double_barrel", 6, 4],
  ] as const) {
    it(`${firmwareId} keeps its magazine through death`, () => {
      const slot = WEAPONS[primary].slot;
      const lo: Loadout = { ...DEFAULT_LOADOUT, primary, firmware: { [primary]: firmwareId } };
      const before = fresh(lo);
      expect(WEAPONS[primary].magSize).toBe(stock);
      expect(weaponDefOf(before, slot).magSize).toBe(flashed);
      expect(before.weapon.ammo[slot]).toBe(flashed);
      // the defect refunded the difference on every respawn
      expect(died(lo).weapon.ammo[slot]).toBe(flashed);
    });
  }
});

describe("the state a life starts in has one definition", () => {
  // the structural guard: a respawn and a fresh spawn of the same loadout must agree field for
  // field. Anything `setLoadout` sets that a respawn forgets fails here rather than in a match.
  for (const lo of [
    { ...DEFAULT_LOADOUT },
    { ...DEFAULT_LOADOUT, primary: "stack_smg" as const, firmware: { stack_smg: "stack_smg:dump_stage" } },
    { ...DEFAULT_LOADOUT, primary: "longwave" as const, secondary: "repo_hammer" as const },
  ]) {
    it(`a respawned ${lo.primary} holds exactly what a fresh spawn holds`, () => {
      expect(died(lo).weapon).toEqual(fresh(lo).weapon);
    });
  }
});
