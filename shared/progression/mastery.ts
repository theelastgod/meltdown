/**
 * Weapon mastery 1–30 per weapon, from use-XP. Rank gates are challenge
 * curricula, not raw XP: at 5, 10, 15, 20 and 25 the next rank needs the
 * gate's challenge done. Ranks unlock chips (see manifest/chips.ts) and the
 * two firmwares (20, 28). Character growth and player growth are the same
 * system.
 */
import { WEAPON_LIST, type WeaponId } from "../weapons/manifest";
import { CHIPS } from "../manifest/chips";
import { FIRMWARES } from "../manifest/firmwares";

export const MAX_RANK = 30;
export const GATES = [5, 10, 15, 20, 25] as const;

/** XP to go from rank r to r+1. Sum to 30 ≈ 60k per weapon ≈ 250 kills + hits. */
export function xpForRank(r: number): number {
  if (r < 1) return 0;
  if (r >= MAX_RANK) return Infinity;
  return Math.round(180 + 95 * (r - 1) + 3 * (r - 1) * (r - 1));
}

export const XP = { kill: 120, hit: 6, headshotKill: 60, assist: 40, vantageKill: 30 } as const;

export interface Challenge {
  id: string;
  gate: (typeof GATES)[number];
  /** what the file reads before it is done */
  text: string;
  need: number;
  /** counter key fed by the tracker (see server/progression.ts) */
  counter: ChallengeCounter;
}

export type ChallengeCounter = "headshotKills" | "slideKills" | "airKills" | "longKills" | "doubleKills" | "adsKills" | "chainStuns" | "lungeKills" | "stickyKills" | "boostFlips" | "quickshotKills" | "fullChargeKills" | "pointBlankKills" | "slugKills" | "braceKills" | "wallKills";

const cur = (weapon: WeaponId, gate: (typeof GATES)[number], counter: ChallengeCounter, need: number, text: string): Challenge => ({ id: `${weapon}:r${gate}`, gate, counter, need, text });

/** Per-weapon curricula: five gates, each teaching a technique the weapon rewards. */
export const CURRICULA: Record<WeaponId, Challenge[]> = {
  lease_breaker: [
    cur("lease_breaker", 5, "headshotKills", 10, "10 headshot kills"),
    cur("lease_breaker", 10, "slideKills", 3, "3 kills mid-slide"),
    cur("lease_breaker", 15, "longKills", 5, "5 kills beyond 25 m"),
    cur("lease_breaker", 20, "doubleKills", 2, "2 double kills (two files within 4 s)"),
    cur("lease_breaker", 25, "adsKills", 15, "15 kills through the optic"),
  ],
  repo_hammer: [
    cur("repo_hammer", 5, "pointBlankKills", 10, "10 kills inside 4 m"),
    cur("repo_hammer", 10, "slugKills", 5, "5 choked-slug kills"),
    cur("repo_hammer", 15, "slideKills", 3, "3 kills mid-slide"),
    cur("repo_hammer", 20, "doubleKills", 2, "2 double kills"),
    cur("repo_hammer", 25, "airKills", 3, "3 kills mid-air"),
  ],
  stack_smg: [
    cur("stack_smg", 5, "slideKills", 5, "5 kills mid-slide"),
    cur("stack_smg", 10, "braceKills", 10, "10 kills braced"),
    cur("stack_smg", 15, "headshotKills", 15, "15 headshot kills"),
    cur("stack_smg", 20, "doubleKills", 3, "3 double kills"),
    cur("stack_smg", 25, "airKills", 5, "5 kills mid-air"),
  ],
  longwave: [
    cur("longwave", 5, "fullChargeKills", 10, "10 full-charge kills"),
    cur("longwave", 10, "longKills", 10, "10 kills beyond 25 m"),
    cur("longwave", 15, "quickshotKills", 5, "5 quickshot kills"),
    cur("longwave", 20, "headshotKills", 10, "10 headshot kills"),
    cur("longwave", 25, "wallKills", 3, "3 kills through cover (pierce)"),
  ],
  phage: [
    cur("phage", 5, "boostFlips", 5, "5 node flips under a phage boost"),
    cur("phage", 10, "stickyKills", 5, "5 sticky kills"),
    cur("phage", 15, "doubleKills", 2, "2 double kills"),
    cur("phage", 20, "airKills", 3, "3 kills mid-air"),
    cur("phage", 25, "longKills", 5, "5 kills beyond 25 m"),
  ],
  shock_baton: [
    cur("shock_baton", 5, "chainStuns", 5, "5 chain stuns"),
    cur("shock_baton", 10, "lungeKills", 5, "5 lunge kills"),
    cur("shock_baton", 15, "slideKills", 5, "5 kills mid-slide"),
    cur("shock_baton", 20, "doubleKills", 2, "2 double kills"),
    cur("shock_baton", 25, "airKills", 3, "3 kills mid-air"),
  ],
  directive: [
    cur("directive", 5, "headshotKills", 8, "8 headshot kills"),
    cur("directive", 10, "longKills", 6, "6 kills beyond 30 m"),
    cur("directive", 15, "adsKills", 12, "12 kills through the optic"),
    cur("directive", 20, "quickshotKills", 4, "4 kills within a second of raising the optic"),
    cur("directive", 25, "doubleKills", 2, "2 double kills"),
  ],
  clockeater: [
    cur("clockeater", 5, "pointBlankKills", 6, "6 kills inside 6 m"),
    cur("clockeater", 10, "slideKills", 3, "3 kills mid-slide"),
    cur("clockeater", 15, "headshotKills", 10, "10 headshot kills"),
    cur("clockeater", 20, "airKills", 3, "3 kills airborne"),
    cur("clockeater", 25, "doubleKills", 3, "3 double kills"),
  ],
};

