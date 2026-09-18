/**
 * What the camera does that the player never asked it to (Stage 79).
 *
 * The body has taken its landings since Stage 63 — the legs compress, the hips drop — and the
 * camera has taken none of them. A drop off the gantry ended with the view perfectly level, which
 * reads as the ground arriving rather than the file arriving; and the slide, which rolls the
 * first-person view by a fixed amount the moment it starts, rolled the third-person one not at all.
 *
 * These are the rules, pure and three-free so they are unit-tested, and eased by the renderer. None
 * of it touches the simulation, the aim, or where a shot goes: the reticle is projected through the
 * camera after these are applied, so the mark stays on the ray through the whole dip.
 */
import { clamp } from "../../shared/math/vec3";

/** below this the ground is just the ground: walking off a kerb is not a landing */
export const LAND_FLOOR = 2.5;
/** and past this it is as hard as a landing gets — the terminal read, not the terminal speed */
export const LAND_CEIL = 13;
/** how far the camera drops at the hardest landing (metres) */
export const LAND_DIP = 0.22;
/** and how long the whole dip-and-recover takes (seconds) */
export const LAND_TIME = 0.34;
/** the roll a slide leans the view by (radians) */
export const SLIDE_ROLL = 0.05;

/**
 * How hard a landing was, 0..1, from the downward speed on the frame the file touched down. A jump
 * on the flat comes back at about six metres a second and reads as a third of the way up; a drop
 * from a roof saturates it.
 */
export function landHardness(fallSpeed: number): number {
  return clamp((Math.max(0, -fallSpeed) - LAND_FLOOR) / (LAND_CEIL - LAND_FLOOR), 0, 1);
}

/**
 * The dip at a point in its life, in metres below the eye: down fast, back up slower, and exactly
 * zero at both ends. A half sine skewed toward the start — a landing is an impact and then a
 * recovery, not a wobble.
 */
export function landDip(hardness: number, t: number, time = LAND_TIME): number {
  if (t <= 0 || t >= time) return 0;
  const u = t / time;
  // the first fifth is the impact, the rest is standing back up
  const shape = u < 0.2 ? u / 0.2 : Math.cos(((u - 0.2) / 0.8) * Math.PI * 0.5);
  return LAND_DIP * clamp(hardness, 0, 1) * shape;
}

/** the roll a stance leans the view by: only the slide leans, and it leans the same way in both views */
export function stanceRoll(stance: string): number {
  return stance === "slide" ? SLIDE_ROLL : 0;
}
