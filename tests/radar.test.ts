/**
 * What the radar knows (Stage 88): where a node goes on the map, in the player's own frame, and
 * what happens to one further out than the map reaches.
 */
import { describe, expect, it } from "vitest";
import { nodeColour, NODE_COLOURS, nodeMarks, type RadarNode } from "../client/hud/radar";

const W = 108;
const H = 84;
const SCALE = 1.5; // pixels per metre
const node = (over: Partial<RadarNode> = {}): RadarNode => ({ id: 1, label: "A", pos: { x: 0, z: 0 }, owner: 0, contested: false, puller: 0, ...over });
const at = { x: 10, z: -4 };

describe("where a node goes on the map", () => {
  it("puts what is ahead above the middle and what is behind below it", () => {
    // yaw 0 looks toward -z, and the map turns with the file so that forward is up
    const ahead = nodeMarks([node({ pos: { x: at.x, z: at.z - 10 } })], at, 0, SCALE, W, H)[0]!;
    expect(ahead.x).toBeCloseTo(W / 2, 6);
    expect(ahead.y).toBeCloseTo(H / 2 - 10 * SCALE, 6);
    const behind = nodeMarks([node({ pos: { x: at.x, z: at.z + 10 } })], at, 0, SCALE, W, H)[0]!;
    expect(behind.y).toBeCloseTo(H / 2 + 10 * SCALE, 6);
    const right = nodeMarks([node({ pos: { x: at.x + 10, z: at.z } })], at, 0, SCALE, W, H)[0]!;
    expect(right.x).toBeCloseTo(W / 2 + 10 * SCALE, 6);
    expect(right.y).toBeCloseTo(H / 2, 6);
  });

  it("turns with the file: facing east puts what is east at the top", () => {
    const east = node({ pos: { x: at.x + 10, z: at.z } });
    const facingEast = nodeMarks([east], at, -Math.PI / 2, SCALE, W, H)[0]!;
    expect(facingEast.x).toBeCloseTo(W / 2, 4);
    expect(facingEast.y).toBeCloseTo(H / 2 - 10 * SCALE, 4);
  });

  it("reports how far away it really is, whatever the map does with it", () => {
    const m = nodeMarks([node({ pos: { x: at.x + 3, z: at.z - 4 } })], at, 0, SCALE, W, H)[0]!;
    expect(m.distance).toBeCloseTo(5, 6);
    expect(m.edge).toBe(false);
  });
});

describe("a node the map cannot reach", () => {
  it("is pinned to the rim rather than dropped, and says it was", () => {
    const far = nodeMarks([node({ pos: { x: at.x, z: at.z - 400 } })], at, 0, SCALE, W, H)[0]!;
    expect(far.edge).toBe(true);
    expect(far.y).toBeCloseTo(3, 6); // the top rim, on the same bearing
    expect(far.x).toBeCloseTo(W / 2, 6);
    expect(far.distance).toBeCloseTo(400, 6);
  });

  it("is pinned along its bearing, not clamped per axis", () => {
    // 45 degrees off to the right and ahead: both axes overflow, and a per-axis clamp would put it
    // in the corner — which points at a street the node is not on
    const m = nodeMarks([node({ pos: { x: at.x + 300, z: at.z - 300 } })], at, 0, SCALE, W, H)[0]!;
    expect(m.edge).toBe(true);
    const vx = m.x - W / 2;
    const vy = m.y - H / 2;
    expect(Math.abs(vx)).toBeCloseTo(Math.abs(vy), 4); // still at 45 degrees
    expect(vx).toBeGreaterThan(0);
    expect(vy).toBeLessThan(0);
    // and inside the map's own edge
    expect(m.x).toBeLessThanOrEqual(W - 3 + 1e-6);
    expect(m.y).toBeGreaterThanOrEqual(3 - 1e-6);
  });

  it("every node gets a mark: the map never silently drops one", () => {
    const nodes = [node({ id: 1, pos: { x: 0, z: 0 } }), node({ id: 2, pos: { x: 500, z: 0 } }), node({ id: 3, pos: { x: -500, z: 500 } })];
    expect(nodeMarks(nodes, at, 0.7, SCALE, W, H)).toHaveLength(3);
  });
});

describe("what colour it is", () => {
  it("is VANTAGE's violet while leased, each cell's colour once taken, and amber while contested", () => {
    expect(nodeColour({ owner: 0, contested: false })).toBe(NODE_COLOURS.vantage);
    expect(nodeColour({ owner: 1, contested: false })).toBe(NODE_COLOURS.one);
    expect(nodeColour({ owner: 2, contested: false })).toBe(NODE_COLOURS.two);
    // a contest beats ownership: it is the thing worth knowing about
    expect(nodeColour({ owner: 1, contested: true })).toBe(NODE_COLOURS.contested);
    expect(nodeColour({ owner: 0, contested: true })).toBe(NODE_COLOURS.contested);
  });
});
