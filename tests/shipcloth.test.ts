/**
 * The airship's cloth does not share a colour.
 * Lease Row keeps the dark hull the skyline shipped with.
 * The nose lamp stays red there, and the capsule stays the same shape.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_CLOTH, shipCloth } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district dyes its own airship", () => {
  it("keeps the street cloth and gives the other nineteen their own", () => {
    expect(STREET_CLOTH).toBe(0x0a0c12);
    expect(shipCloth(undefined)).toBe(STREET_CLOTH);
    expect(shipCloth("lease_row")).toBe(STREET_CLOTH);
    expect(shipCloth("drainage_yard")).toBe(STREET_CLOTH);
    expect(shipCloth("deadletter_office")).toBe(STREET_CLOTH);
    expect(shipCloth("white_office")).toBe(STREET_CLOTH);
    const cloths = CITY_DISTRICTS.map((id) => shipCloth(id));
    expect(new Set(cloths).size).toBe(CITY_DISTRICTS.length);
    expect(shipCloth("night_market")).not.toBe(STREET_CLOTH);
    expect(shipCloth("deadletter_docks")).not.toBe(shipCloth("relay_heights"));
  });

  it("the skyline dyes the hull of the level it was built in", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("color: shipCloth(name)");
    expect(life).toContain("roughness: 0.8");
    expect(life).toContain("new THREE.CapsuleGeometry(9, 40, 4, 10)");
    expect(life).toContain("new THREE.SphereGeometry(0.8, 8, 8)");
  });
});
