/**
 * The rain does not share a sideways slide.
 * Lease Row, the yard, and the indoor rooms keep the 1.2 the streaks shipped with.
 * Fall and tint stay placeAir. The streak count stays put.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_DRIFT, Rain, rainDrift } from "../client/render/rain";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district slides its rain at its own drift", () => {
  it("keeps the street drift and gives the other nineteen their own", () => {
    expect(STREET_DRIFT).toBe(1.2);
    expect(rainDrift(undefined)).toBe(STREET_DRIFT);
    expect(rainDrift("lease_row")).toBe(STREET_DRIFT);
    expect(rainDrift("drainage_yard")).toBe(STREET_DRIFT);
    expect(rainDrift("deadletter_office")).toBe(STREET_DRIFT);
    expect(rainDrift("white_office")).toBe(STREET_DRIFT);
    const drifts = CITY_DISTRICTS.map((id) => rainDrift(id));
    expect(new Set(drifts).size).toBe(CITY_DISTRICTS.length);
    expect(rainDrift("night_market")).toBeGreaterThan(STREET_DRIFT);
    expect(rainDrift("deadletter_docks")).toBeLessThan(rainDrift("relay_heights"));
  });

  it("the streaks take that drift, and a new cloud still starts at the street rate", () => {
    const rain = new Rain();
    expect(rain.driftNow()).toBe(STREET_DRIFT);
    rain.setDrift(rainDrift("night_market"));
    expect(rain.driftNow()).toBe(rainDrift("night_market"));
    rain.setDrift(rainDrift("lease_row"));
    expect(rain.driftNow()).toBe(STREET_DRIFT);
  });

  it("fails closed if the read is removed from the rain", () => {
    const rain = readFileSync(new URL("../client/render/rain.ts", import.meta.url), "utf8");
    const renderer = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(rain).toContain("function rainDrift");
    expect(rain).toContain("time * drift");
    expect(rain).toContain("drift: { value: STREET_DRIFT }");
    expect(renderer).toContain("this.rain.setDrift(rainDrift(level.name))");
    expect(renderer).toContain("if (air) this.rain.setWeather(air.rain, air.fall)");
  });
});
