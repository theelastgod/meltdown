/**
 * Umbrellas do not share a cloth.
 * Lease Row keeps the dark canopy the crowd shipped with.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_BROLLY, brollyRead } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district carries its own umbrella", () => {
  it("keeps the street canopy and gives the other nineteen their own", () => {
    expect(STREET_BROLLY).toBe(0x0e1218);
    expect(brollyRead(undefined)).toBe(STREET_BROLLY);
    expect(brollyRead("lease_row")).toBe(STREET_BROLLY);
    expect(brollyRead("drainage_yard")).toBe(STREET_BROLLY);
    expect(brollyRead("deadletter_office")).toBe(STREET_BROLLY);
    expect(brollyRead("white_office")).toBe(STREET_BROLLY);
    const colours = CITY_DISTRICTS.map((id) => brollyRead(id));
    expect(new Set(colours).size).toBe(CITY_DISTRICTS.length);
    expect(brollyRead("night_market")).not.toBe(brollyRead("lease_row"));
    expect(brollyRead("deadletter_docks")).not.toBe(brollyRead("relay_heights"));
  });

  it("the crowd tints the canopy for the level it was built in", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("color: brollyRead(place)");
    expect(life).toContain("roughness: 0.8, side: THREE.DoubleSide");
  });
});
