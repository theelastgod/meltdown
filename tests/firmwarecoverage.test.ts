/**
 * Every weapon's mastery ladder pays at rank 20 and rank 28 (Stage 658).
 *
 * Measured before this stage: of the eight weapons, six had two firmwares each and THE DIRECTIVE
 * and CLOCKEATER had none. Those two are the campaign unlocks — the rifles the story hands the
 * player as a reward for finishing THE LEAK and the depot heist — so the weapons you earn were the
 * only ones whose ranks 20 and 28 unlocked nothing at all, while every starting weapon paid out.
 * Per weapon the dead ranks went from 7 of 29 to 9 of 29.
 *
 * The gap was invisible from any one firmware: all twelve that existed were individually correct.
 * That is why the guard is a rule over the set rather than a test per firmware — and why it is
 * `lintFirmwareSchema`, run by `lint:fairness`, rather than an assertion living only here.
 */
import { describe, expect, it } from "vitest";
import { FIRMWARES, FIRMWARE_RANKS, lintFirmwareSchema, weaponWithFirmware, type FirmwareDef } from "../shared/manifest/firmwares";
import { WEAPON_LIST, WEAPONS } from "../shared/weapons/manifest";

const NEW = ["directive:standing_order", "directive:mandate", "clockeater:second_hand", "clockeater:overwind"];

describe("every weapon's mastery ladder pays at both firmware ranks", () => {
  it("the manifest as shipped has no schema violations", () => {
    expect(lintFirmwareSchema()).toEqual([]);
  });

  it("every weapon, campaign unlocks included, has exactly one firmware at rank 20 and one at 28", () => {
    for (const w of WEAPON_LIST) {
      for (const rank of FIRMWARE_RANKS) {
        const at = FIRMWARES.filter((f) => f.weapon === w.id && f.rank === rank);
        expect(at, `${w.id} at rank ${rank}`).toHaveLength(1);
      }
    }
    expect(FIRMWARES).toHaveLength(WEAPON_LIST.length * FIRMWARE_RANKS.length);
  });

  it("catches a weapon left with nothing at a rank — the defect this stage fixed", () => {
    // the mutation: take the campaign weapons' firmwares back out and the rule must say so
    const without = FIRMWARES.filter((f) => f.weapon !== "directive" && f.weapon !== "clockeater");
    const v = lintFirmwareSchema(without);
    expect(v.map((x) => x.rule)).toContain("firmware-coverage");
    expect(v.filter((x) => x.rule === "firmware-coverage")).toHaveLength(4);
    expect(v.some((x) => x.detail.includes("rank 20"))).toBe(true);
    expect(v.some((x) => x.detail.includes("rank 28"))).toBe(true);
  });

  it("catches a second firmware crowding a rank, not just an empty one", () => {
    const dupe = [...FIRMWARES, { ...FIRMWARES.find((f) => f.id === "directive:mandate")!, id: "directive:other" }];
    const v = lintFirmwareSchema(dupe).filter((x) => x.rule === "firmware-coverage");
    expect(v).toHaveLength(1);
    expect(v[0]!.detail).toMatch(/2 firmwares at rank 28/);
  });

  it("catches a firmware that patches nothing: a rank reward the player cannot feel", () => {
    const placebo: FirmwareDef = { id: "directive:placebo", weapon: "directive", rank: 20, name: "PLACEBO", line: "NOTHING", patch: (d) => ({ ...d }) };
    const v = lintFirmwareSchema([placebo]);
    expect(v.map((x) => x.rule)).toContain("firmware-is-not-a-no-op");
  });

  it("and each of the four new firmwares really does change its weapon", () => {
    for (const id of NEW) {
      const f = FIRMWARES.find((x) => x.id === id)!;
      const patched = weaponWithFirmware(f.weapon, id);
      const stock = WEAPONS[f.weapon];
      // not `toEqual(not stock)`: name the properties, so a firmware that only renamed something
      // could not pass by moving a field the player never feels
      const felt = (["rpm", "damage", "magSize", "spread", "burst", "recoil"] as const).filter((k) => JSON.stringify(patched[k]) !== JSON.stringify(stock[k]));
      expect(felt.length, `${id} changes nothing the player can feel`).toBeGreaterThanOrEqual(2);
    }
  });

  it("the campaign weapons' firmwares are fire-pattern sidegrades, not damage creep", () => {
    // THE DIRECTIVE is at full damage out to 45 m, past the duel's longest bracket at 40 m, so a
    // damage increase on it is a gain in every bracket by construction and cannot be a sidegrade.
    // STANDING ORDER therefore changes no damage at all, and MANDATE pays for its +17.6% with a
    // rate cut that leaves the body still needing three rounds — the gain lands on the head only.
    const so = weaponWithFirmware("directive", "directive:standing_order");
    expect(so.damage).toBe(WEAPONS.directive.damage);
    expect(so.burst).toEqual({ count: 2, rpm: 500 });

    const md = weaponWithFirmware("directive", "directive:mandate");
    const hp = 100;
    expect(Math.ceil(hp / md.damage), "MANDATE still needs three rounds to the body").toBe(3);
    expect(Math.ceil(hp / WEAPONS.directive.damage)).toBe(3);
    expect(Math.ceil(hp / (md.damage * md.headMult)), "two to the head, as the line says").toBe(2);
    expect(md.rpm).toBeLessThan(WEAPONS.directive.rpm);
  });

  it("CLOCKEATER's pair trade cadence against pattern, and SECOND HAND really drops the burst", () => {
    const sh = weaponWithFirmware("clockeater", "clockeater:second_hand");
    expect(WEAPONS.clockeater.burst, "the stock weapon bursts, so dropping it is a real change").toBeTruthy();
    expect(sh.burst).toBeUndefined();
    expect(sh.rpm).toBeGreaterThan(WEAPONS.clockeater.rpm);
    expect(sh.spread).toBeGreaterThan(WEAPONS.clockeater.spread);

    const ow = weaponWithFirmware("clockeater", "clockeater:overwind");
    expect(ow.burst?.count).toBe(4);
    expect(ow.rpm, "four-round bursts are paid for with a much longer beat between them").toBeLessThan(WEAPONS.clockeater.rpm);
    expect(ow.magSize).toBeLessThan(WEAPONS.clockeater.magSize);
  });
});
