/**
 * Lease Row and the indoor rooms keep the street slap. Deadletter answers late and low, off the water.
 * Eighteen districts do not share a slap.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { shotSlap } from "../client/audio";

const STREET = ["lease_row", "drainage_yard", "deadletter_office", "white_office"] as const;

const OWN = [
  "repo_depot",
  "night_market",
  "relay_heights",
  "ash_canal",
  "glass_mile",
  "bone_market",
  "cold_vault",
  "neon_chapel",
  "slag_pit",
  "wire_garden",
  "red_kiln",
  "paper_wharf",
  "velvet_court",
  "rust_crown",
  "salt_stairs",
  "lamp_bazaar",
  "debt_orchard",
  "black_relay",
] as const;

const STREET_SLAP = { hz: 480, dur: 0.26, q: 0.5, lag: 0.055, gain: 0.09 };
const DOCKS_SLAP = { hz: 160, dur: 0.48, q: 0.35, lag: 0.16, gain: 0.13 };

describe("each district does not slap like the next", () => {
  it("the street and the water stay, and eighteen rooms do not share them", () => {
    for (const name of STREET) expect(shotSlap(name)).toEqual(STREET_SLAP);
    expect(shotSlap(undefined)).toEqual(STREET_SLAP);
    expect(shotSlap("deadletter_docks")).toEqual(DOCKS_SLAP);
    const own = OWN.map((name) => JSON.stringify(shotSlap(name)));
    expect(new Set(own).size).toBe(OWN.length);
    for (const slap of own) {
      expect(slap).not.toBe(JSON.stringify(STREET_SLAP));
      expect(slap).not.toBe(JSON.stringify(DOCKS_SLAP));
    }
  });

  it("the client slaps from the level it is in", () => {
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toContain('this.audio.otherShot(ev.weapon === 0 ? "wasp" : (def?.id ?? "lease_breaker"), cue, this.world.level.name)');
    expect(game).toContain("this.audio.otherShot(ev.weapon, cue, this.world.level.name)");
  });
});
