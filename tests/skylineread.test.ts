/**
 * The docks and Relay Heights share a cast. They do not share a horizon.
 * Deadletter is a low harbor wall. Every other room keeps the towers.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { skylineRead } from "../client/render/city";

const TOWERS = ["lease_row", "relay_heights", "repo_depot", "night_market", "drainage_yard", "deadletter_office", "white_office"] as const;

describe("the docks do not read like the heights", () => {
  it("the harbor wall is lower than the towers, and the other rooms still are the towers", () => {
    const towers = skylineRead("relay_heights");
    const docks = skylineRead("deadletter_docks");
    expect(docks).not.toEqual(towers);
    expect(towers).toEqual({ base: 18, rise: 70, far: 50 });
    expect(docks.base + docks.rise + docks.far).toBeLessThan(towers.base + towers.far);
    for (const name of TOWERS) expect(skylineRead(name)).toEqual(towers);
    expect(skylineRead(undefined)).toEqual(towers);
  });

  it("the client builds the skyline for the level it is in", () => {
    const renderer = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(renderer).toContain("buildSkyline(this.scene, level.skylineSeed ?? 42, (level.bounds ?? 32) + 44, district, level.name)");
  });
});
