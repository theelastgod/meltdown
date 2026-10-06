/**
 * A hologram panel does not share a veil.
 * Lease Row keeps the opacity the ticker shipped with.
 * Ink, copy, and crawl stay where they were.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_VEIL, adVeil } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district veils its own hologram", () => {
  it("keeps the street veil and gives the other nineteen their own", () => {
    expect(STREET_VEIL).toBe(0.85);
    expect(adVeil(undefined)).toBe(STREET_VEIL);
    expect(adVeil("lease_row")).toBe(STREET_VEIL);
    expect(adVeil("drainage_yard")).toBe(STREET_VEIL);
    expect(adVeil("deadletter_office")).toBe(STREET_VEIL);
    expect(adVeil("white_office")).toBe(STREET_VEIL);
    const veils = CITY_DISTRICTS.map((id) => adVeil(id));
    expect(new Set(veils).size).toBe(CITY_DISTRICTS.length);
    expect(adVeil("night_market")).toBeGreaterThan(STREET_VEIL);
    expect(adVeil("deadletter_docks")).toBeLessThan(adVeil("relay_heights"));
  });

  it("the panel uses the veil for the level it was built in", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("opacity: adVeil(district)");
    expect(life).toContain("const crawl = adCrawl(this.district)");
    expect(life).toContain('"#35f2ff"');
  });
});
