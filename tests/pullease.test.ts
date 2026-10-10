/**
 * The camera does not slide back out of a doorway at the same rate on every street.
 * Lease Row, the yard, and the indoor rooms keep the 10 the shoulder shipped with.
 * Pulling in against a wall stays immediate. The sprint pull stays 0.35 metres.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PULL_EASE, pullEase } from "../client/render/renderer";
import { CITY_DISTRICTS } from "../shared/net/city";

function out(name: string | undefined, seconds: number): number {
  let d = 0;
  const dt = 1 / 60;
  const steps = Math.ceil(seconds * 60 - 1e-9);
  for (let i = 0; i < steps; i++) d += (1 - d) * Math.min(1, dt * pullEase(name));
  return d;
}

describe("each district lets the camera slide back out on its own clock", () => {
  it("keeps the street ease and gives the other nineteen their own", () => {
    expect(PULL_EASE).toBe(10);
    expect(pullEase(undefined)).toBe(PULL_EASE);
    expect(pullEase("lease_row")).toBe(PULL_EASE);
    expect(pullEase("drainage_yard")).toBe(PULL_EASE);
    expect(pullEase("deadletter_office")).toBe(PULL_EASE);
    expect(pullEase("white_office")).toBe(PULL_EASE);
    const eases = CITY_DISTRICTS.map((id) => pullEase(id));
    expect(new Set(eases).size).toBe(CITY_DISTRICTS.length);
    expect(pullEase("night_market")).toBeGreaterThan(PULL_EASE);
    expect(pullEase("deadletter_docks")).toBeLessThan(pullEase("relay_heights"));
  });

  it("has slid further out on a quick street while the street ease is still the old one", () => {
    const street = out("lease_row", 0.08);
    expect(street).toBeGreaterThan(0);
    expect(street).toBeLessThan(1);
    expect(out("night_market", 0.08)).toBeGreaterThan(street);
    expect(out("deadletter_docks", 0.08)).toBeLessThan(out("relay_heights", 0.08));
    expect(out(undefined, 0.08)).toBeCloseTo(street, 6);
  });

  it("fails closed if the read is removed from the camera", () => {
    const src = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(src).toContain("function pullEase");
    expect(src).toContain("export const PULL_EASE = 10");
    expect(src).toContain("const k = Math.min(1, dt * pullEase(this.placeName))");
    expect(src).toContain("this.camSmooth.d = !this.camSmooth.set || cam.distance < this.camSmooth.d ? cam.distance : this.camSmooth.d + (cam.distance - this.camSmooth.d) * k");
    expect(src).toContain("this.shoulderSmooth = !this.camSmooth.set || wantOff < this.shoulderSmooth ? wantOff : this.shoulderSmooth + (wantOff - this.shoulderSmooth) * k");
  });
});
