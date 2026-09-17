/**
 * The third-person camera, as maths (Stage 60): where the camera goes for a given aim, and where
 * the reticle goes for a given camera. Pure and three-free so the rules are unit-tested; the
 * renderer applies the answers.
 *
 * The sim is untouched by any of this. A shot still leaves the player's eye along the yaw and
 * pitch the input holds — the camera is a view of that, offset over the right shoulder, and the
 * reticle is drawn where the eye's ray lands on screen rather than at the screen's centre, so what
 * the reticle covers is what the shot hits, at any range.
 */
import { addScaled, clamp, normalize, sub, v3, viewDir, yawRight, type Vec3 } from "../../shared/math/vec3";
import { rayBox } from "../../shared/sim/collision";
import type { Box } from "../../shared/sim/box";

export interface TpsOpts {
  /** how far behind the pivot the camera sits */
  distance: number;
  /** over the right shoulder (metres to the right of the pivot) */
  shoulder: number;
  /** above the pivot */
  lift: number;
  /** the camera never comes closer to the pivot than this, whatever is behind it */
  minDistance: number;
  /** the gap kept between the camera and the wall it backed into */
  wallPad: number;
}

/** the trailer's framing: a hooded silhouette in the lower left, the street ahead of it */
export const TPS_DEFAULT: TpsOpts = { distance: 3.0, shoulder: 0.78, lift: 0.36, minDistance: 0.45, wallPad: 0.22 };
/** aiming down sights pulls in and tightens over the shoulder */
export const TPS_ADS: TpsOpts = { distance: 1.4, shoulder: 0.5, lift: 0.2, minDistance: 0.45, wallPad: 0.22 };

export interface TpsCamera {
  pos: Vec3;
  /** the distance the camera ended up at, after whatever it backed into */
  distance: number;
  /** true when a box between the pivot and the wanted position pulled the camera in */
  blocked: boolean;
}

/**
 * The camera for a pivot (the player's eye), an aim, and the level's boxes. The wanted position is
 * behind and over the shoulder; the segment from the pivot to it is cast against the boxes and the
 * camera stops short of the first one, so a wall behind the player is never between the camera and
 * the player. The shoulder offset is applied before the cast, so the cast is along the line the
 * camera actually occupies.
 */
export function thirdPersonCamera(pivot: Vec3, yaw: number, pitch: number, boxes: readonly Box[], opts: TpsOpts = TPS_DEFAULT): TpsCamera {
  const fwd = viewDir(yaw, pitch);
  const right = yawRight(yaw);
  // the shoulder point: beside and above the pivot, still inside the player's own capsule column
  const anchor = addScaled(addScaled(pivot, right, opts.shoulder), v3(0, 1, 0), opts.lift);
  const want = addScaled(anchor, fwd, -opts.distance);
  const dir = normalize(sub(want, anchor));
  let t = opts.distance;
  let blocked = false;
  for (const b of boxes) {
    const hit = rayBox(anchor, dir, b, t);
    if (hit !== null && hit < t) {
      t = hit;
      blocked = true;
    }
  }
  const distance = clamp(blocked ? t - opts.wallPad : t, opts.minDistance, opts.distance);
  return { pos: addScaled(anchor, dir, distance), distance, blocked: blocked && distance < opts.distance };
}

/** how far the reticle is projected when the eye's ray hits nothing */
export const AIM_FAR = 80;

/** Where the eye's ray lands: the first box along it, or a point far along it. The reticle is drawn where this projects. */
export function aimPoint(eye: Vec3, yaw: number, pitch: number, boxes: readonly Box[], far = AIM_FAR): { point: Vec3; distance: number; hit: boolean } {
  const dir = viewDir(yaw, pitch);
  let t = far;
  let hit = false;
  for (const b of boxes) {
    const h = rayBox(eye, dir, b, t);
    if (h !== null && h < t) {
      t = h;
      hit = true;
    }
  }
  return { point: addScaled(eye, dir, t), distance: t, hit };
}
