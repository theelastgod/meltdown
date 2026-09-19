/**
 * The fixer's terminal on the phone (Stage 138): the footer's words and the seat.
 */
import { describe, expect, it } from "vitest";
import { TERMINAL_GAP, TERMINAL_INSET, terminalFooter, terminalSeat } from "../client/hud/terminal";

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
