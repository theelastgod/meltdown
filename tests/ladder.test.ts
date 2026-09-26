/**
 * The Depth ladder pays the whole way up (Stage 659).
 *
 * Measured before this stage, over every system that gates on Depth — Ledger nodes and keystones,
 * weapons, moniker tiers, glyph layers, the counter-ledger gates — 24 of the 49 Depths above 1
 * granted nothing, and they were not scattered: Depths 31 to 49 were nineteen consecutive empty
 * levels, 36.9 h of play and 68% of the climb to 50 with not one grant in them. Sixty of the
 * sixty-three grants were in hand by Depth 30, at 32% of the climb.
 *
 * Ring 3 of the Ledger Graph was written across Depth 16–30 and is now spread across 16–48. That
 * delays variety rather than strength: every node is a reconciled paired trade the Fairness Lint
 * holds to ±4% TTK, so a fully carved file is differently shaped, not stronger.
 */
import { describe, expect, it } from "vitest";
import { depthGrants, emptyDepths, lintDepthLadder, longestEmptyRun, MAX_EMPTY_RUN, type Grant } from "../shared/progression/lint";
import { LEDGER_ITEMS } from "../shared/manifest/items";
import { MAX_DEPTH } from "../shared/progression/depth";

const runLength = (r: [number, number] | null) => (r ? r[1] - r[0] + 1 : 0);

describe("the Depth ladder pays the whole way up", () => {
  it("the ladder as shipped has no violations", () => {
    expect(lintDepthLadder()).toEqual([]);
  });

  it("no stretch of Depths longer than the limit grants nothing", () => {
    const run = longestEmptyRun();
    expect(runLength(run), `Depth ${run?.[0]}–${run?.[1]} grants nothing`).toBeLessThanOrEqual(MAX_EMPTY_RUN);
  });

  it("the back half of the climb is not empty, and the cap itself pays", () => {
    const grants = depthGrants();
    // 61% of the climb to 50 lies past Depth 40, so the last ten levels carry most of the hours
    expect(grants.filter((g) => g.depth > 30).length, "Depth 31–50 grants").toBeGreaterThan(5);
    expect(grants.some((g) => g.depth === MAX_DEPTH), "the cap grants nothing").toBe(true);
  });

  it("catches the dead zone this stage fixed — ring 3 crammed into Depth 16–30", () => {
    // the mutation: put ring 3 back where it was and the rule must name the dead zone
    const before: Grant[] = depthGrants().map((g) => {
      const it = LEDGER_ITEMS.find((x) => `${x.kind}:${x.id}` === g.what);
      return it && it.ring === 3 ? { ...g, depth: Math.min(g.depth, 30) } : g;
    });
    const v = lintDepthLadder(before);
    expect(v.map((x) => x.rule)).toContain("dead-zone");
    expect(v.find((x) => x.rule === "dead-zone")!.detail).toMatch(/Depth 31–49 is 19 levels/);
    expect(runLength(longestEmptyRun(before))).toBe(19);
  });

  it("catches a single node dragged back, not only the whole ring", () => {
    // the finer mutation: the rule has to bite on one item moving, or it only guards a rewrite
    const dragged = depthGrants().map((g) => (g.what === "node:black_swan" ? { ...g, depth: 30 } : g));
    // 48 was the only grant between 47 and 50, so losing it opens Depth 48–49
    expect(runLength(longestEmptyRun(dragged))).toBeGreaterThan(runLength(longestEmptyRun()));
  });

  it("catches a reward gated past the cap, where nobody would ever see it", () => {
    const v = lintDepthLadder([...depthGrants(), { depth: MAX_DEPTH + 5, what: "node:unreachable" }]);
    expect(v.map((x) => x.rule)).toContain("grant-off-the-ladder");
  });

  it("counts grants from every system that gates on Depth, not just the Ledger Graph", () => {
    const what = depthGrants().map((g) => g.what);
    expect(what.some((w) => w.startsWith("weapon:"))).toBe(true);
    expect(what).toContain("moniker tier");
    expect(what).toContain("glyph layer");
    expect(what).toContain("on-chain name");
    // a rule that only read the Ledger Graph would have called Depth 25 and 50 empty
    expect(emptyDepths()).not.toContain(25);
    expect(emptyDepths()).not.toContain(50);
  });

  it("ring 3 spans the deep half of the climb and still gates no earlier than Depth 16", () => {
    const ring3 = LEDGER_ITEMS.filter((i) => i.ring === 3);
    expect(ring3).toHaveLength(18);
    expect(Math.min(...ring3.map((n) => n.requiresDepth))).toBe(16);
    expect(Math.max(...ring3.map((n) => n.requiresDepth))).toBeGreaterThanOrEqual(46);
    // and the cheap ones still come first: price never falls as the gate deepens
    const byDepth = [...ring3].sort((a, b) => a.requiresDepth - b.requiresDepth);
    for (let i = 1; i < byDepth.length; i++) expect(byDepth[i]!.cost).toBeGreaterThanOrEqual(byDepth[i - 1]!.cost);
  });
});
