/**
 * The words a control uses for itself (Stage 145): the key on a keyboard, the gesture on a phone.
 */
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

describe("the menu's footer (Stage 152)", () => {
  it("names the keys on a keyboard", () => {
    expect(menuFooter(false)).toBe("↑↓ MOVE · ENTER SELECT · ← → ADJUST · ESC BACK");
  });

  it("names the gestures on a phone, and no key it cannot press", () => {
    const touch = menuFooter(true);
    expect(touch).toBe("TAP A LINE TO CHOOSE · TAP [−] [+] TO ADJUST");
    expect(touch).not.toMatch(/ENTER|ESC|\u2191\u2193|\u2190 \u2192/);
  });

  it("and the settings line follows it", () => {
    expect(settingsLine(false)).toBe("← → adjusts · applied live · kept in this browser");
    expect(settingsLine(true)).toBe("tap [−] [+] · applied live · kept in this browser");
    expect(settingsLine(true)).not.toMatch(/\u2190|\u2192/);
  });

  it("keeps the two chips a thumb actually presses, which are drawn in the row", () => {
    expect(menuFooter(true)).toContain("[−]");
    expect(menuFooter(true)).toContain("[+]");
  });
});
