/**
 * The car does not share a pool of light.
 * Lease Row keeps the brightness the street shipped with.
 * The reach stays 18 and the glass colour stays the livery.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_GLOW, tramGlow } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district lights its own monorail", () => {
  it("keeps the street pool and gives the other nineteen their own", () => {
    expect(STREET_GLOW).toBe(6);
    expect(tramGlow(undefined)).toBe(STREET_GLOW);
    expect(tramGlow("lease_row")).toBe(STREET_GLOW);
    expect(tramGlow("drainage_yard")).toBe(STREET_GLOW);
    expect(tramGlow("deadletter_office")).toBe(STREET_GLOW);
    expect(tramGlow("white_office")).toBe(STREET_GLOW);
    const glows = CITY_DISTRICTS.map((id) => tramGlow(id));
    expect(new Set(glows).size).toBe(CITY_DISTRICTS.length);
    expect(tramGlow("night_market")).toBeGreaterThan(STREET_GLOW);
    expect(tramGlow("deadletter_docks")).toBeLessThan(tramGlow("relay_heights"));
  });

  it("the car uses the glow for the level it was built in", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("new THREE.PointLight(livery.glass, tramGlow(name), 18, 1.8)");
    expect(life).toContain("color: 0xfff3d0");
    expect(life).toContain("color: PALETTE.red");
  });
});
