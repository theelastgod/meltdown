/**
 * Where a hit came from, as maths (Stage 74).
 *
 * In first person the screen is the player's whole field of view, and a shot from behind is a shot
 * from behind the screen. Third person moved the camera back over the shoulder, which widened what
 * is visible and did nothing at all for what is not: half the street is still behind you, and until
 * now being shot from it was a sound and a number on a bar. This is the rule that turns a hit into
 * a bearing on the screen's edge — pure and three-free, so the arithmetic is unit-tested and the
 * HUD only draws the answer.
 *
 * Bearings are relative to where the camera looks: 0 is straight ahead, positive is to the right,
 * and ±π is directly behind. The sim is untouched by any of this.
 */
import { wrapAngle } from "../../shared/math/vec3";

/** A hit the player took: where it came from, when, and how hard. */
export interface HitSource {
  /** the attacker's position when it landed, in world space */
  x: number;
  z: number;
  /** the clock reading when it landed (seconds) */
  at: number;
  damage: number;
}

/** A mark to draw: a bearing relative to the look, and how far through its life it is. */
export interface HitMark {
  /** radians, 0 ahead, positive to the right, ±pi behind */
  angle: number;
  /** 1 when it lands, 0 when it has faded */
  alpha: number;
  damage: number;
}

/** how long a mark stays on screen. Lease Row keeps 1.4. The mark count stays HIT_MAX. */
export const HIT_LIFE = 1.4;
/** the most marks drawn at once: past this the oldest go, because a wall of wedges says nothing */
export const HIT_MAX = 4;

const DISTRICT_WEDGE: Record<string, number> = {
  deadletter_docks: 0.55,
  repo_depot: 0.9,
  night_market: 2.4,
  relay_heights: 1.15,
  ash_canal: 0.7,
  glass_mile: 1.85,
  bone_market: 1.0,
  cold_vault: 0.4,
  neon_chapel: 2.1,
  slag_pit: 1.25,
  wire_garden: 1.65,
  red_kiln: 1.5,
  paper_wharf: 0.8,
  velvet_court: 2.6,
  rust_crown: 1.35,
  salt_stairs: 0.35,
  lamp_bazaar: 2.2,
  debt_orchard: 1.75,
  black_relay: 0.25,
};

/** How long a hit's bearing stays on the screen. Indoor rooms and Lease Row keep HIT_LIFE. */
export function wedgeLife(name: string | undefined): number {
  return (name && DISTRICT_WEDGE[name]) || HIT_LIFE;
}

/**
 * The bearing from the player to a point, relative to a look yaw. Yaw is the sim's: 0 looks toward
 * -z, and the right hand is +x, which is the convention `yawRight` and `viewDir` already use.
 */
export function bearing(fromX: number, fromZ: number, atX: number, atZ: number, yaw: number): number {
  const dx = fromX - atX;
  const dz = fromZ - atZ;
  if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return 0;
  // The look direction is (-sin yaw, -cos yaw) — the sim's own convention — so the yaw that points
  // at the attacker is atan2(-dx, -dz). Screen bearings run the other way round from sim yaw: on
  // screen, to the right is positive, and turning right lowers the yaw. Hence yaw minus theirs.
  const theirs = Math.atan2(-dx, -dz);
  return wrapAngle(yaw - theirs);
}

/**
 * The marks to draw for the hits taken, newest first, oldest dropped past HIT_MAX and anything
 * older than HIT_LIFE gone. A hit that is still arriving (`at` in the future) is not drawn.
 */
export function hitMarks(hits: readonly HitSource[], atX: number, atZ: number, yaw: number, now: number, life = HIT_LIFE): HitMark[] {
  const out: HitMark[] = [];
  for (let i = hits.length - 1; i >= 0 && out.length < HIT_MAX; i--) {
    const h = hits[i]!;
    const age = now - h.at;
    if (age < 0 || age >= life) continue;
    out.push({ angle: bearing(h.x, h.z, atX, atZ, yaw), alpha: 1 - age / life, damage: h.damage });
  }
  return out;
}

/** Drop what has faded, so the list a caller keeps cannot grow without bound. */
export function pruneHits(hits: HitSource[], now: number, life = HIT_LIFE): HitSource[] {
  return hits.filter((h) => now - h.at < life);
}
