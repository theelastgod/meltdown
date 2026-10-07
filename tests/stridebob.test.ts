/**
 * A crowd does not share a bounce.
 * Lease Row keeps the lift the street shipped with.
 * The stride clock stays put. The wake cell is not a street, so it keeps that lift.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_BOB, strideBob } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district bobs its own crowd", () => {
  it("keeps the street lift and gives the other nineteen their own", () => {
    expect(STREET_BOB).toBe(0.04);
    expect(strideBob(undefined)).toBe(STREET_BOB);
    expect(strideBob("lease_row")).toBe(STREET_BOB);
    expect(strideBob("drainage_yard")).toBe(STREET_BOB);
    expect(strideBob("deadletter_office")).toBe(STREET_BOB);
    expect(strideBob("white_office")).toBe(STREET_BOB);
    const hops = CITY_DISTRICTS.map((id) => strideBob(id));
    expect(new Set(hops).size).toBe(CITY_DISTRICTS.length);
    expect(strideBob("night_market")).toBeGreaterThan(STREET_BOB);
    expect(strideBob("deadletter_docks")).toBeLessThan(strideBob("relay_heights"));
  });

  it("the crowd uses the lift for the level it was built in, and the wake cell does not", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    const escort = readFileSync(new URL("../client/render/escort.ts", import.meta.url), "utf8");
    expect(life).toContain("this.hop = strideBob(place)");
    expect(life).toContain("Math.abs(Math.sin(this.time * this.stride * ped.speed + ped.bob)) * this.hop");
    expect(life).not.toContain("ped.bob)) * 0.04");
    expect(escort).toContain("* 0.04");
    expect(escort).not.toContain("strideBob");
  });
});
