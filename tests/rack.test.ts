/**
 * The rack called the DIRECTIVE "THE" (Stage 109): the one-word label for every weapon.
 * The rank (Stage 873): the rack names the gun and its rounds, and the rank beside them.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WEAPON_LIST } from "../shared/weapons/manifest";
import { phoneRankSlot, rackLabel, rackRankMark } from "../client/hud/rack";

describe("rackLabel", () => {
  it("is the first word for a name that starts with one", () => {
    expect(rackLabel("REPO HAMMER")).toBe("REPO");
    expect(rackLabel("LEASE-BREAKER")).toBe("LEASE-BREAKER");
  });
  it("skips a leading article", () => {
    expect(rackLabel("THE DIRECTIVE")).toBe("DIRECTIVE");
    expect(rackLabel("a Ledger")).toBe("Ledger");
  });
  it("no weapon on the rack is labelled by an article", () => {
    for (const w of WEAPON_LIST) expect(["THE", "A", "AN"]).not.toContain(rackLabel(w.name).toUpperCase());
  });
  it("a name that is nothing but an article keeps it, and an empty name is empty", () => {
    expect(rackLabel("THE")).toBe("THE");
    expect(rackLabel("  ")).toBe("");
  });
  it("says the rank beside the rounds", () => {
    expect(rackRankMark(1)).toBe("R01");
    expect(rackRankMark(12)).toBe("R12");
    expect(rackRankMark(29)).toBe("R29");
    expect(rackRankMark(0)).toBe("R01");
    expect(rackRankMark(Number.NaN)).toBe("R01");
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/rackRankMark\(ranks\[i\] \?\? 1\)/);
    expect(hud).toMatch(/ranks\.join\(","\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/content: attr\(data-r\)/);
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toMatch(/WEAPON_LIST\.map\(\(w\) => this\.file\.mastery\[w\.id\]\?\.rank \?\? 1\)/);
  });
  it("names every gun's rank on a phone, where the rack is hidden", () => {
    expect(phoneRankSlot("REPO", 12, 6, false)).toBe("<span>REPO <i>6</i> R12</span>");
    expect(phoneRankSlot("LEASE-BREAKER", 1, 30, true)).toBe(`<span class="on">LEASE-BREAKER <i>30</i> R01</span>`);
    expect(phoneRankSlot("DIRECTIVE", 29, 12, false)).toBe("<span>DIRECTIVE <i>12</i> R29</span>");
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/phoneRankSlot\(rackLabel\(w\.name\), ranks\[i\] \?\? 1, w\.magSize \? \(p\.weapon\.ammo\[w\.slot\] \?\? 0\) : "∞", w\.slot === p\.weapon\.slot\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud\.touch \.pranks \{ display: flex/);
    expect(css).toMatch(/#hud\.touch \.rack \{ display: none/);
  });
  it("says the rounds in that gun on a phone, the same count the rack paints", () => {
    expect(phoneRankSlot("REPO", 12, 6, false)).toBe("<span>REPO <i>6</i> R12</span>");
    expect(phoneRankSlot("SHOCK", 1, "∞", true)).toBe(`<span class="on">SHOCK <i>∞</i> R01</span>`);
    expect(phoneRankSlot("DIRECTIVE", 30, 0, false)).toBe("<span>DIRECTIVE <i>0</i> MASTERED</span>");
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/phoneRankSlot\(rackLabel\(w\.name\), ranks\[i\] \?\? 1, w\.magSize \? \(p\.weapon\.ammo\[w\.slot\] \?\? 0\) : "∞", w\.slot === p\.weapon\.slot\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.rack i, #hud \.nades i, #hud \.pranks i/);
  });
  it("says MASTERED at the last rank", () => {
    expect(rackRankMark(30)).toBe("MASTERED");
    expect(rackRankMark(29)).not.toBe("MASTERED");
    expect(phoneRankSlot("DIRECTIVE", 30, 12, false)).toBe("<span>DIRECTIVE <i>12</i> MASTERED</span>");
    const src = readFileSync(new URL("../client/hud/rack.ts", import.meta.url), "utf8");
    expect(src).toMatch(/n >= MAX_RANK\) return "MASTERED"/);
  });
});
