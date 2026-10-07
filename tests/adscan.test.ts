/**
 * A hologram panel does not share a scanline pitch.
 * Lease Row keeps the 4px gap the ticker shipped with.
 * Ink, copy, crawl, veil, and letter size stay where they were.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_SCAN, adScan } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district sets its own ticker scan", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_SCAN).toBe(4);
    expect(adScan(undefined)).toBe(STREET_SCAN);
    expect(adScan("lease_row")).toBe(STREET_SCAN);
    expect(adScan("drainage_yard")).toBe(STREET_SCAN);
    expect(adScan("deadletter_office")).toBe(STREET_SCAN);
    expect(adScan("white_office")).toBe(STREET_SCAN);
    const scans = CITY_DISTRICTS.map((id) => adScan(id));
    expect(new Set(scans).size).toBe(CITY_DISTRICTS.length);
    expect(adScan("night_market")).toBeLessThan(STREET_SCAN);
    expect(adScan("deadletter_docks")).toBeGreaterThan(adScan("relay_heights"));
    expect(adScan("night_market")).not.toBe(adScan("lease_row"));
  });

  it("the ticker draws that pitch for the level it was built in", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("const scan = adScan(this.district)");
    expect(life).toContain("for (let y = 0; y < 128; y += scan)");
    expect(life).toContain('g.fillStyle = "rgba(0,0,0,0.25)"');
    expect(life).toContain("g.lineWidth = 3");
  });
});
