/**
 * The street speaker does not share a syllable step.
 * Lease Row keeps the 0.14 seconds the voice shipped with.
 * The note beat stays paBeat. The pitches stay paChime. The voice stays paVoice.
 * Each note stays 0.35. The PA gap stays 27.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_TALK, paTalk } from "../client/audio";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district talks at its own syllable step", () => {
  it("keeps the street step and gives the other nineteen their own", () => {
    expect(STREET_TALK).toBe(0.14);
    expect(paTalk(undefined)).toBe(STREET_TALK);
    expect(paTalk("lease_row")).toBe(STREET_TALK);
    expect(paTalk("drainage_yard")).toBe(STREET_TALK);
    expect(paTalk("deadletter_office")).toBe(STREET_TALK);
    expect(paTalk("white_office")).toBe(STREET_TALK);
    const steps = CITY_DISTRICTS.map((id) => paTalk(id));
    expect(new Set(steps).size).toBe(CITY_DISTRICTS.length);
    expect(paTalk("night_market")).toBeLessThan(STREET_TALK);
    expect(paTalk("deadletter_docks")).toBeGreaterThan(paTalk("relay_heights"));
  });

  it("the speaker uses that step, and the note length and gap stay", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("d += paTalk(place) + (i % 3) * 0.05");
    expect(audio).toContain("dur: 0.35");
    expect(audio).toContain("delay: i * paBeat(place)");
    expect(game).toContain("this.audio.pa(this.world.level.name)");
    expect(game).toContain("27 + ((c.paIndex * 11) % 17)");
  });

  it("fails closed if the read is removed from the speaker", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    expect(audio).toContain("function paTalk");
    expect(audio).toContain("paTalk(place)");
  });
});
