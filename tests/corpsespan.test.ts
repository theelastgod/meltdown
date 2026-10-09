/**
 * A closed file does not stay on the street for the same time everywhere.
 * Lease Row, the yard, and the indoor rooms keep the 1.2 seconds the body shipped with.
 * The fall itself still finishes in 0.45 seconds.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CORPSE_SECONDS, corpseSpan, createPoseState, poseBody } from "../client/render/pose";
import { CITY_DISTRICTS } from "../shared/net/city";

function dead(place: string | undefined, seconds: number): boolean {
  const st = createPoseState();
  const base = { speed: 0, moveYaw: 0, yaw: 0, pitch: 0, vy: 0, turnRate: 0, grounded: true, stance: "stand" as const, height: 1.8, reloading: 0, ads: 0 as const, kick: 0, swap: 0, charge: 0, hurt: 0, hurtFrom: 0, alive: true, stunned: false, clock: 0, phase: 0, place };
  poseBody(base, st, 1 / 60);
  let out = poseBody({ ...base, alive: false }, st, 1 / 60);
  const steps = Math.ceil(seconds * 60);
  for (let i = 0; i < steps; i++) out = poseBody({ ...base, alive: false, clock: i / 60 }, st, 1 / 60);
  return out.visible;
}

describe("each district keeps a body for its own time", () => {
  it("keeps the street linger and gives the other nineteen their own", () => {
    expect(CORPSE_SECONDS).toBe(1.2);
    expect(corpseSpan(undefined)).toBe(CORPSE_SECONDS);
    expect(corpseSpan("lease_row")).toBe(CORPSE_SECONDS);
    expect(corpseSpan("drainage_yard")).toBe(CORPSE_SECONDS);
    expect(corpseSpan("deadletter_office")).toBe(CORPSE_SECONDS);
    expect(corpseSpan("white_office")).toBe(CORPSE_SECONDS);
    const lives = CITY_DISTRICTS.map((id) => corpseSpan(id));
    expect(new Set(lives).size).toBe(CITY_DISTRICTS.length);
    expect(corpseSpan("night_market")).toBeGreaterThan(CORPSE_SECONDS);
    expect(corpseSpan("deadletter_docks")).toBeLessThan(corpseSpan("relay_heights"));
  });

  it("is still on a longer street after the street clock has cleared the body", () => {
    expect(dead(undefined, CORPSE_SECONDS)).toBe(false);
    expect(dead("lease_row", CORPSE_SECONDS)).toBe(false);
    expect(dead("night_market", CORPSE_SECONDS)).toBe(true);
    expect(dead("night_market", corpseSpan("night_market"))).toBe(false);
    expect(dead("deadletter_docks", corpseSpan("deadletter_docks"))).toBe(false);
    expect(dead("relay_heights", corpseSpan("deadletter_docks"))).toBe(true);
  });

  it("fails closed if the read is removed from the corpse fade", () => {
    const pose = readFileSync(new URL("../client/render/pose.ts", import.meta.url), "utf8");
    const renderer = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(pose).toContain("function corpseSpan");
    expect(pose).toContain("export const CORPSE_SECONDS = 1.2");
    expect(pose).toContain("const linger = corpseSpan(inp.place)");
    expect(pose).toContain("visible = st.corpseT < linger");
    expect(renderer).toContain("place: this.placeName");
  });
});
