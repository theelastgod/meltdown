/**
 * The emission channels' prize maths (docs/TOKENOMICS.md §4.3): the weekly Audit pays the top
 * 10% of the board on a 1/rank curve; the Deep Wake season pays contributors by share of flips.
 * Whole $CAPITAL units; the host turns them into a Merkle epoch. Never a stat.
 */
export const AUDIT_POOL = 1000;
export const SEASON_POOL = 5000;
/** the fraction of the board that places */
export const AUDIT_TOP = 0.1;
/** the Deep Wake pays from this Depth; the constant lives with the season so the match room never imports this module */
export { SEASON_DEPTH } from "../endgame/season";
/** per-account cap on a season's payout, as a share of the pool */
export const SEASON_CAP_SHARE = 0.2;

export interface PrizeLine {
  account: string;
  amount: number;
  reason: string;
}

/** Audit: rank-weighted (1/rank) over the top 10% (at least one). */
export function auditPrizes(board: readonly { account: string; score: number }[], pool = AUDIT_POOL): PrizeLine[] {
  const sorted = [...board].sort((a, b) => b.score - a.score);
  const n = Math.max(1, Math.floor(sorted.length * AUDIT_TOP));
  const top = sorted.slice(0, n);
  const weight = top.reduce((a, _, i) => a + 1 / (i + 1), 0);
  return top.map((e, i) => ({ account: e.account, amount: Math.floor((pool * (1 / (i + 1))) / weight), reason: `AUDIT PLACEMENT #${i + 1}` }));
}

/** Season: share of flips, diminishing returns (sqrt), capped per account. */
export function seasonPrizes(contributors: Readonly<Record<string, number>>, pool = SEASON_POOL): PrizeLine[] {
  const entries = Object.entries(contributors).filter(([, f]) => f > 0);
  const weights = entries.map(([a, f]) => [a, Math.sqrt(f)] as const);
  const sum = weights.reduce((a, [, w]) => a + w, 0);
  if (sum === 0) return [];
  const cap = Math.floor(pool * SEASON_CAP_SHARE);
  return weights.map(([account, w]) => ({ account, amount: Math.min(cap, Math.floor((pool * w) / sum)), reason: "DEEP WAKE CONTRIBUTION" }));
}
