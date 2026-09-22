/**
 * The words a control uses for itself (Stage 145): the key on a keyboard, the gesture on a phone.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { closeHint, menuFooter, openHint, settingsLine } from "../client/hud/keyhint";

describe("a frame's close marker", () => {
  it("names the key on a keyboard", () => {
    expect(closeHint("TAB", false)).toBe("[TAB] CLOSE");
    expect(closeHint("C", false)).toBe("[C] CLOSE");
    expect(closeHint("G", false)).toBe("[G] CLOSE");
    expect(closeHint("M", false)).toBe("[M] CLOSE");
  });
  it("names the gesture on a phone, whatever the key would have been", () => {
    for (const k of ["TAB", "C", "G", "M"]) expect(closeHint(k, true)).toBe("TAP TO CLOSE");
  });
  it("never puts a bracketed key in front of a thumb", () => {
    for (const k of ["TAB", "C", "G", "M"]) expect(closeHint(k, true)).not.toMatch(/\[[A-Z]+\]/);
  });
});

describe("a hint that opens something else", () => {
  it("names the key on a keyboard and the gesture on a phone", () => {
    expect(openHint("TAB", "MARKET", false)).toBe("[TAB] MARKET");
    expect(openHint("TAB", "MARKET", true)).toBe("TAP MARKET");
    expect(openHint("TAB", "MARKET", true)).not.toMatch(/\[[A-Z]+\]/);
  });
});

describe("the menu's footer (Stages 152, 163)", () => {
  // the settings screen: a list, with things to adjust, and somewhere to go back to
  const settings = { adjustable: true, canBack: true };
  // the main menu: a list, nothing adjustable, and nothing behind it
  const root = { adjustable: false, canBack: false };

  it("names the keys on a keyboard, for what the screen offers", () => {
    expect(menuFooter(false, settings.adjustable, settings.canBack)).toBe("↑↓ MOVE · ENTER SELECT · ← → ADJUST · ESC BACK");
    expect(menuFooter(false, root.adjustable, root.canBack)).toBe("↑↓ MOVE · ENTER SELECT");
  });

  it("never offers a control the screen has not got", () => {
    const first = menuFooter(false, root.adjustable, root.canBack);
    expect(first).not.toMatch(/ADJUST/);
    expect(first).not.toMatch(/BACK/);
    expect(menuFooter(false, true, false)).not.toMatch(/BACK/);
    expect(menuFooter(false, false, true)).not.toMatch(/ADJUST/);
  });

  it("always says how to move and how to choose, because every screen is a list", () => {
    for (const adj of [true, false]) {
      for (const back of [true, false]) {
        expect(menuFooter(false, adj, back)).toContain("MOVE");
        expect(menuFooter(false, adj, back)).toContain("SELECT");
        expect(menuFooter(true, adj, back)).toContain("TAP A LINE TO CHOOSE");
      }
    }
  });

  it("names the gestures on a phone, and no key it cannot press", () => {
    const touch = menuFooter(true, settings.adjustable, settings.canBack);
    expect(touch).toBe("TAP A LINE TO CHOOSE · TAP [−] [+] TO ADJUST");
    expect(touch).not.toMatch(/ENTER|ESC|\u2191\u2193|\u2190 \u2192/);
    // a phone has no ESC either way, so going back is never named on touch
    expect(menuFooter(true, false, true)).toBe("TAP A LINE TO CHOOSE");
  });

  it("and the settings line follows it", () => {
    expect(settingsLine(false)).toBe("← → ADJUSTS · APPLIED LIVE · KEPT IN THIS BROWSER");
    expect(settingsLine(true)).toBe("TAP [−] [+] · APPLIED LIVE · KEPT IN THIS BROWSER");
    expect(settingsLine(false)).not.toBe("← → adjusts · applied live · kept in this browser");
    expect(settingsLine(true)).not.toBe("tap [−] [+] · applied live · kept in this browser");
    expect(settingsLine(true)).not.toMatch(/\u2190|\u2192/);
    const src = readFileSync(new URL("../client/hud/keyhint.ts", import.meta.url), "utf8");
    expect(src).toMatch(/APPLIED LIVE · KEPT IN THIS BROWSER/);
    expect(src).not.toMatch(/applied live · kept in this browser/);
  });

  it("keeps the two chips a thumb actually presses where there is anything to adjust", () => {
    expect(menuFooter(true, true, true)).toContain("[−]");
    expect(menuFooter(true, true, true)).toContain("[+]");
    expect(menuFooter(true, false, true)).not.toContain("[−]");
  });
});
