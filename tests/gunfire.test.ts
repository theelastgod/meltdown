/**
 * Somebody else's gun (Stage 81): how loud, which side, and how long the sound takes to get there.
 */
import { describe, expect, it } from "vitest";
import { gunCue, GUN_RANGE, PAN_NEAR, SOUND_SPEED } from "../client/gunfire";

const me = { x: 0, z: 0, yaw: 0 }; // looking down -z

describe("a shot heard from somewhere else", () => {
  it("is louder near than far, and past the range is not heard at all", () => {
    const near = gunCue(0, -5, me)!;
    const mid = gunCue(0, -40, me)!;
    const far = gunCue(0, -100, me)!;
    expect(near.gain).toBeGreaterThan(mid.gain);
    expect(mid.gain).toBeGreaterThan(far.gain);
    expect(far.gain).toBeGreaterThan(0);
    expect(gunCue(0, -GUN_RANGE, me)).toBeNull();
    expect(gunCue(0, -(GUN_RANGE + 50), me)).toBeNull();
  });

  it("carries further than a footstep does: it is still worth hearing at forty metres", () => {
    // a footstep at forty metres is gone (STEP_RANGE is 26); a shot is not
    expect(gunCue(0, -40, me)!.gain).toBeGreaterThan(0.4);
  });

  it("comes from the side the shooter is on, and from everywhere when they are on top of you", () => {
    expect(gunCue(9, 0, me)!.pan).toBeGreaterThan(0.9);
    expect(gunCue(-9, 0, me)!.pan).toBeLessThan(-0.9);
    expect(Math.abs(gunCue(0, -9, me)!.pan)).toBeLessThan(0.05);
    // a muzzle a metre to the left is not a hard-left sound, it is all around
    expect(Math.abs(gunCue(-1, 0, me)!.pan)).toBeLessThan(1 / PAN_NEAR + 0.01);
    expect(Math.abs(gunCue(-1, 0, me)!.pan)).toBeLessThan(Math.abs(gunCue(-9, 0, me)!.pan));
    // and it turns with the listener
    expect(Math.abs(gunCue(9, 0, { x: 0, z: 0, yaw: -Math.PI / 2 })!.pan)).toBeLessThan(0.05);
  });

  it("takes the time sound takes: the flash first, the crack after", () => {
    expect(gunCue(0, -3, me)!.delay).toBeCloseTo(3 / SOUND_SPEED, 6);
    const long = gunCue(0, -90, me)!;
    expect(long.delay).toBeCloseTo(90 / SOUND_SPEED, 6);
    expect(long.delay).toBeGreaterThan(0.25); // a quarter second behind what you saw
    expect(long.delay).toBeGreaterThan(gunCue(0, -9, me)!.delay);
  });

  it("arrives duller the further it comes", () => {
    expect(gunCue(0, -2, me)!.muffle).toBeLessThan(0.05);
    expect(gunCue(0, -60, me)!.muffle).toBeCloseTo(0.5, 2);
    expect(gunCue(0, -110, me)!.muffle).toBeGreaterThan(0.9);
  });

  it("reports the distance it was measured from, for the sound that slaps back off the street", () => {
    expect(gunCue(3, -4, me)!.distance).toBeCloseTo(5, 6);
  });
});
