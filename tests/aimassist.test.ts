/**
 * What the touch aim assist may and may not do (Stage 34).
 *
 * Shipping any aim assist into a game whose PvP pays $CAPITAL needs the limits written down and
 * enforced, not described in a comment. These are those limits. The assist returns a multiplier the
 * input controller applies to the thumb's rotation, so the only thing it can express is *slower*;
 * every case below is a way of saying that precisely.
 */
import { describe, expect, it } from "vitest";
import { aimAssistScale, ASSIST_CONE, ASSIST_FLOOR, type AssistTarget } from "../client/aimassist";

const EYE = { x: 0, y: 1.6, z: 0 };
const always = () => true;
const never = () => false;

/** A target `dist` metres straight ahead (−z is forward), offset `off` radians to the side. */
function ahead(dist: number, off = 0, alive = true): AssistTarget {
  return { x: Math.sin(off) * dist, y: 1.6 - 0.55 * 1.8, z: -Math.cos(off) * dist, height: 1.8, alive };
}

/** Looking straight down −z. */
const YAW = 0;
const PITCH = 0;

describe("the assist can only ever slow the thumb", () => {
  it("is exactly 1 with nothing to aim at, so it is invisible in an empty street", () => {
    expect(aimAssistScale(EYE, YAW, PITCH, [], always)).toBe(1);
  });

  it("never exceeds 1, in any geometry — it cannot add rotation", () => {
    for (let off = -0.4; off <= 0.4; off += 0.01) {
      for (const d of [2, 8, 25, 60]) {
        expect(aimAssistScale(EYE, YAW, PITCH, [ahead(d, off)], always)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("never drops below the floor, so the player never loses control of their own view", () => {
    for (let off = 0; off <= ASSIST_CONE; off += 0.005) {
      expect(aimAssistScale(EYE, YAW, PITCH, [ahead(10, off)], always)).toBeGreaterThanOrEqual(ASSIST_FLOOR);
    }
  });

  it("is strongest dead centre and eases off to nothing at the edge of the cone", () => {
    const centre = aimAssistScale(EYE, YAW, PITCH, [ahead(10, 0)], always);
    const half = aimAssistScale(EYE, YAW, PITCH, [ahead(10, ASSIST_CONE / 2)], always);
    const edge = aimAssistScale(EYE, YAW, PITCH, [ahead(10, ASSIST_CONE * 0.99)], always);
    expect(centre).toBeCloseTo(ASSIST_FLOOR, 6);
    expect(half).toBeGreaterThan(centre);
    expect(edge).toBeGreaterThan(half);
    expect(edge).toBeCloseTo(1, 1);
  });

  it("is off entirely outside the cone: no pull toward a target you are not looking at", () => {
    expect(aimAssistScale(EYE, YAW, PITCH, [ahead(10, ASSIST_CONE * 1.5)], always)).toBe(1);
    expect(aimAssistScale(EYE, YAW, PITCH, [ahead(10, 0.5)], always)).toBe(1);
  });
});

describe("what it refuses to help with", () => {
  it("a dead file is not a target", () => {
    expect(aimAssistScale(EYE, YAW, PITCH, [ahead(10, 0, false)], always)).toBe(1);
  });

  it("a target behind you is not a target, however close the angle wraps", () => {
    const behind: AssistTarget = { x: 0, y: 0.61, z: 10, height: 1.8, alive: true };
    expect(aimAssistScale(EYE, YAW, PITCH, [behind], always)).toBe(1);
  });

  it("a target through a wall is not a target — the slowdown is not a wallhack", () => {
    // this is the case that matters most: a player who can feel the assist engage through geometry
    // has been handed information they did not earn, which is worse than the help is worth
    expect(aimAssistScale(EYE, YAW, PITCH, [ahead(10, 0)], never)).toBe(1);
    expect(aimAssistScale(EYE, YAW, PITCH, [ahead(10, 0)], always)).toBeCloseTo(ASSIST_FLOOR, 6);
  });

  it("picks the nearest silhouette to the crosshair when several are in the cone", () => {
    const far = ahead(10, ASSIST_CONE * 0.9);
    const near = ahead(10, ASSIST_CONE * 0.1);
    const both = aimAssistScale(EYE, YAW, PITCH, [far, near], always);
    expect(both).toBeCloseTo(aimAssistScale(EYE, YAW, PITCH, [near], always), 6);
  });
});

describe("the shape of the help, stated in numbers", () => {
  it("slows a dead-centre drag to a little over half speed and no further", () => {
    expect(ASSIST_FLOOR).toBeGreaterThan(0.5); // still more than half the player's own input
    expect(ASSIST_FLOOR).toBeLessThan(0.7); // …and enough to be worth having
  });

  it("engages within about five degrees, not across the screen", () => {
    expect((ASSIST_CONE * 180) / Math.PI).toBeLessThan(6);
    expect((ASSIST_CONE * 180) / Math.PI).toBeGreaterThan(3);
  });
});
