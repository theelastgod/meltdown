/**
 * The node under your feet (Stage 85).
 *
 * The wake strip at the top of the screen says who holds each of the eight nodes, in eight hexes the
 * size of a word. Standing on one, a player needs the other question answered: is this going my way,
 * and how long until it turns. Until now nothing said — the hold moved a hex's colour at the top of
 * the screen and that was the whole readout.
 *
 * The rule here does not re-derive the simulation's flip rate from who it thinks is standing where.
 * It watches the hold the server is actually publishing and measures how fast it is moving, which is
 * exact whatever the reason — extra files on it, the spread bonus from the nodes next door, a phage
 * burst, a mastery multiplier — and needs nothing new on the wire. Pure, so the arithmetic is
 * unit-tested; the HUD only draws the answer.
 */

/** what the client remembers about a node between frames: its last hold and how fast it was moving */
export interface TrackedNode {
  hold: number;
  /** per second, signed: negative is the hold coming off */
  rate: number;
  /** who held it when that rate was measured */
  owner: number;
}

export interface NodeLike {
  id: number;
  label: string;
  pos: { x: number; z: number };
  owner: number;
  hold: number;
  contested: boolean;
  puller: number;
}

export interface NodeReadout {
  id: number;
  label: string;
  owner: number;
  puller: number;
  hold: number;
  contested: boolean;
  /** metres from the file to the node's middle, and whether that is inside the node */
  distance: number;
  on: boolean;
  /** seconds until it turns over or locks, at the rate it is moving now; 0 when nothing is moving */
  seconds: number;
  toward: "flip" | "hold" | "contested" | "still";
}

/** below this a hold is drifting, not being pulled: the settle rate alone is 0.06 a second */
export const MOVING = 0.02;
/** how quickly the measured rate follows the truth (per second) */
export const RATE_SMOOTH = 6;

/**
 * Update what is known about each node's hold. A node that changes hands starts a new hold under a
 * new owner, moving the other way; carrying the old rate across that moment reads "FLIP IN 0.0s" on
 * a node that has just finished flipping, so the measurement starts again from there.
 */
export function trackHolds(book: Map<number, TrackedNode>, nodes: readonly NodeLike[], dt: number, smooth = RATE_SMOOTH): void {
  // `dt` is the simulation's own elapsed time, not the frame's: holds move per tick, and a frame in
  // which the simulation did not advance says nothing about the rate (a probe drives the sim by
  // hand, and a slow machine renders several frames per tick — both read far too slow otherwise)
  if (dt <= 1e-6) return;
  for (const n of nodes) {
    const t = book.get(n.id);
    if (!t) {
      book.set(n.id, { hold: n.hold, rate: 0, owner: n.owner });
      continue;
    }
    const turned = n.owner !== t.owner || Math.abs(n.hold - t.hold) > 0.5;
    const raw = turned ? 0 : (n.hold - t.hold) / dt;
    t.rate = turned ? 0 : t.rate + (raw - t.rate) * Math.min(1, dt * smooth);
    t.hold = n.hold;
    t.owner = n.owner;
  }
  for (const id of [...book.keys()]) if (!nodes.some((n) => n.id === id)) book.delete(id);
}

/** The node a file is standing on or walking up to, or null when it is out in the street. */
export function nearestNode(nodes: readonly NodeLike[], at: { x: number; z: number }, radius: number): { node: NodeLike; distance: number } | null {
  let best: { node: NodeLike; distance: number } | null = null;
  for (const n of nodes) {
    const d = Math.hypot(n.pos.x - at.x, n.pos.z - at.z);
    if (d <= radius && (!best || d < best.distance)) best = { node: n, distance: d };
  }
  return best;
}

/**
 * What to say about it. The seconds are the hold divided by the rate it is moving at: down to zero
 * is a flip, up to one is the owner locking it. A contested node is not moving at all — that is what
 * contested means in this simulation — so it says so rather than dividing by nothing.
 */
/** The nodefoot clock: CRT, not `FLIP IN 2.4s`. */
export function nodeClockNote(toward: NodeReadout["toward"], seconds: number): string {
  if (toward !== "flip" && toward !== "hold") return "";
  return ` · ${toward === "flip" ? "FLIP" : "LOCK"} IN ${seconds.toFixed(1)}S`;
}

export function nodeReadout(node: NodeLike, tracked: TrackedNode | undefined, distance: number, nodeRadius: number): NodeReadout {
  const rate = tracked?.rate ?? 0;
  const on = distance <= nodeRadius;
  const base = { id: node.id, label: node.label, owner: node.owner, puller: node.puller, hold: node.hold, contested: node.contested, distance, on };
  if (node.contested) return { ...base, seconds: 0, toward: "contested" };
  if (rate < -MOVING) return { ...base, seconds: node.hold / -rate, toward: "flip" };
  if (rate > MOVING) return { ...base, seconds: (1 - node.hold) / rate, toward: node.owner ? "hold" : "flip" };
  return { ...base, seconds: 0, toward: "still" };
}

/**
 * When the KERNEL comes for the weakest hold (Stage 87).
 *
 * VANTAGE brakes the wake on a fixed cadence: every `kernelPulseSeconds` of the round it takes half
 * the hold off whichever node is held most weakly, and re-leases it outright if that empties it. The
 * game announced this only after it happened. A player who can see it coming can go and stand on the
 * node that is about to be taken, which is the whole point of a scheduled threat.
 *
 * Nothing new is sent for this. The round clock is already on the wire, and the cadence is fixed, so
 * one mark — the clock reading at the round's start, or at the last pulse the client actually saw —
 * is enough to place every pulse after it exactly.
 */
export function kernelIn(timeLeft: number, markAt: number | null, pulseSeconds: number): number | null {
  if (markAt === null || pulseSeconds <= 0) return null;
  // the clock counts down, so the next pulse falls at a *lower* reading than the mark
  const left = timeLeft - (markAt - pulseSeconds);
  // a mark that is more than a pulse stale means one went by unseen — say nothing rather than
  // count down to a moment that has passed
  if (left < -1.5 || left > pulseSeconds + 1.5) return null;
  return Math.max(0, left);
}
