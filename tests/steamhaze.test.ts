/**
 * A grate puff does not share a thickness.
 * Lease Row keeps the alpha the street shipped with.
 * Tint, rise, width, climb, and point count stay where they were.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_HAZE, steamHaze } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district hazes its own steam", () => {
  it("keeps the street alpha and gives the other nineteen their own", () => {
    expect(STREET_HAZE).toBe(0.16);
    expect(steamHaze(undefined)).toBe(STREET_HAZE);
    expect(steamHaze("lease_row")).toBe(STREET_HAZE);
    expect(steamHaze("drainage_yard")).toBe(STREET_HAZE);
    expect(steamHaze("deadletter_office")).toBe(STREET_HAZE);
    expect(steamHaze("white_office")).toBe(STREET_HAZE);
    const hazes = CITY_DISTRICTS.map((id) => steamHaze(id));
    expect(new Set(hazes).size).toBe(CITY_DISTRICTS.length);
    expect(steamHaze("night_market")).toBeGreaterThan(STREET_HAZE);
    expect(steamHaze("deadletter_docks")).toBeLessThan(steamHaze("relay_heights"));
  });

  it("the grate uses the haze for the level it was built in", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("uHaze: { value: steamHaze(name) }");
    expect(life).toContain("float a = smoothstep(0.5, 0.1, d) * vA * uHaze;");
    expect(life).toContain("life * 3.2");
    expect(life).toContain("new Steam(level.vents, 28, 3, level.name)");
    expect(life).not.toContain("float a = smoothstep(0.5, 0.1, d) * vA * 0.16;");
  });
});
