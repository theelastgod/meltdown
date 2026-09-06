/**
 * The economy, projected from the constants the game actually runs on.
 *
 * `docs/TOKENOMICS.md` §4.4 sets the discipline: sinks must burn at least 60% of the month's
 * emissions by month 12 and 100% by month 24, and the year's emissions must fit the schedule
 * (§4.1–4.2). Those figures were written as illustrations before the game had real numbers. This
 * module derives them from the real ones instead, so the claim is checkable and stays checked —
 * `tests/model.test.ts` fails the build when a constant drifts out of budget.
 *
 * Nothing here runs in a match. It is arithmetic over the manifest.
 */
import { CAPITAL, ALLOCATION } from "./manifest";
import { AUDIT_POOL, SEASON_POOL } from "./prizes";
import { RUN_DAILY_CAP, MAX_CAPITAL_PER_UNIT } from "../sim/run";
import { runPot, settledRate } from "./settlement";

const WHOLE = 10n ** 18n;
/** whole $CAPITAL from wei */
export const whole = (wei: bigint): number => Number(wei / WHOLE);

export const DAYS_PER_MONTH = 365 / 12;
export const WEEKS_PER_MONTH = 365 / 12 / 7;
/** a Deep Wake season is 28 days */
export const SEASONS_PER_MONTH = 365 / 12 / 28;

/** The emission schedule as whole $CAPITAL per year: year 1, then ×decay. */
export function emissionSchedule(): number[] {
  const out: number[] = [];
  let year = CAPITAL.emissions.year1;
  for (let y = 0; y < CAPITAL.emissions.years; y++) {
    out.push(whole(year));
    year = (year * BigInt(Math.round(CAPITAL.emissions.decay * 1000))) / 1000n;
  }
  return out;
}

/** What the emissions allocation actually holds. */
export const emissionsAllocation = (): number => whole((CAPITAL.cap * BigInt(ALLOCATION.emissions)) / 10_000n);

/** The population the projection is run against. */
export interface Population {
  /** monthly active files */
  mau: number;
  /** share of MAU that plays on a given day */
  dauShare: number;
  /** share of daily players past the run's Depth gate who actually run */
  runnerShare: number;
  /** how much of the daily cap a runner banks, on average */
  capUse: number;
  /** files that reach Depth 50 and buy a name in a month */
  namesPerMonth: number;
  /** average name fee paid, in whole $CAPITAL */
  nameFee: number;
  /** market volume a month, in whole $CAPITAL */
  marketVolume: number;
  /** share of MAU buying the season pass, and its price */
  buyoutShare: number;
  buyoutPrice: number;
  /** room-hours a month, and the burn per hour */
  roomHours: number;
  roomHourPrice: number;
}

/** docs/TOKENOMICS.md §4.4's illustrative month-12 population. */
export const DOC_POPULATION: Population = {
  mau: 50_000,
  dauShare: 0.2,
  runnerShare: 0.5,
  capUse: 0.5,
  namesPerMonth: 1_500,
  nameFee: 500,
  marketVolume: 10_000_000,
  buyoutShare: 0.2,
  buyoutPrice: 400,
  roomHours: 20_000,
  roomHourPrice: 5,
};

/**
 * A population the schedule must survive rather than one it expects: a hit game. The lint runs the
 * projection here, because a rule that only holds at the numbers you hoped for is not a rule.
 */
export const STRESS_POPULATION: Population = { ...DOC_POPULATION, mau: 1_000_000, dauShare: 0.25, runnerShare: 0.6, capUse: 0.8 };

export interface Projection {
  /** whole $CAPITAL a month the channels would pay at their nominal rates — the demand */
  emissions: { run: number; audit: number; season: number; total: number };
  /** what the schedule actually lets them emit, once THE RUN settles against its daily pot */
  settled: { run: number; audit: number; season: number; total: number };
  /** whole $CAPITAL a banked unit settles for, at the ceiling until the pot binds */
  unitRate: number;
  sinks: { names: number; market: number; buyout: number; rooms: number; total: number };
  /** sinks as a share of settled emissions */
  burnRatio: number;
  /** what the schedule allows in year one, a month */
  monthlyBudget: number;
  /** demand as a multiple of that budget: over 1 means a fixed rate would blow the schedule */
  budgetRatio: number;
  /** days of the year-one allocation the *demand* would consume; 365 or more once settled */
  yearOneDays: number;
}

