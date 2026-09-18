/**
 * The charge at your feet (Stage 93).
 *
 * A frag lands beside you while you are looking the other way and the game says nothing at all. The
 * thing is drawn in the world — a small object on the ground, behind you, in the dark, in the rain —
 * and that is the whole warning. Four and a half metres of blast and a hundred damage arrive out of
 * a silence the player had no way to read. Everything needed to warn them has been on the client
 * since Stage 4: the wire carries every live projectile's kind and position, and the blast of a kind
 * is a constant this file reads out of the simulation itself.
 *
 * What it will not do is count down. The fuse is not on the wire, so a countdown would be a guess
 * dressed as a fact; what is honest is *how close you are to the middle of a blast that is coming*,
 * which is what the mark says. The bearing is `hud/damage.ts`'s, the same rule the damage wedges,
 * the footsteps and the gunfire use.
 *
 * Pure, so the arithmetic is unit-tested; the HUD only draws the answer.
 */
import { clamp, type Vec3 } from "../../shared/math/vec3";
import { createProjectile, type ProjKind } from "../../shared/sim/projectiles";
import { bearing } from "./damage";

export interface LiveProjectile {
  id: number;
  kind: string;
  x: number;
  y: number;
  z: number;
}

export interface ThreatMark {
  id: number;
  kind: string;
  /** radians, clockwise from where the file is looking */
  bearing: number;
  /** metres, in three dimensions: one on the roof above you is not one at your feet */
  distance: number;
  /** 1 inside the blast, falling to 0 at the edge of the reach */
  urgency: number;
  /** you are standing in it */
  inside: boolean;
}

/** past this many blast radii a live charge is somebody else's problem */
export const THREAT_REACH = 2.4;
/** and no more than this many at once: a screen of arrows is a screen with no warning on it */
export const THREAT_MAX = 3;

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * What a live charge of this kind does when it goes off, straight out of `createProjectile` — the
 * simulation's own single answer for every kind, so a change to a blast moves the warning with it.
 * An unknown kind is not a threat rather than a guessed one.
 */
export function blastOf(kind: string): { radius: number; damage: number } {
  try {
    const p = createProjectile(0, kind as ProjKind, 0, { ...ZERO }, { ...ZERO });
    return { radius: p.radius, damage: Math.max(p.damage, p.edgeDamage) };
  } catch {
    return { radius: 0, damage: 0 };
  }
}

/**
 * The live charges worth warning about, worst first.
 *
 * Smoke and EMP are left out: they carry no damage, and a warning that cries for a smoke grenade is
 * a warning nobody reads the next time. Whose charge it is does not come into it — the wire does not
 * say, and your own frag at your feet kills you exactly as dead.
 */
export function threatMarks(live: readonly LiveProjectile[], at: { x: number; y: number; z: number; yaw: number }, max = THREAT_MAX): ThreatMark[] {
  const out: ThreatMark[] = [];
  for (const p of live) {
    const blast = blastOf(p.kind);
    if (blast.damage <= 0 || blast.radius <= 0) continue;
    const distance = Math.hypot(p.x - at.x, p.y - at.y, p.z - at.z);
    const reach = blast.radius * THREAT_REACH;
    if (distance >= reach) continue;
    const over = Math.max(0, distance - blast.radius);
    out.push({
      id: p.id,
      kind: p.kind,
      bearing: bearing(p.x, p.z, at.x, at.z, at.yaw),
      distance,
      urgency: clamp(1 - over / (reach - blast.radius), 0, 1),
      inside: distance <= blast.radius,
    });
  }
  out.sort((a, b) => b.urgency - a.urgency || a.distance - b.distance);
  return out.slice(0, max);
}
