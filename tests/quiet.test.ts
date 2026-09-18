/**
 * The desk was not a frame (Stage 95): what each of the campaign's modals takes off the screen.
 */
import { describe, expect, it } from "vitest";
import { ALL_GROUPS, quietFor } from "../client/hud/quiet";

describe("what a frame silences", () => {
  it("silences nothing when nothing is open", () => {
    expect(quietFor({ desk: false, terminal: false, card: false })).toEqual([]);
  });

  it("takes everything but the status line off for the desk, and for a card", () => {
    expect(quietFor({ desk: true, terminal: false, card: false })).toEqual([...ALL_GROUPS]);
    expect(quietFor({ desk: false, terminal: false, card: true })).toEqual([...ALL_GROUPS]);
  });

  it("takes the gun and the tutorial off for a terminal, and keeps the objective and the map", () => {
    const q = quietFor({ desk: false, terminal: true, card: false });
    for (const g of ["prompt", "reticle", "rack", "ammo", "nades", "arrows"] as const) expect(q).toContain(g);
    expect(q).not.toContain("mission");
    expect(q).not.toContain("map");
    expect(q).not.toContain("log");
  });

  it("lets the wider frame win when two are open at once", () => {
    // a card lands while the terminal is up: the card's silence, not the terminal's
    expect(quietFor({ desk: false, terminal: true, card: true })).toEqual([...ALL_GROUPS]);
  });

  it("never names a group twice", () => {
    for (const open of [{ desk: true, terminal: true, card: true }, { desk: false, terminal: true, card: false }]) {
      const q = quietFor(open);
      expect(new Set(q).size).toBe(q.length);
    }
  });
});
