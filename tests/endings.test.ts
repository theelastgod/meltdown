/**
 * The white office delivers the ending the arc earned (Stage 174).
 *
 * Six endings ship. Four are written by a choice in the m7 office script; two — THE CITY THAT READ
 * THE FIRE and THE QUIET WAKING — are written by nothing at all. They are the two readings of
 * wiping the ledger, told apart by what the m6 broadcast said, and the comment above `ENDINGS` sets
 * out the contract: "the arc could be finished twice, having answered its final question
 * differently each time, and end the same way both times." That is exactly what happened. The
 * CONTRACTS panel listed them as open, the office looked `m7:ending` up by id, found "wipe", and
 * showed WIPE THE LEDGER both times.
 *
 * The campaign lint's `ending-is-reachable` rule could not see it: it asks whether an ending's gate
 * can be opened, and both gates could. Nothing asked whether the office could ever name it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ENDINGS, endingTitle, endingsFor, resolveEnding, type Testimony } from "../shared/campaign/testimony";
import { SCRIPTS } from "../shared/campaign/script";
import { lintCampaign } from "../shared/campaign/lint";

/** every ending id that some dialogue choice writes to `m7:ending` */
function writtenIds(): Set<string> {
  const out = new Set<string>();
  for (const s of SCRIPTS) for (const n of s.nodes) for (const c of n.choices ?? []) {
    const v = (c.set ?? {})["m7:ending"];
    if (v) out.add(v);
  }
  return out;
}

const wipe = { "m7:ending": "wipe" } as Testimony;

describe("endings — every ending the game ships can be delivered", () => {
  it("the office can name each one: written by a choice, or refining one that is", () => {
    const written = writtenIds();
    for (const e of ENDINGS) {
      const reachable = written.has(e.id) || (!!e.refines && written.has(e.refines));
      expect(reachable, `${e.id} "${e.title}" is in ENDINGS and nothing can deliver it`).toBe(true);
    }
  });

  it("wiping after a full broadcast is THE CITY THAT READ THE FIRE, not WIPE THE LEDGER", () => {
    const t = { ...wipe, "m6:broadcast": "full" } as Testimony;
    expect(resolveEnding(t, null).id).toBe("wipe_fire");
    expect(resolveEnding(t, null).title).toBe("THE CITY THAT READ THE FIRE");
  });

  it("wiping after a redacted broadcast is THE QUIET WAKING", () => {
    const t = { ...wipe, "m6:broadcast": "redacted" } as Testimony;
    expect(resolveEnding(t, null).id).toBe("wipe_quiet");
  });

  it("two runs that answered the last question differently do not end the same way", () => {
    const fire = resolveEnding({ ...wipe, "m6:broadcast": "full" } as Testimony, null);
    const quiet = resolveEnding({ ...wipe, "m6:broadcast": "redacted" } as Testimony, null);
    expect(fire.id).not.toBe(quiet.id);
    expect(fire.lines).not.toEqual(quiet.lines);
  });

  it("what the panel says is open is what the office can deliver", () => {
    for (const b of ["full", "redacted"] as const) {
      const t = { ...wipe, "m6:broadcast": b } as Testimony;
      const open = endingsFor(t, null).map((e) => e.id);
      const got = resolveEnding(t, null).id;
      expect(open, `panel offered [${open.join(", ")}] and the office gave ${got}`).toContain(got);
      // and it is the sharper of the two on offer, not the one every run gets
      expect(got).not.toBe("wipe");
    }
  });
});

describe("the contracts panel names the ending, not the id", () => {
  it("is the title for every shipped ending", () => {
    for (const e of ENDINGS) {
      expect(endingTitle(e.id)).toBe(e.title);
      expect(endingTitle(e.id)).not.toBe(e.id.toUpperCase().replace(/_/g, " "));
    }
    expect(endingTitle("chair_clockeater")).toBe("THE CLOCKEATER'S CHAIR");
    expect(endingTitle("wipe_fire")).toBe("THE CITY THAT READ THE FIRE");
    expect(endingTitle("chair_clockeater")).not.toBe("CHAIR CLOCKEATER");
  });

  it("the complete line interpolates endingTitle", () => {
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/ENDING: \$\{endingTitle\(c\.ending\)\}/);
    expect(src).not.toMatch(/c\.ending \?\? ""\)\.toUpperCase\(\)/);
  });
});

