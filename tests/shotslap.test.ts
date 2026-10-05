/**
 * The docks and Relay Heights share a cast. They do not share a slap.
 * Deadletter answers late and low, off the water. Every other room keeps the street.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { shotSlap } from "../client/audio";

const STREET = ["lease_row", "relay_heights", "repo_depot", "night_market", "drainage_yard", "deadletter_office", "white_office"] as const;

describe("the docks do not slap like the heights", () => {
  it("the water is not the street, and the other rooms still are", () => {
    const street = shotSlap("relay_heights");
    const docks = shotSlap("deadletter_docks");
    expect(docks).not.toEqual(street);
    expect(street).toEqual({ hz: 480, dur: 0.26, q: 0.5, lag: 0.055, gain: 0.09 });
    expect(docks.hz).toBeLessThan(street.hz);
    expect(docks.lag).toBeGreaterThan(street.lag);
    expect(docks.dur).toBeGreaterThan(street.dur);
    for (const name of STREET) expect(shotSlap(name)).toEqual(street);
    expect(shotSlap(undefined)).toEqual(street);
  });

  it("the client slaps from the level it is in", () => {
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toContain('this.audio.otherShot(ev.weapon === 0 ? "wasp" : (def?.id ?? "lease_breaker"), cue, this.world.level.name)');
    expect(game).toContain("this.audio.otherShot(ev.weapon, cue, this.world.level.name)");
  });
});
