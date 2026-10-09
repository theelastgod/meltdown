/**
 * A sprint does not open the lens by the same number of degrees on every street.
 * Lease Row, the yard, and the indoor rooms keep the 7 degrees the sprint shipped with.
 * The camera pull stays 0.35 metres. The slide cap stays 1.5.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sprintFov, SPRINT_FOV, SPRINT_FOV_MAX, SPRINT_PULL, speedPush } from "../client/render/tps";
import { MOVE } from "../shared/sim/constants";
import { CITY_DISTRICTS } from "../shared/net/city";

function eased(name: string | undefined, seconds: number): number {
  const push = speedPush(MOVE.sprintSpeed, 1) * sprintFov(name);
  let fov = 0;
  const dt = 1 / 60;
  const steps = Math.ceil(seconds * 60 - 1e-9);
  for (let i = 0; i < steps; i++) fov += (push - fov) * Math.min(1, dt * 5);
  return fov;
}

describe("each district opens the sprint lens by its own amount", () => {
  it("keeps the street opening and gives the other nineteen their own", () => {
    expect(SPRINT_FOV).toBe(7);
    expect(SPRINT_PULL).toBe(0.35);
    expect(SPRINT_FOV_MAX).toBe(1.5);
    expect(sprintFov(undefined)).toBe(SPRINT_FOV);
    expect(sprintFov("lease_row")).toBe(SPRINT_FOV);
    expect(sprintFov("drainage_yard")).toBe(SPRINT_FOV);
    expect(sprintFov("deadletter_office")).toBe(SPRINT_FOV);
    expect(sprintFov("white_office")).toBe(SPRINT_FOV);
    const opens = CITY_DISTRICTS.map((id) => sprintFov(id));
    expect(new Set(opens).size).toBe(CITY_DISTRICTS.length);
    expect(sprintFov("night_market")).toBeGreaterThan(SPRINT_FOV);
    expect(sprintFov("deadletter_docks")).toBeLessThan(sprintFov("relay_heights"));
  });

  it("has opened further on a wide street while the street lens is still coming in", () => {
    const street = eased("lease_row", 0.2);
    expect(street).toBeGreaterThan(0);
    expect(street).toBeLessThan(SPRINT_FOV);
    expect(eased("night_market", 0.2)).toBeGreaterThan(street);
    expect(eased("deadletter_docks", 0.2)).toBeLessThan(eased("relay_heights", 0.2));
    expect(speedPush(MOVE.sprintSpeed, 1) * sprintFov("lease_row")).toBe(SPRINT_FOV);
  });

  it("fails closed if the read is removed from the sprint lens", () => {
    const tps = readFileSync(new URL("../client/render/tps.ts", import.meta.url), "utf8");
    const renderer = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(tps).toContain("function sprintFov");
    expect(tps).toContain("export const SPRINT_FOV = 7");
    expect(tps).toContain("export const SPRINT_PULL = 0.35");
    expect(tps).toContain("export const SPRINT_FOV_MAX = 1.5");
    expect(renderer).toContain("speedPush(v.speed, v.zoom) * sprintFov(this.placeName)");
    expect(renderer).toContain("SPRINT_PULL * (this.fovPush / widen)");
  });
});
