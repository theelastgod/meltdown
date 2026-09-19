/**
 * Rejoining a room after the link drops (Stage 153).
 *
 * A dropped socket used to end the match where the player stood: the client set its status to
 * `closed`, pushed `LINK CLOSED` into the event log and stopped. Measured against a live room, the
 * client's world froze at tick 126 while the room ran on to 727 — and the room was still holding
 * the seat, `players: 1, connected: 0`, because a disconnected file keeps its place for the grace
 * window below. Nobody tried the door.
 *
 * The client now knocks, on a doubling wait, for as long as the room keeps the seat. The waits are
 * a rule so the two sides cannot drift: the room's default grace and the client's last try are the
 * same number.
 */

/** how long the room keeps a disconnected file's seat, in seconds */
export const REJOIN_GRACE_SECONDS = 60;
/** the first wait after a drop (ms); each try waits twice the last */
export const REJOIN_FIRST_MS = 500;

/**
 * The wait before the nth rejoin (1-based), or null once the grace window is spent — counting
 * every wait before it, so the last try lands inside the window rather than after it.
 */
export function rejoinDelay(attempt: number, graceSeconds = REJOIN_GRACE_SECONDS): number | null {
  if (!Number.isInteger(attempt) || attempt < 1) return null;
  const wait = REJOIN_FIRST_MS * 2 ** (attempt - 1);
  const spent = REJOIN_FIRST_MS * (2 ** attempt - 1);
  return spent <= graceSeconds * 1000 ? wait : null;
}

/** no window is worth more knocks than this, whatever the arithmetic says */
export const REJOIN_MAX_TRIES = 32;

/**
 * How many tries the grace window holds, for the line the player reads. Bounded: a counter that
 * trusts the rule above to say no is a counter that hangs the moment the rule stops saying it.
 */
export function rejoinTries(graceSeconds = REJOIN_GRACE_SECONDS): number {
  let n = 0;
  while (n < REJOIN_MAX_TRIES && rejoinDelay(n + 1, graceSeconds) !== null) n++;
  return n;
}
