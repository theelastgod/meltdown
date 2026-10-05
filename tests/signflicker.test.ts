/**
 * The docks and Relay Heights share a cast. They do not share a sign.
 * The heights shiver thin and drop often. Every other room keeps the old breathe.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { HEIGHTS_FLICKER, SIGN_FLICKER, signFlickerGlsl } from "../client/render/life";

const SAME = ["lease_row", "deadletter_docks", "repo_depot", "night_market", "drainage_yard", "deadletter_office", "white_office"] as const;

describe("relay heights does not flicker like the docks", () => {
  it("the thin stutter is not the street breathe, and the other rooms still are", () => {
    expect(SIGN_FLICKER).toContain("uTime * 2.3");
    expect(SIGN_FLICKER).toContain("step(0.985");
    expect(HEIGHTS_FLICKER).toContain("uTime * 11.0");
    expect(HEIGHTS_FLICKER).toContain("step(0.72");
    expect(signFlickerGlsl("relay_heights")).toBe(HEIGHTS_FLICKER);
    expect(signFlickerGlsl("relay_heights")).not.toBe(signFlickerGlsl("deadletter_docks"));
    for (const name of SAME) expect(signFlickerGlsl(name)).toBe(SIGN_FLICKER);
    expect(signFlickerGlsl(undefined)).toBe(SIGN_FLICKER);
  });

  it("the client flickers the signs of the level it built", () => {
    const renderer = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(renderer).toContain("flickerMaterial(dressed.signMat, level.name)");
  });
});
