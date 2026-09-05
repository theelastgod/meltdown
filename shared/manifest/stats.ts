/**
 * The stat sheet: every tunable the simulation reads from a build. All
 * multipliers default to 1 and adds to 0. A build is a StatSheet; the sim
 * never reads item tables directly.
 */
export const STAT_KEYS = [
  "moveSpeed", // walk + sprint multiplier
  "slideBoost", // slide entry boost multiplier (slide distance)
  "slideFriction", // slide decay multiplier (lower = longer slides)
  "adsMove", // movement while aiming/bracing
  "mantleTime", // lower = faster mantles
  "maxHealth", // add
  "maxShield", // add
  "shieldRegen", // regen rate multiplier
  "shieldDelay", // regen delay multiplier
  "damage",
  "headMult",
  "fireRate",
  "reloadSpeed",
  "spread",
  "recoil",
  "range", // falloff distance multiplier
  "flipRate", // node pull multiplier
  "droneDetect", // VANTAGE detection radius multiplier against you
  "footstep", // footstep loudness (audio + drone hearing)
  "grenades", // add to grenade count
  "throwSpeed",
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

/** Additive stats (everything else multiplies). */
export const ADDITIVE: ReadonlySet<StatKey> = new Set(["maxHealth", "maxShield", "grenades"]);

export type StatSheet = Record<StatKey, number>;

export function baseSheet(): StatSheet {
  const s = {} as StatSheet;
  for (const k of STAT_KEYS) s[k] = ADDITIVE.has(k) ? 0 : 1;
  return s;
}

export interface StatMod {
  stat: StatKey;
  /** multiplier delta (e.g. +0.10 = +10%) or additive amount for ADDITIVE stats */
  delta: number;
}

/**
 * Budget weights: what one percent (or one additive unit) of a stat is worth
 * on the Auditor's ledger. A node reconciles when its benefits and costs
 * weigh the same. This is the arithmetic gate; the Fairness Lint is the
 * simulation gate.
 */
export const BUDGET_PER_PERCENT: Record<StatKey, number> = {
  moveSpeed: 1.6,
  slideBoost: 0.5,
  slideFriction: 0.5,
  adsMove: 0.6,
  mantleTime: 0.4,
  maxHealth: 0.9, // per point
  maxShield: 0.9, // per point
  shieldRegen: 0.5,
  shieldDelay: 0.5,
  damage: 2.4,
  headMult: 1.2,
  fireRate: 2.2,
  reloadSpeed: 0.7,
  spread: 0.6,
  recoil: 0.6,
  range: 0.8,
  flipRate: 1.0,
  droneDetect: 0.4,
  footstep: 0.35,
  grenades: 8, // per grenade
  throwSpeed: 0.3,
};

/** Stats where a positive delta is a benefit; the rest are benefits when negative. */
export const POSITIVE_IS_GOOD: ReadonlySet<StatKey> = new Set(["moveSpeed", "slideBoost", "adsMove", "maxHealth", "maxShield", "shieldRegen", "damage", "headMult", "fireRate", "reloadSpeed", "range", "flipRate", "grenades", "throwSpeed"]);

export function modWeight(m: StatMod): number {
  const units = ADDITIVE.has(m.stat) ? Math.abs(m.delta) : Math.abs(m.delta) * 100;
  return units * BUDGET_PER_PERCENT[m.stat];
}

export function isBenefit(m: StatMod): boolean {
  return POSITIVE_IS_GOOD.has(m.stat) ? m.delta > 0 : m.delta < 0;
}

/** Fold mods into a sheet (multipliers compound, adds sum). */
export function applyMods(sheet: StatSheet, mods: readonly StatMod[]): StatSheet {
  const out = { ...sheet };
  for (const m of mods) {
    if (ADDITIVE.has(m.stat)) out[m.stat] += m.delta;
    else out[m.stat] *= 1 + m.delta;
  }
  return out;
}
