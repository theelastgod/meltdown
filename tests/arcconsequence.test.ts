/**
 * A choice changes what a later mission IS, not only what someone says about it (Stage 663).
 *
 * Measured before this stage: `m2:informant` and `m5:lattice` were read by no later mission and no
 * ending. Sparing the docks informant and handing him to the Clockeaters produced the same mission
 * 4; blinding the whole sensor lattice and sparing the docks produced the same mission 6.
 *
 * These tests build the mission on a real World through `createMission`, the function the client
 * and the co-op room both call, and read what actually spawned and what the file is told to do —
 * not the manifest's variant list, which a runtime that ignored variants would leave intact.
 */
import { describe, expect, it } from "vitest";
import { World } from "../shared/sim/world";
import { levelById } from "../shared/sim/level";
import { createMission, missionView } from "../shared/campaign/runtime";
import { lintChoicesChangeTheArc, lintCampaign } from "../shared/campaign/lint";
import type { Testimony } from "../shared/campaign/testimony";
import { MISSIONS } from "../shared/campaign/missions";

/** Build a mission as the game does and report what the player actually gets. Threat 0, so only the mission's own presence spawns. */
function build(id: string, level: string, t: Testimony) {
  const world = new World(levelById(level), { ai: false, seed: 9 });
  const st = createMission(id, world, t, "cells", 0)!;
  expect(st, `${id} did not build`).toBeTruthy();
  return { st, wasps: st.spawned.wasps, kinds: st.objectives.map((o) => o.kind), texts: st.objectives.map((o) => ("text" in o ? o.text : "")), view: missionView(st) };
}

