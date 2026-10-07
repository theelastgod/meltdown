/**
 * A walker does not share a lamp.
 * Lease Row keeps the white the crowd shipped with.
 * The plate stays tex_lamp.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_LAMP, crowdLamp } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district lamps its own crowd", () => {
  it("keeps the street white and gives the other nineteen their own", () => {
    expect(STREET_LAMP).toBe(0xffffff);
    expect(crowdLamp(undefined)).toBe(STREET_LAMP);
    expect(crowdLamp("lease_row")).toBe(STREET_LAMP);
    expect(crowdLamp("drainage_yard")).toBe(STREET_LAMP);
    expect(crowdLamp("deadletter_office")).toBe(STREET_LAMP);
    expect(crowdLamp("white_office")).toBe(STREET_LAMP);
    const lamps = CITY_DISTRICTS.map((id) => crowdLamp(id));
    expect(new Set(lamps).size).toBe(CITY_DISTRICTS.length);
    expect(crowdLamp("night_market")).not.toBe(STREET_LAMP);
    expect(crowdLamp("deadletter_docks")).not.toBe(crowdLamp("relay_heights"));
  });

  it("the crowd tints the lamp for the level it was built in", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("color: crowdLamp(place)");
    expect(life).toContain('bindPlate(lampMat, "tex_lamp")');
    expect(life).toContain("new THREE.BoxGeometry(0.06, 0.06, 0.04)");
  });
});
