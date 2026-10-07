/**
 * The street rig does not share a falloff.
 * Lease Row keeps the decay the lamps shipped with.
 * Intensity and range stay on the level. No new light.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_RIG, rigFall } from "../client/render/renderer";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district falls off its own street rig", () => {
  it("keeps the street decay and gives the other nineteen their own", () => {
    expect(STREET_RIG).toBe(1.5);
    expect(rigFall(undefined)).toBe(STREET_RIG);
    expect(rigFall("lease_row")).toBe(STREET_RIG);
    expect(rigFall("drainage_yard")).toBe(STREET_RIG);
    expect(rigFall("deadletter_office")).toBe(STREET_RIG);
    expect(rigFall("white_office")).toBe(STREET_RIG);
    const falls = CITY_DISTRICTS.map((id) => rigFall(id));
    expect(new Set(falls).size).toBe(CITY_DISTRICTS.length);
    expect(rigFall("night_market")).toBeGreaterThan(STREET_RIG);
    expect(rigFall("deadletter_docks")).toBeLessThan(rigFall("relay_heights"));
  });

  it("the rig paints that decay on the point lights it already hangs", () => {
    const src = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(src).toContain("new THREE.PointLight(colors[l.color], l.intensity, l.range, rigFall(level.name))");
  });

  it("fails closed if the read is removed from the rig", () => {
    const src = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(src).toContain("function rigFall");
    expect(src).toContain("rigFall(level.name)");
  });
});
