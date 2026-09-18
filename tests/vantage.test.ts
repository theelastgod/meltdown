/**
 * The wasp that found you (Stage 98): the edge into chase, the reach, the cooldown, and the bearing.
 */
import { describe, expect, it } from "vitest";
import { LOCK_COOLDOWN, LOCK_RANGE, waspLocks, type WaspSeen } from "../client/vantage";

const me = { x: 0, y: 1.6, z: 0, yaw: 0 };
const wasp = (over: Partial<WaspSeen> = {}): WaspSeen => ({ id: 1, state: 0, x: 0, y: 3, z: -8, ...over });
const fresh = () => ({ prev: new Map<number, number>(), cued: new Map<number, number>() });

describe("the edge into chase", () => {
  it("cues on the frame a patrolling wasp turns to chase, and not while it keeps chasing", () => {
    const { prev, cued } = fresh();
    expect(waspLocks(prev, cued, [wasp({ state: 0 })], me, 10)).toEqual([]);
    expect(waspLocks(prev, cued, [wasp({ state: 1 })], me, 10.02)).toHaveLength(1);
    expect(waspLocks(prev, cued, [wasp({ state: 1 })], me, 10.04)).toEqual([]);
    expect(waspLocks(prev, cued, [wasp({ state: 1 })], me, 12)).toEqual([]);
  });

  it("counts a wasp first seen already chasing: to this client that is the moment it went live", () => {
    const { prev, cued } = fresh();
    expect(waspLocks(prev, cued, [wasp({ state: 1 })], me, 10)).toHaveLength(1);
  });

  it("does not cue a wasp that was disabled and comes back on patrol", () => {
    const { prev, cued } = fresh();
    waspLocks(prev, cued, [wasp({ state: 2 })], me, 10);
    expect(waspLocks(prev, cued, [wasp({ state: 0 })], me, 10.02)).toEqual([]);
  });
});

describe("the reach and the cooldown", () => {
  it("lets a far wasp go live in silence", () => {
    const { prev, cued } = fresh();
    expect(waspLocks(prev, cued, [wasp({ state: 1, z: -(LOCK_RANGE + 1) })], me, 10)).toEqual([]);
  });

  it("does not cue the same wasp again inside the cooldown, and does after it", () => {
    const { prev, cued } = fresh();
    expect(waspLocks(prev, cued, [wasp({ state: 1 })], me, 10)).toHaveLength(1);
    waspLocks(prev, cued, [wasp({ state: 0 })], me, 11); // lost you
    expect(waspLocks(prev, cued, [wasp({ state: 1 })], me, 12)).toEqual([]); // found you again, too soon
    waspLocks(prev, cued, [wasp({ state: 0 })], me, 13);
    expect(waspLocks(prev, cued, [wasp({ state: 1 })], me, 10 + LOCK_COOLDOWN + 0.1)).toHaveLength(1);
  });

  it("is louder closer, and never silent inside the reach", () => {
    const near = waspLocks(...Object.values(fresh()) as [Map<number, number>, Map<number, number>], [wasp({ state: 1, z: -3 })], me, 10)[0]!;
    const far = waspLocks(...Object.values(fresh()) as [Map<number, number>, Map<number, number>], [wasp({ state: 1, z: -(LOCK_RANGE - 1) })], me, 10)[0]!;
    expect(near.gain).toBeGreaterThan(far.gain);
    expect(far.gain).toBeGreaterThan(0.35);
  });
});

describe("which way", () => {
  it("pans to the side the wasp is on, using the damage wedges' own bearing", () => {
    // yaw 0 looks toward -z, so a wasp to the east is off to the right
    const { prev, cued } = fresh();
    const east = waspLocks(prev, cued, [wasp({ id: 7, state: 1, x: 9, z: 0 })], me, 10)[0]!;
    expect(east.pan).toBeGreaterThan(0.9);
    const west = waspLocks(prev, cued, [wasp({ id: 8, state: 1, x: -9, z: 0 })], me, 10)[0]!;
    expect(west.pan).toBeLessThan(-0.9);
  });

  it("forgets wasps that are gone", () => {
    const { prev, cued } = fresh();
    waspLocks(prev, cued, [wasp({ state: 1 })], me, 10);
    waspLocks(prev, cued, [], me, 11);
    expect(prev.size).toBe(0);
    expect(cued.size).toBe(0);
  });
});
