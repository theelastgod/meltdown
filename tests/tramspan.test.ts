/**
 * The monorail motor note does not share a length.
 * Lease Row keeps the 2.4 the pass shipped with.
 * Gain stays 0.08. The band stays tramPass. The whoosh peak stays tramRush.
 * The sweep still peaks at 1.1 and closes at 2.6.
 * The whoosh still fades by 2.7 and stops at 2.8. Pan still runs -0.8 to 0.8.
 * The thump stays 0.25 from 60 to 45.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_SPAN, tramSpan } from "../client/audio";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district's monorail motor holds for its own length", () => {
  it("keeps the street length and gives the other nineteen their own", () => {
    expect(STREET_SPAN).toBe(2.4);
    expect(tramSpan(undefined)).toBe(STREET_SPAN);
    expect(tramSpan("lease_row")).toBe(STREET_SPAN);
    expect(tramSpan("drainage_yard")).toBe(STREET_SPAN);
    expect(tramSpan("deadletter_office")).toBe(STREET_SPAN);
    expect(tramSpan("white_office")).toBe(STREET_SPAN);
    const spans = CITY_DISTRICTS.map((id) => tramSpan(id));
    expect(new Set(spans).size).toBe(CITY_DISTRICTS.length);
    expect(tramSpan("night_market")).toBeLessThan(STREET_SPAN);
    expect(tramSpan("deadletter_docks")).toBeGreaterThan(tramSpan("relay_heights"));
  });

  it("the motor uses that length, and the gain, sweep, and thump stay", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    expect(audio).toContain("dur: tramSpan(place)");
    expect(audio).toContain('gain: 0.08, type: "sawtooth"');
    expect(audio).toContain("f.frequency.exponentialRampToValueAtTime(pass.peak, t + 1.1)");
    expect(audio).toContain("f.frequency.exponentialRampToValueAtTime(pass.close, t + 2.6)");
    expect(audio).toContain("g.gain.exponentialRampToValueAtTime(0.001, t + 2.7)");
    expect(audio).toContain("src.stop(t + 2.8)");
    expect(audio).toContain("p.pan.setValueAtTime(-0.8, t)");
    expect(audio).toContain("p.pan.linearRampToValueAtTime(0.8, t + 2.6)");
    expect(audio).toContain("this.tone({ dur: 0.5, from: 60, to: 45, gain: 0.25 })");
  });

  it("fails closed if the read is removed from the motor", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    expect(audio).toContain("function tramSpan");
    expect(audio).toContain("tramSpan(place)");
  });
});
