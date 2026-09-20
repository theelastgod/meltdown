/**
 * The Fairness Lint's recorded debt and the ratchet over it (Stage 173).
 *
 * The full lint has been red since the commit that created it — 62 violations at birth, 89 now —
 * and CI has only ever run it with `--quick`, which duels three of the eight weapons. Every
 * violation the full lint reports is on `stack_smg` or `clockeater`, and neither is in the quick
 * set, so the gate could not see any of it. The debt is now written down and the lint fails on
 * anything that is not on the list, or on anything on the list that got worse.
 */
import { describe, expect, it } from "vitest";
import { MOBILITY_SLACK, reconcileDebt, type DebtEntry, type LintViolation } from "../shared/fairness/lint";
import { FAIRNESS_DEBT } from "../shared/fairness/debt";
import { WEAPONS } from "../shared/weapons/manifest";
import { readFileSync } from "node:fs";

/** one shot of the weapon named in the key, as a fraction of a kill of `kill` seconds */
const quantum = (weapon: string, kill: number): number => 60 / (WEAPONS[weapon as keyof typeof WEAPONS]?.rpm ?? 60) / kill;
const v = (key: string, magnitude: number, slack = quantum(key.split("|")[2] ?? "stack_smg", 1.133)): LintViolation => ({ build: key.split("|")[0]!, rule: "ttk-deviation", detail: key, key, magnitude, slack });
const d = (key: string, magnitude: number): DebtEntry => ({ key, magnitude, detail: key });

describe("fairness debt — the ratchet", () => {
  it("a run that reproduces the record exactly is clean", () => {
    const debt = [d("a|ttk-deviation|stack_smg|25|offense", 0.059), d("b|ttk-deviation|stack_smg|40|offense", 0.077)];
    const r = reconcileDebt([v("a|ttk-deviation|stack_smg|25|offense", 0.059), v("b|ttk-deviation|stack_smg|40|offense", 0.077)], debt);
    expect(r.ok).toBe(true);
    expect(r.fresh).toEqual([]);
    expect(r.worsened).toEqual([]);
    expect(r.cleared).toEqual([]);
  });

  it("a violation that is not on the list fails, however small", () => {
    const r = reconcileDebt([v("a|ttk-deviation|stack_smg|25|offense", 0.041)], []);
    expect(r.ok).toBe(false);
    expect(r.fresh).toHaveLength(1);
    expect(r.fresh[0]!.key).toBe("a|ttk-deviation|stack_smg|25|offense");
  });

  it("a recorded violation that grew by more than its own shot fails", () => {
    const smg = quantum("stack_smg", 1.733); // one shot of a 1.733 s kill at 40 m
    const debt = [d("a|ttk-deviation|stack_smg|40|offense", 0.077)];
    const r = reconcileDebt([v("a|ttk-deviation|stack_smg|40|offense", 0.077 + smg + 0.001, smg)], debt);
    expect(r.ok).toBe(false);
    expect(r.worsened).toHaveLength(1);
    expect(r.worsened[0]!.was).toBe(0.077);
  });

  it("drift of exactly one shot does not fail — a duel's TTK moves in whole shots and nothing smaller", () => {
    const smg = quantum("stack_smg", 1.733);
    const debt = [d("a|ttk-deviation|stack_smg|40|offense", 0.077)];
    const r = reconcileDebt([v("a|ttk-deviation|stack_smg|40|offense", 0.077 + smg, smg)], debt);
    expect(r.ok).toBe(true);
    expect(r.worsened).toEqual([]);
  });

  it("the slack belongs to the duel, not to the file: one number could not serve both weapons", () => {
    // the SMG fires 900 rpm and kills at 25 m in 1.133 s: one shot is 5.9% of the kill
    expect(quantum("stack_smg", 1.133)).toBeCloseTo(0.0588, 3);
    // CLOCKEATER fires 240 rpm and kills at 25 m in 0.883 s: one shot is 28.3%, five times as coarse
    expect(quantum("clockeater", 0.883)).toBeCloseTo(0.2831, 3);
    // a global slack set for the SMG would call a single CLOCKEATER shot a regression
    const ce = quantum("clockeater", 0.883);
    const debt = [d("a|ttk-deviation|clockeater|25|offense", 0.302)];
    expect(reconcileDebt([v("a|ttk-deviation|clockeater|25|offense", 0.302 + ce * 0.9, ce)], debt).ok).toBe(true);
    expect(reconcileDebt([v("a|ttk-deviation|clockeater|25|offense", 0.302 + ce * 0.9, quantum("stack_smg", 1.133))], debt).ok).toBe(false);
  });

  it("the mobility course has no shots to land on, so its slack is float noise only", () => {
    expect(MOBILITY_SLACK).toBeLessThan(0.01);
    const debt = [d("a|mobility-deviation", 0.06)];
    expect(reconcileDebt([v("a|mobility-deviation", 0.07, MOBILITY_SLACK)], debt).ok).toBe(false);
  });

  it("a cleared entry is reported and does not fail: fixing something must not go red", () => {
    const debt = [d("a|ttk-deviation|stack_smg|25|offense", 0.059), d("gone|ttk-deviation|stack_smg|40|offense", 0.077)];
    const r = reconcileDebt([v("a|ttk-deviation|stack_smg|25|offense", 0.059)], debt);
    expect(r.ok).toBe(true);
    expect(r.cleared).toHaveLength(1);
    expect(r.cleared[0]!.key).toBe("gone|ttk-deviation|stack_smg|40|offense");
  });

  it("identity is the build, the rule, the weapon, the range and the side — not the numbers", () => {
    const debt = [d("a|ttk-deviation|stack_smg|25|offense", 0.059)];
    // same build and rule, other side of the duel: a different violation, and new
    expect(reconcileDebt([v("a|ttk-deviation|stack_smg|25|defense", 0.059)], debt).fresh).toHaveLength(1);
    // same build and rule, other bracket: also new
    expect(reconcileDebt([v("a|ttk-deviation|stack_smg|40|offense", 0.059)], debt).fresh).toHaveLength(1);
    // same build and rule, other weapon: also new
    expect(reconcileDebt([v("a|ttk-deviation|clockeater|25|offense", 0.059)], debt).fresh).toHaveLength(1);
  });

  it("an empty record admits nothing: a clean catalogue is the only way to pass with no debt", () => {
    expect(reconcileDebt([], []).ok).toBe(true);
    expect(reconcileDebt([v("a|ttk-deviation|stack_smg|25|offense", 0.05)], []).ok).toBe(false);
  });
});

