/**
 * The magazine that ran out without a word (Stage 100).
 *
 * The ammo count is a number in the bottom-right corner, and in a fight nobody is looking there;
 * the first anyone knew of an empty magazine was the dry click, and the reload after it showed
 * `--` for a second and a half with nothing to say how long was left. Three tells, all read from
 * the weapon state the sim already keeps: the counter turns amber on the last quarter of the
 * magazine and magenta when it is empty, the reticle carries the reload as a ring filling up, and
 * the last quarter is heard once, on the round that crosses into it.
 *
 * Pure so the rule is unit-tested; the HUD and the game read it, neither decides it.
 */

/** the last quarter of a magazine is "low" */
export const LOW_FRAC = 0.25;

export type AmmoState = "ok" | "low" | "empty" | "reloading";

export interface AmmoRead {
  state: AmmoState;
  /** 0 at the start of a reload, 1 as it ends; 0 when no reload is running */
  reloadFrac: number;
  /** the magazine is in: the rest of the reload can be cancelled */
  seated: boolean;
}

/**
 * The round count at or under which a magazine is low. A magazine of one has no last quarter to
 * warn about — its one round is the whole thing — so it is never low, only full or empty.
 */
export function lowLine(magSize: number): number {
  if (magSize <= 1) return 0;
  return Math.max(1, Math.ceil(magSize * LOW_FRAC));
}

export function ammoRead(ammo: number, magSize: number, reloadTimer: number, reloadTotal: number, reloadSeated: boolean): AmmoRead {
  if (magSize <= 0) return { state: "ok", reloadFrac: 0, seated: false };
  if (reloadTimer > 0 && reloadTotal > 0) return { state: "reloading", reloadFrac: Math.min(1, Math.max(0, 1 - reloadTimer / reloadTotal)), seated: reloadSeated };
  if (ammo <= 0) return { state: "empty", reloadFrac: 0, seated: false };
  if (ammo <= lowLine(magSize)) return { state: "low", reloadFrac: 0, seated: false };
  return { state: "ok", reloadFrac: 0, seated: false };
}

/**
 * True on the round that takes the magazine into its last quarter: the count was above the line
 * and is now at or under it, and still has something in it. Counted going down only — a reload
 * that comes up through the line is not a warning — and the empty click is the dry fire's own.
 */
export function lastRoundsEdge(prevAmmo: number, ammo: number, magSize: number): boolean {
  const line = lowLine(magSize);
  return line > 0 && prevAmmo > line && ammo <= line && ammo > 0;
}
