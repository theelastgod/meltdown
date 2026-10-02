/**
 * The magazine that ran out without a word (Stage 100): the low line, the four states, the reload
 * fraction, and the one edge that is heard.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { altPadHot, altPadLow, ammoRead, chargeRead, coneEmpty, coneLow, firePadHot, firePadLow, jumpPadHot, jumpPadLow, lastRoundsEdge, LOW_FRAC, lowLine, nameEmpty, nameLow, reloadPadHot, reloadPadLow, reticleEmpty, reticleLow, sizeEmpty, sizeLow, slashEmpty, slashLow, weaponPadHot, weaponPadLow } from "../client/hud/ammo";

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

describe("the reload pad on the last quarter", () => {
  it("turns amber only on the last quarter", () => {
    expect(reloadPadLow("low")).toBe(true);
    expect(reloadPadLow("empty")).toBe(false);
    expect(reloadPadLow("ok")).toBe(false);
    expect(reloadPadLow("reloading")).toBe(false);
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toMatch(/setMagazineLow\(reloadPadLow\(mag\.state\)\)/);
    const touch = readFileSync(new URL("../client/touch.ts", import.meta.url), "utf8");
    expect(touch).toMatch(/querySelector\("\.tc-reload"\)\?\.classList\.toggle\("low", low\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.thumbs \.tc-reload\.low \{ color: var\(--am\)/);
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

describe("the jump pad on the last quarter", () => {
  it("turns amber only on the last quarter", () => {
    expect(jumpPadLow("low")).toBe(true);
    expect(jumpPadLow("empty")).toBe(false);
    expect(jumpPadLow("ok")).toBe(false);
    expect(jumpPadLow("reloading")).toBe(false);
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toMatch(/setJumpLow\(jumpPadLow\(mag\.state\)\)/);
    const touch = readFileSync(new URL("../client/touch.ts", import.meta.url), "utf8");
    expect(touch).toMatch(/querySelector\("\.tc-jump"\)\?\.classList\.toggle\("low", low\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.thumbs \.tc-jump\.low \{ color: var\(--am\)/);
  });
});

describe("the jump pad", () => {
  it("turns magenta only when the magazine is empty", () => {
    expect(jumpPadHot("empty")).toBe(true);
    expect(jumpPadHot("low")).toBe(false);
    expect(jumpPadHot("ok")).toBe(false);
    expect(jumpPadHot("reloading")).toBe(false);
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toMatch(/setJumpEmpty\(jumpPadHot\(mag\.state\)\)/);
    const touch = readFileSync(new URL("../client/touch.ts", import.meta.url), "utf8");
    expect(touch).toMatch(/querySelector\("\.tc-jump"\)\?\.classList\.toggle\("empty", empty\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.thumbs \.tc-jump\.empty \{ color: var\(--mg\)/);
  });
});

describe("the alt pad on the last quarter", () => {
  it("turns amber only on the last quarter", () => {
    expect(altPadLow("low")).toBe(true);
    expect(altPadLow("empty")).toBe(false);
    expect(altPadLow("ok")).toBe(false);
    expect(altPadLow("reloading")).toBe(false);
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toMatch(/setAltLow\(altPadLow\(mag\.state\)\)/);
    const touch = readFileSync(new URL("../client/touch.ts", import.meta.url), "utf8");
    expect(touch).toMatch(/querySelector\("\.tc-alt"\)\?\.classList\.toggle\("low", low\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.thumbs \.tc-alt\.low \{ color: var\(--am\)/);
  });
});

describe("the alt pad", () => {
  it("turns magenta only when the magazine is empty", () => {
    expect(altPadHot("empty")).toBe(true);
    expect(altPadHot("low")).toBe(false);
    expect(altPadHot("ok")).toBe(false);
    expect(altPadHot("reloading")).toBe(false);
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toMatch(/setAltEmpty\(altPadHot\(mag\.state\)\)/);
    const touch = readFileSync(new URL("../client/touch.ts", import.meta.url), "utf8");
    expect(touch).toMatch(/querySelector\("\.tc-alt"\)\?\.classList\.toggle\("empty", empty\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.thumbs \.tc-alt\.empty \{ color: var\(--mg\)/);
  });
});

describe("the weapon pad on the last quarter", () => {
  it("turns amber only on the last quarter", () => {
    expect(weaponPadLow("low")).toBe(true);
    expect(weaponPadLow("empty")).toBe(false);
    expect(weaponPadLow("ok")).toBe(false);
    expect(weaponPadLow("reloading")).toBe(false);
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toMatch(/setWeaponLow\(weaponPadLow\(mag\.state\)\)/);
    const touch = readFileSync(new URL("../client/touch.ts", import.meta.url), "utf8");
    expect(touch).toMatch(/querySelector\("\.tc-slot"\)\?\.classList\.toggle\("low", low\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.thumbs \.tc-slot\.low \{ color: var\(--am\)/);
  });
});

describe("the weapon pad", () => {
  it("turns magenta only when the magazine is empty", () => {
    expect(weaponPadHot("empty")).toBe(true);
    expect(weaponPadHot("low")).toBe(false);
    expect(weaponPadHot("ok")).toBe(false);
    expect(weaponPadHot("reloading")).toBe(false);
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toMatch(/setWeaponEmpty\(weaponPadHot\(mag\.state\)\)/);
    const touch = readFileSync(new URL("../client/touch.ts", import.meta.url), "utf8");
    expect(touch).toMatch(/querySelector\("\.tc-slot"\)\?\.classList\.toggle\("empty", empty\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.thumbs \.tc-slot\.empty \{ color: var\(--mg\)/);
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

describe("the cone on the last quarter", () => {
  it("turns amber only on the last quarter", () => {
    expect(coneLow("low")).toBe(true);
    expect(coneLow("empty")).toBe(false);
    expect(coneLow("ok")).toBe(false);
    expect(coneLow("reloading")).toBe(false);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/this\.q\("\.xh \.sp"\)\.classList\.toggle\("low", coneLow\(read\.state\)\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.xh \.sp\.low \{ border-color: rgba\(255,176,46/);
  });
});

describe("the slash between the count and the size on the last quarter", () => {
  it("turns amber only on the last quarter", () => {
    expect(slashLow("low")).toBe(true);
    expect(slashLow("empty")).toBe(false);
    expect(slashLow("ok")).toBe(false);
    expect(slashLow("reloading")).toBe(false);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/this\.q\("\.slash"\)\.classList\.toggle\("low", slashLow\(read\.state\)\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.ammo \.slash\.low \{ color: var\(--am\)/);
  });
});

describe("the slash between the count and the size when the magazine is empty", () => {
  it("turns magenta only when the magazine is empty", () => {
    expect(slashEmpty("empty")).toBe(true);
    expect(slashEmpty("low")).toBe(false);
    expect(slashEmpty("ok")).toBe(false);
    expect(slashEmpty("reloading")).toBe(false);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/this\.q\("\.slash"\)\.classList\.toggle\("empty", slashEmpty\(read\.state\)\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.ammo \.slash\.empty \{ color: var\(--mg\)/);
  });
});

describe("the size beside the count on the last quarter", () => {
  it("turns amber only on the last quarter", () => {
    expect(sizeLow("low")).toBe(true);
    expect(sizeLow("empty")).toBe(false);
    expect(sizeLow("ok")).toBe(false);
    expect(sizeLow("reloading")).toBe(false);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/this\.q\("\.mag"\)\.classList\.toggle\("low", sizeLow\(read\.state\)\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.ammo \.mag\.low \{ color: var\(--am\)/);
  });
});

describe("the size beside the count when the magazine is empty", () => {
  it("turns magenta only when the magazine is empty", () => {
    expect(sizeEmpty("empty")).toBe(true);
    expect(sizeEmpty("low")).toBe(false);
    expect(sizeEmpty("ok")).toBe(false);
    expect(sizeEmpty("reloading")).toBe(false);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/this\.q\("\.mag"\)\.classList\.toggle\("empty", sizeEmpty\(read\.state\)\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.ammo \.mag\.empty \{ color: var\(--mg\)/);
  });
});

describe("the gun's name on the last quarter", () => {
  it("turns amber only on the last quarter", () => {
    expect(nameLow("low")).toBe(true);
    expect(nameLow("empty")).toBe(false);
    expect(nameLow("ok")).toBe(false);
    expect(nameLow("reloading")).toBe(false);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/this\.q\("\.wname"\)\.classList\.toggle\("low", nameLow\(read\.state\)\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.ammo \.wname\.low \{ color: var\(--am\)/);
  });
});

describe("the gun's name when the magazine is empty", () => {
  it("turns magenta only when the magazine is empty", () => {
    expect(nameEmpty("empty")).toBe(true);
    expect(nameEmpty("low")).toBe(false);
    expect(nameEmpty("ok")).toBe(false);
    expect(nameEmpty("reloading")).toBe(false);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/this\.q\("\.wname"\)\.classList\.toggle\("empty", nameEmpty\(read\.state\)\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.ammo \.wname\.empty \{ color: var\(--mg\)/);
  });
});

describe("the cone when the magazine is empty", () => {
  it("turns magenta only when the magazine is empty", () => {
    expect(coneEmpty("empty")).toBe(true);
    expect(coneEmpty("low")).toBe(false);
    expect(coneEmpty("ok")).toBe(false);
    expect(coneEmpty("reloading")).toBe(false);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/this\.q\("\.xh \.sp"\)\.classList\.toggle\("empty", coneEmpty\(read\.state\)\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud \.xh \.sp\.empty \{ border-color: rgba\(255,62,201/);
  });
});
