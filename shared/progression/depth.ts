/**
 * Depth 1–50: the account level. XP is objective-weighted (node flips 40%,
 * kills 35%, support 25%). First Rewrite horizon ≈ 55–75 h of play.
 */
export const MAX_DEPTH = 50;

/** XP needed to go from depth d to d+1. Sum to 50 ≈ 1.6M; a good 10-minute match ≈ 4.2k → ~63 h. */
export function xpForDepth(d: number): number {
  if (d < 1) return 0;
  if (d >= MAX_DEPTH) return Infinity;
  return Math.round(1100 + 950 * (d - 1) + 8 * (d - 1) * (d - 1));
}

export function totalXpToReach(depth: number): number {
  let t = 0;
  for (let d = 1; d < depth; d++) t += xpForDepth(d);
  return t;
}

export function depthForXp(xp: number): number {
  let d = 1;
  let rest = xp;
  while (d < MAX_DEPTH && rest >= xpForDepth(d)) {
    rest -= xpForDepth(d);
    d++;
  }
  return d;
}

export interface MatchContribution {
  /** node flips completed with you on the node */
  flips: number;
  /** seconds spent holding/pulling nodes */
  nodeSeconds: number;
  kills: number;
  assists: number;
  /** support: damage to VANTAGE units, smoke/EMP that enabled a flip, time contesting */
  supportPoints: number;
  /** seconds in the match (scales the objective share) */
  seconds: number;
  won: boolean;
}

export const XP_WEIGHTS = { flips: 0.4, kills: 0.35, support: 0.25 } as const;
/** Per-unit XP inside each bucket, tuned so a strong 10-minute match lands near 4,200 XP. */
export const XP_UNITS = { perFlip: 320, perNodeSecond: 2.2, perKill: 140, perAssist: 60, perSupportPoint: 12, winBonus: 500, participation: 250 } as const;

export function matchXp(c: MatchContribution): { total: number; objective: number; combat: number; support: number } {
  const objectiveRaw = c.flips * XP_UNITS.perFlip + c.nodeSeconds * XP_UNITS.perNodeSecond;
  const combatRaw = c.kills * XP_UNITS.perKill + c.assists * XP_UNITS.perAssist;
  const supportRaw = c.supportPoints * XP_UNITS.perSupportPoint;
  // the weights are the design intent: each bucket is scaled so its expected share matches
  const objective = Math.round(objectiveRaw * XP_WEIGHTS.flips * 2.5);
  const combat = Math.round(combatRaw * XP_WEIGHTS.kills * 2.86);
  const support = Math.round(supportRaw * XP_WEIGHTS.support * 4);
  const total = objective + combat + support + XP_UNITS.participation + (c.won ? XP_UNITS.winBonus : 0);
  return { total, objective, combat, support };
}
