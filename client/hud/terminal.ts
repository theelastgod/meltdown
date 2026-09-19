/**
 * The fixer's terminal on the phone (Stage 138).
 *
 * The terminal was played from the keyboard alone: Enter or Space to read on, 1–4 to choose, and
 * its footer said so. A phone has neither, and the campaign's first terminal — the creation
 * script, WHO DO YOU ANSWER TO? — was a dead end there: three choices, no way to take one. The
 * footer's words and the terminal's seat on the phone are pure rules here; the tap itself is wired
 * in the campaign, where the keys are.
 */

/** the footer's line: what the player does next, in the terms of the device in their hands */
export function terminalFooter(hasChoices: boolean, touch: boolean): string {
  if (touch) return hasChoices ? "TAP A LINE TO CHOOSE" : "TAP TO CONTINUE";
  return hasChoices ? "[1–4] CHOOSE" : "[ENTER] CONTINUE";
}

/** the gap the seat keeps from the row above it and from the pads beside it (px) */
export const TERMINAL_GAP = 8;
/** the inset the seat keeps from the view's bottom (px) */
export const TERMINAL_INSET = 14;

/**
 * Where the terminal sits on the phone: under the slot-and-tab row, which the phone lays out at the
 * top left, and short of the thumb pads on either side, which a terminal keeps (the file may still
 * have to move): the weapon pad at the bottom left, the action pads on the right. `leftPadsRight`
 * is the right edge of the nearest left-hand pad and `padsLeft` the left edge of the nearest
 * right-hand one, or null with none drawn on that side.
 */
export function terminalSeat(rowBottom: number, leftPadsRight: number | null, padsLeft: number | null, viewWidth: number, viewHeight: number): { top: number; left: number; right: number; maxHeight: number } {
  const top = Math.ceil(rowBottom) + TERMINAL_GAP;
  const left = leftPadsRight === null ? TERMINAL_INSET : Math.max(TERMINAL_INSET, Math.ceil(leftPadsRight) + TERMINAL_GAP);
  const right = padsLeft === null ? TERMINAL_INSET : Math.max(TERMINAL_INSET, Math.ceil(viewWidth - padsLeft) + TERMINAL_GAP);
  return { top, left, right, maxHeight: Math.max(0, viewHeight - top - TERMINAL_INSET) };
}