describe("endings — resolving does not take a choice away", () => {
  it("a wipe with no broadcast on the record is still WIPE THE LEDGER", () => {
    expect(resolveEnding(wipe, null).id).toBe("wipe");
    expect(resolveEnding({} as Testimony, null).id).toBe("wipe");
  });

  it("taking the plain chair while a sharper chair is open is still the plain chair", () => {
    // the two chair variants are asked for by their own office choices, so they refine nothing:
    // a clockeater who picks TAKE THE CHAIR meant to pick it
    const t = { "m7:ending": "chair", "m4:directive": "kept", "m3:volatility": "hold" } as Testimony;
    expect(resolveEnding(t, "clockeaters").id).toBe("chair");
    expect(ENDINGS.find((e) => e.id === "chair_clockeater")!.refines).toBeUndefined();
    expect(ENDINGS.find((e) => e.id === "chair_estate")!.refines).toBeUndefined();
  });

  it("choosing a variant directly delivers exactly that variant", () => {
    const t = { "m7:ending": "chair_clockeater", "m4:directive": "kept", "m3:volatility": "hold" } as Testimony;
    expect(resolveEnding(t, "clockeaters").id).toBe("chair_clockeater");
  });

  it("a refinement whose gate is shut does not take over", () => {
    // full and redacted are mutually exclusive, so a run that sent neither gets the plain wipe
    expect(resolveEnding({ ...wipe, "m6:broadcast": "neither" } as Testimony, null).id).toBe("wipe");
  });

  it("an m7:ending the manifest does not know falls back to the first ending, not to nothing", () => {
    expect(resolveEnding({ "m7:ending": "nonsense" } as Testimony, null).id).toBe("wipe");
  });
});

describe("endings — the lint that has to catch the next one", () => {
  it("the shipped campaign has no undeliverable ending", () => {
    const problems = lintCampaign().filter((p) => p.rule === "ending-is-deliverable" || p.rule === "ending-refines-an-ending");
    expect(problems.map((p) => `${p.where}: ${p.detail}`)).toEqual([]);
  });

  it("the rule fires on an ending nothing writes and nothing refines", () => {
    const list = ENDINGS as { id: string; title: string; hidden: boolean; gate: unknown; lines: string[]; refines?: string }[];
    list.push({ id: "orphan", title: "THE ORPHAN", hidden: true, gate: {}, lines: ["NOBODY CAN SEE THIS."] });
    try {
      const problems = lintCampaign().filter((p) => p.rule === "ending-is-deliverable");
      expect(problems).toHaveLength(1);
      expect(problems[0]!.where).toBe("ending orphan");
      expect(problems[0]!.severity).toBe("error");
    } finally {
      list.pop();
    }
  });

  it("the rule fires on an ending that refines something that is not an ending", () => {
    const list = ENDINGS as { id: string; title: string; hidden: boolean; gate: unknown; lines: string[]; refines?: string }[];
    list.push({ id: "orphan", title: "THE ORPHAN", hidden: true, gate: {}, lines: ["NOBODY CAN SEE THIS."], refines: "not_an_ending" });
    try {
      const problems = lintCampaign().filter((p) => p.rule === "ending-refines-an-ending");
      expect(problems).toHaveLength(1);
      expect(problems[0]!.severity).toBe("error");
    } finally {
      list.pop();
    }
  });

  it("a chain of refinements ending in something written is deliverable; a cycle is not", () => {
    const list = ENDINGS as { id: string; title: string; hidden: boolean; gate: unknown; lines: string[]; refines?: string }[];
    list.push({ id: "deep", title: "DEEPER", hidden: true, gate: {}, lines: ["x"], refines: "wipe_fire" });
    try {
      expect(lintCampaign().filter((p) => p.rule === "ending-is-deliverable")).toEqual([]);
    } finally {
      list.pop();
    }
    list.push({ id: "loopA", title: "A", hidden: true, gate: {}, lines: ["x"], refines: "loopB" });
    list.push({ id: "loopB", title: "B", hidden: true, gate: {}, lines: ["x"], refines: "loopA" });
    try {
      expect(lintCampaign().filter((p) => p.rule === "ending-is-deliverable")).toHaveLength(2);
    } finally {
      list.pop();
      list.pop();
    }
  });
});