describe("fairness debt — what is actually recorded", () => {
  it("every recorded entry has a key, a magnitude and the detail it was recorded with", () => {
    expect(FAIRNESS_DEBT.length).toBeGreaterThan(0);
    for (const e of FAIRNESS_DEBT) {
      expect(e.key, JSON.stringify(e)).toMatch(/^[^|]+\|[a-z-]+/);
      expect(Number.isFinite(e.magnitude)).toBe(true);
      expect(e.magnitude).toBeGreaterThanOrEqual(0);
      expect(e.detail.length).toBeGreaterThan(10);
    }
  });

  it("no two entries share a key, or one violation would mask another", () => {
    const keys = FAIRNESS_DEBT.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("the debt is only ttk-deviation, and only on the two weapons --quick never duelled", () => {
    const quickSet = new Set(["lease_breaker", "repo_hammer", "longwave"]);
    const weapons = new Set<string>();
    for (const e of FAIRNESS_DEBT) {
      const [, rule, weapon] = e.key.split("|");
      expect(rule, e.detail).toBe("ttk-deviation");
      if (weapon) weapons.add(weapon);
    }
    expect([...weapons].sort()).toEqual(["clockeater", "stack_smg"]);
    for (const w of weapons) expect(quickSet.has(w), `${w} is in the quick set after all`).toBe(false);
  });

  it("a recorded magnitude agrees with the detail it was recorded with", () => {
    // Without this, widening a number in the record would let a real regression hide behind it: the
    // ratchet compares against the record, and nothing else checks what the record says.
    for (const e of FAIRNESS_DEBT) {
      const m = /(offense|defense) (-?[\d.]+)%/.exec(e.detail);
      expect(m, e.detail).not.toBeNull();
      // the detail prints one decimal place, so it can differ from the stored float by half of one
      expect(Math.abs(Math.abs(Number(m![2]) / 100) - e.magnitude), e.detail).toBeLessThanOrEqual(0.0005);
    }
  });

  it("a recorded detail's percentage agrees with its own two measured seconds", () => {
    // and this is why the check above cannot be satisfied by editing the detail to match: the
    // percentage has to follow from the pair of times printed beside it.
    for (const e of FAIRNESS_DEBT) {
      const m = /(-?[\d.]+)% \(([\d.]+) vs ([\d.]+) s\)/.exec(e.detail);
      expect(m, e.detail).not.toBeNull();
      const [, pct, got, ref] = m!;
      // both times are printed to three decimal places, so the ratio they imply carries about
      // 0.001 of rounding; a magnitude someone widened by hand would be out by tenths, not this
      expect(Math.abs(Number(got!) / Number(ref!) - 1 - Number(pct) / 100), e.detail).toBeLessThanOrEqual(0.001);
    }
  });

  it("every recorded weapon and bracket is one the lint actually duels", () => {
    for (const e of FAIRNESS_DEBT) {
      const [, , weapon, range] = e.key.split("|");
      expect(Object.keys(WEAPONS), e.detail).toContain(weapon);
      expect([3, 8, 15, 25, 40]).toContain(Number(range));
    }
  });
});

describe("fairness debt — the gate that runs it", () => {
  const verify = readFileSync(new URL("../.github/workflows/verify.yml", import.meta.url), "utf8");
  const stage6 = readFileSync(new URL("../probe/stage6.ts", import.meta.url), "utf8");

  it("CI runs the full Fairness Lint, not the three-weapon quick set", () => {
    const steps = verify.split("\n").filter((l) => l.includes("lint:fairness"));
    expect(steps, "verify.yml no longer runs the Fairness Lint at all").toHaveLength(1);
    expect(steps[0], "CI is back on --quick, which cannot see any recorded violation").not.toMatch(/--quick/);
  });

  it("the probe's 'the shipped catalogue passes' check duels all eight weapons", () => {
    // it said `--quick` from Stage 6 to Stage 173: a proof artifact that never asked about five
    // of the eight weapons, and every violation the full lint reports is on two of those five.
    expect(stage6).toMatch(/const clean = lint\(\[\]\);/);
    expect(stage6.slice(0, stage6.indexOf("const clean"))).not.toMatch(/"--quick"/);
  });
});
