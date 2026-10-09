/**
 * A closed file does not swing the camera onto its killer at the same rate on every street.
 * Lease Row, the yard, and the indoor rooms keep 2.6 per second. The landing dip and the slide roll stay.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DEATH_TURN, deathTurn } from "../client/render/feel";
import { CITY_DISTRICTS } from "../shared/net/city";

function blend(name: string | undefined, seconds: number): number {
  let b = 0;
  const steps = Math.ceil(seconds * 60 - 1e-9);
  const dt = 1 / 60;
  for (let i = 0; i < steps; i++) b = Math.min(1, b + dt * deathTurn(name));
  return b;
}

describe("each district swings the death camera at its own rate", () => {
  it("keeps the street rate and gives the other nineteen their own", () => {
    expect(DEATH_TURN).toBe(2.6);
    expect(deathTurn(undefined)).toBe(DEATH_TURN);
    expect(deathTurn("lease_row")).toBe(DEATH_TURN);
    expect(deathTurn("drainage_yard")).toBe(DEATH_TURN);
    expect(deathTurn("deadletter_office")).toBe(DEATH_TURN);
    expect(deathTurn("white_office")).toBe(DEATH_TURN);
    const rates = CITY_DISTRICTS.map((id) => deathTurn(id));
    expect(new Set(rates).size).toBe(CITY_DISTRICTS.length);
    expect(deathTurn("night_market")).toBeLessThan(DEATH_TURN);
    expect(deathTurn("deadletter_docks")).toBeGreaterThan(deathTurn("relay_heights"));
  });

  it("has arrived on a fast street while a slow street is still turning", () => {
    const street = 1 / DEATH_TURN;
    expect(blend("lease_row", street)).toBe(1);
    expect(blend("night_market", street)).toBeLessThan(1);
    expect(blend("night_market", 1 / deathTurn("night_market"))).toBe(1);
    const docks = 1 / deathTurn("deadletter_docks");
    expect(blend("deadletter_docks", docks)).toBe(1);
    expect(blend("relay_heights", docks)).toBeLessThan(1);
  });

  it("fails closed if the read is removed from the death swing", () => {
    const feel = readFileSync(new URL("../client/render/feel.ts", import.meta.url), "utf8");
    const renderer = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(feel).toContain("function deathTurn");
    expect(feel).toContain("export const DEATH_TURN = 2.6");
    expect(renderer).toContain("dt * deathTurn(this.placeName)");
  });
});
