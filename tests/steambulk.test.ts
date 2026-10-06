/**
 * A grate puff does not share a width.
 * Lease Row keeps the size the street shipped with.
 * Tint, rise, climb, and point count stay where they were.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_BULK, steamBulk } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district bulks its own steam", () => {
  it("keeps the street puff and gives the other nineteen their own", () => {
    expect(STREET_BULK).toBe(1);
    expect(steamBulk(undefined)).toBe(STREET_BULK);
    expect(steamBulk("lease_row")).toBe(STREET_BULK);
    expect(steamBulk("drainage_yard")).toBe(STREET_BULK);
    expect(steamBulk("deadletter_office")).toBe(STREET_BULK);
    expect(steamBulk("white_office")).toBe(STREET_BULK);
    const bulks = CITY_DISTRICTS.map((id) => steamBulk(id));
    expect(new Set(bulks).size).toBe(CITY_DISTRICTS.length);
    expect(steamBulk("night_market")).toBeGreaterThan(STREET_BULK);
    expect(steamBulk("deadletter_docks")).toBeLessThan(steamBulk("relay_heights"));
  });

  it("the grate uses the bulk for the level it was built in", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("uBulk: { value: steamBulk(name) }");
    expect(life).toContain("gl_PointSize = (18.0 + life * 60.0) * uBulk * (30.0 / max(1.0, -mv.z))");
    expect(life).toContain("life * 3.2");
    expect(life).toContain("new Steam(level.vents, 28, 3, level.name)");
    expect(life).not.toContain("gl_PointSize = (18.0 + life * 60.0) * (30.0 / max(1.0, -mv.z))");
  });
});
