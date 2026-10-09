/**
 * A round does not stay lit on a body for the same time on every street.
 * Lease Row, the yard, and the indoor rooms keep the 0.22 seconds the flash shipped with.
 * The flinch clock stays 0.42. The glow above rest stays 1.6.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decay, FLASH_LIFE, FLINCH_LIFE, flashLife, HIT_GLOW } from "../client/hit";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district keeps a hit lit for its own time", () => {
  it("keeps the street flash and gives the other nineteen their own", () => {
    expect(FLASH_LIFE).toBe(0.22);
    expect(FLINCH_LIFE).toBe(0.42);
    expect(HIT_GLOW).toBe(1.6);
    expect(flashLife(undefined)).toBe(FLASH_LIFE);
    expect(flashLife("lease_row")).toBe(FLASH_LIFE);
    expect(flashLife("drainage_yard")).toBe(FLASH_LIFE);
    expect(flashLife("deadletter_office")).toBe(FLASH_LIFE);
    expect(flashLife("white_office")).toBe(FLASH_LIFE);
    const lives = CITY_DISTRICTS.map((id) => flashLife(id));
    expect(new Set(lives).size).toBe(CITY_DISTRICTS.length);
    expect(flashLife("night_market")).toBeGreaterThan(FLASH_LIFE);
    expect(flashLife("deadletter_docks")).toBeLessThan(flashLife("relay_heights"));
  });

  it("is still lit on a longer street after the street clock has gone out", () => {
    expect(decay(1, FLASH_LIFE, flashLife("lease_row"))).toBe(0);
    const night = flashLife("night_market");
    expect(decay(1, FLASH_LIFE, night)).toBeGreaterThan(0);
    expect(decay(1, night, night)).toBe(0);
    const docks = flashLife("deadletter_docks");
    const heights = flashLife("relay_heights");
    expect(decay(1, docks, docks)).toBe(0);
    expect(decay(1, docks, heights)).toBeGreaterThan(0);
  });

  it("fails closed if the read is removed from the hit fade", () => {
    const hit = readFileSync(new URL("../client/hit.ts", import.meta.url), "utf8");
    const renderer = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(hit).toContain("function flashLife");
    expect(hit).toContain("export const FLASH_LIFE = 0.22");
    expect(hit).toContain("export const FLINCH_LIFE = 0.42");
    expect(hit).toContain("export const HIT_GLOW = 1.6");
    expect(renderer).toContain("const lit = flashLife(this.placeName)");
    expect(renderer).toContain("e.flash = decay(e.flash, dt, lit)");
    expect(renderer).toContain("e.hurt = decay(e.hurt, dt, FLINCH_LIFE)");
  });
});
