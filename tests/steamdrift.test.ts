/**
 * A grate puff does not share a lean.
 * Lease Row keeps the sideways drift the street shipped with.
 * Tint, rise, width, alpha, climb, and point count stay where they were.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_DRIFT, steamDrift } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district drifts its own steam", () => {
  it("keeps the street lean and gives the other nineteen their own", () => {
    expect(STREET_DRIFT).toBe(2.5);
    expect(steamDrift(undefined)).toBe(STREET_DRIFT);
    expect(steamDrift("lease_row")).toBe(STREET_DRIFT);
    expect(steamDrift("drainage_yard")).toBe(STREET_DRIFT);
    expect(steamDrift("deadletter_office")).toBe(STREET_DRIFT);
    expect(steamDrift("white_office")).toBe(STREET_DRIFT);
    const drifts = CITY_DISTRICTS.map((id) => steamDrift(id));
    expect(new Set(drifts).size).toBe(CITY_DISTRICTS.length);
    expect(steamDrift("night_market")).toBeGreaterThan(STREET_DRIFT);
    expect(steamDrift("deadletter_docks")).toBeLessThan(steamDrift("relay_heights"));
  });

  it("the grate uses the drift for the level it was built in", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("uDrift: { value: steamDrift(name) }");
    expect(life).toContain("vec3 p = position + vec3(info.y * life * uDrift, life * 3.2, info.z * life * uDrift);");
    expect(life).toContain("life * 3.2");
    expect(life).toContain("new Steam(level.vents, 28, 3, level.name)");
    expect(life).not.toContain("info.y * life * 2.5");
  });
});
