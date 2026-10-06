/**
 * Lease Row keeps the cyan, magenta, and gold ticker. Nineteen streets each ink their own.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_INK, adInk } from "../client/render/life";

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

const LEASE = ["#35f2ff", "#ff3ec9", "#ffe34a"] as const;

describe("each district inks its own ticker", () => {
  it("the street ink stays, and the other nineteen do not share it", () => {
    expect(adInk("lease_row")).toEqual(LEASE);
    expect(adInk(undefined)).toEqual(LEASE);
    expect(adInk(undefined)).toEqual(adInk("lease_row"));
    expect(adInk("drainage_yard")).toEqual(STREET_INK);
    expect(adInk("deadletter_office")).toEqual(STREET_INK);
    expect(adInk("white_office")).toEqual(STREET_INK);
    const inks = IDS.map((id) => JSON.stringify(adInk(id)));
    expect(new Set(inks).size).toBe(IDS.length);
  });

  it("the city inks the level it built", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("new HoloAds(level.ads, level.name)");
    expect(life).toContain("const fg = hue < 120 ? ink[0] : hue < 240 ? ink[1] : ink[2]");
  });
});
