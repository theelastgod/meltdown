/**
 * Where a round that falls comes down (Stage 78).
 *
 * The reticle marks the end of a straight ray, which is the truth for a bullet and a lie for a
 * launcher: the phage's round leaves at forty metres a second under twelve metres a second squared
 * of gravity, so at twelve metres it is already half a metre under the line the reticle drew, and
 * lobbed over a wall it lands somewhere the reticle never pointed at. This walks the arc the
 * simulation itself integrates — the same launch, the same Euler step, the same order of tests,
 * bodies before boxes — and returns where it stops.
 *
 * Pure and three-free, like `tps.ts`: the rules are unit-tested and the renderer draws the answer.
 * The simulation is untouched; this reads the same weapon definition the sim fires from.
 */
import { addScaled, len, v3, viewDir, type Vec3 } from "../../shared/math/vec3";
import { rayBox, rayCapsule } from "../../shared/sim/collision";
import { SIM_DT } from "../../shared/sim/constants";
import type { Box } from "../../shared/sim/box";
import type { AimTarget } from "./tps";

/** The round, as the sim launches it: `WeaponDef.projectile` plus the shooter's own motion. */
export interface ArcSpec {
  speed: number;
  gravity: number;
  /** seconds before it goes off in the air, which is as far as the trace can honestly reach */
  fuse: number;
  /** the shooter's velocity: the sim adds half of it across and a third of it up */
  vel: Vec3;
  /** how far in front of the eye the round starts */
  muzzle: number;
}

export interface ArcHit {
  /** where the round stops */
  point: Vec3;
  /** how far that is from the eye in a straight line — the depth the reticle is drawn at */
  distance: number;
  /** how long the round is in the air */
  time: number;
  /** it stopped on something rather than burning its fuse in the air */
  hit: boolean;
  /** and that something was a body */
  onTarget: boolean;
}

/** the sim's own launch: `dir * speed` plus half the shooter's ground speed and a third of its climb */
export const CARRY = { x: 0.5, y: 0.3, z: 0.5 };

/**
 * Walk the arc from an eye and an aim until it hits something or its fuse runs out. The step is the
 * simulation's own tick, so the answer is the round's own path rather than an approximation of it:
 * a reticle that disagreed with where the round lands would be worse than the straight ray it
 * replaces. Most shots stop within a few steps — the ground is a box like any other.
 */
export function arcPoint(eye: Vec3, yaw: number, pitch: number, spec: ArcSpec, boxes: readonly Box[], targets: readonly AimTarget[] = [], dt = SIM_DT): ArcHit {
  const dir = viewDir(yaw, pitch);
  const pos = addScaled(eye, dir, spec.muzzle);
  const vel = v3(dir.x * spec.speed + spec.vel.x * CARRY.x, dir.y * spec.speed + spec.vel.y * CARRY.y, dir.z * spec.speed + spec.vel.z * CARRY.z);
  const steps = Math.max(1, Math.ceil(spec.fuse / dt));
  let t = 0;
  for (let i = 0; i < steps; i++) {
    vel.y -= spec.gravity * dt;
    const step = v3(vel.x * dt, vel.y * dt, vel.z * dt);
    const dist = len(step);
    t += dt;
    if (dist < 1e-9) continue;
    const sd = v3(step.x / dist, step.y / dist, step.z / dist);
    // bodies first, the way the sim tests them: a launcher round bursts on contact
    let best = dist;
    let onTarget = false;
    for (const c of targets) {
      const h = rayCapsule(pos, sd, c.pos, c.radius, c.height, best);
      if (h !== null && h < best) {
        best = h;
        onTarget = true;
      }
    }
    let hitBox = false;
    for (const b of boxes) {
      const h = rayBox(pos, sd, b, best);
      if (h !== null && h < best) {
        best = h;
        hitBox = true;
        onTarget = false;
      }
    }
    if (onTarget || hitBox) {
      const point = addScaled(pos, sd, best);
      return { point, distance: len(v3(point.x - eye.x, point.y - eye.y, point.z - eye.z)), time: t - dt + (best / dist) * dt, hit: true, onTarget };
    }
    pos.x += step.x;
    pos.y += step.y;
    pos.z += step.z;
  }
  return { point: pos, distance: len(v3(pos.x - eye.x, pos.y - eye.y, pos.z - eye.z)), time: t, hit: false, onTarget: false };
}
