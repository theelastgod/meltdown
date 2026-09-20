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
  /** Bits 12–15: weapon slot select (0 = no change, 1–8). */
  SlotShift: 12,
} as const;

export const SLOT_MASK = 0xf << 12;
export const slotOf = (buttons: number): number => (buttons >> 12) & 0xf;
export const withSlot = (buttons: number, slot: number): number => (buttons & ~SLOT_MASK) | ((slot & 0xf) << 12);

/** Every action bit the sim defines: Forward (1 << 0) through GrenadeNext (1 << 11). */
export const ACTION_MASK = (1 << Btn.SlotShift) - 1;
/** Highest weapon slot the game ships. The slot nibble could hold 15; only 1..8 exist. */
export const MAX_SLOT = 8;

/**
 * Is this a bitfield the game could have produced? (Stage 172)
 *
 * The server used to ask `buttons <= 0x7fff`, one bit short of the field it was guarding. The slot
 * select lives in bits 12–15, so slot 8 is 0x8000 — above that bound, and the only slot of the
 * eight the game ships that a player could not send. The two halves are now checked as what they
 * are: an action mask that names its bits, and a slot nibble held to the slots that exist.
 */
export const validButtons = (buttons: number): boolean =>
  Number.isInteger(buttons) && buttons >= 0 && (buttons & ~(ACTION_MASK | SLOT_MASK)) === 0 && slotOf(buttons) <= MAX_SLOT;

/**
 * The next slot when the player cycles — the wheel on desktop, the WPN button on a phone. Both
 * wrote this arithmetic out with their own hard-coded 8 (Stage 172); it is one rule, and it is the
 * rule that walks a cycling player straight through the slot the server used to refuse.
 */
export const cycleSlot = (current: number, dir: 1 | -1): number => ((current - 1 + dir + MAX_SLOT) % MAX_SLOT) + 1;

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
