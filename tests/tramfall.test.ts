/**
 * The monorail pool does not share a falloff.
 * Lease Row keeps the decay the car shipped with.
 * Reach stays 18 and brightness stays tramGlow.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_FALL, tramFall } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district falls off its own monorail light", () => {
  it("keeps the street decay and gives the other nineteen their own", () => {
    expect(STREET_FALL).toBe(1.8);
    expect(tramFall(undefined)).toBe(STREET_FALL);
    expect(tramFall("lease_row")).toBe(STREET_FALL);
    expect(tramFall("drainage_yard")).toBe(STREET_FALL);
    expect(tramFall("deadletter_office")).toBe(STREET_FALL);
    expect(tramFall("white_office")).toBe(STREET_FALL);
    const falls = CITY_DISTRICTS.map((id) => tramFall(id));
    expect(new Set(falls).size).toBe(CITY_DISTRICTS.length);
    expect(tramFall("night_market")).toBeLessThan(STREET_FALL);
    expect(tramFall("deadletter_docks")).toBeGreaterThan(tramFall("relay_heights"));
  });

  it("the car uses the falloff for the level it was built in", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("new THREE.PointLight(livery.glass, tramGlow(name), 18, tramFall(name))");
    expect(life).toContain("color: 0xfff3d0");
    expect(life).toContain("color: PALETTE.red");
  });
});
