/**
 * The airship's nose lamp does not share a colour.
 * Lease Row keeps the red the skyline shipped with.
 * The tram's tail lamps stay that red.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PALETTE } from "../client/render/city";
import { STREET_NOSE, shipLamp } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district lamps its own airship", () => {
  it("keeps the street red and gives the other nineteen their own", () => {
    expect(STREET_NOSE).toBe(PALETTE.red);
    expect(shipLamp(undefined)).toBe(PALETTE.red);
    expect(shipLamp("lease_row")).toBe(PALETTE.red);
    expect(shipLamp("drainage_yard")).toBe(PALETTE.red);
    expect(shipLamp("deadletter_office")).toBe(PALETTE.red);
    expect(shipLamp("white_office")).toBe(PALETTE.red);
    const lamps = CITY_DISTRICTS.map((id) => shipLamp(id));
    expect(new Set(lamps).size).toBe(CITY_DISTRICTS.length);
    expect(shipLamp("night_market")).not.toBe(PALETTE.red);
    expect(shipLamp("deadletter_docks")).not.toBe(shipLamp("relay_heights"));
  });

  it("the skyline lamps the level it was built in, and the tram tail stays red", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("color: shipLamp(name)");
    expect(life).toContain("new THREE.SphereGeometry(0.8, 8, 8)");
    expect(life).toContain("color: PALETTE.red");
  });
});
