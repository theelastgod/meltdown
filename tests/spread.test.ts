/**
 * The reticle did not know the cone (Stage 108): the cone the sim fires, and its size on screen.
 */
import { describe, expect, it } from "vitest";
import { WEAPONS } from "../shared/weapons/manifest";
import { CONE_MIN_PX, coneNow, coneRadiusPx } from "../client/hud/spread";

describe("coneNow", () => {
  it("is the weapon's own spread with nothing on", () => {
    expect(coneNow(WEAPONS.repo_hammer, false)).toBe(WEAPONS.repo_hammer.spread);
  });
  it("the choke narrows the REPO HAMMER to its slug, the brace halves the SMG, the optic tightens the rifle", () => {
    expect(coneNow(WEAPONS.repo_hammer, true)).toBeCloseTo(WEAPONS.repo_hammer.spread * (WEAPONS.repo_hammer.alt.spreadMult ?? 1), 9);
    expect(coneNow(WEAPONS.stack_smg, true)).toBeCloseTo(WEAPONS.stack_smg.spread * (WEAPONS.stack_smg.alt.spreadMult ?? 1), 9);
    expect(coneNow(WEAPONS.lease_breaker, true)).toBeCloseTo(WEAPONS.lease_breaker.spread * (WEAPONS.lease_breaker.alt.spreadMult ?? 1), 9);
  });
  it("the firmware's spread stat scales it", () => {
    expect(coneNow(WEAPONS.repo_hammer, false, 0.8)).toBeCloseTo(WEAPONS.repo_hammer.spread * 0.8, 9);
  });
});

describe("coneRadiusPx", () => {
  it("is the cone's tangent on the screen's own scale", () => {
    // 80° vertical field into 540 px: 270 px is tan(40°) of distance
    const r = coneRadiusPx(0.055, 80, 540);
    expect(r).toBeCloseTo(Math.tan(0.055) * (270 / Math.tan((40 * Math.PI) / 180)), 6);
    expect(r).toBeGreaterThan(CONE_MIN_PX);
  });
  it("a narrower field draws the same cone larger", () => {
    expect(coneRadiusPx(0.02, 40, 540)).toBeGreaterThan(coneRadiusPx(0.02, 80, 540));
  });
  it("the LEASE-BREAKER's cone is under the drawing floor at 540 px, the choked HAMMER's too", () => {
    expect(coneRadiusPx(WEAPONS.lease_breaker.spread, 80, 540)).toBeLessThan(CONE_MIN_PX);
    expect(coneRadiusPx(coneNow(WEAPONS.repo_hammer, true), 80, 540)).toBeLessThan(CONE_MIN_PX);
  });
  it("nothing for no cone, no field or no screen", () => {
    expect(coneRadiusPx(0, 80, 540)).toBe(0);
    expect(coneRadiusPx(0.05, 0, 540)).toBe(0);
    expect(coneRadiusPx(0.05, 80, 0)).toBe(0);
  });
});
