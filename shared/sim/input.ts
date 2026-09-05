/** Button bitfield for one simulation tick. Client and server share this exactly. */
export const Btn = {
  Forward: 1 << 0,
  Back: 1 << 1,
  Left: 1 << 2,
  Right: 1 << 3,
  Jump: 1 << 4,
  Sprint: 1 << 5,
  Crouch: 1 << 6,
  Fire: 1 << 7,
  Reload: 1 << 8,
  Alt: 1 << 9,
} as const;

export interface InputFrame {
  /** Simulation tick this frame is for. */
  tick: number;
  buttons: number;
  /** Absolute view angles in radians. */
  yaw: number;
  pitch: number;
}

export const emptyInput = (tick: number): InputFrame => ({ tick, buttons: 0, yaw: 0, pitch: 0 });
export const has = (buttons: number, b: number): boolean => (buttons & b) !== 0;
