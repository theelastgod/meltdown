/**
 * The round that missed you (Stage 99).
 *
 * The simulation has always known how close every shot came — `castRay` measures each ray's
 * closest approach to every other file and calls it `nearMiss` — and nobody heard it. A round
 * passing a hand's width from your ear sounded exactly like one aimed thirty degrees wide of you
 * from the same street: the same crack from the same muzzle. In every shooter the difference is the
 * loudest thing in the fight: the snap of a round going past is how you know you are the one being
 * shot at, before anything lands.
 *
 * Pure and audio-free so the rule is unit-tested. The geometry is the sim's own — the closest point
 * on the ray to the head — read on the client from the shot the wire already carries (its start and
 * its end), so nothing new crosses the network. The bearing is `hud/damage.ts`'s, the wedges' rule.
 */
import { clamp } from "../shared/math/vec3";
import { bearing } from "./hud/damage";

/** metres from the head at closest approach: further than this a round is just somebody's gun */
export const SNAP_REACH = 1.6;
/** closer than this the snap is on you rather than to one side */
export const SNAP_NEAR = 0.15;

export interface PassCue {
  /** metres from the head at the round's closest approach */
  distance: number;
  /** radians, 0 ahead, positive to the right: where the round was when it was closest */
  bearing: number;
  /** −1 hard left, +1 hard right, relative to where the listener is looking */
  pan: number;
  /** 1 at the ear, 0 at the reach */
  gain: number;
}

interface Point {
  x: number;
  y: number;
  z: number;
}

/**
 * What a shot that flew from `from` to `to` sounded like to a head at `head`, or null if it never
 * came within reach. The closest approach is taken on the segment the round actually flew — a round
 * that stopped in a wall two metres short of you did not pass you, and one that started at your
 * own muzzle is yours and does not count (the caller keeps its own shots out anyway).
 */
export function shotPass(from: Point, to: Point, head: { x: number; y: number; z: number; yaw: number }): PassCue | null {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  if (len2 <= 0) return null;
  const hx = head.x - from.x, hy = head.y - from.y, hz = head.z - from.z;
  // where along the flight the round was nearest the head, clamped to the flight itself
  const t = clamp((hx * dx + hy * dy + hz * dz) / len2, 0, 1);
  if (t <= 0) return null;
  const px = from.x + dx * t, py = from.y + dy * t, pz = from.z + dz * t;
  const distance = Math.hypot(px - head.x, py - head.y, pz - head.z);
  if (distance >= SNAP_REACH) return null;
  const b = bearing(px, pz, head.x, head.z, head.yaw);
  return {
    distance,
    bearing: b,
    pan: Math.sin(b) * clamp(distance / SNAP_NEAR, 0, 1),
    gain: 1 - distance / SNAP_REACH,
  };
}
