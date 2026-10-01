/**
 * The phone was told to press keys it does not have (Stage 145).
 *
 * The reader frames close on a click, so a thumb has always worked; what they said was wrong. The
 * FILE book's header read `[TAB] CLOSE`, the graph's `[G] CLOSE`, the contracts desk's `[J] CLOSE` (C until Stage 692, when it was found to be crouch too),
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

/** What a safe zone offers: the market spends, the name desk burns. A phone is not told to press a key. */
export function safeZoneLine(touch: boolean): string {
  return `SAFE ZONE · ${openHint("TAB", "MARKET", touch)} · ${openHint("N", "NAME", touch)}`;
}

/** The district select's footer. Travel reloads. The room, not this page, picks the district online. */
export const DISTRICT_FOOTER = "TRAVEL RELOADS THE CLIENT. ONLINE, THE ROOM DECIDES THE DISTRICT.";

/** A failed contract. R reloads the page; a phone has no R, and the tab opens the desk. */
export function failedContractLine(touch: boolean): string {
  return touch ? "TAP CONTRACTS" : "[J] CONTRACTS · [R] RUN IT AGAIN";
}

/** A closed contract. The tab opens the desk. A phone has no J. */
export function closedContractLine(touch: boolean): string {
  return touch ? "TAP CONTRACTS" : "[J] CONTRACTS";
}

/** The words a phone taps to walk home. The rest of the card still opens the desk. */
export const CITY_WALK = "TAP BACK TO THE CITY";

/** A closed contract taken in the city. B walks back. A phone taps the walk words. */
export function closedCityLine(touch: boolean): string {
  return touch ? `TAP CONTRACTS · <span data-walk="1">${CITY_WALK}</span>` : "[J] CONTRACTS · [B] BACK TO THE CITY";
}

/** A tap landed on the walk words, not on the rest of the card. */
export function cardWalkHit(target: unknown): boolean {
  if (!target || typeof target !== "object" || !("closest" in target)) return false;
  const closest = (target as { closest?: unknown }).closest;
  return typeof closest === "function" && !!closest.call(target, "[data-walk]");
}

/**
 * A card with no timer is waiting on the contracts desk. Opening the desk takes that card down.
 * A timed card (an event, a few seconds) stays up.
 */
export function cardYieldsToDesk(cardOpen: boolean, cardTimer: number, deskOpen: boolean): boolean {
  return deskOpen && cardOpen && cardTimer === 0;
}

/** The city's standing objective. A phone opens contracts from the tab. */
export function cityContractsLine(touch: boolean): string {
  return `${touch ? "TAP CONTRACTS" : "[J] CONTRACTS"} · NO ONE HERE CAN HURT YOU BUT VANTAGE`;
}

/** The line the city writes when the file arrives. */
export function cityArrivalLine(district: string, touch: boolean): string {
  return `THE CITY · ${district} · EVERYONE ONLINE WALKS THESE STREETS · ${touch ? "TAP CONTRACTS" : "[J] CONTRACTS"}`;
}

/** An empty magazine. A phone reloads on the pad labelled RLD. */
export function reloadHint(touch: boolean): string {
  return touch ? "▼ TAP RLD" : "▼ RELOAD [R]";
}

/** The ledger entry's sign line. A phone has no Enter, so the receipt stays up until a tap. */
export function receiptSignLine(touch: boolean): string {
  return touch ? "TAP TO SIGN" : "[ENTER] SIGN";
}

/** What a HUD tab opens. MAP before anything else: a label is matched once. */
export function tabOpens(label: string): "file" | "graph" | "map" | "market" | "contracts" | "name" | null {
  if (/MAP/.test(label)) return "map";
  if (/FILE/.test(label)) return "file";
  if (/GRAPH/.test(label)) return "graph";
  if (/MARKET/.test(label)) return "market";
  if (/CONTRACTS/.test(label)) return "contracts";
  if (/NAME/.test(label)) return "name";
  return null;
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
