/**
 * The gun in hand (Stage 868). The file page says the rank. The gun you are holding did not:
 * a rank-up was one log line, and then the number was gone.
 * The gate (Stage 869). The file page says the challenge holding that rank. The gun said the rank only.
 * The count (Stage 870). The file page says how far through that challenge. The gun named it and not the count.
 * The pace (Stage 871). Between gates the file page says the XP into the next rank. The gun did not.
 */
import { MAX_RANK, xpForRank } from "@shared/progression/mastery";

/** name, rank, then the alt or the charge already written as a tail */
export function heldWeaponLine(name: string, rank: number, tail: string): string {
  const n = Number.isFinite(rank) ? Math.max(1, Math.min(MAX_RANK, Math.floor(rank))) : 1;
  return `${name} · R${String(n).padStart(2, "0")}${tail}`;
}

/** The challenge holding the rank, and how far through it. Empty when this gun is not held at a gate. */
export function heldGateLine(text: string | null | undefined, have?: number, need?: number): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  const body = `GATE · ${t.toUpperCase()}`;
  if (need === undefined || !Number.isFinite(need) || need <= 0) return body;
  const got = have ?? NaN;
  const n = Number.isFinite(got) ? Math.max(0, Math.floor(got)) : 0;
  return `${body} · ${n}/${Math.floor(need)}`;
}

/** XP into the next rank, the same sum the file page uses. Empty at the last rank. */
export function heldRankPace(rank: number, xp: number): string {
  const r = Number.isFinite(rank) ? Math.max(1, Math.min(MAX_RANK, Math.floor(rank))) : 1;
  if (r >= MAX_RANK) return "";
  const x = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  const spent = Array.from({ length: r - 1 }, (_, i) => xpForRank(i + 1)).reduce((a, b) => a + b, 0);
  return `${x - spent}/${xpForRank(r)} XP`;
}
