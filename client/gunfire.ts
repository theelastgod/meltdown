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
/** metres a second, near enough: the crack lags the muzzle flash by this much */
export const SOUND_SPEED = 340;
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
export function gunCue(fromX: number, fromZ: number, listener: { x: number; z: number; yaw: number }): GunCue | null {
  const distance = Math.hypot(fromX - listener.x, fromZ - listener.z);
  if (distance >= GUN_RANGE) return null;
  const fall = 1 - distance / GUN_RANGE;
  return {
    // a gunshot carries: it falls off more slowly than a footstep, and is still worth hearing at
    // the far end of a district
    gain: Math.pow(fall, 1.7),
    pan: Math.sin(bearing(fromX, fromZ, listener.x, listener.z, listener.yaw)) * clamp(distance / PAN_NEAR, 0, 1),
    delay: distance / SOUND_SPEED,
    muffle: clamp(distance / GUN_RANGE, 0, 1),
    distance,
  };
}
