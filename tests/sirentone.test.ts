/**
 * Lease Row keeps the 494 / 660 wail. Nineteen streets each wail their own pair.
 * A mission wave still calls siren with no district, so it stays the street.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_SIREN, sirenTone } from "../client/audio";

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

describe("each district wails its own siren", () => {
  it("the street pair stays, and the other nineteen do not share it", () => {
    expect(sirenTone("lease_row")).toEqual({ low: 494, high: 660, cut: 900 });
    expect(sirenTone(undefined)).toEqual(STREET_SIREN);
    expect(sirenTone("drainage_yard")).toEqual(STREET_SIREN);
    const tones = IDS.map((id) => JSON.stringify(sirenTone(id)));
    expect(new Set(tones).size).toBe(IDS.length);
  });

  it("the city siren is the level it is in, and a mission wave is not", () => {
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    const campaign = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(game).toContain("this.audio.siren(0.6 * c.sirenSide, this.world.level.name)");
    expect(campaign).toContain("this.game.audio.siren(0.5)");
  });
});
