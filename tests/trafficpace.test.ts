/**
 * The streaks past the gates do not share a pace.
 * Lease Row keeps the lane speed the vista shipped with.
 * Head and tail colours stay on the same segments.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_PACE, Traffic, trafficPace } from "../client/render/city";
import { CITY_DISTRICTS } from "../shared/net/city";

const LANE = { from: { x: 0, y: 8, z: 0 }, to: { x: 80, y: 8, z: 0 }, speed: 12, count: 1 };

describe("each district runs its own far traffic", () => {
  it("keeps the street pace and gives the other nineteen their own", () => {
    expect(STREET_PACE).toBe(1);
    expect(trafficPace(undefined)).toBe(STREET_PACE);
    expect(trafficPace("lease_row")).toBe(STREET_PACE);
    expect(trafficPace("drainage_yard")).toBe(STREET_PACE);
    expect(trafficPace("deadletter_office")).toBe(STREET_PACE);
    expect(trafficPace("white_office")).toBe(STREET_PACE);
    const paces = CITY_DISTRICTS.map((id) => trafficPace(id));
    expect(new Set(paces).size).toBe(CITY_DISTRICTS.length);
    expect(trafficPace("night_market")).toBeGreaterThan(STREET_PACE);
    expect(trafficPace("deadletter_docks")).toBeLessThan(trafficPace("relay_heights"));
  });

  it("the same lane moves farther where the pace is higher", () => {
    const slow = new Traffic([LANE], 5, "deadletter_docks");
    const fast = new Traffic([LANE], 5, "night_market");
    const at = (t: Traffic) => t.object.geometry.getAttribute("position").array[0] as number;
    const before = at(slow);
    expect(at(fast)).toBe(before);
    slow.update(1);
    fast.update(1);
    expect(at(fast) - before).toBeGreaterThan(at(slow) - before);
  });

  it("the streaks multiply the lane by the district pace", () => {
    const city = readFileSync(new URL("../client/render/city.ts", import.meta.url), "utf8");
    expect(city).toContain("this.pace = trafficPace(name)");
    expect(city).toContain("c.lane.speed * this.pace");
    expect(city).toContain("opacity: 0.9");
  });
});
