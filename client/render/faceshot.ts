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
import { yawDir, yawTo } from "../../shared/math/vec3";

export const FACE_STAND = 0.72;
export const FACE_DIP = 0.08;
export const FACE_FOV = 28;
/** A new face farther than this from the last one is a cut, not a slide across the room. */
export const FACE_CUT_M = 0.5;

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
  /** The facing the face holds. The lens sits along `yawDir(yaw)`. */
  yaw: number;
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
    yaw,
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
 * Facing from a body toward the player. The placed yaw is where they were stood; a line looks at
 * the person they are talking to. On top of them the direction is noise, so the placed yaw stays.
 */
function yawAt(at: { x: number; z: number }, player: { x: number; z: number }, placed: number): number {
  const dx = player.x - at.x;
  const dz = player.z - at.z;
  if (dx * dx + dz * dz < 0.25) return placed;
  return yawTo({ x: at.x, y: 0, z: at.z }, { x: player.x, y: 0, z: player.z });
}

/** The other body in the room, if there is one. The visitor stands closer to a reply than Wern does. */
function partner(o: DialogueBodies): { x: number; z: number } | null {
  if (o.visitor) return o.visitor;
  if (o.wern) return o.wern;
  return null;
}

/**
 * Whose face the cutscene closes on. A speaker with no body in the room returns null: the
 * portrait plate does the zoom instead. The terminal has neither.
 *
 * A reply, when someone else is standing there, looks at them. The gun's yaw is where the next
 * shot goes, and a conversation is not a shot.
 */
export function dialogueShot(o: DialogueBodies): FaceShot | null {
  if (o.speaker === "you") {
    const other = partner(o);
    const yaw = other ? yawTo({ x: o.player.x, y: 0, z: o.player.z }, { x: other.x, y: 0, z: other.z }) : o.player.yaw;
    return faceShot({ x: o.player.x, z: o.player.z }, yaw, o.player.y + o.player.eye, "you");
  }
  if (o.visitor && o.visitor.id === o.speaker && o.speaker in FACE_Y) return faceShot(o.visitor, yawAt(o.visitor, o.player, o.visitor.yaw), FACE_Y[o.speaker as keyof typeof FACE_Y]);
  if (o.speaker === "wern" && o.wern) return faceShot(o.wern, yawAt(o.wern, o.player, o.wern.yaw), FACE_Y.wern);
  return null;
}

/**
 * Where your body stands for your own line (Stage 723). Third person had already put it on these
 * feet. First person hid it and left it wherever it last was, so the close-up was the room.
 */
export function ownStand(who: FaceWho, third: boolean, feet: { x: number; y: number; z: number }): { x: number; y: number; z: number } | null {
  if (who !== "you") return null;
  if (!third) return { x: feet.x, y: feet.y, z: feet.z };
  return { x: feet.x, y: feet.y, z: feet.z };
}

/**
 * The play gun leaves the lens for the whole line (Stage 722). Gating it on the blend left the
 * weapon in the face until the camera had mostly arrived. First person parents that gun to the lens.
 */
export function gunOnLine(blending: number, shot: boolean): boolean {
  if (!shot) return false;
  return blending >= 0;
}

/** True when the line has moved to a different face. Opening and closing a line are blends. */
export function faceCuts(prev: Pick<FaceShot, "lookX" | "lookY" | "lookZ"> | null, next: Pick<FaceShot, "lookX" | "lookY" | "lookZ"> | null): boolean {
  if (!prev || !next) return false;
  const dx = prev.lookX - next.lookX;
  const dy = prev.lookY - next.lookY;
  const dz = prev.lookZ - next.lookZ;
  return dx * dx + dy * dy + dz * dz > FACE_CUT_M * FACE_CUT_M;
}
