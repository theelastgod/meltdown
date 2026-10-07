/**
 * The slab blinkers do not share a size.
 * Lease Row keeps the bead the skyline shipped with.
 * The flash rate and the on-window stay on the points.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_BEAD, skyBead } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district sizes its own blinkers", () => {
  it("keeps the street bead and gives the other nineteen their own", () => {
    expect(STREET_BEAD).toBe(9);
    expect(skyBead(undefined)).toBe(STREET_BEAD);
    expect(skyBead("lease_row")).toBe(STREET_BEAD);
    expect(skyBead("drainage_yard")).toBe(STREET_BEAD);
    expect(skyBead("deadletter_office")).toBe(STREET_BEAD);
    expect(skyBead("white_office")).toBe(STREET_BEAD);
    const beads = CITY_DISTRICTS.map((id) => skyBead(id));
    expect(new Set(beads).size).toBe(CITY_DISTRICTS.length);
    expect(skyBead("night_market")).toBeGreaterThan(STREET_BEAD);
    expect(skyBead("deadletter_docks")).toBeLessThan(skyBead("relay_heights"));
  });

  it("the skyline draws the bead for the level it was built in", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("uBead: { value: skyBead(name) }");
    expect(life).toContain("gl_PointSize = uBead * (120.0 / max(1.0, -mv.z)) + 2.0");
    expect(life).toContain("step(0.92, fract(uTime * uRate + phase))");
  });
});
