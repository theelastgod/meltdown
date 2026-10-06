/**
 * Lease Row keeps the pale grate steam. Nineteen streets each breathe their own.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_STEAM, steamTint } from "../client/render/life";

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

describe("each district steams its own colour", () => {
  it("the street puff stays, and the other nineteen do not share it", () => {
    expect(steamTint("lease_row")).toEqual([0.62, 0.72, 0.8]);
    expect(steamTint(undefined)).toEqual(STREET_STEAM);
    expect(steamTint("drainage_yard")).toEqual(STREET_STEAM);
    expect(steamTint("deadletter_office")).toEqual(STREET_STEAM);
    expect(steamTint("white_office")).toEqual(STREET_STEAM);
    const tints = IDS.map((id) => JSON.stringify(steamTint(id)));
    expect(new Set(tints).size).toBe(IDS.length);
  });

  it("the city steams the level it built", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("new Steam(level.vents, 28, 3, level.name)");
  });
});
