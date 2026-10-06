/**
 * Lease Row keeps the magenta skirt and the pale glass. Heads stay warm. Tails stay red.
 * Nineteen lines each wear their own stripe and their own glass.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PALETTE } from "../client/render/city";
import { Tram, tramLivery } from "../client/render/life";

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

const LINE = { axis: "x" as const, at: 0, y: 9.4, from: 0, to: 100, period: 26 };

describe("each district wears its own monorail", () => {
  it("lease row keeps the old car, and the other nineteen do not share it", () => {
    const lease = { strip: PALETTE.magenta, glass: 0xbfefff };
    expect(tramLivery("lease_row")).toEqual(lease);
    expect(tramLivery(undefined)).toEqual(lease);
    expect(tramLivery("drainage_yard")).toEqual(lease);
    const bare = new Tram(LINE);
    const strip = bare.group.children[0]!.children.find((c) => (c as { material?: { color?: { getHex: () => number } } }).material?.color?.getHex() === lease.strip);
    expect(strip, "a car with no district keeps the magenta skirt").toBeTruthy();
    const marks = IDS.map((id) => tramLivery(id));
    expect(new Set(marks.map((m) => m.strip)).size).toBe(IDS.length);
    expect(new Set(marks.map((m) => m.glass)).size).toBe(IDS.length);
  });

  it("the city builds the tram of the level it is in", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("new Tram(level.tram, level.name)");
    expect(life).toContain("color: 0xfff3d0");
    expect(life).toContain("color: PALETTE.red");
  });
});
