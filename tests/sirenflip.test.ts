/**
 * The street siren does not share a flip inside one wail.
 * Lease Row keeps the 0.8 seconds the two tones shipped with.
 * The pitches stay sirenTone. The wait stays sirenWait. The first call still lands at 9 seconds.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_FLIP, sirenFlip } from "../client/audio";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district flips its siren at its own step", () => {
  it("keeps the street flip and gives the other nineteen their own", () => {
    expect(STREET_FLIP).toBe(0.8);
    expect(sirenFlip(undefined)).toBe(STREET_FLIP);
    expect(sirenFlip("lease_row")).toBe(STREET_FLIP);
    expect(sirenFlip("drainage_yard")).toBe(STREET_FLIP);
    expect(sirenFlip("deadletter_office")).toBe(STREET_FLIP);
    expect(sirenFlip("white_office")).toBe(STREET_FLIP);
    const flips = CITY_DISTRICTS.map((id) => sirenFlip(id));
    expect(new Set(flips).size).toBe(CITY_DISTRICTS.length);
    expect(sirenFlip("night_market")).toBeLessThan(STREET_FLIP);
    expect(sirenFlip("deadletter_docks")).toBeGreaterThan(sirenFlip("relay_heights"));
  });

  it("the wail uses that flip, and the tone, wait, and first call stay", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("t + i * flip");
    expect(audio).toContain("const flip = sirenFlip(place)");
    expect(audio).toContain("sirenTone(place)");
    expect(audio).toContain("o.stop(t + 6.6)");
    expect(game).toContain("sirenWait(this.world.level.name)");
    expect(game).toContain("c.nextSiren = 9 * SIM_HZ");
  });

  it("fails closed if the read is removed from the wail", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    expect(audio).toContain("function sirenFlip");
    expect(audio).toContain("sirenFlip(place)");
  });
});
