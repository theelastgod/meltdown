/**
 * The two numbers every projection rests on, measured instead of guessed (Stage 38).
 *
 * docs/ECONOMY.md §6 has said since Stage 19 that `capUse` and `runnerShare` are guesses and "the
 * first thing to replace with telemetry". Nothing was collecting the telemetry. Worse, nothing
 * could have: `run_day.units` is spent down as files are paid and `run_settled.units` is only the
 * part the night settled, so the day's gross banking existed nowhere. `run_day_stat` is the record
 * that can answer, and this turns it into the model's parameters.
 *
 * Two deliberate choices about the arithmetic:
 *
 *   - **Pooled, not a mean of daily ratios.** The model multiplies `runners × cap × capUse`, so the
 *     estimator it needs is total units over total runner-days. A mean of per-day ratios weights a
 *     day with four runners the same as a day with four thousand, which is not the quantity the
 *     projection is about.
 *   - **It refuses on a thin sample.** An estimate off nine runner-days is not worth more than the
 *     documented guess it would replace, and it is worth considerably less than the guess if it is
 *     presented with the authority of a measurement. Below the floor this returns null and the
 *     model keeps its stated assumption — which is the honest answer, not a fallback.
 */
import { RUN_DAILY_CAP } from "./counter";

/** One day of recorded play, as `RunStore.stat` returns it. */
export interface DayStat {
  day: number;
  grossUnits: number;
  runners: number;
  active: number;
  eligible: number;
}

/**
 * How much evidence is enough to be worth more than a stated assumption.
 *
 * Runner-days rather than days: thirty days of one runner is one player's habit, not a population's.
 * The numbers are a judgement, not a derivation, and they are here rather than inline so that
 * judgement is visible and arguable.
 */
export const MIN_RUNNER_DAYS = 200;
export const MIN_ELIGIBLE_DAYS = 200;
export const MIN_DAYS = 7;

export interface Observed {
  /** whole days with any recorded play */
  days: number;
  runnerDays: number;
  eligibleDays: number;
  grossUnits: number;
  /** units banked ÷ (runner-days × the daily cap), or null when the sample is too thin to say */
  capUse: number | null;
  /** runner-days ÷ eligible-days, or null when too thin */
  runnerShare: number | null;
  /** why a parameter is null, for the line the model prints */
  why: string[];
}

/** Measure `capUse` and `runnerShare` over recorded days, or decline to. */
export function observe(stats: readonly DayStat[]): Observed {
  const played = stats.filter((s) => s.active > 0);
  const days = played.length;
  const runnerDays = played.reduce((n, s) => n + s.runners, 0);
  const eligibleDays = played.reduce((n, s) => n + s.eligible, 0);
  const grossUnits = played.reduce((n, s) => n + s.grossUnits, 0);
  const why: string[] = [];
  if (days < MIN_DAYS) why.push(`${days} of ${MIN_DAYS} days`);
  if (runnerDays < MIN_RUNNER_DAYS) why.push(`${runnerDays} of ${MIN_RUNNER_DAYS} runner-days`);
  if (eligibleDays < MIN_ELIGIBLE_DAYS) why.push(`${eligibleDays} of ${MIN_ELIGIBLE_DAYS} eligible-days`);
  const enoughDays = days >= MIN_DAYS;
  // capUse cannot exceed 1 — the room refuses to bank past RUN_DAILY_CAP — so a value above it is a
  // bug in the recording rather than an enthusiastic player, and clamping would hide it. Report it.
  const rawCap = runnerDays > 0 ? grossUnits / (runnerDays * RUN_DAILY_CAP) : 0;
  if (rawCap > 1) why.push(`capUse ${rawCap.toFixed(3)} > 1, which the daily cap makes impossible — the record is wrong`);
  const capUse = enoughDays && runnerDays >= MIN_RUNNER_DAYS && rawCap <= 1 ? rawCap : null;
  const runnerShare = enoughDays && eligibleDays >= MIN_ELIGIBLE_DAYS ? Math.min(1, runnerDays / eligibleDays) : null;
  return { days, runnerDays, eligibleDays, grossUnits, capUse, runnerShare, why };
}

/** A one-line account of what was measured and what is still assumed. */
export function describe(o: Observed): string {
  const part = (name: string, v: number | null) => `${name} ${v === null ? "assumed" : `${(v * 100).toFixed(1)}% measured`}`;
  return `${part("capUse", o.capUse)} · ${part("runnerShare", o.runnerShare)} — ${o.days} days, ${o.runnerDays} runner-days, ${o.eligibleDays} eligible-days${o.why.length ? ` (${o.why.join("; ")})` : ""}`;
}
