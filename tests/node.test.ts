/**
 * The node under your feet (Stage 85): the readout is measured from the hold the server publishes,
 * so the seconds it prints are the simulation's seconds and not a guess about who is standing where.
 */
import { describe, expect, it } from "vitest";
import { MOVING, nearestNode, nodeReadout, trackHolds, type NodeLike, type TrackedNode } from "../client/hud/node";
import { WAKE } from "../shared/sim/wake";

const node = (over: Partial<NodeLike> = {}): NodeLike => ({ id: 3, label: "C", pos: { x: 10, z: -4 }, owner: 0, hold: 1, contested: false, puller: 0, ...over });
/** run a hold down (or up) at a fixed rate and return what the tracker made of it */
const run = (from: number, ratePerSecond: number, seconds: number, dt = 1 / 60): { book: Map<number, TrackedNode>; n: NodeLike } => {
  const book = new Map<number, TrackedNode>();
  const n = node({ hold: from });
  for (let t = 0; t < seconds; t += dt) {
    n.hold = Math.max(0, Math.min(1, n.hold + ratePerSecond * dt));
    trackHolds(book, [n], dt);
  }
  return { book, n };
};

describe("watching a node's hold", () => {
  it("measures the rate it is actually moving at", () => {
    const { book } = run(1, -0.25, 2);
    expect(book.get(3)!.rate).toBeCloseTo(-0.25, 2);
    // stop short of the ceiling: a hold clamped at one is not moving any more, and the measured
    // rate correctly falls away with it
    const up = run(0.1, 0.4, 1.5);
    expect(up.book.get(3)!.rate).toBeCloseTo(0.4, 2);
  });

  it("does not read a flip as a rate: the hold resets under a new owner", () => {
    const book = new Map<number, TrackedNode>();
    const n = node({ hold: 0.04, owner: 0 });
    for (let i = 0; i < 20; i++) {
      n.hold -= 0.002;
      trackHolds(book, [n], 1 / 60);
    }
    expect(book.get(3)!.rate).toBeLessThan(0);
    // it flips: owner 2 now, hold back to nearly one
    n.owner = 2;
    n.hold = 0.98;
    trackHolds(book, [n], 1 / 60);
    expect(book.get(3)!.rate).toBe(0);
  });

  it("starts again when a node changes hands: the rate it had was the other owner's", () => {
    const book = new Map<number, TrackedNode>();
    const n = node({ hold: 0.6, owner: 0 });
    for (let i = 0; i < 30; i++) {
      n.hold -= 0.004;
      trackHolds(book, [n], 1 / 60);
    }
    expect(book.get(3)!.rate).toBeLessThan(-0.1);
    // it turns over: cell two owns it now and starts building its own hold from nothing
    n.owner = 2;
    n.hold = 0.02;
    trackHolds(book, [n], 1 / 60);
    expect(book.get(3)!.rate).toBe(0);
    // which means the readout says nothing rather than "flip in 0.0s" on a node that just flipped
    expect(nodeReadout(n, book.get(3), 1, WAKE.nodeRadius).toward).toBe("still");
  });

  it("forgets a node that is no longer in the round", () => {
    const book = new Map<number, TrackedNode>();
    trackHolds(book, [node({ id: 1 }), node({ id: 2 })], 1 / 60);
    expect(book.size).toBe(2);
    trackHolds(book, [node({ id: 1 })], 1 / 60);
    expect([...book.keys()]).toEqual([1]);
  });
});

describe("what it says about it", () => {
  it("counts down to the flip when the hold is coming off, at the rate it is coming off", () => {
    const { book, n } = run(1, -0.25, 2); // 0.5 of hold left after two seconds
    const r = nodeReadout(n, book.get(3), 1, WAKE.nodeRadius);
    expect(r.toward).toBe("flip");
    expect(r.seconds).toBeCloseTo(n.hold / 0.25, 1);
    expect(r.on).toBe(true);
  });

  it("counts up to the lock when an owner is settling it, and calls an unowned node's rise a flip", () => {
    const owned = run(0.4, 0.3, 1);
    owned.n.owner = 1;
    const r = nodeReadout(owned.n, owned.book.get(3), 0.5, WAKE.nodeRadius);
    expect(r.toward).toBe("hold");
    expect(r.seconds).toBeCloseTo((1 - owned.n.hold) / 0.3, 1);
    // VANTAGE still holds it and the hold is rising: that is the lease settling back, which ends
    // with the node still theirs — the file needs to know it is losing ground, not gaining it
    const leased = run(0.4, 0.3, 1);
    expect(nodeReadout(leased.n, leased.book.get(3), 0.5, WAKE.nodeRadius).toward).toBe("flip");
  });

  it("says nothing about a contested node, because nothing is moving on it", () => {
    const { book, n } = run(1, -0.25, 2);
    n.contested = true;
    const r = nodeReadout(n, book.get(3), 1, WAKE.nodeRadius);
    expect(r.toward).toBe("contested");
    expect(r.seconds).toBe(0);
  });

  it("and nothing about a node nobody is pulling: a drift is not a countdown", () => {
    const { book, n } = run(0.5, MOVING / 2, 1);
    const r = nodeReadout(n, book.get(3), 1, WAKE.nodeRadius);
    expect(r.toward).toBe("still");
    expect(r.seconds).toBe(0);
    // with no history at all it is still safe
    expect(nodeReadout(n, undefined, 1, WAKE.nodeRadius).toward).toBe("still");
  });

  it("knows whether the file is on the node or walking up to it", () => {
    const n = node();
    expect(nodeReadout(n, undefined, WAKE.nodeRadius - 0.1, WAKE.nodeRadius).on).toBe(true);
    expect(nodeReadout(n, undefined, WAKE.nodeRadius + 0.1, WAKE.nodeRadius).on).toBe(false);
  });
});

describe("which node is yours to worry about", () => {
  const nodes = [node({ id: 1, label: "A", pos: { x: 0, z: 0 } }), node({ id: 2, label: "B", pos: { x: 20, z: 0 } })];

  it("is the nearest one inside the radius, and none when the street is empty", () => {
    expect(nearestNode(nodes, { x: 2, z: 0 }, 8)!.node.label).toBe("A");
    expect(nearestNode(nodes, { x: 18, z: 0 }, 8)!.node.label).toBe("B");
    expect(nearestNode(nodes, { x: 10, z: 0 }, 8)).toBeNull();
    expect(nearestNode([], { x: 0, z: 0 }, 8)).toBeNull();
    expect(nearestNode(nodes, { x: 2, z: 0 }, 8)!.distance).toBeCloseTo(2, 6);
  });
});
