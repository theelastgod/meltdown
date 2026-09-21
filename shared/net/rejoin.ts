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
 * same number. Stage 183: the last wait is the remainder of that window, not a refused double.
 */

/** how long the room keeps a disconnected file's seat, in seconds */
export const REJOIN_GRACE_SECONDS = 60;
/** the first wait after a drop (ms); each try waits twice the last */
export const REJOIN_FIRST_MS = 500;

/**
 * The wait before the nth rejoin (1-based), or null once the grace window is spent.
 *
 * Waits double, then the last one is the remainder so it lands on the window rather than
 * refusing the next double (which overshoots) and leaving the second half of the seat unused.
 * Measured: the geometric-sum gate ended the plan at 31.5 s of a 60 s hold.
 */
export function rejoinDelay(attempt: number, graceSeconds = REJOIN_GRACE_SECONDS): number | null {
  if (!Number.isInteger(attempt) || attempt < 1) return null;
  const windowMs = graceSeconds * 1000;
  let landed = 0;
  for (let n = 1; n <= attempt; n++) {
    const remaining = windowMs - landed;
    if (remaining <= 0) return null;
    const wait = Math.min(REJOIN_FIRST_MS * 2 ** (n - 1), remaining);
    if (n === attempt) return wait;
    landed += wait;
  }
  return null;
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

/**
 * The join handshake's own retry plan (Stage 155).
 *
 * The rule above knocks on a link that dropped. It never covered the link that never opened: the
 * join was sent once, on `onOpen`, and the Welcome was answered once. Either can be lost like any
 * other packet, and measured against a room over a 5 % lossy link two seeds in three ended the
 * same way — the client sat in `connecting` for ever, `playerId: -1`, while the room streamed
 * snapshots at a file it thought was playing. Nothing timed the handshake out, so nothing retried.
 *
 * The client now re-asks on a doubling wait, and the room answers a repeat join by saying hello
 * again rather than by striking it. Both sides read the same count, so the client cannot spend more
 * asks than the room will tolerate.
 */

/** the first wait for a Welcome (ms); each ask waits twice the last */
export const JOIN_FIRST_MS = 700;
/** how many times the join is re-sent before the link is handed to the knock */
export const JOIN_RESENDS = 3;

/**
 * The wait before the nth re-send of the join (1-based), or null once the plan is spent.
 *
 * A join is not an input: the room admits on it, so asking again forever would be asking the room
 * to admit forever. The plan is short and it ends.
 */
export function joinDelay(attempt: number, resends = JOIN_RESENDS): number | null {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > resends) return null;
  return JOIN_FIRST_MS * 2 ** (attempt - 1);
}

/** How long the client listens after its last ask before giving the door to the knock (ms). */
export function joinGiveUpMs(resends = JOIN_RESENDS): number {
  return joinDelay(resends, resends) ?? JOIN_FIRST_MS;
}

/** The whole handshake plan's span (ms): every wait, plus the listen after the last ask. */
export function joinWindowMs(resends = JOIN_RESENDS): number {
  let ms = joinGiveUpMs(resends);
  for (let n = 1; n <= resends; n++) ms += joinDelay(n, resends) ?? 0;
  return ms;
}
