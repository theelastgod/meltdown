/**
 * The emission schedule as the chain enforces it (Stage 59).
 *
 * Every prize the game pays is a PrizeVault epoch. An epoch's id names its channel and its period
 * (`kind * KIND_SPAN + period`: the Audit's week, the season's index, THE RUN's day), and the vault
 * holds a cap per channel per schedule year that `post` may not exceed. This file is the one place
 * the cap is computed; the contract carries the same numbers, set at deploy, and
 * `tests/schedule.test.ts` holds the two to each other.
 *
 * What the chain can bound is the *amount*: a poster key, leaked or wrong, funds at most a period's
 * schedule per period. Whether a day's root was built from real banking is still the poster's
 * word — see docs/SECURITY.md §3.2.
 */
import { emissionSchedule, LAUNCH_DAY, RUN_EMISSION_SHARE, scheduleYear } from "./model";
import { AUDIT_POOL, SEASON_POOL } from "./prizes";

export type EpochKind = "audit" | "season" | "run";

/** an epoch id is `kind * KIND_SPAN + period`; the contract carries the same constant */
export const KIND_SPAN = 1_000_000;
export const EPOCH_KIND: Record<EpochKind, number> = { audit: 1, season: 2, run: 3 };
/** how many days one period of the channel spans: the chain maps a period to a schedule year with it */
export const PERIOD_DAYS: Record<EpochKind, number> = { audit: 7, season: 28, run: 1 };

export const kindOf = (epoch: number): EpochKind | null => (Object.entries(EPOCH_KIND).find(([, k]) => k === Math.floor(epoch / KIND_SPAN))?.[0] as EpochKind | undefined) ?? null;

/** the cap per schedule year, in whole $CAPITAL; a channel with one entry holds that cap in every year */
export function channelCaps(kind: EpochKind): number[] {
  if (kind === "run") return emissionSchedule().map((year) => Math.ceil((year / 365) * RUN_EMISSION_SHARE));
  if (kind === "audit") return [AUDIT_POOL];
  return [SEASON_POOL];
}

/** what the vault allows the epoch `kind`/`period` to be funded with, in whole $CAPITAL — the contract's `capOf` */
export function epochCap(kind: EpochKind, period: number): number {
  const caps = channelCaps(kind);
  const year = Math.min(caps.length - 1, scheduleYear(period * PERIOD_DAYS[kind]));
  return caps[year]!;
}

/** the PrizeVault constructor's channel arguments */
export function channelParams(): { launchDay: bigint; kinds: bigint[]; periodDays: bigint[]; caps: bigint[][] } {
  const kinds = Object.keys(EPOCH_KIND) as EpochKind[];
  return {
    launchDay: BigInt(LAUNCH_DAY),
    kinds: kinds.map((k) => BigInt(EPOCH_KIND[k])),
    periodDays: kinds.map((k) => BigInt(PERIOD_DAYS[k])),
    caps: kinds.map((k) => channelCaps(k).map((c) => BigInt(c) * 10n ** 18n)),
  };
}
