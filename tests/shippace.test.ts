/**
 * The airship does not share a drift.
 * Lease Row keeps the orbit and the bob the skyline shipped with.
 * The circle stays 210 m and the bob stays 3 m.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_SHIP, shipPace } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district drifts its own airship", () => {
  it("keeps the street pace and gives the other nineteen their own", () => {
    expect(STREET_SHIP).toEqual({ orbit: 0.012, bob: 0.2 });
    expect(shipPace(undefined)).toEqual(STREET_SHIP);
    expect(shipPace("lease_row")).toEqual(STREET_SHIP);
    expect(shipPace("drainage_yard")).toEqual(STREET_SHIP);
    expect(shipPace("deadletter_office")).toEqual(STREET_SHIP);
    expect(shipPace("white_office")).toEqual(STREET_SHIP);
    const paces = CITY_DISTRICTS.map((id) => JSON.stringify(shipPace(id)));
    expect(new Set(paces).size).toBe(CITY_DISTRICTS.length);
    expect(shipPace("night_market").orbit).toBeGreaterThan(STREET_SHIP.orbit);
    expect(shipPace("deadletter_docks").orbit).toBeLessThan(STREET_SHIP.orbit);
    expect(shipPace("deadletter_docks")).not.toEqual(shipPace("relay_heights"));
    expect(shipPace("night_market")).not.toEqual(shipPace("lease_row"));
  });

  it("the skyline uses the pace for the level it was built in", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("this.pace = shipPace(name)");
    expect(life).toContain("dt * this.pace.orbit");
    expect(life).toContain("Math.sin(time * this.pace.bob) * 3");
    expect(life).toContain("const r = 210");
  });
});
