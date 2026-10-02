/**
 * The magazine that ran out without a word (Stage 100): the low line, the four states, the reload
 * fraction, and the one edge that is heard.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ammoRead, chargeRead, firePadHot, firePadLow, lastRoundsEdge, LOW_FRAC, lowLine, reloadPadHot, reticleEmpty, reticleLow } from "../client/hud/ammo";

describe("lowLine", () => {
  it("is the last quarter, rounded up, and never under a round", () => {
    expect(lowLine(30)).toBe(Math.ceil(30 * LOW_FRAC));
    expect(lowLine(6)).toBe(2);
    expect(lowLine(2)).toBe(1);
  });
  it("a magazine of one has no last quarter", () => {
    expect(lowLine(1)).toBe(0);
    expect(lowLine(0)).toBe(0);
  });
});

describe("ammoRead", () => {
  it("reads ok above the line, low at it, empty at nothing", () => {
    expect(ammoRead(9, 30, 0, 0, false).state).toBe("ok");
    expect(ammoRead(8, 30, 0, 0, false).state).toBe("low");
    expect(ammoRead(1, 30, 0, 0, false).state).toBe("low");
    expect(ammoRead(0, 30, 0, 0, false).state).toBe("empty");
  });
  it("a reload is a reload whatever the count, with how far along it is", () => {
    const r = ammoRead(0, 30, 1.2, 1.6, false);
    expect(r.state).toBe("reloading");
    expect(r.reloadFrac).toBeCloseTo(0.25, 6);
    expect(r.seated).toBe(false);
    const late = ammoRead(30, 30, 0.2, 1.6, true);
    expect(late.state).toBe("reloading");
    expect(late.reloadFrac).toBeCloseTo(0.875, 6);
    expect(late.seated).toBe(true);
  });
  it("a bottomless weapon is always ok", () => {
    expect(ammoRead(0, 0, 0, 0, false).state).toBe("ok");
  });
});

describe("lastRoundsEdge", () => {
  it("fires on the round that crosses the line, and only that one", () => {
    const line = lowLine(30);
    expect(lastRoundsEdge(line + 1, line, 30)).toBe(true);
    expect(lastRoundsEdge(line, line - 1, 30)).toBe(false);
    expect(lastRoundsEdge(line + 2, line + 1, 30)).toBe(false);
  });
  it("a burst that jumps the line still counts once", () => {
    expect(lastRoundsEdge(lowLine(30) + 3, 2, 30)).toBe(true);
  });
  it("not going up, not into empty, not on a magazine of one", () => {
    expect(lastRoundsEdge(0, 30, 30)).toBe(false);
    expect(lastRoundsEdge(2, 8, 30)).toBe(false);
    expect(lastRoundsEdge(1, 0, 30)).toBe(false);
    expect(lastRoundsEdge(1, 0, 1)).toBe(false);
  });
});

describe("chargeRead (Stage 106)", () => {
  it("is off when nothing is charging, whatever the last value was", () => {
    expect(chargeRead(false, 0.7)).toEqual({ on: false, frac: 0, full: false });
  });
  it("reads the fraction while charging and is full only at the top", () => {
    expect(chargeRead(true, 0.33)).toEqual({ on: true, frac: 0.33, full: false });
    expect(chargeRead(true, 0.999)).toEqual({ on: true, frac: 0.999, full: false });
    expect(chargeRead(true, 1)).toEqual({ on: true, frac: 1, full: true });
  });
  it("clamps a value the sim would never send", () => {
    expect(chargeRead(true, 1.3).frac).toBe(1);
    expect(chargeRead(true, -0.2).frac).toBe(0);
  });
});

describe("the magazine bar", () => {
  it("turns amber on the last quarter, on the bar itself", () => {
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/this\.q\("\.ammobar"\)\.classList\.toggle\("low", read\.state === "low"\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.ammobar\.low \{ background: var\(--am\)/);
    expect(css).not.toMatch(/#hud \.ammo\.low \.ammobar/);
  });
});

describe("the reload pad", () => {
  it("turns magenta only when the magazine is empty", () => {
    expect(reloadPadHot("empty")).toBe(true);
    expect(reloadPadHot("low")).toBe(false);
    expect(reloadPadHot("ok")).toBe(false);
    expect(reloadPadHot("reloading")).toBe(false);
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toMatch(/setMagazineEmpty\(reloadPadHot\(mag\.state\)\)/);
    const touch = readFileSync(new URL("../client/touch.ts", import.meta.url), "utf8");
    expect(touch).toMatch(/querySelector\("\.tc-reload"\)\?\.classList\.toggle\("empty", empty\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.thumbs \.tc-reload\.empty \{ color: var\(--mg\)/);
  });
});

describe("the fire pad", () => {
  it("turns magenta only when the magazine is empty", () => {
    expect(firePadHot("empty")).toBe(true);
    expect(firePadHot("low")).toBe(false);
    expect(firePadHot("ok")).toBe(false);
    expect(firePadHot("reloading")).toBe(false);
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toMatch(/setFireEmpty\(firePadHot\(mag\.state\)\)/);
    const touch = readFileSync(new URL("../client/touch.ts", import.meta.url), "utf8");
    expect(touch).toMatch(/querySelector\("\.tc-fire"\)\?\.classList\.toggle\("empty", empty\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.thumbs \.tc-fire\.empty \{ color: var\(--mg\)/);
  });
});

describe("the fire pad on the last quarter", () => {
  it("turns amber only on the last quarter", () => {
    expect(firePadLow("low")).toBe(true);
    expect(firePadLow("empty")).toBe(false);
    expect(firePadLow("ok")).toBe(false);
    expect(firePadLow("reloading")).toBe(false);
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toMatch(/setFireLow\(firePadLow\(mag\.state\)\)/);
    const touch = readFileSync(new URL("../client/touch.ts", import.meta.url), "utf8");
    expect(touch).toMatch(/querySelector\("\.tc-fire"\)\?\.classList\.toggle\("low", low\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.thumbs \.tc-fire\.low \{ color: var\(--am\)/);
  });
});

describe("the crosshair on the last quarter", () => {
  it("turns amber only on the last quarter", () => {
    expect(reticleLow("low")).toBe(true);
    expect(reticleLow("empty")).toBe(false);
    expect(reticleLow("ok")).toBe(false);
    expect(reticleLow("reloading")).toBe(false);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/this\.q\("\.xh"\)\.classList\.toggle\("low", reticleLow\(read\.state\)\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.xh\.low::before, #hud \.xh\.low::after \{ background: var\(--am\)/);
  });
});

describe("the crosshair when the magazine is empty", () => {
  it("turns magenta only when the magazine is empty", () => {
    expect(reticleEmpty("empty")).toBe(true);
    expect(reticleEmpty("low")).toBe(false);
    expect(reticleEmpty("ok")).toBe(false);
    expect(reticleEmpty("reloading")).toBe(false);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/this\.q\("\.xh"\)\.classList\.toggle\("empty", reticleEmpty\(read\.state\)\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.xh\.empty::before, #hud \.xh\.empty::after \{ background: var\(--mg\)/);
  });
});
