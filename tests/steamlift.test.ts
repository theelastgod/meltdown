/**
 * Grate steam does not share a rise.
 * Lease Row keeps the cycle the street shipped with.
 * The puff still climbs 3.2 and keeps its colour from steamTint.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_LIFT, steamLift } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district lifts its own steam", () => {
  it("keeps the street cycle and gives the other nineteen their own", () => {
    expect(STREET_LIFT).toBe(0.28);
    expect(steamLift(undefined)).toBe(STREET_LIFT);
    expect(steamLift("lease_row")).toBe(STREET_LIFT);
    expect(steamLift("drainage_yard")).toBe(STREET_LIFT);
    expect(steamLift("deadletter_office")).toBe(STREET_LIFT);
    expect(steamLift("white_office")).toBe(STREET_LIFT);
    const lifts = CITY_DISTRICTS.map((id) => steamLift(id));
    expect(new Set(lifts).size).toBe(CITY_DISTRICTS.length);
    expect(steamLift("night_market")).not.toBe(STREET_LIFT);
    expect(steamLift("deadletter_docks")).not.toBe(steamLift("relay_heights"));
  });

  it("the grate uses the lift for the level it was built in", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("uLift: { value: steamLift(name) }");
    expect(life).toContain("float life = fract(uTime * uLift + info.x)");
    expect(life).toContain("life * 3.2");
    expect(life).toContain("new Steam(level.vents, 28, 3, level.name)");
  });
});
