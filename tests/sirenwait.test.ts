/**
 * The street siren does not share a wait.
 * Lease Row keeps the 38 second base the city shipped with.
 * The tone stays sirenTone. The first call still lands at 9 seconds. The jitter stays (t * 7) % 23.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_WAIT, sirenWait } from "../client/audio";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district waits its own siren", () => {
  it("keeps the street base and gives the other nineteen their own", () => {
    expect(STREET_WAIT).toBe(38);
    expect(sirenWait(undefined)).toBe(STREET_WAIT);
    expect(sirenWait("lease_row")).toBe(STREET_WAIT);
    expect(sirenWait("drainage_yard")).toBe(STREET_WAIT);
    expect(sirenWait("deadletter_office")).toBe(STREET_WAIT);
    expect(sirenWait("white_office")).toBe(STREET_WAIT);
    const waits = CITY_DISTRICTS.map((id) => sirenWait(id));
    expect(new Set(waits).size).toBe(CITY_DISTRICTS.length);
    expect(sirenWait("night_market")).toBeLessThan(STREET_WAIT);
    expect(sirenWait("deadletter_docks")).toBeGreaterThan(sirenWait("relay_heights"));
  });

  it("the city schedule uses that wait, and the tone call stays", () => {
    const src = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(src).toContain("c.nextSiren = t + Math.round((sirenWait(this.world.level.name) + ((t * 7) % 23)) * SIM_HZ)");
    expect(src).toContain("this.audio.siren(0.6 * c.sirenSide, this.world.level.name)");
    expect(src).toContain("c.nextSiren = 9 * SIM_HZ");
  });

  it("fails closed if the read is removed from the schedule", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function sirenWait");
    expect(game).toContain("sirenWait(this.world.level.name)");
  });
});
