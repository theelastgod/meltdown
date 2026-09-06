/**
 * THE RUN's daily settlement: units banked in a day become $CAPITAL at a rate the schedule can
 * afford, never at a rate fixed in advance.
 *
 * The distinction is the whole point. A fixed rate per unit — which is what the game shipped with,
 * `CAPITAL_PER_UNIT = 1` — makes the day's emission a product of how many people played. The
 * emission schedule (`docs/TOKENOMICS.md` §4.1) is a fixed number of tokens a year. Two quantities,
 * one of which scales with success and one of which does not, cannot be reconciled by choosing a
 * better constant: there is no rate that is both worth banking at ten thousand players and solvent
 * at a hundred thousand. `docs/ECONOMY.md` has the arithmetic.
 *
 * So the day is a pot, not a price. Every unit banked that day draws a share of it:
 *
 *   rate = min(MAX_CAPITAL_PER_UNIT, pot / unitsBankedToday)
 *
 * The ceiling is what keeps the early game honest — with four hundred runners the pro-rata share
 * of a day's budget would be thousands of $CAPITAL a unit, which is a giveaway, not a payout — and
 * it means nothing changes for players at today's scale: below the crossover the rate *is* the old
 * fixed 1:1. Above it the pot binds and a unit dilutes. Emission is therefore
 * `min(pot, units × ceiling)`, which is `≤ pot` for every population, forever. That is the
 * invariant `tests/model.test.ts` holds the build to.
 *
 * Pure arithmetic over a day's banking. The host turns the lines into a PrizeVault Merkle epoch
 * (`kind: "run"`), the same machinery the Audit and the Deep Wake already use, so a settlement is
 * claimed rather than pushed and the vault's per-epoch funding guard (`docs/SECURITY.md` §1.2)
 * ring-fences a day's emission on chain as well as here.
 */
import type { PrizeLine } from "./prizes";
import { dailyEmissionBudget, RUN_EMISSION_SHARE } from "./model";
import { MAX_CAPITAL_PER_UNIT, RUN_DAILY_CAP } from "../sim/run";

/** One file's day: units banked at a gate, at the Depth the run pays $CAPITAL from. */
export interface Banked {
  account: string;
  units: number;
}

export interface Settlement {
  /** day index the settlement pays */
  day: number;
  /** whole $CAPITAL the schedule allows THE RUN to emit that day */
  pot: number;
  /** units banked that day, after the per-file cap */
  units: number;
  /** whole $CAPITAL a unit settled at */
  rate: number;
  /** whole $CAPITAL actually emitted — never more than the pot */
  minted: number;
  lines: PrizeLine[];
}

/** The day's pot: the schedule's daily allowance, times THE RUN's share of it. */
export const runPot = (day: number): number => dailyEmissionBudget(day) * RUN_EMISSION_SHARE;

/**
 * What a unit is worth on a day that banked `units` of them. The one line the whole fix rests on,
 * so the settlement and the projection both call it rather than each writing it out — a model that
 * can disagree with the code it models is worth nothing.
 */
export function settledRate(units: number, pot: number, ceiling = MAX_CAPITAL_PER_UNIT): number {
  if (!(units > 0)) return 0;
  return Math.min(ceiling, pot / units);
}

/**
 * Settled amounts are rounded down to a millionth of a $CAPITAL, not to a whole one.
 *
 * Whole tokens look like the natural unit because every price in the game is one, but they are a
 * fiction of this module: the vault pays in wei. Rounding a settlement to whole tokens quietly
 * pays *nothing at all* to anyone whose day is worth less than one — and at a million-MAU
 * population a full 200-unit day settles at about 0.86 $CAPITAL, so that is every player in the
 * game, on the day the game is most successful. Truncation is fine; a floor at one is not.
 */
export const SETTLE_PRECISION = 1_000_000;
const floorToPrecision = (x: number): number => Math.floor(x * SETTLE_PRECISION);

/**
 * Settle a day. `banked` is one entry per file; duplicates are summed and each file is held to
 * `RUN_DAILY_CAP` units here as well as in the room — the settlement does not trust the room's cap
 * for the same reason `PrizeVault.claim` does not trust the Merkle root's arithmetic.
 */
export function settleRun(day: number, banked: readonly Banked[], opts: { pot?: number; ceiling?: number } = {}): Settlement {
  const pot = opts.pot ?? runPot(day);
  const ceiling = opts.ceiling ?? MAX_CAPITAL_PER_UNIT;

  const perFile = new Map<string, number>();
  for (const b of banked) {
    if (!b.account || !(b.units > 0)) continue;
    perFile.set(b.account, Math.min(RUN_DAILY_CAP, (perFile.get(b.account) ?? 0) + b.units));
  }
  const units = [...perFile.values()].reduce((a, u) => a + u, 0);
  if (units <= 0) return { day, pot, units: 0, rate: 0, minted: 0, lines: [] };

  const rate = settledRate(units, pot, ceiling);
  const lines: PrizeLine[] = [];
  // accumulated in millionths so the total is exact rather than a sum of rounded floats
  let mintedMicro = 0;
  for (const [account, u] of perFile) {
    const micro = floorToPrecision(u * rate);
    if (micro <= 0) continue;
    mintedMicro += micro;
    lines.push({ account, amount: micro / SETTLE_PRECISION, reason: `THE RUN · DAY ${day} · ${u} UNITS` });
  }
  return { day, pot, units, rate, minted: mintedMicro / SETTLE_PRECISION, lines };
}

/** The crossover: the number of units a day past which the pot binds and a unit starts to dilute. */
export const dilutionThreshold = (day: number, ceiling = MAX_CAPITAL_PER_UNIT): number => runPot(day) / ceiling;
