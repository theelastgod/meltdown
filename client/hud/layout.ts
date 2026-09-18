/**
 * The chrome crossed the play (Stage 97).
 *
 * Two things in a real third-person frame at 960 px wide. The weapon rack is anchored to the right
 * edge but eight slots wide, so it runs left across the file's own body and the lane ahead — the
 * part of the screen where the ground and everyone's feet are. And the alert line sits at a fixed
 * height straight under the mission panel, which is two lines tall in a contract, so INTEGRITY 30
 * prints half-hidden behind the objective.
 *
 * These are the two placement rules, pure so they are unit-tested: how much of the width the right
 * band may take before the rack has to wrap, and where the alert goes given where the panel above
 * it actually ends. The HUD measures and applies; the stylesheet wraps.
 */

/** the rack and its ammo may use this much of the width from the right edge, and no more */
export const RIGHT_BAND = 0.44;
/** the alert sits this far under whatever is above it (px) */
export const ALERT_GAP = 6;
/** and never lower than this (px), so it stays in the top band whatever the panel does */
export const ALERT_FLOOR = 120;

/** The width the right-hand band may take, in px, for a view this wide with this inset from the edge. */
export function rightBandWidth(viewWidth: number, inset: number): number {
  return Math.max(0, Math.floor(viewWidth * RIGHT_BAND) - inset);
}

/** Where the alert's top goes, given the bottom of the panel above it. */
export function alertTop(missionBottom: number): number {
  return Math.min(ALERT_FLOOR, Math.ceil(missionBottom) + ALERT_GAP);
}

/**
 * Whether a box that spans [left, right] crosses the play: the middle band of the screen, where the
 * reticle and the file's body are. The rack must never; the check reads this rule.
 */
export function crossesPlay(left: number, right: number, viewWidth: number): boolean {
  // the band's edge is the same integer the width function floors to, so a rack that fills the
  // band exactly is on the line, not over it — 1 − 0.44 is not 0.56 in floating point
  const band = viewWidth - Math.floor(viewWidth * RIGHT_BAND);
  return left < band && right > viewWidth * 0.5;
}

/** the status panel's content width at rest (px), the stylesheet's own number */
export const STATUS_WIDTH = 330;
/** the status panel keeps this far from the mission panel (px) */
export const STATUS_GAP = 8;
/** and never narrower than this (px): below it the name is not a name */
export const STATUS_MIN = 180;

/**
 * The status panel's content width, given where the mission panel begins (Stage 107). The status
 * panel is anchored at `inset` from the left with `frame` px of padding and border around its
 * content; the mission panel is centred and as wide as its text, so at 960 px the two met — the
 * file's own name ran under the objective and was cut at its edge. Null means no panel to keep
 * clear of.
 */
export function statusWidth(missionLeft: number | null, inset: number, frame: number): number {
  if (missionLeft === null) return STATUS_WIDTH;
  const room = Math.floor(missionLeft - STATUS_GAP - inset - frame);
  return Math.max(STATUS_MIN, Math.min(STATUS_WIDTH, room));
}
