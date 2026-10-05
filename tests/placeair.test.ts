/**
 * The five districts do not share a night. A level that is not one of them has no place air.
 */
import { describe, expect, it } from "vitest";
import { placeAir } from "../client/render/renderer";

const NAMES = ["lease_row", "deadletter_docks", "repo_depot", "night_market", "relay_heights"] as const;

describe("each district has its own air", () => {
  it("fog, density, and rain pace all differ, and they stay inside the skyline sweep", () => {
    const airs = NAMES.map((n) => placeAir(n)!);
    expect(airs.every(Boolean)).toBe(true);
    expect(new Set(airs.map((a) => a.fog)).size).toBe(5);
    expect(new Set(airs.map((a) => a.density)).size).toBe(5);
    expect(new Set(airs.map((a) => a.fall)).size).toBe(5);
    expect(new Set(airs.map((a) => a.sky)).size).toBe(5);
    for (const a of airs) {
      expect(a.density).toBeGreaterThanOrEqual(0.0045);
      expect(a.density).toBeLessThanOrEqual(0.009);
    }
    expect(placeAir("drainage_yard")).toBeNull();
    expect(placeAir(undefined)).toBeNull();
  });
});
