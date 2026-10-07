/**
 * The street windows do not share a burn.
 * Lease Row keeps the facade glow the blocks shipped with.
 * Roughness and metalness stay on the panes.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_PANE, paneBurn } from "../client/render/city";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district burns its own windows", () => {
  it("keeps the street glow and gives the other nineteen their own", () => {
    expect(STREET_PANE).toBe(1.5);
    expect(paneBurn(undefined)).toBe(STREET_PANE);
    expect(paneBurn("lease_row")).toBe(STREET_PANE);
    expect(paneBurn("drainage_yard")).toBe(STREET_PANE);
    expect(paneBurn("deadletter_office")).toBe(STREET_PANE);
    expect(paneBurn("white_office")).toBe(STREET_PANE);
    const burns = CITY_DISTRICTS.map((id) => paneBurn(id));
    expect(new Set(burns).size).toBe(CITY_DISTRICTS.length);
    expect(paneBurn("night_market")).toBeGreaterThan(STREET_PANE);
    expect(paneBurn("deadletter_docks")).toBeLessThan(paneBurn("relay_heights"));
  });

  it("the dresser burns the panes for the level it was built in", () => {
    const city = readFileSync(new URL("../client/render/city.ts", import.meta.url), "utf8");
    expect(city).toContain("emissiveIntensity: paneBurn(level.name), roughness: 0.8, metalness: 0.1");
  });
});
