/**
 * The street chime does not share a loudness.
 * Lease Row keeps the 0.07 the three notes shipped with.
 * Each note stays 0.35. The beat stays paBeat. The pitches stay paChime.
 * The lead stays paLead. The hold stays paHold. The step stays paTalk.
 * The voice stays paVoice. The echo stays 0.09 at 0.17 seconds.
 * The speaker still adds (i % 3) * 0.05 after paTalk. The PA gap stays 27.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_LOUD, paLoud } from "../client/audio";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district rings the announcement at its own loudness", () => {
  it("keeps the street loudness and gives the other nineteen their own", () => {
    expect(STREET_LOUD).toBe(0.07);
    expect(paLoud(undefined)).toBe(STREET_LOUD);
    expect(paLoud("lease_row")).toBe(STREET_LOUD);
    expect(paLoud("drainage_yard")).toBe(STREET_LOUD);
    expect(paLoud("deadletter_office")).toBe(STREET_LOUD);
    expect(paLoud("white_office")).toBe(STREET_LOUD);
    const loud = CITY_DISTRICTS.map((id) => paLoud(id));
    expect(new Set(loud).size).toBe(CITY_DISTRICTS.length);
    expect(paLoud("night_market")).toBeGreaterThan(STREET_LOUD);
    expect(paLoud("deadletter_docks")).toBeLessThan(paLoud("relay_heights"));
  });

  it("the chime uses that loudness, and the notes, lead, echo, and gap stay", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("gain: paLoud(place)");
    expect(audio).toContain("dur: 0.35");
    expect(audio).toContain("let d = paLead(place)");
    expect(audio).toContain("const hold = paHold(place)");
    expect(audio).toContain("d += paTalk(place) + (i % 3) * 0.05");
    expect(audio).toContain("delay: d + 0.17");
    expect(audio).toContain("dur: 0.09");
    expect(audio).toContain("gain: 0.07");
    expect(game).toContain("27 + ((c.paIndex * 11) % 17)");
  });

  it("fails closed if the read is removed from the chime", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    expect(audio).toContain("function paLoud");
    expect(audio).toContain("paLoud(place)");
  });
});
