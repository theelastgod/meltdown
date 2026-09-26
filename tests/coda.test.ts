/**
 * The last screen answers the choices no ending gate reads (Stage 656).
 *
 * An ending is named by `m7:ending` and sharpened by at most one gate, so a testimony key that no
 * gate mentions never reaches the white office. Measured against the gates themselves, three of
 * the seven questions the campaign asks were in that position — `m1:lease`, `m2:informant` and
 * `m5:lattice`, which are the three with the most weight on them. A player could burn their own
 * lease file in the first hour and finish the game without the ending noticing.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ENDING_CODA, endingCoda, endingGateKeys } from "../shared/campaign/testimony";
import { producibleTestimony } from "../shared/campaign/lint";

describe("the file's own footnote", () => {
  it("says nothing when the file has no testimony", () => {
    expect(endingCoda({})).toEqual([]);
  });

  it("answers the opening choice differently either way, and names the consequence", () => {
    const keep = endingCoda({ "m1:lease": "keep" });
    const burn = endingCoda({ "m1:lease": "burn" });
    expect(keep).toHaveLength(1);
    expect(burn).toHaveLength(1);
    expect(keep).not.toEqual(burn);
    expect(keep[0]).toMatch(/STILL IN YOUR COAT/);
    expect(burn[0]).toMatch(/BURNED IN LEASE ROW/);
  });

  it("reads the questions back in the order the campaign asked them", () => {
    const all = endingCoda({ "m5:lattice": "all", "m1:lease": "keep", "m2:informant": "turn" });
    expect(all).toHaveLength(3);
    expect(all[0]).toMatch(/LEASE FILE/);
    expect(all[1]).toMatch(/GAVE HER UP/);
    expect(all[2]).toMatch(/LATTICE NODES/);
  });

  it("covers every choice no ending gate reads — the rule the campaign lint enforces", () => {
    const gated = endingGateKeys();
    for (const [key, values] of producibleTestimony()) {
      if (key.endsWith(":ending") || key === "faction" || gated.has(key)) continue;
      expect(ENDING_CODA[key], `"${key}" is answered by no gate and has no coda`).toBeDefined();
      for (const v of values) expect(ENDING_CODA[key]![v], `"${key}" = "${v}" has no coda line`).toBeTruthy();
    }
  });

  it("and the white office actually prints it, rather than computing it and dropping it", () => {
    // the Stage 654 lesson: a guard that never enters the path it guards proves nothing, so pin
    // that the coda reaches the card and is not merely exported
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/const coda = endingCoda\(t\)/);
    expect(src).toMatch(/\.\.\.e\.lines, \.\.\.\(coda\.length \? \["", \.\.\.coda\] : \[\]\)/);
  });
});
