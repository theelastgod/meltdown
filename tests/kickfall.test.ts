/**
 * A shot does not settle its shove at the same rate on every street.
 * Lease Row, the yard, and the indoor rooms keep the 14 the viewmodel shipped with.
 * The shove stays 0.06 metres and the tip stays 0.08 radians. The lens ease stays 14.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { KICK_FALL, kickFall } from "../client/render/renderer";
import { CITY_DISTRICTS } from "../shared/net/city";

function left(name: string | undefined, seconds: number): number {
  let kick = 1;
  const dt = 1 / 60;
  const steps = Math.ceil(seconds * 60 - 1e-9);
  for (let i = 0; i < steps; i++) kick = Math.max(0, kick - dt * kickFall(name));
  return kick;
}

describe("each district lets a shot's shove fall on its own clock", () => {
  it("keeps the street fall and gives the other nineteen their own", () => {
    expect(KICK_FALL).toBe(14);
    expect(kickFall(undefined)).toBe(KICK_FALL);
    expect(kickFall("lease_row")).toBe(KICK_FALL);
    expect(kickFall("drainage_yard")).toBe(KICK_FALL);
    expect(kickFall("deadletter_office")).toBe(KICK_FALL);
    expect(kickFall("white_office")).toBe(KICK_FALL);
    const falls = CITY_DISTRICTS.map((id) => kickFall(id));
    expect(new Set(falls).size).toBe(CITY_DISTRICTS.length);
    expect(kickFall("night_market")).toBeGreaterThan(KICK_FALL);
    expect(kickFall("deadletter_docks")).toBeLessThan(kickFall("relay_heights"));
  });

  it("has settled further on a quick street while the street fall is still the old one", () => {
    const street = left("lease_row", 0.04);
    expect(street).toBeGreaterThan(0);
    expect(street).toBeLessThan(1);
    expect(left("night_market", 0.04)).toBeLessThan(street);
    expect(left("deadletter_docks", 0.04)).toBeGreaterThan(left("relay_heights", 0.04));
    expect(left(undefined, 0.04)).toBeCloseTo(street, 6);
  });

  it("fails closed if the read is removed from the shove", () => {
    const src = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(src).toContain("function kickFall");
    expect(src).toContain("export const KICK_FALL = 14");
    expect(src).toContain("e.kick = Math.max(0, e.kick - dt * kickFall(this.placeName))");
    expect(src).toContain("this.vmKick = Math.max(0, this.vmKick - dt * kickFall(this.placeName))");
    expect(src).toContain("this.viewmodel.position.set(0.28 + bobX * 0.5, -0.26 - reloadDip + bobY * 0.5, -0.55 + this.vmKick * 0.06)");
    expect(src).toContain("this.viewmodel.rotation.x = this.vmKick * 0.08 - reloadDip * 0.8");
    expect(src).toContain("this.fovNow += (targetFov - this.fovNow) * Math.min(1, dt * 14)");
  });
});
