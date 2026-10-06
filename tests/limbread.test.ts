/**
 * Shoes, shins, and sleeves do not share a colour.
 * Lease Row keeps the three the crowd shipped with.
 * The wake cell is not a street, so it keeps those three.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_LIMB, limbRead } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

const red = (n: number) => ((n >> 16) & 255) / 255;

describe("each district dresses its own limbs", () => {
  it("keeps the street limbs and gives the other nineteen their own", () => {
    expect(STREET_LIMB).toEqual({ shoe: 0x14110e, shin: 0x4a433c, cloth: 0xffffff });
    expect(limbRead(undefined)).toEqual(STREET_LIMB);
    expect(limbRead("lease_row")).toEqual(STREET_LIMB);
    expect(limbRead("drainage_yard")).toEqual(STREET_LIMB);
    expect(limbRead("deadletter_office")).toEqual(STREET_LIMB);
    expect(limbRead("white_office")).toEqual(STREET_LIMB);
    const seen = new Set<string>();
    for (const id of CITY_DISTRICTS) {
      const limb = limbRead(id);
      expect(red(limb.shoe), id).toBeLessThan(red(limb.shin));
      expect(red(limb.shin), id).toBeLessThan(red(limb.cloth));
      seen.add(JSON.stringify(limb));
    }
    expect(seen.size).toBe(CITY_DISTRICTS.length);
    expect(limbRead("night_market")).not.toEqual(limbRead("lease_row"));
    expect(limbRead("deadletter_docks")).not.toEqual(limbRead("relay_heights"));
  });

  it("the crowd paints the level it was built in, and the wake cell does not", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    const escort = readFileSync(new URL("../client/render/escort.ts", import.meta.url), "utf8");
    expect(life).toContain("paintCitizenLimbs(this.limbs, count, place)");
    expect(escort).toContain("paintCitizenLimbs(this.cellLimbs, n)");
    expect(escort).not.toContain("paintCitizenLimbs(this.cellLimbs, n,");
  });
});
