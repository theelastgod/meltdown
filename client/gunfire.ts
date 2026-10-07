/**
 * Somebody else's gun going off (Stage 81).
 *
 * Until now only your own shots and a wasp's made any noise: another file could empty a magazine at
 * you from across the street in silence, and the first you knew of it was the integrity bar. Stage
 * 80 gave the street footsteps; this is the loudest thing in it.
 *
 * Pure and audio-free so the rule is unit-tested. The bearing is `hud/damage.ts`'s, the same rule
 * the damage wedges and the footsteps use. Two things here are not volume: sound takes time to
 * arrive, so a shot from ninety metres is heard a quarter of a second after the flash, and it
 * arrives duller — distance eats the top of a crack long before it eats the body of it.
 */
import { clamp } from "../shared/math/vec3";
import { bearing } from "./hud/damage";

/** past this a shot is somebody else's business */
export const GUN_RANGE = 120;
/** metres a second, near enough: the crack lags the muzzle flash by this much. Lease Row keeps 340. */
export const SOUND_SPEED = 340;

const DISTRICT_SPEED: Record<string, number> = {
  deadletter_docks: 214,
  repo_depot: 255,
  night_market: 188,
  relay_heights: 455,
  ash_canal: 236,
  glass_mile: 510,
  bone_market: 196,
  cold_vault: 142,
  neon_chapel: 305,
  slag_pit: 278,
  wire_garden: 388,
  red_kiln: 228,
  paper_wharf: 246,
  velvet_court: 164,
  rust_crown: 322,
  salt_stairs: 418,
  lamp_bazaar: 362,
  debt_orchard: 206,
  black_relay: 575,
};

/** How fast a distant crack crosses the street, in metres a second. Lease Row keeps 340. Gain, pan, muffle, and range stay put. The slap stays shotSlap. */
export function soundSpeed(name: string | undefined): number {
  return (name && DISTRICT_SPEED[name]) || SOUND_SPEED;
}

/** closer than this a shot is all around you rather than to one side */
export const PAN_NEAR = 4;

export interface GunCue {
  /** 0..1 */
  gain: number;
  /** −1 hard left, +1 hard right, relative to where the listener is looking */
  pan: number;
  /** seconds before it arrives */
  delay: number;
  /** 0 at the muzzle, 1 at the range: how much of the crack's top end the air has eaten */
  muffle: number;
  distance: number;
}

/**
 * What a shot fired at a point sounds like from where the listener is standing, or null if it is
 * too far away to be heard at all.
 */
export function gunCue(fromX: number, fromZ: number, listener: { x: number; z: number; yaw: number }, name?: string): GunCue | null {
  const distance = Math.hypot(fromX - listener.x, fromZ - listener.z);
  if (distance >= GUN_RANGE) return null;
  const fall = 1 - distance / GUN_RANGE;
  return {
    // a gunshot carries: it falls off more slowly than a footstep, and is still worth hearing at
    // the far end of a district
    gain: Math.pow(fall, 1.7),
    pan: Math.sin(bearing(fromX, fromZ, listener.x, listener.z, listener.yaw)) * clamp(distance / PAN_NEAR, 0, 1),
    delay: distance / soundSpeed(name),
    muffle: clamp(distance / GUN_RANGE, 0, 1),
    distance,
  };
}
