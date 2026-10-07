/**
 * The airship hull does not share a sheen.
 * Lease Row keeps the roughness the skyline shipped with.
 * The cloth colour stays shipCloth.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_SHEEN, shipSheen } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district sheens its own airship", () => {
  it("keeps the street roughness and gives the other nineteen their own", () => {
    expect(STREET_SHEEN).toBe(0.8);
    expect(shipSheen(undefined)).toBe(STREET_SHEEN);
    expect(shipSheen("lease_row")).toBe(STREET_SHEEN);
    expect(shipSheen("drainage_yard")).toBe(STREET_SHEEN);
    expect(shipSheen("deadletter_office")).toBe(STREET_SHEEN);
    expect(shipSheen("white_office")).toBe(STREET_SHEEN);
    const sheens = CITY_DISTRICTS.map((id) => shipSheen(id));
    expect(new Set(sheens).size).toBe(CITY_DISTRICTS.length);
    expect(shipSheen("night_market")).toBeLessThan(STREET_SHEEN);
    expect(shipSheen("deadletter_docks")).toBeGreaterThan(shipSheen("relay_heights"));
  });

  it("the skyline uses the sheen for the level it was built in", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("color: shipCloth(name), roughness: shipSheen(name)");
    expect(life).toContain("new THREE.CapsuleGeometry(9, 40, 4, 10)");
  });
});
