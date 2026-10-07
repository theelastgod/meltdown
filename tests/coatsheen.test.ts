/**
 * Leased coats do not share a sheen.
 * Lease Row keeps the matte cloth the crowd shipped with.
 * Hood colour stays on the hood. The stride stays strideClock.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_COAT, coatSheen } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district wears its own coat sheen", () => {
  it("keeps the street cloth and gives the other nineteen their own", () => {
    expect(STREET_COAT).toBe(0.9);
    expect(coatSheen(undefined)).toBe(STREET_COAT);
    expect(coatSheen("lease_row")).toBe(STREET_COAT);
    expect(coatSheen("drainage_yard")).toBe(STREET_COAT);
    expect(coatSheen("deadletter_office")).toBe(STREET_COAT);
    expect(coatSheen("white_office")).toBe(STREET_COAT);
    const sheens = CITY_DISTRICTS.map((id) => coatSheen(id));
    expect(new Set(sheens).size).toBe(CITY_DISTRICTS.length);
    expect(coatSheen("night_market")).toBeLessThan(STREET_COAT);
    expect(coatSheen("deadletter_docks")).toBeGreaterThan(coatSheen("relay_heights"));
  });

  it("the crowd wears the sheen for the level it was built in", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("roughness: coatSheen(place), metalness: 0.05");
    expect(life).toContain("color: 0x090a0f");
  });
});