export interface Mastery {
  xp: number;
  rank: number;
  counters: Partial<Record<ChallengeCounter, number>>;
  /** challenge ids completed */
  done: string[];
}

export const emptyMastery = (): Mastery => ({ xp: 0, rank: 1, counters: {}, done: [] });
export const emptyMasteries = (): Record<WeaponId, Mastery> => Object.fromEntries(WEAPON_LIST.map((w) => [w.id, emptyMastery()])) as Record<WeaponId, Mastery>;

/** Rank from XP, held at each gate until its challenge is done. */
export function rankFor(weapon: WeaponId, xp: number, done: readonly string[]): number {
  let r = 1;
  let rest = xp;
  while (r < MAX_RANK && rest >= xpForRank(r)) {
    if (GATES.includes(r as (typeof GATES)[number]) && !done.includes(`${weapon}:r${r}`)) break;
    rest -= xpForRank(r);
    r++;
  }
  return r;
}

/** The gate holding this weapon back, if any. */
export function gateFor(weapon: WeaponId, m: Mastery): Challenge | null {
  const g = GATES.find((x) => x === m.rank && !m.done.includes(`${weapon}:r${x}`));
  return g ? (CURRICULA[weapon].find((c) => c.gate === g) ?? null) : null;
}

/** Feed a counter; completes challenges and re-derives the rank. Returns newly completed challenge ids. */
export function bump(weapon: WeaponId, m: Mastery, counter: ChallengeCounter, n = 1): string[] {
  m.counters[counter] = (m.counters[counter] ?? 0) + n;
  const newly: string[] = [];
  for (const c of CURRICULA[weapon]) if (!m.done.includes(c.id) && (m.counters[c.counter] ?? 0) >= c.need) {
    m.done.push(c.id);
    newly.push(c.id);
  }
  m.rank = rankFor(weapon, m.xp, m.done);
  return newly;
}

/** Add use-XP; returns the ranks gained (0 when held at a gate). */
export function addXp(weapon: WeaponId, m: Mastery, xp: number): number {
  const before = m.rank;
  m.xp += xp;
  m.rank = rankFor(weapon, m.xp, m.done);
  return m.rank - before;
}

export function chipUnlocked(chipId: string, masteries: Record<WeaponId, Mastery>): boolean {
  const c = CHIPS.find((x) => x.id === chipId);
  return !!c && (masteries[c.weapon]?.rank ?? 1) >= c.rank;
}

export function firmwareUnlocked(fwId: string, masteries: Record<WeaponId, Mastery>): boolean {
  const f = FIRMWARES.find((x) => x.id === fwId);
  return !!f && (masteries[f.weapon]?.rank ?? 1) >= f.rank;
}

export function unlockedChips(weapon: WeaponId, masteries: Record<WeaponId, Mastery>): string[] {
  return CHIPS.filter((c) => c.weapon === weapon && (masteries[weapon]?.rank ?? 1) >= c.rank).map((c) => c.id);
}
