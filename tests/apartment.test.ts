/**
 * The file apartment is one indoor room. It loads, it has a spawn, and it
 * is not one of the twenty districts.
 */
import { describe, expect, it } from "vitest";
import { CITY_DISTRICTS } from "../shared/net/city";
import { FILE_APARTMENT_ID } from "../shared/sim/apartment";
import { LEVEL_INFO, levelById } from "../shared/sim/level";

describe("the file apartment", () => {
  it("loads a room with a spawn and stays off the city list", () => {
    const level = levelById(FILE_APARTMENT_ID);
    expect(level.name).toBe(FILE_APARTMENT_ID);
    expect(level.spawns.length).toBeGreaterThan(0);
    expect(level.spawns[0]!.pos).toBeDefined();
    expect(CITY_DISTRICTS).not.toContain(FILE_APARTMENT_ID);
    expect(LEVEL_INFO.find((l) => l.id === FILE_APARTMENT_ID)?.kind).not.toBe("district");
    expect(level.boxes.filter((b) => b.tag === "wall")).toHaveLength(4);
    expect(level.boxes.some((b) => b.tag === "floor")).toBe(true);
    expect(level.tram).toBeUndefined();
    expect(level.exits ?? []).toEqual([]);
  });
});
