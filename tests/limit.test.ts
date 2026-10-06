/**
 * The city limit is open ground outside the city. It loads, it has a spawn,
 * and it is not one of the twenty districts.
 */
import { describe, expect, it } from "vitest";
import { CITY_DISTRICTS } from "../shared/net/city";
import { CITY_LIMIT_ID } from "../shared/sim/limit";
import { LEVEL_INFO, levelById } from "../shared/sim/level";

describe("the city limit", () => {
  it("loads an open walk with a spawn and stays off the city list", () => {
    const level = levelById(CITY_LIMIT_ID);
    expect(level.name).toBe(CITY_LIMIT_ID);
    expect(level.spawns.length).toBeGreaterThan(0);
    expect(level.spawns[0]!.pos).toBeDefined();
    expect(level.bounds ?? 0).toBeGreaterThanOrEqual(40);
    expect(CITY_DISTRICTS).not.toContain(CITY_LIMIT_ID);
    expect(CITY_DISTRICTS).toHaveLength(20);
    expect(LEVEL_INFO.find((l) => l.id === CITY_LIMIT_ID)?.kind).not.toBe("district");
    expect(level.boxes.filter((b) => b.tag === "floor")).toHaveLength(1);
    expect(level.boxes.filter((b) => b.tag === "ridge")).toHaveLength(3);
    expect(level.exits ?? []).toEqual([]);
    expect(level.tram).toBeUndefined();
    expect(level.signs ?? []).toEqual([]);
    expect(level.dummies).toEqual([]);
    expect(level.wasps).toEqual([]);
    expect(level.mechs).toEqual([]);
  });
});
