/**
 * The slab blinkers do not share a clock.
 * Lease Row keeps the half-hertz flash the skyline shipped with.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_BLINK, skyBlink } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district blinks its own skyline", () => {
  it("keeps the street rate and gives the other nineteen their own", () => {
    expect(STREET_BLINK).toBe(0.5);
    expect(skyBlink(undefined)).toBe(STREET_BLINK);
    expect(skyBlink("lease_row")).toBe(STREET_BLINK);
    expect(skyBlink("drainage_yard")).toBe(STREET_BLINK);
    expect(skyBlink("deadletter_office")).toBe(STREET_BLINK);
    expect(skyBlink("white_office")).toBe(STREET_BLINK);
    const rates = CITY_DISTRICTS.map((id) => skyBlink(id));
    expect(new Set(rates).size).toBe(CITY_DISTRICTS.length);
    expect(skyBlink("night_market")).toBeGreaterThan(STREET_BLINK);
    expect(skyBlink("deadletter_docks")).toBeLessThan(STREET_BLINK);
    expect(skyBlink("deadletter_docks")).not.toBe(skyBlink("relay_heights"));
    expect(skyBlink("night_market")).not.toBe(skyBlink("lease_row"));
  });

  it("the skyline uses the rate for the level it was built in", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("uRate: { value: skyBlink(name) }");
    expect(life).toContain("fract(uTime * uRate + phase)");
    expect(life).toContain("step(0.92, fract(uTime * uRate + phase))");
  });
});
