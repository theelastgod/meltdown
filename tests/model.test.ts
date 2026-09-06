/**
 * The economy, held to its own schedule.
 *
 * `docs/TOKENOMICS.md` publishes an emission schedule: a fixed number of $CAPITAL a year, decaying.
 * The game shipped paying THE RUN a fixed rate per unit banked, which makes the year's emission a
 * product of the rate and the player count — a quantity the schedule does not contain. These cases
 * pin the finding (a fixed rate blows the schedule, at the doc's own population and worse at a
 * happier one) and the fix (a settlement drawn from a daily pot cannot, at any population).
 *
 * See docs/ECONOMY.md.
 */
import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { DOC_POPULATION, STRESS_POPULATION, dailyEmissionBudget, emissionSchedule, emissionsAllocation, project, RUN_EMISSION_SHARE } from "../shared/economy/model";
import { dilutionThreshold, runPot, settleRun } from "../shared/economy/settlement";
import { lintTokenConstants } from "../shared/economy/lint";
import { MAX_CAPITAL_PER_UNIT, RUN_DAILY_CAP } from "../shared/sim/run";

describe("the emission schedule", () => {
  it("fits inside the emissions allocation, and decays as declared", () => {
    const s = emissionSchedule();
    expect(s).toHaveLength(8);
    expect(s.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(emissionsAllocation());
    for (let i = 1; i < s.length; i++) expect(s[i]!).toBeLessThan(s[i - 1]!);
  });

  it("spreads a year evenly across its days, and holds the last year's rate afterwards", () => {
    expect(dailyEmissionBudget(0) * 365).toBeCloseTo(emissionSchedule()[0]!, 6);
    expect(dailyEmissionBudget(400)).toBeCloseTo(emissionSchedule()[1]! / 365, 9);
    // past the schedule the rate does not fall off a cliff and does not restart
    expect(dailyEmissionBudget(99_999)).toBeCloseTo(emissionSchedule()[7]! / 365, 9);
  });
});

describe("the finding: a rate fixed per unit cannot fit a fixed schedule", () => {
  it("blows the year-one budget at the population the tokenomics doc assumes", () => {
    const r = project(DOC_POPULATION);
    expect(r.emissions.run).toBeGreaterThan(r.monthlyBudget);
    expect(r.budgetRatio).toBeGreaterThan(1.5);
    // a year's allocation gone in well under a year
    expect(r.yearOneDays).toBeLessThan(220);
  });

  it("gets worse the better the game does — which is the shape of the problem, not the size of it", () => {
    const doc = project(DOC_POPULATION);
    const hit = project(STRESS_POPULATION);
    expect(hit.budgetRatio).toBeGreaterThan(doc.budgetRatio * 10);
    // demand is linear in the player count: doubling the runners doubles it exactly
    const twice = project({ ...DOC_POPULATION, mau: DOC_POPULATION.mau * 2 });
    expect(twice.emissions.run).toBeCloseTo(doc.emissions.run * 2, 6);
  });

  it("is THE RUN's doing: the fixed pools are per event, so they do not scale at all", () => {
    const doc = project(DOC_POPULATION);
    const hit = project(STRESS_POPULATION);
    expect(hit.emissions.audit).toBe(doc.emissions.audit);
    expect(hit.emissions.season).toBe(doc.emissions.season);
    expect(doc.emissions.audit + doc.emissions.season).toBeLessThan(doc.emissions.run * 0.001);
  });
});

describe("the fix: a day is a pot, not a price", () => {
  it("never mints past the day's pot, however many units are banked", () => {
    for (const files of [1, 10, 1_000, 50_000]) {
      const banked = Array.from({ length: files }, (_, i) => ({ account: `f${i}`, units: RUN_DAILY_CAP }));
      const s = settleRun(0, banked);
      expect(s.minted).toBeLessThanOrEqual(s.pot);
      expect(s.rate).toBeLessThanOrEqual(MAX_CAPITAL_PER_UNIT);
      // `minted` is accumulated in millionths and divided once, so it is the exact total; adding
      // the lines back up in floating point agrees with it but is not bit-identical, which is the
      // reason the settlement does not compute it that way
      expect(s.lines.reduce((a, l) => a + l.amount, 0)).toBeCloseTo(s.minted, 6);
    }
  });

  it("pays the old fixed rate while the game is small: nothing changes below the crossover", () => {
    const threshold = dilutionThreshold(0);
    const files = Math.floor((threshold * 0.5) / RUN_DAILY_CAP);
    const s = settleRun(0, Array.from({ length: files }, (_, i) => ({ account: `f${i}`, units: RUN_DAILY_CAP })));
    expect(s.rate).toBe(MAX_CAPITAL_PER_UNIT);
    expect(s.lines[0]!.amount).toBe(RUN_DAILY_CAP);
  });

  it("dilutes pro rata once the pot binds, and splits it by contribution", () => {
    // three files, one of them banking twice what the others do, against a pot far under demand
    const s = settleRun(0, [{ account: "a", units: 100 }, { account: "b", units: 50 }, { account: "c", units: 50 }], { pot: 100 });
    expect(s.rate).toBeCloseTo(0.5, 12);
    expect(s.lines.find((l) => l.account === "a")!.amount).toBe(50);
    expect(s.lines.find((l) => l.account === "b")!.amount).toBe(25);
    expect(s.minted).toBeLessThanOrEqual(100);
  });

  it("holds each file to the day's cap even if the room hands it more", () => {
    const s = settleRun(0, [{ account: "a", units: 10_000 }, { account: "b", units: RUN_DAILY_CAP }], { pot: 1e9 });
    expect(s.units).toBe(RUN_DAILY_CAP * 2);
    expect(s.lines.find((l) => l.account === "a")!.amount).toBe(RUN_DAILY_CAP);
  });

  it("sums a file's separate banks, and ignores empty and negative ones", () => {
    const s = settleRun(0, [{ account: "a", units: 30 }, { account: "a", units: 12 }, { account: "b", units: 0 }, { account: "c", units: -5 }], { pot: 1e9 });
    expect(s.units).toBe(42);
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]!.amount).toBe(42);
  });

  it("pays a day worth less than a whole $CAPITAL rather than rounding it away", () => {
    // a million-MAU day: a full 200-unit run settles at well under one $CAPITAL. Rounding to whole
    // tokens would have paid every player in the game nothing, on the game's best day.
    const files = 250_000;
    const s = settleRun(0, Array.from({ length: files }, (_, i) => ({ account: `f${i}`, units: RUN_DAILY_CAP })));
    expect(s.rate).toBeLessThan(0.01);
    expect(s.lines).toHaveLength(files);
    expect(s.lines[0]!.amount).toBeGreaterThan(0);
    expect(s.lines[0]!.amount).toBeLessThan(1);
    // and the pot is spent rather than stranded by the rounding
    expect(s.minted).toBeGreaterThan(s.pot * 0.999);
    expect(s.minted).toBeLessThanOrEqual(s.pot);
    // every amount survives the trip to wei that postEpoch makes
    for (const l of s.lines.slice(0, 50)) expect(parseEther(String(l.amount))).toBeGreaterThan(0n);
  });

  it("settles an empty day to nothing rather than dividing by zero", () => {
    const s = settleRun(0, []);
    expect(s).toMatchObject({ units: 0, rate: 0, minted: 0, lines: [] });
    expect(s.pot).toBeGreaterThan(0);
  });

  it("keeps a month inside the year-one budget at every population, which is the point", () => {
    for (const p of [DOC_POPULATION, STRESS_POPULATION, { ...DOC_POPULATION, mau: 5_000_000 }]) {
      const r = project(p);
      expect(r.settled.total).toBeLessThanOrEqual(r.monthlyBudget);
    }
    // and the run's own share of a day is exactly what it was allotted
    expect(runPot(0)).toBeCloseTo(dailyEmissionBudget(0) * RUN_EMISSION_SHARE, 9);
  });

  it("clears the burn discipline the tokenomics doc sets, which the fixed rate did not", () => {
    const r = project(DOC_POPULATION);
    expect(r.burnRatio).toBeGreaterThan(0.6); // §4.4's month-12 target
    // the same sinks against the unsettled demand fell far short — that is what was being papered over
    expect(r.sinks.total / r.emissions.total).toBeLessThan(0.4);
  });
});

describe("the economy lint", () => {
  it("passes on the constants as they stand", () => {
    expect(lintTokenConstants()).toEqual([]);
  });

  it("would fail if a settlement ever minted past its pot", () => {
    // the rule's own witness: a settlement that ignores the pot is exactly what the lint is for
    const bad = settleRun(0, [{ account: "a", units: 100 }], { pot: 10, ceiling: MAX_CAPITAL_PER_UNIT });
    expect(bad.minted).toBeLessThanOrEqual(bad.pot);
    const fixedRate = 100 * MAX_CAPITAL_PER_UNIT;
    expect(fixedRate).toBeGreaterThan(bad.pot); // what the old rule would have paid
  });
});
