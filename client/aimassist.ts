/**
 * Touch aim assist, as a pure function (Stage 34).
 *
 * A thumb cannot do what a mouse does, and on a phone that is the difference between competing and
 * not — which in a game whose PvP pays $CAPITAL is the difference between earning and not. This is
 * the conservative form of the help: **rotational slowdown only**.
 *
 * It returns a multiplier the input controller applies to the thumb's rotation for one frame. The
 * controller can only ever multiply by it, so the assist can slow a drag and can never move the view
 * a pixel the player did not ask for. There is no snap, no lock, and no magnetism toward a target
 * the player is turning away from.
 *
 * Three properties are what make it safe to ship in this game specifically:
 *
 *  - it is a property of the **input device**, never of the Ghostfile, so there is nothing about it
 *    to sell and `lint:fairness` has no surface to police;
 *  - the frame that leaves the client is an ordinary `InputFrame`, so the sim and the server cannot
 *    tell an assisted drag from a careful one — the same rule Stage 32 set for the digital stick:
 *    mobile gets a different input device, not a different sim;
 *  - it only engages on a target that is **alive, in front, and actually visible**, so a player
 *    cannot feel for slowdown through a wall and use it as a cheap wallhack.
 */

export interface AssistTarget {
  x: number;
  y: number;
  z: number;
  height: number;
  alive: boolean;
}

/** How far off-centre a silhouette still slows the thumb, in radians (~4.6°). */
export const ASSIST_CONE = 0.08;
/** Slowest the thumb may get, dead on target. Never zero — the player always keeps control. */
export const ASSIST_FLOOR = 0.55;

/**
 * The multiplier for this frame's thumb rotation, in [ASSIST_FLOOR, 1].
 *
 * `visible` is the line-of-sight test, supplied by the caller so this stays pure and so the same
 * function can be exercised without a world.
 */
export function aimAssistScale(
  eye: { x: number; y: number; z: number },
  yaw: number,
  pitch: number,
  targets: readonly AssistTarget[],
  visible: (from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }) => boolean,
): number {
  const cy = Math.cos(pitch);
  const dir = { x: -Math.sin(yaw) * cy, y: Math.sin(pitch), z: -Math.cos(yaw) * cy };
  let best = Infinity;
  for (const t of targets) {
    if (!t.alive) continue;
    const aim = { x: t.x, y: t.y + t.height * 0.55, z: t.z };
    const to = { x: aim.x - eye.x, y: aim.y - eye.y, z: aim.z - eye.z };
    const dist = Math.hypot(to.x, to.y, to.z);
    if (dist < 1e-3) continue;
    const dot = (to.x * dir.x + to.y * dir.y + to.z * dir.z) / dist;
    if (dot <= 0) continue; // behind the player
    const off = Math.acos(Math.min(1, dot));
    if (off >= best || off > ASSIST_CONE) continue;
    if (!visible(eye, aim)) continue; // no help through walls
    best = off;
  }
  if (!Number.isFinite(best)) return 1;
  // full slowdown dead centre, easing back to normal at the edge of the cone
  return ASSIST_FLOOR + (1 - ASSIST_FLOOR) * (best / ASSIST_CONE);
}
