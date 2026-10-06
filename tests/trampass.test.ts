/**
 * Lease Row's monorail still opens at 200 and peaks at 1800. Nineteen lines each pass in their own band.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_TRAM, tramPass } from "../client/audio";

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

describe("each district's monorail passes in its own band", () => {
  it("the street pass stays, and the other nineteen do not share it", () => {
    expect(tramPass("lease_row")).toEqual({ open: 200, peak: 1800, close: 160, motorFrom: 210, motorTo: 140 });
    expect(tramPass(undefined)).toEqual(STREET_TRAM);
    expect(tramPass("drainage_yard")).toEqual(STREET_TRAM);
    const passes = IDS.map((id) => JSON.stringify(tramPass(id)));
    expect(new Set(passes).size).toBe(IDS.length);
    for (const id of IDS) {
      const pass = tramPass(id);
      expect(pass.open).toBeGreaterThan(0);
      expect(pass.peak).toBeGreaterThan(pass.open);
      expect(pass.close).toBeGreaterThan(0);
      expect(pass.motorFrom).toBeGreaterThan(0);
      expect(pass.motorTo).toBeGreaterThan(0);
    }
  });

  it("the city plays the pass of the level it is in", () => {
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toContain("this.audio.tram(this.world.level.name)");
  });
});
