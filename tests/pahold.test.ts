/**
 * The street speaker does not share a syllable length.
 * Lease Row keeps the 0.11 seconds each syllable shipped with.
 * The step stays paTalk. The beat stays paBeat. The pitches stay paChime.
 * Each note stays 0.35. The echo stays 0.09. The PA gap stays 27.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_HOLD, paHold } from "../client/audio";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district holds its announcement syllables for its own length", () => {
  it("keeps the street hold and gives the other nineteen their own", () => {
    expect(STREET_HOLD).toBe(0.11);
    expect(paHold(undefined)).toBe(STREET_HOLD);
    expect(paHold("lease_row")).toBe(STREET_HOLD);
    expect(paHold("drainage_yard")).toBe(STREET_HOLD);
    expect(paHold("deadletter_office")).toBe(STREET_HOLD);
    expect(paHold("white_office")).toBe(STREET_HOLD);
    const holds = CITY_DISTRICTS.map((id) => paHold(id));
    expect(new Set(holds).size).toBe(CITY_DISTRICTS.length);
    expect(paHold("night_market")).toBeLessThan(STREET_HOLD);
    expect(paHold("deadletter_docks")).toBeGreaterThan(paHold("relay_heights"));
  });

  it("the speaker uses that hold, and the step, notes, echo, and gap stay", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("const hold = paHold(place)");
    expect(audio).toContain("dur: hold");
    expect(audio).toContain("d += paTalk(place) + (i % 3) * 0.05");
    expect(audio).toContain("dur: 0.35");
    expect(audio).toContain("delay: d + 0.17");
    expect(audio).toContain("dur: 0.09");
    expect(game).toContain("27 + ((c.paIndex * 11) % 17)");
  });

  it("fails closed if the read is removed from the speaker", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    expect(audio).toContain("function paHold");
    expect(audio).toContain("paHold(place)");
  });
});
