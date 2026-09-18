/**
 * The map never heard the shot (Stage 104): what is remembered, for how long, and where it lands.
 */
import { describe, expect, it } from "vitest";
import { PING_LIFE, PING_MAX, pingMarks, prunePings, rememberPing, type Ping } from "../client/hud/ping";

const ping = (x: number, z: number, at: number, kind: "file" | "wasp" = "file"): Ping => ({ x, z, at, kind });

describe("rememberPing / prunePings", () => {
  it("keeps the newest, up to the cap", () => {
    let book: Ping[] = [];
    for (let i = 0; i < PING_MAX + 3; i++) book = rememberPing(book, ping(i, 0, i));
    expect(book.length).toBe(PING_MAX);
    expect(book[0]!.x).toBe(3);
  });
  it("forgets a ping once it has faded, and never draws one from the future", () => {
    const book = [ping(0, 0, 10), ping(1, 0, 10.9), ping(2, 0, 12)];
    expect(prunePings(book, 11.6).map((p) => p.x)).toEqual([1]);
  });
});

describe("pingMarks", () => {
  // yaw 0 looks toward −z, up on the map; +x is the right hand
  const at = { x: 0, z: 0 };
  it("puts a shot ahead above the centre, fading with age", () => {
    const [m] = pingMarks([ping(0, -10, 10)], at, 0, 2, 100, 100, 10.75);
    expect(m!.y).toBeLessThan(50);
    expect(Math.abs(m!.x - 50)).toBeLessThan(0.01);
    expect(m!.alpha).toBeCloseTo(0.5, 6);
    expect(m!.edge).toBe(false);
  });
  it("a shot to the right sits right of the centre, and turning right brings it ahead", () => {
    const [right] = pingMarks([ping(10, 0, 10)], at, 0, 2, 100, 100, 10);
    expect(right!.x).toBeGreaterThan(50);
    const [ahead] = pingMarks([ping(10, 0, 10)], at, -Math.PI / 2, 2, 100, 100, 10);
    expect(Math.abs(ahead!.x - 50)).toBeLessThan(0.01);
    expect(ahead!.y).toBeLessThan(50);
  });
  it("a shot off the map is pinned to the rim, still on its bearing", () => {
    const [m] = pingMarks([ping(0, -400, 10)], at, 0, 2, 100, 100, 10);
    expect(m!.edge).toBe(true);
    expect(m!.y).toBeLessThanOrEqual(4);
  });
  it("carries the kind and drops what has faded", () => {
    const marks = pingMarks([ping(0, -10, 10, "wasp"), ping(0, -10, 8)], at, 0, 2, 100, 100, 10 + PING_LIFE - 0.01);
    expect(marks.length).toBe(1);
    expect(marks[0]!.kind).toBe("wasp");
  });
});
