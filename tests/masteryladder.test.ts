/**
 * A weapon's mastery ladder pays at the ranks that matter (Stage 660).
 *
 * Mastery runs rank 1–30 per weapon with 22 things to give — 20 chips and the two firmwares — so
 * 7 of the 29 ranks above the first are empty by arithmetic, and no re-spacing can change that.
 * The rule is not "fill every rank", which is impossible; it is that the empty ones may not be the
 * ranks that matter.
 *
 * Measured before this stage, all three ways of getting that wrong were live at once:
 *
 *   ranks 2..30 granting nothing: 7 of 29 → 15,19,23,24,26,29,30
 *   rank 30 (the cap) grants: NOTHING
 *   longest empty run: 2 (r23-24)
 *
 * Rank 30 is roughly 12.4 h of use on one weapon, and it paid nothing on any of the eight. Rank 15
 * was a challenge gate that paid nothing, alone among the five, so a player finished a curriculum
 * and was granted permission to keep ranking. The seven empty ranks are now 3, 8, 12, 19, 23, 26
 * and 29: no gate, not the cap, none adjacent.
 */
import { describe, expect, it } from "vitest";
import { lintMasteryLadder, rankGrants, MAX_EMPTY_RANK_RUN } from "../shared/progression/lint";
import { GATES, MAX_RANK } from "../shared/progression/mastery";
import { WEAPON_LIST } from "../shared/weapons/manifest";
import { CHIPS } from "../shared/manifest/chips";
import { FIRMWARES } from "../shared/manifest/firmwares";

const longestRun = (paid: Set<number>) => {
  let run = 0;
  let worst = 0;
  for (let r = 2; r <= MAX_RANK; r++) {
    run = paid.has(r) ? 0 : run + 1;
    worst = Math.max(worst, run);
  }
  return worst;
};

describe("a mastery ladder pays at the ranks that matter", () => {
  it("the manifest as shipped has no violations", () => {
    expect(lintMasteryLadder()).toEqual([]);
  });

  it("every challenge gate pays, on every weapon — a curriculum is not its own reward", () => {
    for (const w of WEAPON_LIST) {
      const paid = new Set(rankGrants(w.id));
      for (const g of GATES) expect(paid.has(g), `${w.id} rank ${g} is a gate that grants nothing`).toBe(true);
    }
  });

  it("the cap pays, on every weapon", () => {
    for (const w of WEAPON_LIST) {
      expect(new Set(rankGrants(w.id)).has(MAX_RANK), `${w.id} rank ${MAX_RANK}`).toBe(true);
    }
  });

  it("no two ranks in a row grant nothing", () => {
    for (const w of WEAPON_LIST) {
      expect(longestRun(new Set(rankGrants(w.id))), w.id).toBeLessThanOrEqual(MAX_EMPTY_RANK_RUN);
    }
  });

  it("the seven ranks that must stay empty are the ones that cost least", () => {
    // 22 grants over 29 ranks: seven are empty whatever anyone does, so name which seven, or the
    // arithmetic quietly chooses them again
    const paid = new Set(rankGrants(WEAPON_LIST[0]!.id));
    const empty = [];
    for (let r = 2; r <= MAX_RANK; r++) if (!paid.has(r)) empty.push(r);
    expect(empty).toEqual([3, 8, 12, 19, 23, 26, 29]);
    expect(empty.filter((r) => (GATES as readonly number[]).includes(r))).toEqual([]);
    expect(empty).not.toContain(MAX_RANK);
    expect(paid.size + empty.length).toBe(MAX_RANK - 1);
  });

  it("catches the cap left empty — one of the three defects this stage fixed", () => {
    const capped = CHIPS.filter((c) => c.rank !== MAX_RANK);
    expect(capped.length).toBeLessThan(CHIPS.length);
    // rebuild the check against the mutated set rather than trusting the live manifest
    const paid = new Set([...capped.filter((c) => c.weapon === "lease_breaker").map((c) => c.rank), ...FIRMWARES.filter((f) => f.weapon === "lease_breaker").map((f) => f.rank)]);
    expect(paid.has(MAX_RANK)).toBe(false);
    expect(longestRun(paid)).toBeGreaterThan(MAX_EMPTY_RANK_RUN);
  });

  it("the arithmetic the rule rests on: 20 chips and 2 firmwares per weapon, 22 grants", () => {
    for (const w of WEAPON_LIST) {
      expect(CHIPS.filter((c) => c.weapon === w.id)).toHaveLength(20);
      expect(FIRMWARES.filter((f) => f.weapon === w.id)).toHaveLength(2);
      expect(rankGrants(w.id)).toHaveLength(22);
      // every grant is on the ladder, and no two chips share a rank on one weapon
      expect(new Set(rankGrants(w.id)).size).toBe(22);
      for (const r of rankGrants(w.id)) expect(r).toBeGreaterThanOrEqual(2);
      for (const r of rankGrants(w.id)) expect(r).toBeLessThanOrEqual(MAX_RANK);
    }
  });

  it("chips still climb: a chip unlocked later is never cheaper to reach than one before it", () => {
    // the re-spacing preserved each chip's place in the order, so the ladder still reads as one
    const bySocket = new Map<string, number[]>();
    for (const c of CHIPS.filter((c) => c.weapon === "lease_breaker")) bySocket.set(c.socket, [...(bySocket.get(c.socket) ?? []), c.rank]);
    for (const [socket, ranks] of bySocket) {
      const sorted = [...ranks].sort((a, b) => a - b);
      expect(new Set(sorted).size, `${socket} has two chips on one rank`).toBe(sorted.length);
    }
    expect(bySocket.size).toBe(3);
  });
});
