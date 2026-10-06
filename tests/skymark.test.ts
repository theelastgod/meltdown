/**
 * Lease Row keeps the magenta panel, the cyan keel, and the red blinker.
 * Every other district marks the airship and the tall-slab blinker as its own.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PALETTE } from "../client/render/city";
import { skyMark } from "../client/render/life";

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

describe("each district marks its own sky", () => {
  it("lease row keeps the old marks, and the other nineteen do not share them", () => {
    const lease = skyMark("lease_row");
    expect(lease).toEqual({ panel: PALETTE.magenta, keel: PALETTE.cyan, blink: [1, 0.1, 0.18] });
    expect(skyMark(undefined)).toEqual(lease);
    expect(skyMark("drainage_yard")).toEqual(lease);
    const marks = IDS.map((id) => skyMark(id));
    expect(new Set(marks.map((m) => m.panel)).size).toBe(IDS.length);
    expect(new Set(marks.map((m) => m.keel)).size).toBe(IDS.length);
    expect(new Set(marks.map((m) => JSON.stringify(m.blink))).size).toBe(IDS.length);
  });

  it("the city builds the sky of the level it is in", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("new Sky(skyline, (level.skylineSeed ?? 1) + 3, level.name)");
  });
});
