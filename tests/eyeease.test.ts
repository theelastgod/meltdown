/**
 * The camera does not catch a crouch at the same rate on every street.
 * Lease Row, the yard, and the indoor rooms keep the 18 the eye shipped with.
 * A crouch stays 1.2 metres. The boot gap stays 1.9. Speed still adds 0.06.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EYE_EASE, eyeEase } from "../client/render/renderer";
import { CITY_DISTRICTS } from "../shared/net/city";

function caught(name: string | undefined, seconds: number): number {
  let eye = 0;
  const dt = 1 / 60;
  const steps = Math.ceil(seconds * 60 - 1e-9);
  for (let i = 0; i < steps; i++) eye += (1 - eye) * Math.min(1, dt * eyeEase(name));
  return eye;
}

describe("each district lets the camera catch a crouch on its own clock", () => {
  it("keeps the street ease and gives the other nineteen their own", () => {
    expect(EYE_EASE).toBe(18);
    expect(eyeEase(undefined)).toBe(EYE_EASE);
    expect(eyeEase("lease_row")).toBe(EYE_EASE);
    expect(eyeEase("drainage_yard")).toBe(EYE_EASE);
    expect(eyeEase("deadletter_office")).toBe(EYE_EASE);
    expect(eyeEase("white_office")).toBe(EYE_EASE);
    const eases = CITY_DISTRICTS.map((id) => eyeEase(id));
    expect(new Set(eases).size).toBe(CITY_DISTRICTS.length);
    expect(eyeEase("night_market")).toBeGreaterThan(EYE_EASE);
    expect(eyeEase("deadletter_docks")).toBeLessThan(eyeEase("relay_heights"));
  });

  it("has dropped further on a quick street while the street ease is still the old one", () => {
    const street = caught("lease_row", 0.08);
    expect(street).toBeGreaterThan(0);
    expect(street).toBeLessThan(1);
    expect(caught("night_market", 0.08)).toBeGreaterThan(street);
    expect(caught("deadletter_docks", 0.08)).toBeLessThan(caught("relay_heights", 0.08));
    expect(caught(undefined, 0.08)).toBeCloseTo(street, 6);
  });

  it("fails closed if the read is removed from the camera", () => {
    const src = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(src).toContain("function eyeEase");
    expect(src).toContain("export const EYE_EASE = 18");
    expect(src).toContain("this.eyeSmooth += (v.eye - this.eyeSmooth) * Math.min(1, dt * eyeEase(this.placeName))");
  });
});
