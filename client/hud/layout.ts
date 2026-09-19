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
export const ALERT_FLOOR = 160;

/** The width the right-hand band may take, in px, for a view this wide with this inset from the edge. */
export function rightBandWidth(viewWidth: number, inset: number): number {
  return Math.max(0, Math.floor(viewWidth * RIGHT_BAND) - inset);
}

/** Where the alert's top goes, given the bottom of the panel above it. */
export function alertTop(missionBottom: number, underBottom: number | null = null, shift = 0): number {
  // the alert also stacks under the node line and the searchlight warning when they are up
  // (Stage 120): a three-line mission panel had put it straight through the node line. `shift` is
  // the phone's (Stage 139): its floor moves down with the rest of the stack
  const seat = Math.max(Math.ceil(missionBottom), underBottom === null ? 0 : Math.ceil(underBottom));
  return Math.min(ALERT_FLOOR + shift, seat + ALERT_GAP);
}

/**
 * How far the phone moves the stack down (Stage 139): the node line, the searchlight warning and
 * the alert were seated at the desktop's 92 px, which on the phone is inside its slot-and-tab
 * row. They sit under whatever the phone draws there instead: the row, or the touch legend under
 * it. `underBottom` is that thing's bottom, or null on the desktop, where nothing moves.
 */
export function stackShift(underBottom: number | null): number {
  return underBottom === null ? 0 : Math.max(0, Math.ceil(underBottom) + FLAG_GAP - FLAG_TOP);
}

/** where the searchlight warning sits when nothing is under it (px from the HUD's top) */
export const FLAG_TOP = 92;
/** the gap it keeps under the node line */
export const FLAG_GAP = 6;

/**
 * The searchlight warning's seat (Stage 116): it shared the node line's 92 px and printed over it
 * whenever the mech lit you at a node. With the node line up it hangs a gap under the line's
 * measured bottom; with the line hidden it keeps its old seat.
 */
export function flagTop(nodeFootBottom: number | null, shift = 0): number {
  return nodeFootBottom === null ? FLAG_TOP + shift : Math.max(FLAG_TOP + shift, Math.ceil(nodeFootBottom) + FLAG_GAP);
}

/** the gap the foot line keeps from the slots on its left and the tab strip on its right */
export const FOOT_GAP = 8;

/**
 * Where the foot line sits (Stage 118): between the slots and the tab strip when the room between
 * them holds it on one line with a gap either side, and lifted above the row when it does not —
 * at 640 px wide the row left it 67 px and it wrapped onto three lines.
 */
export function footRow(room: number, need: number): "beside" | "above" {
  return need + 2 * FOOT_GAP <= room ? "beside" : "above";
}

/** the gap a reader frame keeps under the file's header, and its inset from the view's bottom */
export const FRAME_GAP = 8;
export const FRAME_INSET = 14;

/**
 * Where a reader frame sits (Stage 119): the ledger book, its graph and the contracts desk were
 * centred at up to 92 % of the view's height, and on a 540 px view that put their top edge over
 * the file's header — the one piece of chrome every frame keeps, cut through by a translucent
 * panel. The frame's top hangs a gap under the header's measured bottom and its height is what
 * is left above the bottom inset.
 */
export function frameSeat(statusBottom: number, viewHeight: number, rowTop: number | null = null): { top: number; maxHeight: number } {
  const top = Math.ceil(statusBottom) + FRAME_GAP;
  // Stage 136: where the bottom row (the slots, the foot line, the tab strip) is drawn under the
  // frame, the frame ends a gap above it rather than at the view's inset, under the row
  const floor = rowTop === null ? viewHeight - FRAME_INSET : Math.min(viewHeight - FRAME_INSET, Math.floor(rowTop) - FRAME_GAP);
  return { top, maxHeight: Math.max(0, floor - top) };
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

/**
 * The most the centred mission panel may be wide (px), given the view's width, where the status
 * panel would end at its narrowest, and where the map begins (Stage 110). The panel is centred, so
 * its half-width is bounded on each side by the nearer of the two: the status panel's floor plus
 * the gap on the left, the map plus the gap on the right. THE RUN's strip made the panel 630 px
 * wide at 960, and the status panel, already at its floor, was run over.
 */
export function missionMaxWidth(viewWidth: number, statusFloorRight: number, mapLeft: number): number {
  const half = Math.min(viewWidth / 2 - statusFloorRight - STATUS_GAP, mapLeft - STATUS_GAP - viewWidth / 2);
  return Math.max(0, Math.floor(half * 2));
}

/** the mission panel's narrowest useful width (px), the stylesheet's own min-width */
export const MISSION_MIN = 240;

/**
 * Where the mission panel goes (Stage 111): beside the status panel in the top band when the band
 * can hold it at its narrowest useful width, otherwise on a second row under the status panel,
 * where only the map bounds it. At 640 px the band is 214 of status floor, 240 of panel and 138 of
 * map with gaps — more than the width — and the panel ran over the header a third time.
 */
export function missionRow(viewWidth: number, statusFloorRight: number, mapLeft: number, inset: number): { row: "beside" | "below"; maxWidth: number } {
  const beside = missionMaxWidth(viewWidth, statusFloorRight, mapLeft);
  if (beside >= MISSION_MIN) return { row: "beside", maxWidth: beside };
  return { row: "below", maxWidth: missionMaxWidth(viewWidth, inset, mapLeft) };
}

/**
 * Which form the status panel's second line takes (Stage 135): the full one, with the XP into the
 * depth, where the line's box holds it; else the short one, which drops the XP and keeps the scrip
 * and the wakelight. `room` is the line's box width, `need` what the full line measures.
 */
export function statusLineFit(room: number, need: number): "full" | "short" {
  return need <= room ? "full" : "short";
}

/** the gap the phone's row keeps under the mission panel (px) */
export const PHONE_ROW_GAP = 6;

/**
 * Where the phone's slot-and-tab row begins (Stage 140): at its stylesheet's seat, or a gap under
 * the mission panel when the panel, centred over the row's span, reaches lower than that — the
 * wake's panel carries a cell line and the hex strip and had ended at 92 px over a row at 72.
 * `base` is the row's own seat and `missionBottom` the panel's bottom, or null with none drawn.
 */
export function phoneRowTop(base: number, missionBottom: number | null): number {
  return missionBottom === null ? base : Math.max(base, Math.ceil(missionBottom) + PHONE_ROW_GAP);
}

/** how many entries the event log keeps (Stage 140): five, and three on the phone, whose log has the alert's seat above it */
export const LOG_LINES = 5;
export const PHONE_LOG_LINES = 3;
export function logLines(touch: boolean): number {
  return touch ? PHONE_LOG_LINES : LOG_LINES;
}
