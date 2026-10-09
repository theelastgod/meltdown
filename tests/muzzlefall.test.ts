/**
 * A muzzle flash does not die at the same rate on every street.
 * Lease Row, the yard, and the indoor rooms keep the 18 the lamp shipped with.
 * The peak stays 1. The lamp stays intensity times 8. The light's decay stays 2.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MUZZLE_FALL, muzzleFall } from "../client/render/renderer";
import { CITY_DISTRICTS } from "../shared/net/city";

function left(name: string | undefined, seconds: number): number {
  let flash = 1;
  const dt = 1 / 60;
  const steps = Math.ceil(seconds * 60 - 1e-9);
  for (let i = 0; i < steps; i++) flash = Math.max(0, flash - dt * muzzleFall(name));
  return flash;
}

describe("each district lets a muzzle flash fall on its own clock", () => {
  it("keeps the street fall and gives the other nineteen their own", () => {
    expect(MUZZLE_FALL).toBe(18);
    expect(muzzleFall(undefined)).toBe(MUZZLE_FALL);
    expect(muzzleFall("lease_row")).toBe(MUZZLE_FALL);
    expect(muzzleFall("drainage_yard")).toBe(MUZZLE_FALL);
    expect(muzzleFall("deadletter_office")).toBe(MUZZLE_FALL);
    expect(muzzleFall("white_office")).toBe(MUZZLE_FALL);
    const falls = CITY_DISTRICTS.map((id) => muzzleFall(id));
    expect(new Set(falls).size).toBe(CITY_DISTRICTS.length);
    expect(muzzleFall("night_market")).toBeGreaterThan(MUZZLE_FALL);
    expect(muzzleFall("deadletter_docks")).toBeLessThan(muzzleFall("relay_heights"));
  });

  it("has faded further on a quick street while the street fall is still the old one", () => {
    const street = left("lease_row", 0.03);
    expect(street).toBeGreaterThan(0);
    expect(street).toBeLessThan(1);
    expect(left("night_market", 0.03)).toBeLessThan(street);
    expect(left("deadletter_docks", 0.03)).toBeGreaterThan(left("relay_heights", 0.03));
    expect(left(undefined, 0.03)).toBeCloseTo(street, 6);
  });

  it("fails closed if the read is removed from the flash", () => {
    const src = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(src).toContain("function muzzleFall");
    expect(src).toContain("export const MUZZLE_FALL = 18");
    expect(src).toContain("this.muzzleT = Math.max(0, this.muzzleT - dt * muzzleFall(this.placeName))");
    expect(src).toContain("this.muzzle.intensity = onBody ? 0 : this.muzzleT * 8");
    expect(src).toContain("this.handMuzzle.intensity = onBody ? this.muzzleT * 8 : 0");
    expect(src).toContain("new THREE.PointLight(PALETTE.cyan, 0, 7, 2)");
    expect(src).toContain("this.eyeSmooth += (v.eye - this.eyeSmooth) * Math.min(1, dt * 18)");
  });
});
