/**
 * The green hold is a nature preserve the file can enter. It loads, it has a
 * spawn and tree trunks, and it is not one of the twenty districts.
 */
import { describe, expect, it } from "vitest";
import { CITY_DISTRICTS } from "../shared/net/city";
import { GREEN_HOLD_ID } from "../shared/sim/preserve";
import { LEVEL_INFO, levelById } from "../shared/sim/level";

describe("the green hold", () => {
  it("loads a preserve with a spawn and trees and stays off the city list", () => {
    const level = levelById(GREEN_HOLD_ID);
    expect(level.name).toBe(GREEN_HOLD_ID);
    expect(level.spawns.length).toBeGreaterThan(0);
    expect(level.spawns[0]!.pos).toBeDefined();
    expect(level.boxes.filter((b) => b.tag === "tree").length).toBeGreaterThanOrEqual(6);
    expect(CITY_DISTRICTS).not.toContain(GREEN_HOLD_ID);
    expect(CITY_DISTRICTS).toHaveLength(20);
    expect(LEVEL_INFO.find((l) => l.id === GREEN_HOLD_ID)?.kind).not.toBe("district");
  });
});
