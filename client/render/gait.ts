/**
 * A rigid-legged walk that keeps the planted foot planted (Stage 668, shared in Stage 677).
 *
 * Each leg is driven by ground covered, not by time. For half the cycle its foot is on the ground and
 * moves back under the hip at exactly the body's speed; the hip angle is an `asin`, not a sine
 * wave, because a rigid leg's foot is a radius away from the hip. For the other half it lifts and
 * swings forward to the next foothold. The two legs are half a cycle apart. A rigid leg's planted
 * foot rises at each end of its step, so the body sinks by the same amount (`plantedBob`).
 */
export interface PlantedWalk {
  /** one full cycle, in metres travelled: two steps */
  stride: number;
  /** hip to the bottom of the sole, read off the built leg */
  leg: number;
  /** how high a stepping foot is lifted at the top of its swing */
  lift: number;
}

/**
 * A leg's pose after `walked` metres. `angle` is the hip's pitch (positive swings the foot forward,
 * toward -z); `lift` raises the leg. `side` -1 is the left leg, +1 the right.
 */
export function plantedGait(w: PlantedWalk, walked: number, side: -1 | 1): { angle: number; lift: number } {
  const half = w.stride / 4; // how far ahead of (or behind) the hip a foot is put down
  const u = (((walked / w.stride + (side > 0 ? 0.5 : 0)) % 1) + 1) % 1;
  let ahead: number;
  let lift = 0;
  if (u < 0.5) ahead = half - (u / 0.5) * 2 * half;
  else {
    const t = (u - 0.5) / 0.5;
    const eased = t * t * (3 - 2 * t);
    ahead = -half + eased * 2 * half;
    lift = w.lift * Math.sin(Math.PI * t);
  }
  return { angle: Math.asin(ahead / w.leg), lift };
}

/**
 * An arm's pitch after `walked` metres (Stage 685), in `plantedGait`'s sense: a pendulum `swing`
 * radians each way, back while the leg on its own side is forward, so it swings with the other leg.
 */
export function armSwing(w: PlantedWalk, walked: number, side: -1 | 1, swing: number): number {
  return side * swing * Math.cos((2 * Math.PI * walked) / w.stride);
}

/** how far the body sinks so the planted foot, on its rigid leg, stays on the ground */
export function plantedBob(w: PlantedWalk, walked: number): number {
  const l = plantedGait(w, walked, -1);
  const r = plantedGait(w, walked, 1);
  const planted = l.lift <= r.lift ? l : r;
  return -w.leg * (1 - Math.cos(planted.angle));
}
