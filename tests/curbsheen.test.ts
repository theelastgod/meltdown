/**
 * The curbs do not share a sheen.
 * Lease Row keeps the cobble the blocks shipped with.
 * Colour stays on the slab. No new mesh.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_CURB, curbSheen } from "../client/render/city";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district wears its own curb sheen", () => {
  it("keeps the street cobble and gives the other nineteen their own", () => {
    expect(STREET_CURB).toBe(0.85);
    expect(curbSheen(undefined)).toBe(STREET_CURB);
    expect(curbSheen("lease_row")).toBe(STREET_CURB);
    expect(curbSheen("drainage_yard")).toBe(STREET_CURB);
    expect(curbSheen("deadletter_office")).toBe(STREET_CURB);
    expect(curbSheen("white_office")).toBe(STREET_CURB);
    const sheens = CITY_DISTRICTS.map((id) => curbSheen(id));
    expect(new Set(sheens).size).toBe(CITY_DISTRICTS.length);
    expect(curbSheen("night_market")).toBeLessThan(STREET_CURB);
    expect(curbSheen("deadletter_docks")).toBeGreaterThan(curbSheen("relay_heights"));
  });

  it("the dresser paints that sheen on the curb it already lays", () => {
    const city = readFileSync(new URL("../client/render/city.ts", import.meta.url), "utf8");
    expect(city).toContain("sidewalk: std({ color: 0x2a3140, roughness: curbSheen(level.name), metalness: 0.05 })");
  });
});
