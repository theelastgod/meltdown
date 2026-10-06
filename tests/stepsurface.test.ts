/**
 * Lease Row and the indoor rooms keep the wet street. Night Market keeps the stall tile.
 * Twelve districts that used to share that street now step on their own ground.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { stepSurface } from "../client/audio";

const STREET = ["lease_row", "drainage_yard", "deadletter_office", "white_office"] as const;

const OWN = {
  deadletter_docks: { hz: 110, dur: 0.11, q: 0.35, type: "lowpass" },
  repo_depot: { hz: 320, dur: 0.045, q: 0.6, type: "lowpass" },
  relay_heights: { hz: 2100, dur: 0.018, q: 3.1, type: "highpass" },
  bone_market: { hz: 220, dur: 0.05, q: 0.55, type: "lowpass" },
  neon_chapel: { hz: 150, dur: 0.12, q: 0.8, type: "lowpass" },
  wire_garden: { hz: 1600, dur: 0.022, q: 1.6, type: "highpass" },
  red_kiln: { hz: 480, dur: 0.04, q: 1.1, type: "lowpass" },
  paper_wharf: { hz: 90, dur: 0.1, q: 0.25, type: "lowpass" },
  rust_crown: { hz: 700, dur: 0.03, q: 1.2, type: "highpass" },
  lamp_bazaar: { hz: 1200, dur: 0.025, q: 2.0, type: "highpass" },
  debt_orchard: { hz: 200, dur: 0.085, q: 0.45, type: "lowpass" },
  black_relay: { hz: 2500, dur: 0.012, q: 4.0, type: "highpass" },
} as const;

describe("night market does not step like lease row", () => {
  it("the stall tile is not the wet street, and twelve streets are not either", () => {
    const row = stepSurface("lease_row");
    const market = stepSurface("night_market");
    expect(market).not.toEqual(row);
    expect(row).toEqual({ hz: 260, dur: 0.06, q: 0.7, type: "lowpass" });
    expect(market).toEqual({ hz: 920, dur: 0.028, q: 1.8, type: "highpass" });
    expect(market.hz).toBeGreaterThan(row.hz);
    expect(market.dur).toBeLessThan(row.dur);
    expect(market.type).not.toBe(row.type);
    for (const name of STREET) expect(stepSurface(name)).toEqual(row);
    expect(stepSurface(undefined)).toEqual(row);
    const own = Object.values(OWN).map((step) => JSON.stringify(step));
    expect(new Set(own).size).toBe(own.length);
    for (const [name, step] of Object.entries(OWN)) {
      expect(stepSurface(name)).toEqual(step);
      expect(step).not.toEqual(row);
      expect(step).not.toEqual(market);
    }
  });

  it("the client steps on the level it built", () => {
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toContain("this.audio.footstep(sp, this.stepSide * 0.25, this.world.level.name)");
  });
});
