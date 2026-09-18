/**
 * What you put into the mech (Stage 103).
 *
 * A VANTAGE mech is four hundred points of health and the client showed nothing of what a round
 * did to it: a spark (Stage 89) and the same spark on the next one, with no way to tell a mech at
 * ninety percent from one at nine. A wasp is forty and dies in two, but a mech is a decision — keep
 * pouring rounds in, or go — and the number that decides it was on the wire the whole time: the
 * room sends every wasp's health and every mech's, and offline the sim has them in hand.
 *
 * The read is of the VANTAGE body my last round landed on, for two seconds after it: not a bar over
 * every enemy, and not for files — another player's integrity is theirs. Pure so the rule is
 * unit-tested; the game looks the health up and the HUD draws what it is handed.
 */
import type { LandedHit } from "./kill";

/** seconds after my last round on a body that the read stays up */
export const TARGET_HOLD = 2.0;
/** the bar is this many blocks wide */
export const TARGET_BLOCKS = 8;

export type VantageKind = "wasp" | "mech";

export interface TargetRead {
  label: string;
  health: number;
  max: number;
  /** 0..1 */
  frac: number;
  /** ▮ for each full block, ▯ for the rest */
  blocks: string;
  /** seconds since my round landed */
  age: number;
}

export function vantageLabel(kind: VantageKind, id: number): string {
  return `${kind === "mech" ? "MECH" : "WASP"}-${String(id).padStart(2, "0")}`;
}

/**
 * The VANTAGE body my freshest round landed on, if it landed within the hold. The book is the
 * close-book's (Stage 91), keyed `kind:id`; files and dummies in it are passed over.
 */
export function freshestVantage(book: ReadonlyMap<string, LandedHit>, now: number, hold = TARGET_HOLD): { kind: VantageKind; id: number; at: number } | null {
  let best: { kind: VantageKind; id: number; at: number } | null = null;
  for (const [key, h] of book) {
    const sep = key.indexOf(":");
    const kind = key.slice(0, sep);
    if (kind !== "wasp" && kind !== "mech") continue;
    const age = now - h.at;
    if (age < 0 || age > hold) continue;
    if (!best || h.at > best.at) best = { kind, id: Number(key.slice(sep + 1)), at: h.at };
  }
  return best;
}

export function targetRead(kind: VantageKind, id: number, health: number, max: number, at: number, now: number): TargetRead {
  const frac = max > 0 ? Math.min(1, Math.max(0, health / max)) : 0;
  const full = Math.round(frac * TARGET_BLOCKS);
  return { label: vantageLabel(kind, id), health: Math.max(0, health), max, frac, blocks: "▮".repeat(full) + "▯".repeat(TARGET_BLOCKS - full), age: Math.max(0, now - at) };
}
