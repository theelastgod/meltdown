/**
 * The $CAPITAL mark (Stage 679): the owner's call, a ¥ in the Estate's gold with the terminal's
 * cyan and magenta fringe, in a coin ring. Wherever the game names the token as a place or a thing
 * you hold — the Counter-Ledger, THE RUN on the menu, the run readout on the HUD — the mark stands
 * beside the name. Two sizes live under /icons/, which the service worker keeps for offline play.
 */
export const CAPITAL_MARK = { small: "/icons/capital-64.png", large: "/icons/capital-256.png" } as const;

/** the mark as inline HTML at text height, for the terminal panels */
export function capitalMark(): string {
  return `<img class="cap-mark" src="${CAPITAL_MARK.small}" alt="¥" width="64" height="64">`;
}