describe("a choice changes what a later mission is", () => {
  it("the campaign lint is clean, and the new rule finds nothing", () => {
    expect(lintChoicesChangeTheArc()).toEqual([]);
    expect(lintCampaign().filter((x) => x.severity === "error")).toEqual([]);
  });

  it("mission 4 is a different mission for a spared informant, a betrayed one, and neither", () => {
    const none = build("m4_the_leak", "deadletter_docks", {});
    const spare = build("m4_the_leak", "deadletter_docks", { "m2:informant": "spare" });
    const turn = build("m4_the_leak", "deadletter_docks", { "m2:informant": "turn" });

    // spared: a new objective the other two do not have — he left the sweep's ears at C
    expect(spare.kinds).toContain("destroy");
    expect(none.kinds).not.toContain("destroy");
    expect(turn.kinds).not.toContain("destroy");
    expect(spare.texts.join(" ")).toMatch(/SPEAKER AT C/);
    // and the fight after it is smaller, because the sweep is deaf
    const killCount = (b: typeof none) => (b.st.objectives.find((o) => o.kind === "kill") as { count: number }).count;
    expect(killCount(spare)).toBeLessThan(killCount(none));

    // turned: the routes he sold are live — more drones spawned, and more of them to clear
    expect(turn.wasps).toBe(none.wasps + 2);
    expect(killCount(turn)).toBeGreaterThan(killCount(none));
    expect(turn.texts.join(" ")).toMatch(/ROUTES HE SOLD/);

    // every version still delivers the Directive and still walks Ida Vessel home
    for (const b of [none, spare, turn]) {
      expect(b.kinds[0]).toBe("dialogue");
      expect(b.kinds).toContain("escort");
    }
  });

  it("mission 3 pays Marrow's debt to the file that turned the informant in, and to no other (Stage 671)", () => {
    const spare = build("m3_repo_volatility", "repo_depot", { "m2:informant": "spare" });
    const turn = build("m3_repo_volatility", "repo_depot", { "m2:informant": "turn" });
    const holdOf = (b: typeof spare) => b.st.objectives.find((o) => o.kind === "hold") as { seconds: number; waves: number };
    // the turned file walks to the switchgear first; the spared one goes straight to the plaza
    expect(turn.kinds[0]).toBe("reach");
    expect(turn.texts[0]).toMatch(/SWITCHGEAR OPEN AT D/);
    expect(spare.kinds[0]).toBe("hold");
    // and then holds the plaza in the dark for half as long, against fewer waves
    expect(holdOf(turn).seconds * 2).toBe(holdOf(spare).seconds);
    expect(holdOf(turn).waves).toBeLessThan(holdOf(spare).waves);
    // both still disable the mech and read the logs, so both reach the same choice
    for (const b of [spare, turn]) {
      expect(b.kinds).toContain("kill");
      expect(b.kinds[b.kinds.length - 1]).toBe("dialogue");
    }
  });

  it("mission 6 changes in kind for a file that spared the docks, and composes with the lease (Stage 676)", () => {
    const base = build("m6_trial_by_data", "repo_depot", {});
    const spare = build("m6_trial_by_data", "repo_depot", { "m5:lattice": "spare_docks" });
    const blind = build("m6_trial_by_data", "repo_depot", { "m5:lattice": "all" });
    // the docks' eye has to be cut first: a new objective the other two files never see
    expect(spare.kinds[0]).toBe("destroy");
    expect(spare.texts[0]).toMatch(/RELAY AT E/);
    expect(spare.kinds.slice(1)).toEqual(base.kinds);
    expect(base.kinds).not.toContain("destroy");
    expect(blind.kinds).not.toContain("destroy");
    // and it does not overwrite the lease variant's closing hold: both choices change the mission
    const leaseOnly = build("m6_trial_by_data", "repo_depot", { "m1:lease": "keep" });
    const both = build("m6_trial_by_data", "repo_depot", { "m1:lease": "keep", "m5:lattice": "spare_docks" });
    expect(both.texts.slice(1)).toEqual(leaseOnly.texts);
    expect(both.texts[0]).toMatch(/RELAY AT E/);
  });

  it("the campaign lint reads what a variant prepends: a relay at a node the district lacks is an error", () => {
    const m6 = MISSIONS.find((m) => m.id === "m6_trial_by_data")!;
    const v = m6.variants!.find((x) => x.prepend)!;
    const saved = v.prepend![0]!;
    try {
      v.prepend![0] = { ...(saved as Extract<typeof saved, { kind: "destroy" }>), spots: [{ node: "Q" }] };
      expect(lintCampaign().some((x) => x.rule === "spot-names-a-node" && /node Q/.test(x.detail))).toBe(true);
    } finally {
      v.prepend![0] = saved;
    }
  });

  it("the harder fight can still be won: the betrayed sweep never asks for more drones than it spawns", () => {
    const turn = build("m4_the_leak", "deadletter_docks", { "m2:informant": "turn" });
    const need = (turn.st.objectives.find((o) => o.kind === "kill") as { count: number }).count;
    expect(turn.wasps, "a kill objective asking for more wasps than exist cannot be finished").toBeGreaterThanOrEqual(need);
  });

  it("mission 6 draws two fewer drones for a city blinded whole, and that composes with the lease variant", () => {
    const base = build("m6_trial_by_data", "repo_depot", {});
    const blind = build("m6_trial_by_data", "repo_depot", { "m5:lattice": "all" });
    const docks = build("m6_trial_by_data", "repo_depot", { "m5:lattice": "spare_docks" });
    expect(blind.wasps).toBe(base.wasps - 2);
    expect(docks.wasps).toBe(base.wasps);

    // both variants open at once: the lease's objectives survive AND the lattice's drones stay away,
    // because the lattice variant carries wasps only and never overwrites objectives
    const both = build("m6_trial_by_data", "repo_depot", { "m1:lease": "keep", "m5:lattice": "all" });
    const leaseOnly = build("m6_trial_by_data", "repo_depot", { "m1:lease": "keep" });
    expect(both.texts).toEqual(leaseOnly.texts);
    expect(both.texts.join(" ")).toMatch(/LEASE FILE IS GOING OUT/);
    expect(both.wasps).toBe(leaseOnly.wasps - 2);
  });
});
