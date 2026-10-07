/**
 * The announcement chime does not share a beat.
 * Lease Row keeps the 0.22 seconds between notes the city shipped with.
 * The pitches stay paChime. The voice stays paVoice. The PA gap stays 27.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_BEAT, paBeat } from "../client/audio";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district beats its own announcement", () => {
  it("keeps the street beat and gives the other nineteen their own", () => {
    expect(STREET_BEAT).toBe(0.22);
    expect(paBeat(undefined)).toBe(STREET_BEAT);
    expect(paBeat("lease_row")).toBe(STREET_BEAT);
    expect(paBeat("drainage_yard")).toBe(STREET_BEAT);
    expect(paBeat("deadletter_office")).toBe(STREET_BEAT);
    expect(paBeat("white_office")).toBe(STREET_BEAT);
    const beats = CITY_DISTRICTS.map((id) => paBeat(id));
    expect(new Set(beats).size).toBe(CITY_DISTRICTS.length);
    expect(paBeat("night_market")).toBeLessThan(STREET_BEAT);
    expect(paBeat("deadletter_docks")).toBeGreaterThan(paBeat("relay_heights"));
  });

  it("the chime uses that beat, and the gap stays 27", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("delay: i * paBeat(place)");
    expect(audio).toContain("paChime(place)");
    expect(game).toContain("this.audio.pa(this.world.level.name)");
    expect(game).toContain("27 + ((c.paIndex * 11) % 17)");
  });

  it("fails closed if the read is removed from the chime", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    expect(audio).toContain("function paBeat");
    expect(audio).toContain("i * paBeat(place)");
  });
});
