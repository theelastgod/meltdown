/**
 * The phone's grenade pads (Stage 143): what a tap throws, and what the next cycle selects.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { grenadePad, grenadePadHtml, nadeCountHtml, nadeSlot, nextGrenade } from "../client/hud/grenadepad";

const NAMES = ["FRAG", "SMOKE", "EMP"];

describe("the cycle the sim performs", () => {
  it("is the list's next, wrapping, whatever the counts", () => {
    expect(nextGrenade(0, 3)).toBe(1);
    expect(nextGrenade(1, 3)).toBe(2);
    expect(nextGrenade(2, 3)).toBe(0);
  });
  it("is nothing with no list", () => {
    expect(nextGrenade(0, 0)).toBe(0);
  });
});

describe("the pads' labels", () => {
  it("name what a tap throws and what the next tap selects, with the counts", () => {
    expect(grenadePad(0, [2, 1, 1], NAMES)).toEqual({ throwLabel: "FRAG 2", cycleLabel: "▸SMOKE 1" });
    expect(grenadePad(1, [2, 1, 1], NAMES)).toEqual({ throwLabel: "SMOKE 1", cycleLabel: "▸EMP 1" });
    expect(grenadePad(2, [2, 1, 1], NAMES)).toEqual({ throwLabel: "EMP 1", cycleLabel: "▸FRAG 2" });
  });
  it("tells the truth about an empty type rather than skipping it, because the sim does not skip", () => {
    expect(grenadePad(0, [2, 0, 1], NAMES)).toEqual({ throwLabel: "FRAG 2", cycleLabel: "▸SMOKE 0" });
    expect(grenadePad(1, [0, 0, 0], NAMES).throwLabel).toBe("SMOKE 0");
  });
  it("falls back to the bare word with no list", () => {
    expect(grenadePad(0, [], [])).toEqual({ throwLabel: "NADE", cycleLabel: "NADE" });
  });
  it("paints none left magenta, the same empty a gun uses", () => {
    expect(nadeCountHtml(2)).toBe("<i>2</i>");
    expect(nadeCountHtml(0)).toBe(`<i class="empty">0</i>`);
    expect(nadeCountHtml(Number.NaN)).toBe(`<i class="empty">0</i>`);
    const src = readFileSync(new URL("../client/hud/grenadepad.ts", import.meta.url), "utf8");
    expect(src).toMatch(/nadeCountHtml\(count\)/);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/nadeSlot\(g\.name, p\.weapon\.grenades\[i\] \?\? 0/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.nades i\.empty \{ color: var\(--mg\)/);
  });
  it("marks the grenade the next cycle selects", () => {
    expect(nadeSlot("SMOKE", 1, false, true)).toBe(`<span class="next">▸ SMOKE <i>1</i></span>`);
    expect(nadeSlot("FRAG", 2, true, false)).toBe(`<span class="on">FRAG <i>2</i></span>`);
    expect(nadeSlot("FRAG", 0, true, true)).toBe(`<span class="on">FRAG <i class="empty">0</i></span>`);
    expect(nadeSlot("EMP", 1, false, false)).toBe("<span>EMP <i>1</i></span>");
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/const nextG = nextGrenade\(p\.weapon\.grenadeSel, GRENADE_LIST\.length\)/);
    expect(hud).toMatch(/i === nextG\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.nades span\.next \{ color: var\(--ye\)/);
  });
  it("paints a spent zero magenta on the phone, where the row is hidden", () => {
    expect(grenadePadHtml(1, [2, 0, 1], NAMES).throwHtml).toBe(`SMOKE <i class="empty">0</i>`);
    expect(grenadePadHtml(0, [2, 0, 1], NAMES).cycleHtml).toBe(`▸SMOKE <i class="empty">0</i>`);
    expect(grenadePadHtml(0, [2, 1, 1], NAMES)).toEqual({ throwHtml: "FRAG <i>2</i>", cycleHtml: "▸SMOKE <i>1</i>" });
    expect(grenadePadHtml(0, [], [])).toEqual({ throwHtml: "NADE", cycleHtml: "NADE" });
    const touch = readFileSync(new URL("../client/touch.ts", import.meta.url), "utf8");
    expect(touch).toMatch(/grenadePadHtml\(sel, counts, names\)/);
    expect(touch).toMatch(/innerHTML = `<span>\$\{throwHtml\}<\/span>`/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.thumbs \.tc-nade i\.empty, #hud \.thumbs \.tc-nadenext i\.empty \{ color: var\(--mg\)/);
  });
  it("paints a grenade you still have yellow on the phone, the same as the row", () => {
    expect(grenadePadHtml(0, [2, 1, 1], NAMES).throwHtml).toBe("FRAG <i>2</i>");
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.thumbs \.tc-nade i, #hud \.thumbs \.tc-nadenext i \{ font-style: normal; color: var\(--ye\)/);
    expect(css).toMatch(/#hud \.nades i, #hud \.pranks i \{ font-style: normal; color: var\(--ye\)/);
  });
});
