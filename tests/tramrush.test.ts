/**
 * The monorail whoosh does not share a peak.
 * Lease Row keeps the 0.3 the pass shipped with.
 * The band stays tramPass. The sweep still peaks at 1.1 and closes at 2.6.
 * The whoosh still fades by 2.7 and stops at 2.8. Pan still runs -0.8 to 0.8.
 * The motor stays gain 0.08. The thump stays 0.25 from 60 to 45.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_RUSH, tramRush } from "../client/audio";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district's monorail whoosh peaks at its own loudness", () => {
  it("keeps the street peak and gives the other nineteen their own", () => {
    expect(STREET_RUSH).toBe(0.3);
    expect(tramRush(undefined)).toBe(STREET_RUSH);
    expect(tramRush("lease_row")).toBe(STREET_RUSH);
    expect(tramRush("drainage_yard")).toBe(STREET_RUSH);
    expect(tramRush("deadletter_office")).toBe(STREET_RUSH);
    expect(tramRush("white_office")).toBe(STREET_RUSH);
    const rushes = CITY_DISTRICTS.map((id) => tramRush(id));
    expect(new Set(rushes).size).toBe(CITY_DISTRICTS.length);
    expect(tramRush("night_market")).toBeGreaterThan(STREET_RUSH);
    expect(tramRush("deadletter_docks")).toBeLessThan(tramRush("relay_heights"));
  });

  it("the whoosh uses that peak, and the sweep, motor, and thump stay", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    expect(audio).toContain("const rush = tramRush(place)");
    expect(audio).toContain("g.gain.exponentialRampToValueAtTime(rush, t + 1.1)");
    expect(audio).toContain("f.frequency.exponentialRampToValueAtTime(pass.peak, t + 1.1)");
    expect(audio).toContain("f.frequency.exponentialRampToValueAtTime(pass.close, t + 2.6)");
    expect(audio).toContain("g.gain.exponentialRampToValueAtTime(0.001, t + 2.7)");
    expect(audio).toContain("src.stop(t + 2.8)");
    expect(audio).toContain("p.pan.setValueAtTime(-0.8, t)");
    expect(audio).toContain("p.pan.linearRampToValueAtTime(0.8, t + 2.6)");
    expect(audio).toContain('gain: 0.08, type: "sawtooth"');
    expect(audio).toContain("this.tone({ dur: 0.5, from: 60, to: 45, gain: 0.25 })");
  });

  it("fails closed if the read is removed from the whoosh", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    expect(audio).toContain("function tramRush");
    expect(audio).toContain("tramRush(place)");
  });
});
