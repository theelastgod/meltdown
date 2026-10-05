/**
 * The city past the gates is the same set of boxes in every district.
 * Their height is not. Lease Row keeps the blocks it had.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { vistaRead } from "../client/render/city";

const PLACES = ["lease_row", "deadletter_docks", "repo_depot", "night_market", "relay_heights"] as const;

describe("the outside is not the same city five times", () => {
  it("five rises, and lease row is the blocks the vista already had", () => {
    const rises = PLACES.map((name) => vistaRead(name).rise);
    expect(new Set(rises).size).toBe(PLACES.length);
    expect(vistaRead("lease_row")).toEqual({ rise: 1 });
    expect(vistaRead(undefined)).toEqual({ rise: 1 });
    expect(vistaRead("drainage_yard")).toEqual({ rise: 1 });
    expect(vistaRead("deadletter_docks").rise).toBeLessThan(vistaRead("night_market").rise);
    expect(vistaRead("night_market").rise).toBeLessThan(vistaRead("repo_depot").rise);
    expect(vistaRead("repo_depot").rise).toBeLessThan(1);
    expect(vistaRead("relay_heights").rise).toBeGreaterThan(1);
  });

  it("the dresser scales a vista block and leaves a rise of 1 untouched", () => {
    const city = readFileSync(new URL("../client/render/city.ts", import.meta.url), "utf8");
    expect(city).toContain("const rise = vistaRead(level.name).rise");
    expect(city).toContain("const built = rise === 1 ? d :");
  });
});
