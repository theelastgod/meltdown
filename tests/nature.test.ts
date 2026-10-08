import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { groveSpots } from "../shared/city/nature";

const walk = (i: number) => ({ x0: i * 4, z0: 0, x1: i * 4 + 2, z1: 8 });

describe("nature on existing streets", () => {
  it("plants a kerb on a walked street and leaves indoor rooms bare", () => {
    const walks = [0, 1, 2, 3, 4, 5, 6, 7].map(walk);
    expect(groveSpots("lease_row", walks)).toHaveLength(6);
    expect(groveSpots("white_office", walks)).toEqual([]);
    expect(groveSpots("drainage_yard", walks)).toEqual([]);
    expect(groveSpots(undefined, walks)).toEqual([]);
    expect(groveSpots("night_market", [])).toEqual([]);
    expect(groveSpots("lease_row", walks)[0]).not.toEqual(groveSpots("night_market", walks)[0]);
  });

  it("the city draws those spots off the dressed level", () => {
    const src = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(src).toMatch(/groveSpots\(level\.name, level\.walks/);
    expect(src).toMatch(/street-grove/);
    expect(src).toMatch(/layers\.set\(FAR_LAYER\)/);
  });
});
