/**
 * The fixer's terminal on the phone (Stage 138): the footer's words and the seat.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hostPush, TERMINAL_GAP, TERMINAL_INSET, terminalFooter, terminalPush, terminalSeat } from "../client/hud/terminal";

describe("the terminal's footer", () => {
  it("offers the keys on a keyboard", () => {
    expect(terminalFooter(true, false)).toBe("[1–4] CHOOSE");
    expect(terminalFooter(false, false)).toBe("[ENTER] CONTINUE");
  });
  it("and a tap on a phone", () => {
    expect(terminalFooter(true, true)).toBe("TAP A LINE TO CHOOSE");
    expect(terminalFooter(false, true)).toBe("TAP TO CONTINUE");
  });
});

describe("the bare terminal", () => {
  it("pushes the CRT in when the file is speaking and nobody is standing there", () => {
    expect(terminalPush("terminal", false)).toBe(true);
    expect(terminalPush("terminal", true)).toBe(false);
    expect(terminalPush("deacon", false)).toBe(false);
    expect(terminalPush("you", false)).toBe(false);
    expect(terminalPush("vantage", false)).toBe(false);
    const camp = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(camp).toMatch(/terminalPush\(speaker, shot !== null\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud\.cut\.file:not\(\.touch\) \.terminal/);
    expect(css).toMatch(/scale\(1\.14\)/);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/toggle\("file", on && machine && !plate\)/);
  });
});

describe("the host's line with no body", () => {
  it("pushes the CRT in on a guest, and leaves a filmed host and your own line alone", () => {
    expect(hostPush("you", false, false)).toBe(true);
    expect(hostPush("you", false, true)).toBe(false);
    expect(hostPush("you", true, false)).toBe(false);
    expect(hostPush("terminal", false, false)).toBe(false);
    expect(hostPush("deacon", false, false)).toBe(false);
    const camp = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(camp).toMatch(/hostPush\(speaker, youIsSelf, shot !== null\)/);
  });
});

describe("the terminal's seat on the phone", () => {
  it("hangs a gap under the row and stops a gap short of the nearest pad on either side", () => {
    expect(terminalSeat(158, 60, 627, 844, 390)).toEqual({ top: 158 + TERMINAL_GAP, left: 60 + TERMINAL_GAP, right: 844 - 627 + TERMINAL_GAP, maxHeight: 390 - (158 + TERMINAL_GAP) - TERMINAL_INSET });
    expect(terminalSeat(157.4, 59.6, 626.6, 844, 390).top).toBe(158 + TERMINAL_GAP);
    expect(terminalSeat(157.4, 59.6, 626.6, 844, 390).left).toBe(60 + TERMINAL_GAP);
    expect(terminalSeat(157.4, 59.6, 626.6, 844, 390).right).toBe(218 + TERMINAL_GAP);
  });
  it("keeps the inset with no pad on a side, and never a negative height", () => {
    expect(terminalSeat(158, null, null, 844, 390).left).toBe(TERMINAL_INSET);
    expect(terminalSeat(158, null, null, 844, 390).right).toBe(TERMINAL_INSET);
    expect(terminalSeat(380, 60, 627, 844, 390).maxHeight).toBe(0);
  });
});
