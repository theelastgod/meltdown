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
import { yawDir, yawRight, yawTo } from "../../shared/math/vec3";
import { MOVE } from "../../shared/sim/constants";

export const FACE_STAND = 0.72;
/** Stay this far short of the other body before the full stand-off fits. */
export const FACE_CLEAR = 0.16;
/** A stand closer than this is inside the hood. The lens steps aside instead. */
export const FACE_HOOD = 0.22;
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

/**
 * How far in front of a face the lens may stand. The full stand is 0.72 m. When the other person
 * is closer than that along the look, the lens stops short of them instead of sitting inside them.
 * Nobody in front keeps the full stand.
 */
export function standOff(forward: number | null): number {
  if (forward === null || forward >= FACE_STAND + FACE_CLEAR) return FACE_STAND;
  return Math.min(FACE_STAND, forward * 0.55);
}

/** Metres to the right of the look when a straight stand would be inside the hood. Zero otherwise. */
export function lensBeside(stand: number): number {
  if (stand >= FACE_HOOD) return 0;
  return Math.sqrt(FACE_HOOD * FACE_HOOD - stand * stand);
}

/** Where a side-step puts the lens, in the horizontal. Positive `side` is to the right of the look. */
export function sidePoint(at: { x: number; z: number }, yaw: number, stand: number, side: number): { x: number; z: number } {
  const fwd = yawDir(yaw);
  const right = yawRight(yaw);
  return { x: at.x + fwd.x * stand + right.x * side, z: at.z + fwd.z * stand + right.z * side };
}

/**
 * Which way the close step goes (Stage 734). The right side is the default. A wall there sends
 * the lens left. Both sides in masonry keeps the lens on the line: inside the hood, not the wall.
 */
export function lensSide(stand: number, rightBlocked: boolean, leftBlocked = false): number {
  const mag = lensBeside(stand);
  if (mag === 0) return 0;
  if (!rightBlocked) return mag;
  if (leftBlocked) return 0;
  return -mag;
}

/** True when a point sits in a solid box. Floors and ceilings that miss this height do not count. */
export function solidAt(x: number, y: number, z: number, boxes: readonly { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }[]): boolean {
  for (const b of boxes) {
    if (x >= b.min.x && x <= b.max.x && y >= b.min.y && y <= b.max.y && z >= b.min.z && z <= b.max.z) return true;
  }
  return false;
}

/** Metres along `yaw` to another body, when they are in the lens. Off to the side is not a block. */
export function lensGap(from: { x: number; z: number }, yaw: number, other: { x: number; z: number } | null): number | null {
  if (!other) return null;
  const fwd = yawDir(yaw);
  const right = yawRight(yaw);
  const dx = other.x - from.x;
  const dz = other.z - from.z;
  const along = dx * fwd.x + dz * fwd.z;
  const side = dx * right.x + dz * right.z;
  if (along < 0.15 || Math.abs(side) > 0.45) return null;
  return along;
}

/** The lens in front of a face that stands at `at` and looks along `yaw`. */
export function faceShot(at: { x: number; z: number }, yaw: number, faceY: number, who: FaceWho = "other", stand = FACE_STAND, side = 0): FaceShot {
  const fwd = yawDir(yaw);
  const right = yawRight(yaw);
  return {
    who,
    lookX: at.x,
    lookY: faceY,
    lookZ: at.z,
    yaw,
    x: at.x + fwd.x * stand + right.x * side,
    y: faceY - FACE_DIP,
    z: at.z + fwd.z * stand + right.z * side,
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
  /**
   * False when this machine is mirroring the host's line (Stage 726). "you" is the host, not the
   * guest whose camera this is. Omitting it means the line is your own.
   */
  youIsSelf?: boolean;
  /** The host's body, on a guest's mirror of the host's own line. Absent when they are not drawn. */
  host?: { x: number; y: number; z: number; yaw: number; eye: number } | null;
  /** True when that horizontal point is inside a wall. Absent means the room is open. */
  solid?: (x: number, z: number) => boolean;
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
/** The close-up for one body. A wall on the right sends the step to the left. */
function closeOn(o: DialogueBodies, at: { x: number; z: number }, yaw: number, faceY: number, who: FaceWho, other: { x: number; z: number } | null): FaceShot {
  const stand = standOff(lensGap(at, yaw, other));
  const mag = lensBeside(stand);
  let rightBlocked = false;
  let leftBlocked = false;
  if (mag > 0 && o.solid) {
    const right = sidePoint(at, yaw, stand, mag);
    const left = sidePoint(at, yaw, stand, -mag);
    rightBlocked = o.solid(right.x, right.z);
    leftBlocked = o.solid(left.x, left.z);
  }
  return faceShot(at, yaw, faceY, who, stand, lensSide(stand, rightBlocked, leftBlocked));
}

export function dialogueShot(o: DialogueBodies): FaceShot | null {
  if (o.speaker === "you") {
    if (o.youIsSelf === false) {
      // The host is in the room (Stage 729). Absent, the line stays the bars.
      if (!o.host) return null;
      const face = partner(o) ?? o.player;
      const yaw = yawAt(o.host, face, o.host.yaw);
      return closeOn(o, o.host, yaw, o.host.y + o.host.eye, "other", face);
    }
    const other = partner(o);
    const yaw = other ? yawTo({ x: o.player.x, y: 0, z: o.player.z }, { x: other.x, y: 0, z: other.z }) : o.player.yaw;
    return closeOn(o, { x: o.player.x, z: o.player.z }, yaw, o.player.y + o.player.eye, "you", other);
  }
  if (o.visitor && o.visitor.id === o.speaker && o.speaker in FACE_Y) {
    const yaw = yawAt(o.visitor, o.player, o.visitor.yaw);
    return closeOn(o, o.visitor, yaw, FACE_Y[o.speaker as keyof typeof FACE_Y], "other", o.player);
  }
  if (o.speaker === "wern" && o.wern) {
    const yaw = yawAt(o.wern, o.player, o.wern.yaw);
    return closeOn(o, o.wern, yaw, FACE_Y.wern, "other", o.player);
  }
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
 * Your body is in the shot for the whole line (Stage 728). First person hides it, and the line
 * used to wait until the blend passed 0.2 before standing it back up. The opening was an empty hood.
 */
export function bodyOnLine(blending: number, who: FaceWho): boolean {
  if (who !== "you") return false;
  return blending >= 0;
}

/**
 * The play gun leaves the lens for the whole line (Stage 722). Gating it on the blend left the
 * weapon in the face until the camera had mostly arrived. First person parents that gun to the lens.
 */
export function gunOnLine(blending: number, shot: boolean): boolean {
  if (!shot) return false;
  return blending >= 0;
}

/** Eye height for a body's line. A crouched file is not filmed a standing head above the coat. */
export function lineEye(height: number): number {
  return height < MOVE.standHeight - 0.01 ? MOVE.eyeLow : MOVE.eyeStand;
}

/** True when the line has moved to a different face. Opening and closing a line are blends. */
export function faceCuts(prev: Pick<FaceShot, "lookX" | "lookY" | "lookZ"> | null, next: Pick<FaceShot, "lookX" | "lookY" | "lookZ"> | null): boolean {
  if (!prev || !next) return false;
  const dx = prev.lookX - next.lookX;
  const dy = prev.lookY - next.lookY;
  const dz = prev.lookZ - next.lookZ;
  return dx * dx + dy * dy + dz * dz > FACE_CUT_M * FACE_CUT_M;
}
