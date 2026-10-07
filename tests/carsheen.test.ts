/**
 * The parked cars do not share a sheen.
 * Lease Row keeps the paint the blocks shipped with.
 * Colour stays on the body. No new mesh.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_CAR, carSheen } from "../client/render/city";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district wears its own car sheen", () => {
  it("keeps the street paint and gives the other nineteen their own", () => {
    expect(STREET_CAR).toBe(0.35);
    expect(carSheen(undefined)).toBe(STREET_CAR);
    expect(carSheen("lease_row")).toBe(STREET_CAR);
    expect(carSheen("drainage_yard")).toBe(STREET_CAR);
    expect(carSheen("deadletter_office")).toBe(STREET_CAR);
    expect(carSheen("white_office")).toBe(STREET_CAR);
    const sheens = CITY_DISTRICTS.map((id) => carSheen(id));
    expect(new Set(sheens).size).toBe(CITY_DISTRICTS.length);
    expect(carSheen("night_market")).toBeLessThan(STREET_CAR);
    expect(carSheen("deadletter_docks")).toBeGreaterThan(carSheen("relay_heights"));
  });

  it("the dresser paints that sheen on the cars it already parks", () => {
    const city = readFileSync(new URL("../client/render/city.ts", import.meta.url), "utf8");
    expect(city).toContain("car: std({ color: 0x0c1018, roughness: carSheen(level.name), metalness: 0.6 })");
    expect(city).toContain("carAlt: std({ color: 0x1a1220, roughness: carSheen(level.name), metalness: 0.6 })");
  });
});
