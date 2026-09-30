/**
 * A dialogue close-up (Stage 715).
 *
 * The face looks along `yawDir`, the same forward the body and the shots use. The lens sits in
 * front of that face, a little below it, on a narrow field of view. A street lens is 65–105°.
 * This one is a face.
 *
 * Heights are the hood and head centres in figures.ts, times FIXER_SCALE. The player's line uses
 * the eye the sim already fires from.
 */
import { yawDir } from "../../shared/math/vec3";

export const FACE_STAND = 0.72;
export const FACE_DIP = 0.08;
export const FACE_FOV = 28;

/** hood / head centre, in metres, after the figure's own scale */
export const FACE_Y = {
  deacon: 1.66 * 1.06,
  marrow: 1.6 * 0.93,
  vessel: 1.69,
  wern: 1.73 * 1.07,
} as const;

export type FaceWho = "you" | "other";

export interface FaceShot {
  who: FaceWho;
  x: number;
  y: number;
  z: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  fov: number;
}

/** The lens in front of a face that stands at `at` and looks along `yaw`. */
export function faceShot(at: { x: number; z: number }, yaw: number, faceY: number, who: FaceWho = "other"): FaceShot {
  const fwd = yawDir(yaw);
  return {
    who,
    lookX: at.x,
    lookY: faceY,
    lookZ: at.z,
    x: at.x + fwd.x * FACE_STAND,
    y: faceY - FACE_DIP,
    z: at.z + fwd.z * FACE_STAND,
    fov: FACE_FOV,
  };
}

export interface DialogueBodies {
  speaker: string;
  player: { x: number; y: number; z: number; yaw: number; eye: number };
  /** the fixer standing in the office, if this room has one and they are that speaker */
  visitor: { id: string; x: number; z: number; yaw: number } | null;
  /** August Wern, if this is his office */
  wern: { x: number; z: number; yaw: number } | null;
}

/**
 * Whose face the cutscene closes on. A speaker with no body in the room returns null: the
 * portrait plate does the zoom instead. The terminal has neither.
 */
export function dialogueShot(o: DialogueBodies): FaceShot | null {
  if (o.speaker === "you") return faceShot({ x: o.player.x, z: o.player.z }, o.player.yaw, o.player.y + o.player.eye, "you");
  if (o.visitor && o.visitor.id === o.speaker && o.speaker in FACE_Y) return faceShot(o.visitor, o.visitor.yaw, FACE_Y[o.speaker as keyof typeof FACE_Y]);
  if (o.speaker === "wern" && o.wern) return faceShot(o.wern, o.wern.yaw, FACE_Y.wern);
  return null;
}
