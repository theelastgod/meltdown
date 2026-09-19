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
 * The menu's footer (Stage 152). Stage 145 took the keys off the frames a thumb reaches inside the
 * game and left the screen every player sees first saying `↑↓ MOVE · ENTER SELECT · ← → ADJUST ·
 * ESC BACK`. The menu has taken clicks since it was written — a tap on a row chooses it, a tap on
 * a row's [−] or [+] adjusts it — so what was wrong was only what it said.
 */
export function menuFooter(touch: boolean): string {
  return touch ? "TAP A LINE TO CHOOSE · TAP [−] [+] TO ADJUST" : "↑↓ MOVE · ENTER SELECT · ← → ADJUST · ESC BACK";
}

/** the line under a settings row, which names the same two chips (Stage 152) */
export function settingsLine(touch: boolean): string {
  return `${touch ? "tap [−] [+]" : "← → adjusts"} · applied live · kept in this browser`;
}
