/**
 * The shop plinth does not share a sheen.
 * Lease Row keeps the gloss the blocks shipped with.
 * Colour stays on the base. No new mesh.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_PLINTH, plinthSheen } from "../client/render/city";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district wears its own plinth sheen", () => {
  it("keeps the street plinth and gives the other nineteen their own", () => {
    expect(STREET_PLINTH).toBe(0.8);
    expect(plinthSheen(undefined)).toBe(STREET_PLINTH);
    expect(plinthSheen("lease_row")).toBe(STREET_PLINTH);
    expect(plinthSheen("drainage_yard")).toBe(STREET_PLINTH);
    expect(plinthSheen("deadletter_office")).toBe(STREET_PLINTH);
    expect(plinthSheen("white_office")).toBe(STREET_PLINTH);
    const sheens = CITY_DISTRICTS.map((id) => plinthSheen(id));
    expect(new Set(sheens).size).toBe(CITY_DISTRICTS.length);
    expect(plinthSheen("night_market")).toBeLessThan(STREET_PLINTH);
    expect(plinthSheen("deadletter_docks")).toBeGreaterThan(plinthSheen("relay_heights"));
  });

  it("the dresser paints that sheen on the plinth it already lays", () => {
    const city = readFileSync(new URL("../client/render/city.ts", import.meta.url), "utf8");
    expect(city).toContain("base: std({ color: 0x10141c, roughness: plinthSheen(level.name), metalness: 0.1 })");
  });

  it("fails closed if the read is removed from the dresser", () => {
    const city = readFileSync(new URL("../client/render/city.ts", import.meta.url), "utf8");
    expect(city).toContain("function plinthSheen");
    expect(city).toContain("roughness: plinthSheen(level.name)");
  });
});
