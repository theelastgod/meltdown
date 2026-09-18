/**
 * The word under the file's name (Stage 117). The foot line printed the sim's stance, and the sim
 * has no stance for running: at a full sprint it said STAND, in the air it said STAND. The word is
 * read from the stance, the ground and the speed together.
 */
import type { Stance } from "@shared/sim/player";

/** at or above this horizontal speed a standing file is running (midway between walk and sprint) */
export const SPRINT_READ = 6.2;
/** below this it is standing still */
export const WALK_READ = 0.5;

export type MotionWord = "MANTLE" | "SLIDE" | "CROUCH" | "AIR" | "SPRINT" | "WALK" | "STAND";

export function motionWord(stance: Stance, grounded: boolean, speed: number): MotionWord {
  if (stance === "mantle") return "MANTLE";
  if (stance === "slide") return "SLIDE";
  if (stance === "crouch") return "CROUCH";
  if (!grounded) return "AIR";
  if (speed >= SPRINT_READ) return "SPRINT";
  if (speed >= WALK_READ) return "WALK";
  return "STAND";
}
