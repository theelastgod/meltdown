/**
 * Lease Row and the indoor rooms keep the street breathe. Relay Heights keeps its thin shiver.
 * Eighteen districts do not share a sign.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { HEIGHTS_FLICKER, SIGN_FLICKER, signFlickerGlsl } from "../client/render/life";

const SAME = ["lease_row", "drainage_yard", "deadletter_office", "white_office"] as const;

const OWN = [
  "deadletter_docks",
  "repo_depot",
  "night_market",
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

describe("each district sign does not flicker like the next", () => {
  it("the two old casts stay, and eighteen rooms do not share them", () => {
    expect(SIGN_FLICKER).toContain("uTime * 2.3");
    expect(SIGN_FLICKER).toContain("step(0.985");
    expect(HEIGHTS_FLICKER).toContain("uTime * 11.0");
    expect(HEIGHTS_FLICKER).toContain("step(0.72");
    expect(signFlickerGlsl("relay_heights")).toBe(HEIGHTS_FLICKER);
    for (const name of SAME) expect(signFlickerGlsl(name)).toBe(SIGN_FLICKER);
    expect(signFlickerGlsl(undefined)).toBe(SIGN_FLICKER);
    const own = OWN.map((name) => signFlickerGlsl(name));
    expect(new Set(own).size).toBe(OWN.length);
    for (const body of own) {
      expect(body).not.toBe(SIGN_FLICKER);
      expect(body).not.toBe(HEIGHTS_FLICKER);
    }
  });

  it("the client flickers the signs of the level it built", () => {
    const renderer = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(renderer).toContain("flickerMaterial(dressed.signMat, level.name)");
  });
});
