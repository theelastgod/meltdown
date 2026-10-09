/**
 * A walk does not turn its phase at the same rate on every street.
 * Lease Row, the yard, and the indoor rooms keep the 6 the gait shipped with.
 * Speed still adds 0.9. The camera lift stays 0.012. The sway stays 0.008.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { WALK_CLOCK, walkClock, walkRate } from "../client/render/pose";
import { CITY_DISTRICTS } from "../shared/net/city";

function phase(name: string | undefined, seconds: number): number {
  let p = 0;
  const speed = 4;
  const dt = 1 / 60;
  const steps = Math.ceil(seconds * 60 - 1e-9);
  for (let i = 0; i < steps; i++) p += dt * walkRate(speed, name);
  return p;
}

describe("each district turns a walk on its own clock", () => {
  it("keeps the street clock and gives the other nineteen their own", () => {
    expect(WALK_CLOCK).toBe(6);
    expect(walkRate(4)).toBeCloseTo(6 + 4 * 0.9, 6);
    expect(walkRate(4, "lease_row")).toBeCloseTo(6 + 4 * 0.9, 6);
    expect(walkClock(undefined)).toBe(WALK_CLOCK);
    expect(walkClock("lease_row")).toBe(WALK_CLOCK);
    expect(walkClock("drainage_yard")).toBe(WALK_CLOCK);
    expect(walkClock("deadletter_office")).toBe(WALK_CLOCK);
    expect(walkClock("white_office")).toBe(WALK_CLOCK);
    const clocks = CITY_DISTRICTS.map((id) => walkClock(id));
    expect(new Set(clocks).size).toBe(CITY_DISTRICTS.length);
    expect(walkClock("night_market")).toBeGreaterThan(WALK_CLOCK);
    expect(walkClock("deadletter_docks")).toBeLessThan(walkClock("relay_heights"));
  });

  it("has turned further on a quick street while the street clock is still the old one", () => {
    const street = phase("lease_row", 0.4);
    expect(street).toBeGreaterThan(0);
    expect(phase("night_market", 0.4)).toBeGreaterThan(street);
    expect(phase("deadletter_docks", 0.4)).toBeLessThan(phase("relay_heights", 0.4));
    expect(phase(undefined, 0.4)).toBeCloseTo(street, 6);
  });

  it("fails closed if the read is removed from the walk", () => {
    const pose = readFileSync(new URL("../client/render/pose.ts", import.meta.url), "utf8");
    const renderer = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(pose).toContain("function walkClock");
    expect(pose).toContain("export const WALK_CLOCK = 6");
    expect(pose).toContain("return walkClock(name) + speed * 0.9");
    expect(renderer).toContain("this.bobPhase += dt * walkRate(v.speed, this.placeName)");
    expect(renderer).toContain("e.phase += dt * walkRate(speed, this.placeName)");
    expect(renderer).toContain("Math.sin(this.bobPhase * 2) * 0.012");
    expect(renderer).toContain("Math.sin(this.bobPhase) * 0.008");
  });
});
