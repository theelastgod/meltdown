/**
 * The street speaker does not share a lead-in.
 * Lease Row keeps the 0.9 seconds before the first syllable.
 * The hold stays paHold. The step stays paTalk. The beat stays paBeat.
 * The pitches stay paChime. Each note stays 0.35. The echo stays 0.09 at 0.17 seconds.
 * The speaker still adds (i % 3) * 0.05 after paTalk. The PA gap stays 27.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_LEAD, paLead } from "../client/audio";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district waits its own time before the announcement voice", () => {
  it("keeps the street lead and gives the other nineteen their own", () => {
    expect(STREET_LEAD).toBe(0.9);
    expect(paLead(undefined)).toBe(STREET_LEAD);
    expect(paLead("lease_row")).toBe(STREET_LEAD);
    expect(paLead("drainage_yard")).toBe(STREET_LEAD);
    expect(paLead("deadletter_office")).toBe(STREET_LEAD);
    expect(paLead("white_office")).toBe(STREET_LEAD);
    const leads = CITY_DISTRICTS.map((id) => paLead(id));
    expect(new Set(leads).size).toBe(CITY_DISTRICTS.length);
    expect(paLead("night_market")).toBeLessThan(STREET_LEAD);
    expect(paLead("deadletter_docks")).toBeGreaterThan(paLead("relay_heights"));
  });

  it("the speaker uses that lead, and the hold, step, notes, echo, and gap stay", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("let d = paLead(place)");
    expect(audio).toContain("const hold = paHold(place)");
    expect(audio).toContain("d += paTalk(place) + (i % 3) * 0.05");
    expect(audio).toContain("dur: 0.35");
    expect(audio).toContain("delay: d + 0.17");
    expect(audio).toContain("dur: 0.09");
    expect(game).toContain("27 + ((c.paIndex * 11) % 17)");
  });

  it("fails closed if the read is removed from the speaker", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    expect(audio).toContain("function paLead");
    expect(audio).toContain("paLead(place)");
  });
});
