/**
 * The rack called the DIRECTIVE "THE" (Stage 109): the one-word label for every weapon.
 * The rank (Stage 873): the rack names the gun and its rounds, and the rank beside them.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WEAPON_LIST } from "../shared/weapons/manifest";
import { phoneNameEmpty, phoneNameHtml, phoneNameLow, phoneRankEmpty, phoneRankHtml, phoneRankLow, phoneRankSlot, rackLabel, rackNameEmpty, rackNameHtml, rackNameLow, rackRankAttr, rackRankEmpty, rackRankLow, rackRankMark, rackRoundHtml, rackRoundShown, rackRoundTone, rackSlotEmpty, rackSlotHtml } from "../client/hud/rack";

describe("the slot number on the rack when the magazine is empty", () => {
  it("turns magenta only when that gun's magazine is empty", () => {
    expect(rackSlotEmpty("empty")).toBe(true);
    expect(rackSlotEmpty("low")).toBe(false);
    expect(rackSlotEmpty("")).toBe(false);
    expect(rackSlotHtml(2, "empty")).toBe(`<span class="num empty">2</span>`);
    expect(rackSlotHtml(2, "low")).not.toContain("empty");
    expect(rackSlotHtml(2, "")).toBe(`<span class="num">2</span>`);
    const src = readFileSync(new URL("../client/hud/rack.ts", import.meta.url), "utf8");
    expect(src).toMatch(/rackSlotEmpty\(tone\)/);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/rackSlotHtml\(w\.slot, tone\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.rack span\.num \{ padding: 0; border: none; box-shadow: none/);
    expect(css).toMatch(/#hud \.rack span\.num\.empty \{ color: var\(--mg\)/);
  });
});

describe("the rank on the rack on the last quarter", () => {
  it("turns amber only on the last quarter", () => {
    expect(rackRankLow("low")).toBe(true);
    expect(rackRankLow("empty")).toBe(false);
    expect(rackRankLow("")).toBe(false);
    expect(rackRankAttr("low")).toBe(` class="low"`);
    expect(rackRankAttr("empty")).toBe(` class="empty"`);
    expect(rackRankAttr("")).toBe("");
    const src = readFileSync(new URL("../client/hud/rack.ts", import.meta.url), "utf8");
    expect(src).toMatch(/rackRankLow\(tone\)/);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/rackRankAttr\(tone\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.rack b\.low::before \{ color: var\(--am\)/);
  });
});

describe("the rank on the rack when the magazine is empty", () => {
  it("turns magenta only when that gun's magazine is empty", () => {
    expect(rackRankEmpty("empty")).toBe(true);
    expect(rackRankEmpty("low")).toBe(false);
    expect(rackRankEmpty("")).toBe(false);
    expect(rackRankAttr("empty")).toBe(` class="empty"`);
    expect(rackRankAttr("low")).not.toContain("empty");
    expect(rackRankAttr("")).toBe("");
    const src = readFileSync(new URL("../client/hud/rack.ts", import.meta.url), "utf8");
    expect(src).toMatch(/rackRankEmpty\(tone\)/);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/rackRankAttr\(tone\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.rack b\.empty::before \{ color: var\(--mg\)/);
  });
});

describe("the rank beside the name on the phone on the last quarter", () => {
  it("turns amber only on the last quarter", () => {
    expect(phoneRankLow("low")).toBe(true);
    expect(phoneRankLow("empty")).toBe(false);
    expect(phoneRankLow("")).toBe(false);
    expect(phoneRankHtml(12, "low")).toBe(`<b class="low">R12</b>`);
    expect(phoneRankHtml(30, "low")).toBe(`<b class="low">MASTERED</b>`);
    expect(phoneRankHtml(12, "empty")).toBe(`<b class="empty">R12</b>`);
    expect(phoneRankHtml(12, "")).toBe("R12");
    expect(phoneRankSlot("REPO", 12, 8, false, "low")).toBe(`<span><em class="low">REPO</em> <i class="low">8</i> <b class="low">R12</b></span>`);
    const src = readFileSync(new URL("../client/hud/rack.ts", import.meta.url), "utf8");
    expect(src).toMatch(/phoneRankLow\(tone\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.pranks b\.low \{ color: var\(--am\)/);
  });
});

describe("the rank beside the name on the phone when the magazine is empty", () => {
  it("turns magenta only when that gun's magazine is empty", () => {
    expect(phoneRankEmpty("empty")).toBe(true);
    expect(phoneRankEmpty("low")).toBe(false);
    expect(phoneRankEmpty("")).toBe(false);
    expect(phoneRankHtml(12, "empty")).toBe(`<b class="empty">R12</b>`);
    expect(phoneRankHtml(30, "empty")).toBe(`<b class="empty">MASTERED</b>`);
    expect(phoneRankHtml(12, "low")).not.toContain("empty");
    expect(phoneRankHtml(12, "")).toBe("R12");
    expect(phoneRankSlot("REPO", 12, 0, false, "empty")).toBe(`<span><em class="empty">REPO</em> <i class="empty">0</i> <b class="empty">R12</b></span>`);
    const src = readFileSync(new URL("../client/hud/rack.ts", import.meta.url), "utf8");
    expect(src).toMatch(/phoneRankHtml\(rank, tone\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.pranks b \{ font-weight: normal/);
    expect(css).toMatch(/#hud \.pranks b\.empty \{ color: var\(--mg\)/);
  });
});

describe("the short name on the phone on the last quarter", () => {
  it("turns amber only on the last quarter", () => {
    expect(phoneNameLow("low")).toBe(true);
    expect(phoneNameLow("empty")).toBe(false);
    expect(phoneNameLow("")).toBe(false);
    expect(phoneNameHtml("REPO", "low")).toBe(`<em class="low">REPO</em>`);
    expect(phoneNameHtml("REPO", "empty")).toBe(`<em class="empty">REPO</em>`);
    expect(phoneNameHtml("REPO", "")).toBe("<em>REPO</em>");
    expect(phoneRankSlot("REPO", 12, 8, false, "low")).toBe(`<span><em class="low">REPO</em> <i class="low">8</i> <b class="low">R12</b></span>`);
    const src = readFileSync(new URL("../client/hud/rack.ts", import.meta.url), "utf8");
    expect(src).toMatch(/phoneNameLow\(tone\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.pranks em\.low \{ color: var\(--am\)/);
  });
});

describe("the short name on the phone when the magazine is empty", () => {
  it("turns magenta only when that gun's magazine is empty", () => {
    expect(phoneNameEmpty("empty")).toBe(true);
    expect(phoneNameEmpty("low")).toBe(false);
    expect(phoneNameEmpty("")).toBe(false);
    expect(phoneNameHtml("REPO", "empty")).toBe(`<em class="empty">REPO</em>`);
    expect(phoneNameHtml("REPO", "low")).not.toContain("empty");
    expect(phoneNameHtml("REPO", "")).toBe("<em>REPO</em>");
    expect(phoneRankSlot("REPO", 12, 0, false, "empty")).toBe(`<span><em class="empty">REPO</em> <i class="empty">0</i> <b class="empty">R12</b></span>`);
    const src = readFileSync(new URL("../client/hud/rack.ts", import.meta.url), "utf8");
    expect(src).toMatch(/phoneNameHtml\(name, tone\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.pranks em \{ font-style: normal/);
    expect(css).toMatch(/#hud \.pranks em\.empty \{ color: var\(--mg\)/);
  });
});

describe("the short name on the rack on the last quarter", () => {
  it("turns amber only on the last quarter", () => {
    expect(rackNameLow("low")).toBe(true);
    expect(rackNameLow("empty")).toBe(false);
    expect(rackNameLow("")).toBe(false);
    expect(rackNameHtml("LEASE-BREAKER", "low")).toBe(`<em class="low">LEASE-BREAKER</em>`);
    expect(rackNameHtml("LEASE-BREAKER", "empty")).toBe(`<em class="empty">LEASE-BREAKER</em>`);
    expect(rackNameHtml("LEASE-BREAKER", "")).toBe("<em>LEASE-BREAKER</em>");
    const src = readFileSync(new URL("../client/hud/rack.ts", import.meta.url), "utf8");
    expect(src).toMatch(/return tone === "low"/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.rack em\.low \{ color: var\(--am\)/);
  });
});

describe("the short name on the rack when the magazine is empty", () => {
  it("turns magenta only when that gun's magazine is empty", () => {
    expect(rackNameEmpty("empty")).toBe(true);
    expect(rackNameEmpty("low")).toBe(false);
    expect(rackNameEmpty("")).toBe(false);
    expect(rackNameHtml("LEASE-BREAKER", "empty")).toBe(`<em class="empty">LEASE-BREAKER</em>`);
    expect(rackNameHtml("LEASE-BREAKER", "low")).not.toContain("empty");
    expect(rackNameHtml("LEASE-BREAKER", "")).toBe("<em>LEASE-BREAKER</em>");
    const src = readFileSync(new URL("../client/hud/rack.ts", import.meta.url), "utf8");
    expect(src).toMatch(/return tone === "empty"/);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/rackNameHtml\(rackLabel\(w\.name\), tone\)/);
    expect(hud).toMatch(/const tone = rackRoundTone\(w\.magSize, p\.weapon\.ammo\[w\.slot\] \?\? 0, seating && w\.slot === p\.weapon\.slot\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.rack em \{ font-style: normal/);
    expect(css).toMatch(/#hud \.rack em\.empty \{ color: var\(--mg\)/);
  });
});

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
    expect(phoneRankSlot("REPO", 12, 6, false)).toBe("<span><em>REPO</em> <i>6</i> R12</span>");
    expect(phoneRankSlot("LEASE-BREAKER", 1, 30, true)).toBe(`<span class="on"><em>LEASE-BREAKER</em> <i>30</i> R01</span>`);
    expect(phoneRankSlot("DIRECTIVE", 29, 12, false)).toBe("<span><em>DIRECTIVE</em> <i>12</i> R29</span>");
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/phoneRankSlot\(rackLabel\(w\.name\), ranks\[i\] \?\? 1, rackRoundShown\(w\.magSize, p\.weapon\.ammo\[w\.slot\] \?\? 0, seating && w\.slot === p\.weapon\.slot\), w\.slot === p\.weapon\.slot, rackRoundTone\(w\.magSize, p\.weapon\.ammo\[w\.slot\] \?\? 0, seating && w\.slot === p\.weapon\.slot\), w\.slot === nextSlot\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud\.touch \.pranks \{ display: flex/);
    expect(css).toMatch(/#hud\.touch \.rack \{ display: none/);
  });
  it("says the rounds in that gun on a phone, the same count the rack paints", () => {
    expect(phoneRankSlot("REPO", 12, 6, false)).toBe("<span><em>REPO</em> <i>6</i> R12</span>");
    expect(phoneRankSlot("SHOCK", 1, "∞", true)).toBe(`<span class="on"><em>SHOCK</em> <i>∞</i> R01</span>`);
    expect(phoneRankSlot("DIRECTIVE", 30, 0, false)).toBe("<span><em>DIRECTIVE</em> <i>0</i> MASTERED</span>");
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/phoneRankSlot\(rackLabel\(w\.name\), ranks\[i\] \?\? 1, rackRoundShown\(w\.magSize, p\.weapon\.ammo\[w\.slot\] \?\? 0, seating && w\.slot === p\.weapon\.slot\), w\.slot === p\.weapon\.slot, rackRoundTone\(w\.magSize, p\.weapon\.ammo\[w\.slot\] \?\? 0, seating && w\.slot === p\.weapon\.slot\), w\.slot === nextSlot\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.rack i, #hud \.nades i, #hud \.pranks i/);
  });
  it("says MASTERED at the last rank", () => {
    expect(rackRankMark(30)).toBe("MASTERED");
    expect(rackRankMark(29)).not.toBe("MASTERED");
    expect(phoneRankSlot("DIRECTIVE", 30, 12, false)).toBe("<span><em>DIRECTIVE</em> <i>12</i> MASTERED</span>");
    const src = readFileSync(new URL("../client/hud/rack.ts", import.meta.url), "utf8");
    expect(src).toMatch(/n >= MAX_RANK\) return "MASTERED"/);
  });
  it("paints an empty count magenta and the last quarter amber, on the rack and the phone", () => {
    expect(rackRoundTone(30, 0)).toBe("empty");
    expect(rackRoundTone(30, 8)).toBe("low");
    expect(rackRoundTone(30, 9)).toBe("");
    expect(rackRoundTone(1, 1)).toBe("");
    expect(rackRoundTone(0, 0)).toBe("");
    expect(rackRoundHtml(0, "empty")).toBe(`<i class="empty">0</i>`);
    expect(rackRoundHtml(8, "low")).toBe(`<i class="low">8</i>`);
    expect(rackRoundHtml("∞")).toBe("<i>∞</i>");
    expect(phoneRankSlot("REPO", 12, 0, false, "empty")).toBe(`<span><em class="empty">REPO</em> <i class="empty">0</i> <b class="empty">R12</b></span>`);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    const tones = hud.match(/rackRoundTone\(w\.magSize, p\.weapon\.ammo\[w\.slot\] \?\? 0, seating && w\.slot === p\.weapon\.slot\)/g) ?? [];
    expect(tones).toHaveLength(2);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.rack i\.empty, #hud \.pranks i\.empty \{ color: var\(--mg\)/);
    expect(css).toMatch(/#hud \.rack i\.low, #hud \.pranks i\.low \{ color: var\(--am\)/);
  });
  it("marks the gun the next WPN tap selects", () => {
    expect(phoneRankSlot("STACK", 3, 40, false, "", true)).toBe(`<span class="next">▸ <em>STACK</em> <i>40</i> R03</span>`);
    expect(phoneRankSlot("STACK", 3, 40, true, "", true)).toBe(`<span class="on"><em>STACK</em> <i>40</i> R03</span>`);
    expect(phoneRankSlot("STACK", 3, 40, false)).toBe("<span><em>STACK</em> <i>40</i> R03</span>");
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/const nextSlot = cycleSlot\(p\.weapon\.slot, 1\)/);
    expect(hud).toMatch(/w\.slot === nextSlot\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud\.touch \.pranks span\.next \{ color: var\(--ye\)/);
  });
  it("says -- before the magazine seats, on the rack and the phone", () => {
    expect(rackRoundShown(30, 0, true)).toBe("--");
    expect(rackRoundShown(30, 12, true)).toBe("--");
    expect(rackRoundShown(30, 0, false)).toBe(0);
    expect(rackRoundShown(30, 12, false)).toBe(12);
    expect(rackRoundShown(0, 0, true)).toBe("∞");
    expect(rackRoundTone(30, 0, true)).toBe("");
    expect(rackRoundTone(30, 8, true)).toBe("");
    expect(rackRoundHtml("--")).toBe("<i>--</i>");
    expect(phoneRankSlot("REPO", 12, "--", true)).toBe(`<span class="on"><em>REPO</em> <i>--</i> R12</span>`);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/const seating = p\.weapon\.reloadTimer > 0 && !p\.weapon\.reloadSeated/);
    expect(hud).toMatch(/\$\{seating \? 1 : 0\}/);
    const shown = hud.match(/rackRoundShown\(w\.magSize, p\.weapon\.ammo\[w\.slot\] \?\? 0, seating && w\.slot === p\.weapon\.slot\)/g) ?? [];
    expect(shown).toHaveLength(2);
  });
});
