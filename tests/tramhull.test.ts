/**
 * The monorail body does not share a colour.
 * Lease Row keeps the hull the car shipped with.
 * Heads stay warm and tails stay red.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_HULL, tramHull } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district paints its own monorail hull", () => {
  it("keeps the street hull and gives the other nineteen their own", () => {
    expect(STREET_HULL).toBe(0x141a24);
    expect(tramHull(undefined)).toBe(STREET_HULL);
    expect(tramHull("lease_row")).toBe(STREET_HULL);
    expect(tramHull("drainage_yard")).toBe(STREET_HULL);
    expect(tramHull("deadletter_office")).toBe(STREET_HULL);
    expect(tramHull("white_office")).toBe(STREET_HULL);
    const hulls = CITY_DISTRICTS.map((id) => tramHull(id));
    expect(new Set(hulls).size).toBe(CITY_DISTRICTS.length);
    expect(tramHull("night_market")).not.toBe(STREET_HULL);
    expect(tramHull("deadletter_docks")).not.toBe(tramHull("relay_heights"));
  });

  it("the car uses the hull for the level it was built in", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("color: tramHull(name)");
    expect(life).toContain("roughness: 0.4, metalness: 0.6");
    expect(life).toContain("color: 0xfff3d0");
    expect(life).toContain("color: PALETTE.red");
  });
});
