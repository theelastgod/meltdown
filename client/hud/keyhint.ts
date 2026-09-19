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
