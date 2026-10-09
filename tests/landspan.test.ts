/**
 * A landing does not take the same time to recover on every street.
 * Lease Row, the yard, and the indoor rooms keep the 0.34 the camera shipped with.
 * The dip depth stays 0.22. The slide roll stays.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { LAND_DIP, LAND_TIME, landDip, landSpan } from "../client/render/feel";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district recovers a landing on its own time", () => {
  it("keeps the street span and gives the other nineteen their own", () => {
    expect(LAND_TIME).toBe(0.34);
    expect(LAND_DIP).toBe(0.22);
    expect(landSpan(undefined)).toBe(LAND_TIME);
    expect(landSpan("lease_row")).toBe(LAND_TIME);
    expect(landSpan("drainage_yard")).toBe(LAND_TIME);
    expect(landSpan("deadletter_office")).toBe(LAND_TIME);
    expect(landSpan("white_office")).toBe(LAND_TIME);
    const spans = CITY_DISTRICTS.map((id) => landSpan(id));
    expect(new Set(spans).size).toBe(CITY_DISTRICTS.length);
    expect(landSpan("night_market")).toBeGreaterThan(LAND_TIME);
    expect(landSpan("deadletter_docks")).toBeLessThan(landSpan("relay_heights"));
  });

  it("the dip is still deepest early, and a longer street is not done at 0.34", () => {
    const row = landSpan("lease_row");
    expect(landDip(1, row * 0.2, row)).toBeCloseTo(LAND_DIP, 6);
    expect(landDip(1, row, row)).toBe(0);
    const night = landSpan("night_market");
    expect(landDip(1, night * 0.2, night)).toBeCloseTo(LAND_DIP, 6);
    expect(landDip(1, LAND_TIME, night)).toBeGreaterThan(0);
    expect(landDip(1, night, night)).toBe(0);
    const docks = landSpan("deadletter_docks");
    const heights = landSpan("relay_heights");
    expect(landDip(1, docks, docks)).toBe(0);
    expect(landDip(1, docks, heights)).toBeGreaterThan(0);
  });

  it("fails closed if the read is removed from the camera", () => {
    const feel = readFileSync(new URL("../client/render/feel.ts", import.meta.url), "utf8");
    const renderer = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(feel).toContain("function landSpan");
    expect(feel).toContain("export const LAND_DIP = 0.22");
    expect(feel).toContain("export const LAND_TIME = 0.34");
    expect(renderer).toContain("const span = landSpan(this.placeName)");
    expect(renderer).toContain("landDip(this.landHard, span - this.landT, span)");
  });
});
