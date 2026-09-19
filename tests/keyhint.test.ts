/**
 * The words a control uses for itself (Stage 145): the key on a keyboard, the gesture on a phone.
 */
import { describe, expect, it } from "vitest";
import { closeHint, openHint } from "../client/hud/keyhint";

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
