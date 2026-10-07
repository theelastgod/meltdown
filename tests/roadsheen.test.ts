/**
 * The asphalt does not share a sheen.
 * Lease Row keeps the tar the blocks shipped with.
 * Colour stays on the road. No new mesh.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_ROAD, roadSheen } from "../client/render/city";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district wears its own road sheen", () => {
  it("keeps the street tar and gives the other nineteen their own", () => {
    expect(STREET_ROAD).toBe(0.9);
    expect(roadSheen(undefined)).toBe(STREET_ROAD);
    expect(roadSheen("lease_row")).toBe(STREET_ROAD);
    expect(roadSheen("drainage_yard")).toBe(STREET_ROAD);
    expect(roadSheen("deadletter_office")).toBe(STREET_ROAD);
    expect(roadSheen("white_office")).toBe(STREET_ROAD);
    const sheens = CITY_DISTRICTS.map((id) => roadSheen(id));
    expect(new Set(sheens).size).toBe(CITY_DISTRICTS.length);
    expect(roadSheen("night_market")).toBeLessThan(STREET_ROAD);
    expect(roadSheen("deadletter_docks")).toBeGreaterThan(roadSheen("relay_heights"));
  });

  it("the dresser paints that sheen on the road it already lays", () => {
    const city = readFileSync(new URL("../client/render/city.ts", import.meta.url), "utf8");
    expect(city).toContain("road: std({ color: 0x12161c, roughness: roadSheen(level.name), metalness: 0.05 })");
  });

  it("fails closed if the read is removed from the dresser", () => {
    const city = readFileSync(new URL("../client/render/city.ts", import.meta.url), "utf8");
    expect(city).toContain("function roadSheen");
    expect(city).toContain("roughness: roadSheen(level.name)");
  });
});
