/**
 * Lease Row keeps the street speaker. Nineteen districts each speak through their own formants.
 * A mission announcement still calls pa with no district.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_VOICE, paVoice } from "../client/audio";

const IDS = [
  "lease_row",
  "deadletter_docks",
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

describe("each district speaks in its own voice", () => {
  it("the street formants stay, and the other nineteen do not share them", () => {
    expect(paVoice("lease_row")).toEqual([640, 820, 1100, 720, 980, 560, 1250, 880, 700]);
    expect(paVoice(undefined)).toEqual(STREET_VOICE);
    expect(paVoice("drainage_yard")).toEqual(STREET_VOICE);
    const voices = IDS.map((id) => JSON.stringify(paVoice(id)));
    expect(new Set(voices).size).toBe(IDS.length);
    for (const id of IDS) expect(paVoice(id).every((hz) => hz > 40)).toBe(true);
  });

  it("the city voice is the level it is in", () => {
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    expect(game).toContain("this.audio.pa(this.world.level.name)");
    expect(audio).toContain("const formants = paVoice(place)");
  });
});
