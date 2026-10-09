/**
 * A file does not come into focus on the same clock on every street.
 * Lease Row, the yard, and the indoor rooms keep the 1.0 second the picture shipped with.
 * The CRT weight stays 1.2. The lens pull stays 9 degrees.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SPAWN_CRT, SPAWN_FOV, SPAWN_TIME, spawnCurve, spawnSpan } from "../client/render/spawn";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district focuses a spawn-in on its own time", () => {
  it("keeps the street second and gives the other nineteen their own", () => {
    expect(SPAWN_TIME).toBe(1.0);
    expect(SPAWN_CRT).toBe(1.2);
    expect(SPAWN_FOV).toBe(9);
    expect(spawnSpan(undefined)).toBe(SPAWN_TIME);
    expect(spawnSpan("lease_row")).toBe(SPAWN_TIME);
    expect(spawnSpan("drainage_yard")).toBe(SPAWN_TIME);
    expect(spawnSpan("deadletter_office")).toBe(SPAWN_TIME);
    expect(spawnSpan("white_office")).toBe(SPAWN_TIME);
    const spans = CITY_DISTRICTS.map((id) => spawnSpan(id));
    expect(new Set(spans).size).toBe(CITY_DISTRICTS.length);
    expect(spawnSpan("night_market")).toBeGreaterThan(SPAWN_TIME);
    expect(spawnSpan("deadletter_docks")).toBeLessThan(spawnSpan("relay_heights"));
  });

  it("starts just as heavy, and a longer street is not done at one second", () => {
    const row = spawnSpan("lease_row");
    expect(spawnCurve(0, row).crt).toBeCloseTo(SPAWN_CRT, 6);
    expect(spawnCurve(0, row).fov).toBeCloseTo(-SPAWN_FOV, 6);
    expect(spawnCurve(row, row).live).toBe(false);
    const night = spawnSpan("night_market");
    expect(spawnCurve(0, night).crt).toBeCloseTo(SPAWN_CRT, 6);
    expect(spawnCurve(0, night).fov).toBeCloseTo(-SPAWN_FOV, 6);
    expect(spawnCurve(SPAWN_TIME, night).live).toBe(true);
    expect(spawnCurve(night, night).live).toBe(false);
    const docks = spawnSpan("deadletter_docks");
    const heights = spawnSpan("relay_heights");
    expect(spawnCurve(docks, docks).live).toBe(false);
    expect(spawnCurve(docks, heights).live).toBe(true);
  });

  it("fails closed if the read is removed from the camera", () => {
    const spawn = readFileSync(new URL("../client/render/spawn.ts", import.meta.url), "utf8");
    const renderer = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(spawn).toContain("function spawnSpan");
    expect(spawn).toContain("export const SPAWN_TIME = 1.0");
    expect(spawn).toContain("export const SPAWN_CRT = 1.2");
    expect(spawn).toContain("export const SPAWN_FOV = 9");
    expect(renderer).toContain("this.spawnT = spawnSpan(level.name)");
    expect(renderer).toContain("const born = spawnSpan(this.placeName)");
    expect(renderer).toContain("spawnCurve(this.spawnT, born)");
  });
});
