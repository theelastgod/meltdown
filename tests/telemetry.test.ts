/**
 * The two guesses the whole projection rests on, and what it takes to stop guessing (Stage 38).
 *
 * docs/ECONOMY.md §6 has said since Stage 19 that `capUse` and `runnerShare` are guesses and "the
 * first thing to replace with telemetry". Nothing was collecting it — and nothing could have. The
 * day's gross banking existed nowhere: `run_day.units` is spent down as files are paid, and
 * `run_settled.units` is only the part the night settled. A projection resting on two numbers that
 * the game had no way of measuring is the kind of claim this project exists to stop making.
 *
 * These cases hold the recording (nothing subtracts from it), the arithmetic (pooled, because that
 * is the shape the model multiplies), and the refusal — which is the part that matters most. An
 * estimate off nine runner-days presented as a measurement is worse than an honest guess.
 */
import { describe as suite, expect, it } from "vitest";
import { MemoryRunStore } from "../server/run-store";
import { describe, observe, MIN_DAYS, MIN_ELIGIBLE_DAYS, MIN_RUNNER_DAYS, type DayStat } from "../shared/economy/telemetry";
import { DOC_POPULATION, observedPopulation } from "../shared/economy/model";
import { RUN_DAILY_CAP } from "../shared/economy/counter";

/** `days` days, each with `runners` runners banking `each` units and `eligible` files who could have. */
const fleet = (days: number, runners: number, each: number, eligible: number): DayStat[] =>
  Array.from({ length: days }, (_, i) => ({ day: i, grossUnits: runners * each, runners, active: eligible, eligible }));

suite("the record the economy reads is never spent down", () => {
  it("a payout reduces what is owed and leaves the day's gross alone", () => {
    const s = new MemoryRunStore();
    s.add(10, "f1", 120);
    s.add(10, "f2", 80);
    expect(s.stat(10)).toMatchObject({ grossUnits: 200, runners: 2 });
    // f1 takes the direct withdrawal: run_day drops, the stat does not
    s.spend(10, "f1", 120);
    expect(s.day(10).find((r) => r.file === "f1")).toBeUndefined();
    expect(s.stat(10)).toMatchObject({ grossUnits: 200, runners: 2 });
  });

  it("counts a file once however many rounds it plays, and marks the Depth gate", () => {
    const s = new MemoryRunStore();
    for (let i = 0; i < 9; i++) s.seen(3, "grinder", false);
    s.seen(3, "deep", true);
    expect(s.stat(3)).toMatchObject({ active: 2, eligible: 1, runners: 0, grossUnits: 0 });
  });

  it("banking is itself proof of eligibility — the room only banks past the gate", () => {
    const s = new MemoryRunStore();
    s.seen(4, "f1", false); // seen before the file crossed the gate
    s.add(4, "f1", 50);
    expect(s.stat(4)).toMatchObject({ active: 1, eligible: 1, runners: 1, grossUnits: 50 });
  });

  it("a day nobody played reads as empty rather than as a divide by zero", () => {
    expect(new MemoryRunStore().stat(99)).toEqual({ day: 99, grossUnits: 0, runners: 0, active: 0, eligible: 0 });
  });
});

suite("the arithmetic is the one the model multiplies", () => {
  it("capUse is units over runner-days at the cap, and runnerShare is runners over eligible", () => {
    const o = observe(fleet(30, 40, RUN_DAILY_CAP * 0.6, 100));
    expect(o.capUse).toBeCloseTo(0.6, 6);
    expect(o.runnerShare).toBeCloseTo(0.4, 6);
    expect(o.days).toBe(30);
    expect(o.runnerDays).toBe(1200);
  });

  it("pooled, not a mean of daily ratios: a day with four runners does not weigh as much as a day with four hundred", () => {
    const small: DayStat = { day: 1, grossUnits: 4 * RUN_DAILY_CAP, runners: 4, active: 400, eligible: 400 };
    const big: DayStat = { day: 2, grossUnits: 400 * (RUN_DAILY_CAP * 0.1), runners: 400, active: 400, eligible: 400 };
    const days = [small, big, ...fleet(8, 50, RUN_DAILY_CAP * 0.1, 100)];
    const o = observe(days);
    // the mean of the two headline ratios would be ~0.55; pooled, the big day dominates as it should
    expect(o.capUse!).toBeLessThan(0.2);
  });

  it("a run of empty days does not drag the estimate toward zero — they are not days of play", () => {
    const withEmpties = observe([...fleet(30, 40, RUN_DAILY_CAP * 0.6, 100), ...Array.from({ length: 20 }, (_, i) => ({ day: 900 + i, grossUnits: 0, runners: 0, active: 0, eligible: 0 }))]);
    expect(withEmpties.capUse).toBeCloseTo(0.6, 6);
    expect(withEmpties.days).toBe(30);
  });
});

