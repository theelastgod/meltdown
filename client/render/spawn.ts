/**
 * The respawn was a cut (Stage 96).
 *
 * A file that has just been closed is looking at whatever closed it — Stage 83 turned the camera
 * onto the killer over about a second. Then the simulation puts it back on the ledger, and on that
 * frame the camera cuts: a new place, the old heading, no fade, no sound, no line. The world jumps
 * and the player works out where they are from the buildings. Every death in the game ended in
 * that jump.
 *
 * This is the spawn-in, pure so it is unit-tested: the CRT comes up heavy and settles, and the lens
 * starts pulled in and opens out, over a second — a picture coming into focus rather than a cut.
 * Nothing here touches the simulation or the aim; the reticle is projected through the camera
 * after this is applied, exactly as the landing dip is.
 */
import { clamp } from "../../shared/math/vec3";

/** how long the picture takes to come into focus (seconds) */
export const SPAWN_TIME = 1.0;
/** how much heavier the CRT is on the first frame, as a multiplier on the settings' own level */
export const SPAWN_CRT = 1.2;
/** how far in the lens starts, in degrees below the frame's own field of view */
export const SPAWN_FOV = 9;

export interface SpawnIn {
  /** 0..SPAWN_CRT: added to the CRT level's multiplier, so a clean-image setting stays clean */
  crt: number;
  /** degrees, ≤ 0: taken off the field of view */
  fov: number;
  /** true while the spawn-in is still doing something */
  live: boolean;
}

/**
 * Where the spawn-in is at `t` seconds after the file came back. Both curves are eased out — steep
 * at the start, flat at the end — so the picture arrives rather than drifts, and both are exactly
 * zero at and after SPAWN_TIME.
 */
export function spawnCurve(t: number, time = SPAWN_TIME): SpawnIn {
  if (t < 0 || t >= time) return { crt: 0, fov: 0, live: false };
  const u = clamp(t / time, 0, 1);
  const k = (1 - u) * (1 - u); // ease-out: 1 at the start, 0 at the end
  return { crt: SPAWN_CRT * k, fov: -SPAWN_FOV * k, live: true };
}

/** A file came back on the ledger this frame: dead on the last one, alive on this. */
export function spawnEdge(wasAlive: boolean, alive: boolean): boolean {
  return alive && !wasAlive;
}
