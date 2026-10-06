/**
 * Lease Row keeps the 523, 659, 784 chime. Nineteen streets each chime their own three.
 * A mission announcement still calls pa with no district, so it stays the street.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_PA, paChime } from "../client/audio";

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

describe("each district chimes its own announcement", () => {
  it("the street triad stays, and the other nineteen do not share it", () => {
    expect(paChime("lease_row")).toEqual([523, 659, 784]);
    expect(paChime(undefined)).toEqual(STREET_PA);
    expect(paChime("drainage_yard")).toEqual(STREET_PA);
    const chimes = IDS.map((id) => JSON.stringify(paChime(id)));
    expect(new Set(chimes).size).toBe(IDS.length);
  });

  it("the city announcement is the level it is in", () => {
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    const campaign = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(game).toContain("this.audio.pa(this.world.level.name)");
    expect(campaign).toContain("this.game.audio.pa()");
  });
});
