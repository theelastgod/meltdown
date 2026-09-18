/**
 * What the radar knows (Stage 88): where a node goes on the map, in the player's own frame, and
 * what happens to one further out than the map reaches.
 */
import { describe, expect, it } from "vitest";
import { mapFooter, nodeColour, NODE_COLOURS, nodeMarks, place, spotMarks, SPOT_COLOURS, type RadarNode } from "../client/hud/radar";

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

describe("where the contract wants you (Stage 92)", () => {
  const me = { x: 4, z: 9 };

  it("puts the goal where the geometry says, at a heading that is not due north", () => {
    // facing east (yaw -pi/2 looks toward +x): something to the east is ahead, so it is above the middle
    const east = spotMarks([{ kind: "goal", x: me.x + 12, z: me.z }], me, -Math.PI / 2, SCALE, W, H)[0]!;
    expect(east.x).toBeCloseTo(W / 2, 6);
    expect(east.y).toBeCloseTo(H / 2 - 12 * SCALE, 6);
    expect(east.distance).toBeCloseTo(12, 6);
    expect(east.edge).toBe(false);
    // and something to the north, at that heading, is off to the left
    const north = spotMarks([{ kind: "goal", x: me.x, z: me.z - 12 }], me, -Math.PI / 2, SCALE, W, H)[0]!;
    expect(north.x).toBeCloseTo(W / 2 - 12 * SCALE, 6);
    expect(north.y).toBeCloseTo(H / 2, 6);
  });

  it("pins a goal past the edge to the rim, on its own bearing, and still says how far", () => {
    const far = spotMarks([{ kind: "goal", x: me.x + 400, z: me.z - 400 }], me, 0, SCALE, W, H)[0]!;
    expect(far.edge).toBe(true);
    expect(far.distance).toBeCloseTo(Math.hypot(400, 400), 6);
    expect(far.x).toBeLessThanOrEqual(W - 3 + 1e-9);
    expect(far.y).toBeGreaterThanOrEqual(3 - 1e-9);
    // up and to the right, which is where it is: the rim mark keeps the bearing of the real one
    const on = place({ x: me.x + 400, z: me.z - 400 }, me, 0, SCALE, W, H);
    expect(Math.atan2(-(far.y - H / 2), far.x - W / 2)).toBeCloseTo(Math.atan2(-(on.y - H / 2), on.x - W / 2), 6);
  });

  it("keeps the kinds apart and gives each its own colour", () => {
    const marks = spotMarks([{ kind: "goal", x: 4, z: 9 }, { kind: "escort", x: 5, z: 9 }, { kind: "target", x: 6, z: 9 }], me, 0, SCALE, W, H);
    expect(marks.map((m) => m.kind)).toEqual(["goal", "escort", "target"]);
    expect(new Set(Object.values(SPOT_COLOURS)).size).toBe(3);
  });

  it("a spot under your feet sits at the middle and is not an edge mark", () => {
    const here = spotMarks([{ kind: "goal", x: me.x, z: me.z }], me, 1.1, SCALE, W, H)[0]!;
    expect(here.x).toBeCloseTo(W / 2, 6);
    expect(here.y).toBeCloseTo(H / 2, 6);
    expect(here.distance).toBe(0);
    expect(here.edge).toBe(false);
  });
});

describe("the map's footer (Stage 129)", () => {
  it("says what the map is: heading-up, and how far across, from the scale it is drawn at", () => {
    expect(mapFooter(86)).toBe("▲ AHEAD · 86 M ACROSS");
    expect(mapFooter(85.6)).toBe("▲ AHEAD · 86 M ACROSS");
  });
  it("promises nothing the map does not do", () => {
    expect(mapFooter(86).toLowerCase()).not.toMatch(/tap|click|walk/);
  });
  it("has a compact form for the phone's narrow box, still heading-up and still the metres (Stage 132)", () => {
    expect(mapFooter(70, true)).toBe("▲ 70 M WIDE");
    expect(mapFooter(70, true).length).toBeLessThan(mapFooter(70).length - 6);
  });
});
