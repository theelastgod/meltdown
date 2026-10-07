/**
 * A hologram line does not share a letter size.
 * Lease Row keeps the 44px face the ticker shipped with.
 * Ink, copy, crawl, and veil stay where they were.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_GLYPH, adGlyph } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district sets its own ticker face", () => {
  it("keeps the street size and gives the other nineteen their own", () => {
    expect(STREET_GLYPH).toBe(44);
    expect(adGlyph(undefined)).toBe(STREET_GLYPH);
    expect(adGlyph("lease_row")).toBe(STREET_GLYPH);
    expect(adGlyph("drainage_yard")).toBe(STREET_GLYPH);
    expect(adGlyph("deadletter_office")).toBe(STREET_GLYPH);
    expect(adGlyph("white_office")).toBe(STREET_GLYPH);
    const glyphs = CITY_DISTRICTS.map((id) => adGlyph(id));
    expect(new Set(glyphs).size).toBe(CITY_DISTRICTS.length);
    expect(adGlyph("night_market")).toBeGreaterThan(STREET_GLYPH);
    expect(adGlyph("deadletter_docks")).toBeLessThan(adGlyph("relay_heights"));
    expect(adGlyph("night_market")).not.toBe(adGlyph("lease_row"));
  });

  it("the ticker draws that face for the level it was built in", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("bold ${adGlyph(this.district)}px 'Courier New', monospace");
    expect(life).toContain("opacity: adVeil(district)");
    expect(life).toContain("g.lineWidth = 3");
  });
});
