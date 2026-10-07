/**
 * The towers past the gates do not share a burn.
 * Lease Row keeps the horizon glow the skyline shipped with.
 * Street windows stay on paneBurn. Roughness and metalness stay on the slabs.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_HORIZON, horizonBurn } from "../client/render/city";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district burns its own horizon", () => {
  it("keeps the street glow and gives the other nineteen their own", () => {
    expect(STREET_HORIZON).toBe(0.7);
    expect(horizonBurn(undefined)).toBe(STREET_HORIZON);
    expect(horizonBurn("lease_row")).toBe(STREET_HORIZON);
    expect(horizonBurn("drainage_yard")).toBe(STREET_HORIZON);
    expect(horizonBurn("deadletter_office")).toBe(STREET_HORIZON);
    expect(horizonBurn("white_office")).toBe(STREET_HORIZON);
    const burns = CITY_DISTRICTS.map((id) => horizonBurn(id));
    expect(new Set(burns).size).toBe(CITY_DISTRICTS.length);
    expect(horizonBurn("night_market")).toBeGreaterThan(STREET_HORIZON);
    expect(horizonBurn("deadletter_docks")).toBeLessThan(horizonBurn("relay_heights"));
  });

  it("the skyline burns for the level it was built in", () => {
    const city = readFileSync(new URL("../client/render/city.ts", import.meta.url), "utf8");
    expect(city).toContain("emissiveIntensity: horizonBurn(place), roughness: 0.8, metalness: 0.1");
    expect(city).toContain("emissive: 0xffffff");
  });
});
