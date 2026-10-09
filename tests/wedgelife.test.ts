/**
 * A hit's bearing does not fade off the screen at the same time on every street.
 * Lease Row, the yard, and the indoor rooms keep the 1.4 seconds the wedge shipped with.
 * The mark count stays four.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { HIT_LIFE, HIT_MAX, hitMarks, pruneHits, wedgeLife, type HitSource } from "../client/hud/damage";
import { CITY_DISTRICTS } from "../shared/net/city";

const at = { x: 0, z: 0 };
const hit = (): HitSource[] => [{ x: 0, z: -8, at: 0, damage: 10 }];

describe("each district keeps a hit bearing for its own time", () => {
  it("keeps the street wedge and gives the other nineteen their own", () => {
    expect(HIT_LIFE).toBe(1.4);
    expect(HIT_MAX).toBe(4);
    expect(wedgeLife(undefined)).toBe(HIT_LIFE);
    expect(wedgeLife("lease_row")).toBe(HIT_LIFE);
    expect(wedgeLife("drainage_yard")).toBe(HIT_LIFE);
    expect(wedgeLife("deadletter_office")).toBe(HIT_LIFE);
    expect(wedgeLife("white_office")).toBe(HIT_LIFE);
    const lives = CITY_DISTRICTS.map((id) => wedgeLife(id));
    expect(new Set(lives).size).toBe(CITY_DISTRICTS.length);
    expect(wedgeLife("night_market")).toBeGreaterThan(HIT_LIFE);
    expect(wedgeLife("deadletter_docks")).toBeLessThan(wedgeLife("relay_heights"));
  });

  it("is still on screen on a longer street after the street clock has gone", () => {
    expect(hitMarks(hit(), at.x, at.z, 0, HIT_LIFE, wedgeLife("lease_row"))).toHaveLength(0);
    const night = wedgeLife("night_market");
    expect(hitMarks(hit(), at.x, at.z, 0, HIT_LIFE, night)[0]!.alpha).toBeGreaterThan(0);
    expect(hitMarks(hit(), at.x, at.z, 0, night, night)).toHaveLength(0);
    const docks = wedgeLife("deadletter_docks");
    const heights = wedgeLife("relay_heights");
    expect(hitMarks(hit(), at.x, at.z, 0, docks, docks)).toHaveLength(0);
    expect(hitMarks(hit(), at.x, at.z, 0, docks, heights)[0]!.alpha).toBeGreaterThan(0);
    expect(pruneHits(hit(), HIT_LIFE, night)).toHaveLength(1);
    expect(pruneHits(hit(), HIT_LIFE, wedgeLife("lease_row"))).toHaveLength(0);
  });

  it("fails closed if the read is removed from the wedge", () => {
    const damage = readFileSync(new URL("../client/hud/damage.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(damage).toContain("function wedgeLife");
    expect(damage).toContain("export const HIT_LIFE = 1.4");
    expect(damage).toContain("export const HIT_MAX = 4");
    expect(game).toContain("pruneHits(this.hits, this.renderer.clockNow, wedgeLife(this.world.level.name))");
    expect(game).toContain("hitMarks(this.hits, p.pos.x, p.pos.z, view.yaw, this.renderer.clockNow, wedgeLife(this.world.level.name))");
  });
});
