/**
 * What a hit on somebody else looks like (Stage 89).
 *
 * Until now a shot that hit a body looked exactly like a shot that hit nothing. The spark was drawn
 * for world hits only, so a rifle round into a file's chest ended in mid-air; the body did not
 * light, did not flinch, and — over the wire — did not so much as blink. The one exception was a
 * training dummy, which flashed. Against another player, in the mode the game is built around, the
 * whole confirmation was a sound on the shooter's own client, and every bystander in the room saw a
 * firefight in which nothing landed.
 *
 * The pose rig has taken a hit since Stage 74: `hurt` and `hurtFrom` bend the chest and turn the
 * head away from whatever arrived. Only the local file was ever given them — every remote body was
 * posed with `hurt: 0` on every frame of its life.
 *
 * This is the rule, pure so it is unit-tested: what a shot was worth, and how hard that reads. The
 * damage is the simulation's own arithmetic — the same `falloff` curve the server ran, the weapon's
 * own zone multipliers — so the read cannot drift from the shot. It is what the shot was worth, not
 * a claim about what the victim has left: the client is not told anyone else's integrity and this
 * does not guess at it. For another player's shot the shooter's own mastery multiplier is unknown
 * and the stock number is used, which moves the brightness of a spark and nothing else.
 */
import { clamp } from "../shared/math/vec3";
import { WASP } from "../shared/sim/ai";
import { falloff, type RangeProfile } from "../shared/weapons/manifest";

export type HitZone = "head" | "body" | "legs";

/** what the read needs of a weapon: the same four fields `castRay` is handed */
export interface ShotSpec {
  damage: number;
  headMult: number;
  legMult: number;
  range: RangeProfile;
}

/**
 * The damage that shot landed. This mirrors `zoneDmg` in `shared/sim/world.ts` — zone multiplier,
 * range falloff, rounded, and never less than one — and shares its `falloff`, so a change to the
 * curve moves both at once.
 */
export function landedDamage(spec: ShotSpec, zone: HitZone, distance: number, mult = 1): number {
  const z = zone === "head" ? spec.headMult : zone === "legs" ? spec.legMult : 1;
  return Math.max(1, Math.round(spec.damage * mult * z * falloff(spec.range, distance)));
}

/** a hit worth this much reads at full strength: about a third of a whole file in one round */
export const IMPACT_FULL = 34;
/** the smallest hit still lights the body this much — a graze that reads as nothing is a miss */
export const FLASH_MIN = 0.35;
/** how far the hardest hit bends a body (0..1, into the pose rig's own `hurt`) */
export const FLINCH_MAX = 0.8;
/** how far above its resting glow a full-strength hit lights a body */
export const HIT_GLOW = 1.6;
/** seconds the flash and the flinch take to die away */
export const FLASH_LIFE = 0.22;
export const FLINCH_LIFE = 0.42;

export interface ImpactRead {
  /** 0..1 of a full file, what the shot was worth */
  weight: number;
  /** 0..1: how hard the body lights */
  flash: number;
  /** 0..1: how far it bends, fed to the pose rig's `hurt` */
  flinch: number;
  /** multiplier on the impact spark's size */
  spark: number;
}

/**
 * How hard that reads. The brightness is the square root of the weight so that a pistol round is
 * clearly visible next to a slug rather than invisible beside it, and it never starts from nothing;
 * the flinch is linear in the weight, because a body bending is a statement about force and a graze
 * should not throw anyone.
 */
export function impactRead(damage: number): ImpactRead {
  const weight = clamp(damage / IMPACT_FULL, 0, 1);
  return {
    weight,
    flash: FLASH_MIN + (1 - FLASH_MIN) * Math.sqrt(weight),
    flinch: FLINCH_MAX * weight,
    spark: 0.6 + 0.9 * weight,
  };
}

/**
 * Fade a flash or a flinch by elapsed time rather than per frame. The dummies' flash had been
 * stepped by a fixed amount every frame since Stage 1, which makes a hit last four times as long on
 * a phone as on a desktop — the same mistake Stage 85 found in the node clock, in the other
 * direction.
 */
export function decay(v: number, dt: number, life: number): number {
  return life <= 0 ? 0 : Math.max(0, v - dt / life);
}

/**
 * The wasp's own shot, which has no entry in the weapon manifest: these are the numbers `stepWasps`
 * passes to `castRay` in `shared/sim/world.ts`, and they live here so the read of a wasp's round is
 * the same arithmetic as everything else's.
 */
export const WASP_SHOT: ShotSpec = { damage: WASP.damage, headMult: 1, legMult: 1, range: { ideal: 10, fullTo: 30, falloffTo: 40, minMult: 0.5, max: 60 } };
