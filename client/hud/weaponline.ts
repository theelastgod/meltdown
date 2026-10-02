/**
 * The gun in hand (Stage 868). The file page says the rank. The gun you are holding did not:
 * a rank-up was one log line, and then the number was gone.
 */
import { MAX_RANK } from "@shared/progression/mastery";

/** name, rank, then the alt or the charge already written as a tail */
export function heldWeaponLine(name: string, rank: number, tail: string): string {
  const n = Number.isFinite(rank) ? Math.max(1, Math.min(MAX_RANK, Math.floor(rank))) : 1;
  return `${name} · R${String(n).padStart(2, "0")}${tail}`;
}
