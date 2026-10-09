/**
 * A walk does not land its boots the same distance apart on every street.
 * Lease Row, the yard, and the indoor rooms keep the 1.9 metres the stride shipped with.
 * A crouch stays 1.2. Speed still adds 0.06 metres a second.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { bootGap, stepCues, STREET_GAP, strideOf, type Walker } from "../client/steps";
import { CITY_DISTRICTS } from "../shared/net/city";

function landings(name: string | undefined, seconds: number): number {
  const covered = new Map<number, number>();
  const w: Walker = { id: 1, x: 0, z: -3, speed: 4, stance: "stand", grounded: true, alive: true };
  let n = 0;
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) n += stepCues([w], { x: 0, z: 0, yaw: 0 }, covered, dt, name).length;
  return n;
}

describe("each district lands a boot on its own gap", () => {
  it("keeps the street gap and gives the other nineteen their own", () => {
    expect(STREET_GAP).toBe(1.9);
    expect(strideOf(4, "crouch", "night_market")).toBe(1.2);
    expect(strideOf(4, "stand")).toBeCloseTo(1.9 + 4 * 0.06, 6);
    expect(strideOf(4, "stand", "lease_row")).toBeCloseTo(1.9 + 4 * 0.06, 6);
    expect(bootGap(undefined)).toBe(STREET_GAP);
    expect(bootGap("lease_row")).toBe(STREET_GAP);
    expect(bootGap("drainage_yard")).toBe(STREET_GAP);
    expect(bootGap("deadletter_office")).toBe(STREET_GAP);
    expect(bootGap("white_office")).toBe(STREET_GAP);
    const gaps = CITY_DISTRICTS.map((id) => bootGap(id));
    expect(new Set(gaps).size).toBe(CITY_DISTRICTS.length);
    expect(bootGap("night_market")).toBeGreaterThan(STREET_GAP);
    expect(bootGap("deadletter_docks")).toBeLessThan(bootGap("relay_heights"));
  });

  it("lands fewer boots on a long street while the street gap is still the old one", () => {
    const street = landings("lease_row", 4);
    expect(street).toBeGreaterThan(0);
    expect(landings("night_market", 4)).toBeLessThan(street);
    expect(landings("deadletter_docks", 4)).toBeGreaterThan(landings("relay_heights", 4));
    expect(landings(undefined, 4)).toBe(street);
  });

  it("fails closed if the read is removed from the stride", () => {
    const steps = readFileSync(new URL("../client/steps.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(steps).toContain("function bootGap");
    expect(steps).toContain("export const STREET_GAP = 1.9");
    expect(steps).toContain('stance === "crouch" ? 1.2 : bootGap(name) + speed * 0.06');
    expect(steps).toContain("strideOf(w.speed, w.stance, name)");
    expect(game).toContain("strideOf(sp, p.stance, this.world.level.name)");
    expect(game).toContain("stepCues(w, this.listenPoint(), this.stepBook, SIM_DT, this.world.level.name)");
  });
});
