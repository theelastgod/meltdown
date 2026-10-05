/**
 * The lamps past the gates were one warm metal head in every district.
 * The box is still that box. The colour is the district's.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { lampRead } from "../client/render/city";

const PLACES = ["lease_row", "deadletter_docks", "repo_depot", "night_market", "relay_heights"] as const;

describe("the vista lamps are not one head five times", () => {
  it("five colours, and lease row keeps the warm head it had", () => {
    const colors = PLACES.map((name) => lampRead(name).color);
    expect(new Set(colors).size).toBe(PLACES.length);
    expect(lampRead("lease_row")).toEqual({ color: 0xfff1c8 });
    expect(lampRead(undefined)).toEqual({ color: 0xfff1c8 });
    expect(lampRead("drainage_yard")).toEqual({ color: 0xfff1c8 });
    expect(lampRead("deadletter_docks").color).toBe(0x67d7ea);
    expect(lampRead("night_market").color).toBe(0xff3ec9);
    expect(lampRead("repo_depot").color).toBe(0xffb02e);
    expect(lampRead("relay_heights").color).toBe(0xd5dde6);
  });

  it("the dresser paints that head from the district and does not grow a mesh for it", () => {
    const city = readFileSync(new URL("../client/render/city.ts", import.meta.url), "utf8");
    expect(city).toContain("lampHead: basic(lampRead(level.name).color)");
    expect(city).toContain('case "vista_lamp":');
    const lamp = city.slice(city.indexOf('case "vista_lamp":'), city.indexOf('case "beam":'));
    expect(lamp).toContain("M.lampHead");
    expect(lamp).not.toContain("new THREE");
  });
});