export function project(p: Population = DOC_POPULATION): Projection {
  const dau = p.mau * p.dauShare;
  const runners = dau * p.runnerShare;

  // the demand: what a rate fixed per unit would pay out. It is a product of a constant and the
  // player count, which is why no choice of constant reconciles it with a fixed schedule.
  const unitsPerDay = runners * RUN_DAILY_CAP * p.capUse;
  const run = unitsPerDay * MAX_CAPITAL_PER_UNIT * DAYS_PER_MONTH;
  // the Audit and the season are fixed pools per event, so they do not scale with the population
  // and are not the problem; only THE RUN is per capita.
  const audit = AUDIT_POOL * WEEKS_PER_MONTH;
  const season = SEASON_POOL * SEASONS_PER_MONTH;
  const emissionsTotal = run + audit + season;

  // the settlement: a day's pot split pro rata, capped at the ceiling
  const unitRate = unitsPerDay > 0 ? settledRate(unitsPerDay, runPot(0)) : MAX_CAPITAL_PER_UNIT;
  const runSettled = unitsPerDay * unitRate * DAYS_PER_MONTH;
  const settledTotal = runSettled + audit + season;

  // sinks: 100% burns except the market, which burns 2% of volume
  const names = p.namesPerMonth * p.nameFee;
  const market = (p.marketVolume * CAPITAL.marketFeeSplit.burnBps) / 10_000;
  const buyout = p.mau * p.buyoutShare * p.buyoutPrice;
  const rooms = p.roomHours * p.roomHourPrice;
  const sinksTotal = names + market + buyout + rooms;

  const yearOne = emissionSchedule()[0]!;
  const monthlyBudget = yearOne / 12;
  return {
    emissions: { run, audit, season, total: emissionsTotal },
    settled: { run: runSettled, audit, season, total: settledTotal },
    unitRate,
    sinks: { names, market, buyout, rooms, total: sinksTotal },
    burnRatio: settledTotal === 0 ? 0 : sinksTotal / settledTotal,
    monthlyBudget,
    budgetRatio: emissionsTotal / monthlyBudget,
    yearOneDays: emissionsTotal === 0 ? Infinity : yearOne / (emissionsTotal / DAYS_PER_MONTH),
  };
}

/**
 * The daily emission budget the treasury can afford on day `day` of the schedule: the year's
 * allowance spread evenly. A payout rate derived from this cannot outrun the schedule however
 * many people play, which a fixed rate per unit cannot promise at any constant (see
 * `docs/ECONOMY.md`).
 */
export function dailyEmissionBudget(day: number): number {
  const schedule = emissionSchedule();
  const year = Math.min(schedule.length - 1, Math.max(0, Math.floor(day / 365)));
  return schedule[year]! / 365;
}

/** The share of the daily emission budget THE RUN pays out; the rest funds the Audit and season pools. */
export const RUN_EMISSION_SHARE = 0.8;

/**
 * What one unit is worth on a day when `unitsBanked` units were banked in total, given the day's
 * budget and the share of it the run is allotted. Pro rata: the budget is the ceiling, the split
 * is by contribution.
 */
export function unitValue(day: number, unitsBanked: number, runShare = RUN_EMISSION_SHARE): number {
  if (unitsBanked <= 0) return 0;
  return (dailyEmissionBudget(day) * runShare) / unitsBanked;
}


/** A few lines for the CLI and the docs. */
export function summarise(p: Population = DOC_POPULATION): string[] {
  const r = project(p);
  const n = (x: number) => Math.round(x).toLocaleString("en-US");
  return [
    `population: ${n(p.mau)} MAU · ${n(p.mau * p.dauShare)} DAU · ${n(p.mau * p.dauShare * p.runnerShare)} runners at ${Math.round(p.capUse * 100)}% of the ${RUN_DAILY_CAP}/day cap`,
    `budget:     ${n(r.monthlyBudget)} a month, from the year-one schedule`,
    `demand:     THE RUN ${n(r.emissions.run)} + Audit ${n(r.emissions.audit)} + season ${n(r.emissions.season)} = ${n(r.emissions.total)} a month at a fixed 1:1 — ${r.budgetRatio.toFixed(1)}× the budget (${r.yearOneDays.toFixed(0)} days of runway, not 365)`,
    `settled:    ${n(r.settled.total)} a month at ${r.unitRate.toFixed(4)} $CAPITAL a unit — ${(r.settled.total / r.monthlyBudget).toFixed(2)}× the budget`,
    `sinks:      names ${n(r.sinks.names)} + market ${n(r.sinks.market)} + buyout ${n(r.sinks.buyout)} + rooms ${n(r.sinks.rooms)} = ${n(r.sinks.total)} a month`,
    `burn ratio: ${(r.burnRatio * 100).toFixed(1)}% of settled emissions (target 60% by month 12, 100% by month 24)`,
  ];
}