suite("it declines rather than inventing a number", () => {
  it("too few days: both parameters come back unmeasured, with the reason", () => {
    const o = observe(fleet(MIN_DAYS - 1, 500, RUN_DAILY_CAP * 0.5, 1000));
    expect(o.capUse).toBeNull();
    expect(o.runnerShare).toBeNull();
    expect(o.why.join(" ")).toContain(`of ${MIN_DAYS} days`);
  });

  it("enough days but too few runners: capUse declines and says how short it is", () => {
    const o = observe(fleet(MIN_DAYS, 1, RUN_DAILY_CAP * 0.5, 1000));
    expect(o.capUse).toBeNull();
    expect(o.why.join(" ")).toContain(`of ${MIN_RUNNER_DAYS} runner-days`);
    // …while runnerShare, whose sample IS large enough, still answers
    expect(o.runnerShare).not.toBeNull();
  });

  it("a thin population stops both, and the two floors are not independent", () => {
    // runners are a subset of the eligible, so eligible-days can never be the smaller number: any
    // sample rich enough for capUse is already rich enough for runnerShare's denominator. The
    // eligible floor therefore only ever binds on a population too small for either.
    const o = observe(fleet(MIN_DAYS + 1, 20, RUN_DAILY_CAP * 0.5, 20));
    expect(o.eligibleDays).toBeGreaterThanOrEqual(o.runnerDays);
    expect(o.eligibleDays).toBeLessThan(MIN_ELIGIBLE_DAYS);
    expect(o.capUse).toBeNull();
    expect(o.runnerShare).toBeNull();
    // and it says both shortfalls rather than only the first one it hit
    expect(o.why.join(" ")).toContain(`of ${MIN_RUNNER_DAYS} runner-days`);
    expect(o.why.join(" ")).toContain(`of ${MIN_ELIGIBLE_DAYS} eligible-days`);
  });

  it("a capUse above 1 is a broken record, not a keen player, and is reported instead of clamped", () => {
    // the room refuses to bank past RUN_DAILY_CAP, so this cannot happen unless the recording is wrong
    const o = observe(fleet(30, 40, RUN_DAILY_CAP * 1.4, 100));
    expect(o.capUse).toBeNull();
    expect(o.why.join(" ")).toContain("the record is wrong");
  });
});

suite("the model says which of its inputs are measured", () => {
  it("an unmeasured parameter leaves the documented assumption exactly as it was", () => {
    const thin = observe(fleet(2, 3, RUN_DAILY_CAP * 0.9, 5));
    const p = observedPopulation(DOC_POPULATION, thin);
    expect(p.capUse).toBe(DOC_POPULATION.capUse);
    expect(p.runnerShare).toBe(DOC_POPULATION.runnerShare);
  });

  it("a measured one replaces it, and only it", () => {
    const o = observe(fleet(30, 40, RUN_DAILY_CAP * 0.6, 100));
    const p = observedPopulation(DOC_POPULATION, o);
    expect(p.capUse).toBeCloseTo(0.6, 6);
    expect(p.runnerShare).toBeCloseTo(0.4, 6);
    expect(p.mau).toBe(DOC_POPULATION.mau);
    expect(p.marketVolume).toBe(DOC_POPULATION.marketVolume);
  });

  it("and the line it prints never calls a guess a measurement", () => {
    expect(describe(observe(fleet(2, 3, 10, 5)))).toContain("capUse assumed");
    expect(describe(observe(fleet(2, 3, 10, 5)))).toContain("runnerShare assumed");
    const good = describe(observe(fleet(30, 40, RUN_DAILY_CAP * 0.6, 100)));
    expect(good).toContain("capUse 60.0% measured");
    expect(good).toContain("runnerShare 40.0% measured");
  });
});
