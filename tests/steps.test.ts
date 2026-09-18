/**
 * Everyone else's footsteps (Stage 80): the rule that decides which steps land, how loud, and which
 * side they are on. A step that fires at the wrong moment or the wrong side is worse than silence.
 */
import { describe, expect, it } from "vitest";
import { CROUCH_GAIN, STEP_MIN_SPEED, STEP_RANGE, stepCues, strideOf, type Walker } from "../client/steps";

const me = { x: 0, z: 0, yaw: 0 }; // looking down -z, which is the sim's convention
const walker = (over: Partial<Walker> = {}): Walker => ({ id: 7, x: 0, z: -5, speed: 5, stance: "stand", grounded: true, alive: true, ...over });
/** walk a body for a while and collect every step it lands */
const walk = (w: Walker, seconds: number, listener = me, dt = 1 / 60) => {
  const covered = new Map<number, number>();
  const out = [];
  for (let t = 0; t < seconds; t += dt) out.push(...stepCues([w], listener, covered, dt));
  return out;
};

describe("when another file's boot lands", () => {
  it("falls on its stride, not on a timer: a sprint lands more steps than a walk in the same seconds", () => {
    const sprint = walk(walker({ speed: 7.2 }), 4);
    const amble = walk(walker({ speed: 1.5 }), 4);
    expect(sprint.length).toBeGreaterThan(amble.length);
    // 7.2 m/s over 4 s is 28.8 m, at a 2.33 m stride: a dozen steps
    expect(sprint.length).toBeGreaterThan(9);
    expect(sprint.length).toBeLessThan(15);
  });

  it("never lands for a body that is standing, airborne, sliding or dead", () => {
    expect(walk(walker({ speed: 0 }), 4)).toHaveLength(0);
    expect(walk(walker({ speed: STEP_MIN_SPEED - 0.01 }), 6)).toHaveLength(0);
    expect(walk(walker({ grounded: false }), 4)).toHaveLength(0);
    expect(walk(walker({ stance: "slide", speed: 9 }), 4)).toHaveLength(0);
    expect(walk(walker({ stance: "mantle", speed: 4 }), 4)).toHaveLength(0);
    expect(walk(walker({ alive: false }), 4)).toHaveLength(0);
  });

  it("stopping does not bank a step to fire on the next move", () => {
    const covered = new Map<number, number>();
    const moving = walker({ speed: 6 });
    // most of a stride, then a stop
    for (let i = 0; i < 18; i++) stepCues([moving], me, covered, 1 / 60);
    expect(covered.get(7)).toBeGreaterThan(1);
    stepCues([walker({ speed: 0 })], me, covered, 1 / 60);
    expect(covered.get(7)).toBeLessThanOrEqual(0.5);
  });
});

describe("how loud, and which side", () => {
  it("fades with distance and stops at the range", () => {
    const near = walk(walker({ z: -3 }), 4)[0]!;
    const far = walk(walker({ z: -20 }), 4)[0]!;
    expect(near.gain).toBeGreaterThan(far.gain);
    expect(walk(walker({ z: -STEP_RANGE }), 4)).toHaveLength(0);
    expect(walk(walker({ z: -(STEP_RANGE + 10) }), 4)).toHaveLength(0);
  });

  it("a crouched file is nearly silent at the same distance", () => {
    const stood = walk(walker({ z: -5, speed: 2.5 }), 8)[0]!;
    const crept = walk(walker({ z: -5, speed: 2.5, stance: "crouch" }), 8)[0]!;
    expect(crept.gain).toBeCloseTo(stood.gain * CROUCH_GAIN, 6);
    expect(crept.gain).toBeLessThan(stood.gain * 0.5);
  });

  it("pans to the side the body is on, and to the middle when it is ahead or behind", () => {
    expect(walk(walker({ x: 6, z: 0 }), 4)[0]!.pan).toBeGreaterThan(0.9); // to the right
    expect(walk(walker({ x: -6, z: 0 }), 4)[0]!.pan).toBeLessThan(-0.9); // to the left
    expect(Math.abs(walk(walker({ x: 0, z: -6 }), 4)[0]!.pan)).toBeLessThan(0.05); // ahead
    expect(Math.abs(walk(walker({ x: 0, z: 6 }), 4)[0]!.pan)).toBeLessThan(0.05); // behind
    // and it turns with the listener: face east and a body to the east is ahead
    expect(Math.abs(walk(walker({ x: 6, z: 0 }), 4, { x: 0, z: 0, yaw: -Math.PI / 2 })[0]!.pan)).toBeLessThan(0.05);
  });

  it("a crouch takes shorter strides than a walk, and a sprint longer ones", () => {
    expect(strideOf(2.5, "crouch")).toBeLessThan(strideOf(2.5, "stand"));
    expect(strideOf(7.2, "stand")).toBeGreaterThan(strideOf(2.5, "stand"));
  });

  it("forgets a body that has left, so the book-keeping cannot grow without bound", () => {
    const covered = new Map<number, number>();
    stepCues([walker({ id: 1 }), walker({ id: 2 })], me, covered, 1 / 60);
    expect(covered.size).toBe(2);
    stepCues([walker({ id: 1 })], me, covered, 1 / 60);
    expect([...covered.keys()]).toEqual([1]);
  });
});
