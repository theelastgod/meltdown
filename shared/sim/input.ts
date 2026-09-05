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
  Grenade: 1 << 10,
  GrenadeNext: 1 << 11,
  /** Bits 12–14: weapon slot select (0 = no change, 1–6). */
  SlotShift: 12,
} as const;

export const SLOT_MASK = 0x7 << 12;
export const slotOf = (buttons: number): number => (buttons >> 12) & 0x7;
export const withSlot = (buttons: number, slot: number): number => (buttons & ~SLOT_MASK) | ((slot & 0x7) << 12);
/** Highest valid button value (used by server validation). */
export const MAX_BUTTONS = 0x7fff;

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
