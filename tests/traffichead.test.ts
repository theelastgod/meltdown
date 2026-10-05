/**
 * Traffic past the gates was one warm head in every district.
 * The streaks are still those streaks. The head colour is the district's. Tails stay red.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Traffic, TRAFFIC_TAIL, trafficHead } from "../client/render/city";

const HEADS: Record<string, readonly [number, number, number]> = {
  lease_row: [1, 0.93, 0.75],
  deadletter_docks: [0.62, 0.82, 1],
  repo_depot: [1, 0.78, 0.35],
  night_market: [1, 0.55, 0.82],
  relay_heights: [0.82, 0.9, 1],
  ash_canal: [0.45, 1, 0.72],
  glass_mile: [0.92, 0.82, 1],
  bone_market: [1, 0.86, 0.62],
  cold_vault: [0.7, 1, 0.95],
  neon_chapel: [0.78, 0.45, 1],
  slag_pit: [1, 0.42, 0.18],
  wire_garden: [0.45, 1, 0.55],
  red_kiln: [1, 0.35, 0.32],
  paper_wharf: [0.75, 0.84, 0.95],
  velvet_court: [1, 0.28, 0.48],
  rust_crown: [1, 0.62, 0.28],
  salt_stairs: [0.9, 0.94, 1],
  lamp_bazaar: [1, 0.4, 0.7],
  debt_orchard: [0.8, 1, 0.35],
  black_relay: [0.45, 0.52, 0.68],
};

const LANE = { from: { x: 0, y: 8, z: 0 }, to: { x: 40, y: 8, z: 0 }, speed: 12, count: 2 };

describe("the traffic past the gates is not one head twenty times", () => {
  it("twenty head colours, lease row stays warm white, tails stay red", () => {
    const names = Object.keys(HEADS);
    expect(names).toHaveLength(20);
    expect(new Set(names.map((n) => HEADS[n]!.join(","))).size).toBe(20);
    expect(trafficHead("lease_row")).toEqual([1, 0.93, 0.75]);
    expect(trafficHead(undefined)).toEqual([1, 0.93, 0.75]);
    expect(TRAFFIC_TAIL).toEqual([1, 0.1, 0.18]);
    for (const name of names) {
      expect(trafficHead(name), name).toEqual(HEADS[name]);
      const traffic = new Traffic([LANE], 5, name);
      const col = traffic.object.geometry.getAttribute("color").array;
      const head = [...new Float32Array(HEADS[name]!)];
      const tail = [...new Float32Array(TRAFFIC_TAIL)];
      expect([col[0], col[1], col[2]], name).toEqual(head);
      expect([col[3], col[4], col[5]], name).toEqual(head);
      expect([col[6], col[7], col[8]], name).toEqual(tail);
      expect([col[9], col[10], col[11]], name).toEqual(tail);
      expect(traffic.object.type).toBe("LineSegments");
    }
  });

  it("the renderer passes the level name into the same streaks", () => {
    const renderer = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(renderer).toContain("new Traffic(level.traffic, level.skylineSeed ?? 5, level.name)");
  });
});
