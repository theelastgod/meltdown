/**
 * What a hit on somebody else is worth, and how hard that reads (Stage 89).
 *
 * The damage half of this is checked against the simulation's own arithmetic rather than against a
 * number typed in here: `zoneDmg` in `shared/sim/world.ts` is the thing the read must not drift
 * from, and the test walks the same weapons and the same distances.
 */
import { describe, expect, it } from "vitest";
import { decay, FLASH_MIN, FLINCH_MAX, impactRead, IMPACT_FULL, landedDamage } from "../client/hit";
import { falloff, WEAPONS, WEAPON_LIST } from "../shared/weapons/manifest";

const rifle = WEAPONS.lease_breaker;

describe("what the shot was worth", () => {
  it("is the simulation's own arithmetic: zone multiplier, falloff, rounded, never under one", () => {
    for (const w of WEAPON_LIST) {
      for (const d of [0, w.range.fullTo, (w.range.fullTo + w.range.falloffTo) / 2, w.range.falloffTo, w.range.max + 5]) {
        for (const [zone, mult] of [["head", w.headMult], ["body", 1], ["legs", w.legMult]] as const) {
          // the same expression `castRay` runs, written out
          const want = Math.max(1, Math.round(w.damage * 1 * mult * falloff(w.range, d)));
          expect(landedDamage(w, zone, d)).toBe(want);
        }
      }
    }
  });

  it("holds full damage to the end of the full band and decays past it", () => {
    const near = landedDamage(rifle, "body", rifle.range.fullTo);
    expect(near).toBe(rifle.damage);
    expect(landedDamage(rifle, "body", 0)).toBe(near);
    const far = landedDamage(rifle, "body", rifle.range.falloffTo);
    expect(far).toBeLessThan(near);
    expect(landedDamage(rifle, "body", (rifle.range.fullTo + rifle.range.falloffTo) / 2)).toBeGreaterThan(far);
  });

  it("never reports a hit as nothing, even out past the weapon's reach", () => {
    expect(falloff(rifle.range, rifle.range.max + 100)).toBe(0);
    expect(landedDamage(rifle, "body", rifle.range.max + 100)).toBe(1);
  });

  it("carries the shooter's own multiplier", () => {
    expect(landedDamage(rifle, "body", 0, 1.5)).toBe(Math.round(rifle.damage * 1.5));
  });

  it("puts a head shot above a body shot above a leg shot", () => {
    const head = landedDamage(rifle, "head", 10);
    const body = landedDamage(rifle, "body", 10);
    const legs = landedDamage(rifle, "legs", 10);
    expect(head).toBeGreaterThan(body);
    expect(body).toBeGreaterThan(legs);
  });
});

describe("how hard it reads", () => {
  it("lights the body at least a little for the smallest hit there is", () => {
    const r = impactRead(1);
    expect(r.flash).toBeGreaterThanOrEqual(FLASH_MIN);
    expect(r.flash).toBeLessThan(0.55);
    expect(r.weight).toBeGreaterThan(0);
  });

  it("saturates at a hit worth a third of a file and does not go past it", () => {
    const full = impactRead(IMPACT_FULL);
    expect(full.weight).toBe(1);
    expect(full.flash).toBeCloseTo(1, 6);
    expect(full.flinch).toBeCloseTo(FLINCH_MAX, 6);
    const over = impactRead(IMPACT_FULL * 4);
    expect(over.flash).toBeCloseTo(full.flash, 6);
    expect(over.flinch).toBeCloseTo(full.flinch, 6);
  });

  it("rises with the damage, all the way up", () => {
    let prev = impactRead(1);
    for (let d = 2; d <= IMPACT_FULL; d++) {
      const r = impactRead(d);
      expect(r.flash).toBeGreaterThan(prev.flash);
      expect(r.flinch).toBeGreaterThan(prev.flinch);
      expect(r.spark).toBeGreaterThan(prev.spark);
      prev = r;
    }
  });

  it("bends a body in proportion to the force: a graze barely moves it", () => {
    // the flinch is linear in the weight where the flash is not, so a tenth of a file is a tenth of
    // the bend but well over a tenth of the light
    const tenth = impactRead(IMPACT_FULL * 0.1);
    expect(tenth.flinch).toBeCloseTo(FLINCH_MAX * 0.1, 6);
    expect(tenth.flash).toBeGreaterThan(0.5);
  });
});

describe("fading it", () => {
  it("fades by elapsed time, not per frame", () => {
    const one = decay(1, 0.2, 1);
    let many = 1;
    for (let i = 0; i < 20; i++) many = decay(many, 0.01, 1);
    expect(many).toBeCloseTo(one, 9);
  });

  it("reaches nothing at the end of its life and stays there", () => {
    expect(decay(1, 1, 1)).toBe(0);
    expect(decay(1, 4, 1)).toBe(0);
    expect(decay(0, 0.016, 1)).toBe(0);
    expect(decay(1, 0.016, 0)).toBe(0);
  });
});
