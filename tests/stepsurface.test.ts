/**
 * Lease Row and Night Market share a cast. They do not share a step.
 * Night Market is stall tile. Every other room keeps the wet street.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { stepSurface } from "../client/audio";

const STREET = ["lease_row", "deadletter_docks", "repo_depot", "relay_heights", "drainage_yard", "deadletter_office", "white_office"] as const;

describe("night market does not step like lease row", () => {
  it("the stall tile is not the wet street, and the other rooms still are", () => {
    const row = stepSurface("lease_row");
    const market = stepSurface("night_market");
    expect(market).not.toEqual(row);
    expect(row).toEqual({ hz: 260, dur: 0.06, q: 0.7, type: "lowpass" });
    expect(market.hz).toBeGreaterThan(row.hz);
    expect(market.dur).toBeLessThan(row.dur);
    expect(market.type).not.toBe(row.type);
    for (const name of STREET) expect(stepSurface(name)).toEqual(row);
    expect(stepSurface(undefined)).toEqual(row);
  });

  it("the client steps on the level it built", () => {
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toContain("this.audio.footstep(sp, this.stepSide * 0.25, this.world.level.name)");
  });
});
