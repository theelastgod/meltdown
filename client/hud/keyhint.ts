/**
 * The phone was told to press keys it does not have (Stage 145).
 *
 * The reader frames close on a click, so a thumb has always worked; what they said was wrong. The
 * FILE book's header read `[TAB] CLOSE`, the graph's `[G] CLOSE`, the contracts desk's `[C] CLOSE`,
 * the district panel's `[M] CLOSE`, and THE RUN's strip offered `[TAB] MARKET` — five instructions
 * naming keys a phone has no way to press, on frames a phone reaches by tapping. Stage 138 fixed
 * the fixer's terminal the same way; these are the rest.
 *
 * The rules are pure so the words are unit-tested, and so the phone's probe can hold the whole
 * client to one of them: no `[KEY]` anywhere on a touch frame.
 */

/** a frame's close marker: the key on a keyboard, the gesture on a phone */
export function closeHint(key: string, touch: boolean): string {
  return touch ? "TAP TO CLOSE" : `[${key}] CLOSE`;
}

/** a hint that opens something else: the key on a keyboard, the gesture on a phone */
export function openHint(key: string, what: string, touch: boolean): string {
  return touch ? `TAP ${what}` : `[${key}] ${what}`;
}

/**
 * The menu's footer (Stage 152, narrowed in Stage 163).
 *
 * Stage 145 took the keys off the frames a thumb reaches inside the game and left the screen every
 * player sees first saying `↑↓ MOVE · ENTER SELECT · ← → ADJUST · ESC BACK`. Stage 152 made that
 * line right for a phone. It was still the same line on every screen, and on the first one two of
 * its four instructions are for controls that screen has not got: `adjust` returns unless the row
 * is a setting, and `back` matches `wake`, `settings` and `pause` and does nothing at all on the
 * main menu. A title screen that offers ESC and answers with a sound and no movement has told the
 * player their key was wrong when it was the screen that was.
 *
 * So the footer says what this screen offers. Moving and selecting are always there — every screen
 * is a list. Adjusting is named when the screen holds anything adjustable, by screen rather than by
 * row, so the line does not flicker as the cursor passes the one row that is not.
 */
export function menuFooter(touch: boolean, adjustable: boolean, canBack: boolean): string {
  if (touch) return `TAP A LINE TO CHOOSE${adjustable ? " · TAP [−] [+] TO ADJUST" : ""}`;
  return `↑↓ MOVE · ENTER SELECT${adjustable ? " · ← → ADJUST" : ""}${canBack ? " · ESC BACK" : ""}`;
}

/** the line under a settings row, which names the same two chips (Stage 152) */
export function settingsLine(touch: boolean): string {
  return `${touch ? "TAP [−] [+]" : "← → ADJUSTS"} · APPLIED LIVE · KEPT IN THIS BROWSER`;
}
