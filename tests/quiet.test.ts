/**
 * The desk was not a frame (Stage 95): what each of the campaign's modals takes off the screen.
 */
import { describe, expect, it } from "vitest";
import { ALL_GROUPS, quietFor } from "../client/hud/quiet";

describe("what a frame silences", () => {
  it("silences nothing when nothing is open", () => {
    expect(quietFor({ desk: false, terminal: false, card: false, ledger: false })).toEqual([]);
  });

  it("takes everything but the status line off for the desk, and for a card", () => {
    expect(quietFor({ desk: true, terminal: false, card: false, ledger: false })).toEqual([...ALL_GROUPS]);
    expect(quietFor({ desk: false, terminal: false, card: true, ledger: false })).toEqual([...ALL_GROUPS]);
  });

  it("takes the gun and the tutorial off for a terminal, and keeps the objective and the map", () => {
    const q = quietFor({ desk: false, terminal: true, card: false, ledger: false });
    for (const g of ["prompt", "reticle", "rack", "ammo", "nades", "arrows"] as const) expect(q).toContain(g);
    expect(q).not.toContain("mission");
    expect(q).not.toContain("map");
    expect(q).not.toContain("log");
  });

  it("lets the wider frame win when two are open at once", () => {
    // a card lands while the terminal is up: the card's silence, not the terminal's
    expect(quietFor({ desk: false, terminal: true, card: true, ledger: false })).toEqual([...ALL_GROUPS]);
  });

  it("takes the gun off a closed file and leaves it what it reads (Stage 128)", () => {
    const q = quietFor({ desk: false, terminal: false, card: false, ledger: false, dead: true });
    for (const g of ["prompt", "reticle", "rack", "ammo", "nades", "arrows", "nodefoot"] as const) expect(q).toContain(g);
    for (const g of ["alert", "log", "map", "mission", "diag"] as const) expect(q).not.toContain(g);
  });

  it("a card over a dead file is still the card's silence, and a terminal's and a death's add up", () => {
    expect(quietFor({ desk: false, terminal: false, card: true, ledger: false, dead: true })).toEqual([...ALL_GROUPS]);
    const both = quietFor({ desk: false, terminal: true, card: false, ledger: false, dead: true });
    expect(both).toEqual(quietFor({ desk: false, terminal: true, card: false, ledger: false }));
    expect(new Set(both).size).toBe(both.length);
  });

  it("never names a group twice", () => {
    for (const open of [{ desk: true, terminal: true, card: true, ledger: false }, { desk: false, terminal: true, card: false, ledger: false }]) {
      const q = quietFor(open);
      expect(new Set(q).size).toBe(q.length);
    }
  });
});

describe("the ledger is a frame too (Stage 112)", () => {
  it("takes everything but the status line off for the ledger book or its graph", () => {
    expect(quietFor({ desk: false, terminal: false, card: false, ledger: true })).toEqual([...ALL_GROUPS]);
  });
  it("and wins over a terminal open under it", () => {
    expect(quietFor({ desk: false, terminal: true, card: false, ledger: true })).toEqual([...ALL_GROUPS]);
  });
});

describe("the alert is chrome (Stage 113)", () => {
  it("is silenced by the frames that cover the screen", () => {
    expect(ALL_GROUPS).toContain("alert");
    expect(quietFor({ desk: true, terminal: false, card: false, ledger: false })).toContain("alert");
    expect(quietFor({ desk: false, terminal: false, card: true, ledger: false })).toContain("alert");
    expect(quietFor({ desk: false, terminal: false, card: false, ledger: true })).toContain("alert");
  });
  it("and kept by a terminal, which is usually the objective", () => {
    expect(quietFor({ desk: false, terminal: true, card: false, ledger: false })).not.toContain("alert");
  });
});

describe("the phone's thumb pads are chrome (Stage 137)", () => {
  it("are silenced by the frames that cover the screen", () => {
    expect(quietFor({ desk: true, terminal: false, card: false, ledger: false })).toContain("thumbs");
    expect(quietFor({ desk: false, terminal: false, card: false, ledger: true })).toContain("thumbs");
    expect(quietFor({ desk: false, terminal: false, card: true, ledger: false })).toContain("thumbs");
  });
  it("and kept by a terminal and by a closed file", () => {
    expect(quietFor({ desk: false, terminal: true, card: false, ledger: false })).not.toContain("thumbs");
    expect(quietFor({ desk: false, terminal: false, card: false, ledger: false, dead: true })).not.toContain("thumbs");
  });
});
