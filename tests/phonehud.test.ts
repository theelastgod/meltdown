/**
 * Stage 951: a landscape phone can see the lane.
 *
 * The slot-and-tab row reserved 270 px for the thumb arc and wrapped, so the row was two lines
 * tall. The ammo column used the desktop's right band and sat in that arc, and the rank chips
 * wrapped down into the grenade pads. The log stays wide enough for three lines.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PHONE_AMMO_WIDTH, phoneAmmoWidth, rightBandWidth } from "../client/hud/layout";

describe("the phone's chrome", () => {
  it("keeps the ammo column short on a phone and the desktop band on a desktop", () => {
    expect(phoneAmmoWidth(true, 844)).toBe(PHONE_AMMO_WIDTH);
    expect(PHONE_AMMO_WIDTH).toBe(96);
    expect(phoneAmmoWidth(false, 960)).toBe(rightBandWidth(960, 14));
    expect(phoneAmmoWidth(false, 1920)).toBe(rightBandWidth(1920, 14));
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/phoneAmmoWidth\(this\.root\.classList\.contains\("touch"\), w\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud\.touch \.bottom \{[^}]*flex-wrap: nowrap/);
    expect(css).toMatch(/#hud\.touch \.bottom \{[^}]*max-width: calc\(100vw - 128px - env\(safe-area-inset-left\)\)/);
    expect(css).not.toMatch(/100vw - 270px/);
    expect(css).not.toMatch(/right: calc\(250px \+ env\(safe-area-inset-right\)\)/);
    expect(css).toMatch(/#hud\.touch \.ammo \{[^}]*top: calc\(104px \+ env\(safe-area-inset-top\)\)/);
    expect(css).toMatch(/#hud\.touch \.ammo \{[^}]*width: 96px/);
    expect(css).toMatch(/#hud\.touch \.log \{[^}]*width: 420px/);
    expect(css).toMatch(/#hud\.touch \.pranks \{ display: flex; flex-wrap: nowrap/);
    expect(css).toMatch(/#hud\.touch\.cut\.file \.terminal \{ transform: none/);
    expect(css).not.toMatch(/#hud\.touch\.cut\.file \.terminal \{ transform: scale/);
  });
});
