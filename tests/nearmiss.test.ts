/**
 * The round that missed you (Stage 99): the closest approach, the reach, the side, and what does
 * not count.
 */
import { describe, expect, it } from "vitest";
import { SNAP_NEAR, SNAP_REACH, shotPass } from "../client/nearmiss";

const head = { x: 0, y: 1.6, z: 0, yaw: 0 };

describe("shotPass", () => {
  it("hears a round that flies past the right ear, on the right", () => {
    // yaw 0 looks toward -z; +x is the right hand. A round flying past half a metre to the right.
    const cue = shotPass({ x: 0.5, y: 1.6, z: -10 }, { x: 0.5, y: 1.6, z: 10 }, head);
    expect(cue).not.toBeNull();
    expect(cue!.distance).toBeCloseTo(0.5, 6);
    expect(cue!.pan).toBeGreaterThan(0.9);
    expect(cue!.gain).toBeCloseTo(1 - 0.5 / SNAP_REACH, 6);
  });

  it("and one past the left ear on the left, whichever way the head is turned", () => {
    const left = shotPass({ x: -0.5, y: 1.6, z: -10 }, { x: -0.5, y: 1.6, z: 10 }, head);
    expect(left!.pan).toBeLessThan(-0.9);
    // turned to face +x (yaw −π/2), the same round now passes ahead and behind, not to a side
    const turned = shotPass({ x: -0.5, y: 1.6, z: -10 }, { x: -0.5, y: 1.6, z: 10 }, { ...head, yaw: -Math.PI / 2 });
    expect(Math.abs(turned!.pan)).toBeLessThan(0.05);
  });

  it("is louder the closer it came, and silent past the reach", () => {
    const near = shotPass({ x: 0.2, y: 1.6, z: -10 }, { x: 0.2, y: 1.6, z: 10 }, head)!;
    const far = shotPass({ x: 1.2, y: 1.6, z: -10 }, { x: 1.2, y: 1.6, z: 10 }, head)!;
    expect(near.gain).toBeGreaterThan(far.gain);
    expect(shotPass({ x: SNAP_REACH + 0.01, y: 1.6, z: -10 }, { x: SNAP_REACH + 0.01, y: 1.6, z: 10 }, head)).toBeNull();
    expect(shotPass({ x: SNAP_REACH - 0.01, y: 1.6, z: -10 }, { x: SNAP_REACH - 0.01, y: 1.6, z: 10 }, head)).not.toBeNull();
  });

  it("measures in three dimensions: a round over the head is as far as one beside it", () => {
    const over = shotPass({ x: 0, y: 1.6 + 1.0, z: -10 }, { x: 0, y: 2.6, z: 10 }, head)!;
    const beside = shotPass({ x: 1.0, y: 1.6, z: -10 }, { x: 1.0, y: 1.6, z: 10 }, head)!;
    expect(over.distance).toBeCloseTo(beside.distance, 6);
  });

  it("a round that stopped short did not pass: the closest approach is on the flight, not the line", () => {
    // dead on, but into a wall three metres in front
    expect(shotPass({ x: 0, y: 1.6, z: -10 }, { x: 0, y: 1.6, z: -3 }, head)).toBeNull();
    // the same line carried through is a snap
    expect(shotPass({ x: 0, y: 1.6, z: -10 }, { x: 0, y: 1.6, z: 3 }, head)).not.toBeNull();
    // and one into the wall right beside the head is heard: the wall was beside the head
    expect(shotPass({ x: 0.3, y: 1.6, z: -10 }, { x: 0.3, y: 1.6, z: 0.2 }, head)).not.toBeNull();
  });

  it("a round that starts at the head is not a pass, and a shot going nowhere is nothing", () => {
    expect(shotPass({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 1.6, z: -20 }, head)).toBeNull();
    expect(shotPass({ x: 0.3, y: 1.6, z: -2 }, { x: 0.3, y: 1.6, z: -2 }, head)).toBeNull();
  });

  it("right on the ear it is all around rather than to one side", () => {
    const cue = shotPass({ x: SNAP_NEAR * 0.2, y: 1.6, z: -10 }, { x: SNAP_NEAR * 0.2, y: 1.6, z: 10 }, head)!;
    expect(Math.abs(cue.pan)).toBeLessThan(0.25);
  });
});
