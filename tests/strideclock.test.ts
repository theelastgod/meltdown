/**
 * A crowd does not share a step.
 * Lease Row keeps the stride clock the street shipped with.
 * The wake cell is not a street, so it keeps that clock.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_STRIDE, citizenSwing, strideClock } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district steps to its own clock", () => {
  it("keeps the street clock and gives the other nineteen their own", () => {
    expect(STREET_STRIDE).toBe(6);
    expect(strideClock(undefined)).toBe(STREET_STRIDE);
    expect(strideClock("lease_row")).toBe(STREET_STRIDE);
    expect(strideClock("drainage_yard")).toBe(STREET_STRIDE);
    expect(strideClock("deadletter_office")).toBe(STREET_STRIDE);
    expect(strideClock("white_office")).toBe(STREET_STRIDE);
    const clocks = CITY_DISTRICTS.map((id) => strideClock(id));
    expect(new Set(clocks).size).toBe(CITY_DISTRICTS.length);
    expect(strideClock("night_market")).toBeGreaterThan(STREET_STRIDE);
    expect(strideClock("deadletter_docks")).toBeLessThan(strideClock("relay_heights"));
    const speed = 1.5;
    const phase = 0.4;
    expect(citizenSwing(0.2, speed, phase, false)).toBeCloseTo(citizenSwing(0.2, speed, phase, false, STREET_STRIDE), 9);
    expect(citizenSwing(0.2, speed, phase, false, strideClock("night_market"))).not.toBeCloseTo(citizenSwing(0.2, speed, phase, false), 5);
  });

  it("the crowd uses the clock for the level it was built in, and the wake cell does not", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    const escort = readFileSync(new URL("../client/render/escort.ts", import.meta.url), "utf8");
    expect(life).toContain("this.stride = strideClock(place)");
    expect(life).toContain("this.time * this.stride * ped.speed");
    expect(life).toContain("citizenSwing(this.time, ped.speed, ped.bob, ped.idle, this.stride)");
    expect(escort).toContain("citizenSwing(this.walked, 1, c.phase, false)");
    expect(escort).not.toContain("strideClock");
  });
});
