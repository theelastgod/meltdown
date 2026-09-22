/**
 * A hold names a place (Stage 180).
 *
 * m1's "HOLD THE TERMINAL WHILE THE FILE DECRYPTS" had no `at`. stepMission treats a missing at as
 * "everywhere", so the 20 s timer ran in Lease Row's plaza, the wave spawned on the player, and
 * syncFx drew no marker. Measured: walk to B, start the hold, teleport to A, wait 21 s — the
 * objective advanced to "TAKE THE FILE FROM THE CABINET AT E" with the player never at the terminal.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { holdClock } from "../client/campaign";
import { World } from "../shared/sim/world";
import { levelById } from "../shared/sim/level";
import { createMission, missionView, resolveDialogue, stepMission } from "../shared/campaign/runtime";
import { MISSIONS } from "../shared/campaign/missions";
import { lintCampaign, lintHoldsAreAnchored } from "../shared/campaign/lint";
import { SIM_HZ } from "../shared/sim/constants";

function toSurvive() {
  const L = levelById("lease_row");
  const w = new World(L, { ai: true, seed: 3, wakePhase: "off", dummyRespawn: false });
  const p = w.addPlayer(1, "BLANK", 1);
  const st = createMission("m1_wake_unlisted", w, {}, "cells", 4)!;
  const tick = () => {
    w.step(new Map());
    stepMission(st, w, w.drainEvents());
  };
  tick();
  resolveDialogue(st, {});
  tick();
  const B = L.nodes.find((n) => n.label === "B")!.pos;
  p.pos.x = B.x;
  p.pos.z = B.z;
  tick();
  expect(missionView(st).kind, "did not reach the hold").toBe("survive");
  return { L, w, p, st, tick, B };
}

describe("m1's hold is at the terminal", () => {
  it("the timer does not run across the district", () => {
    const { L, p, st, tick } = toSurvive();
    const A = L.nodes.find((n) => n.label === "A")!.pos;
    p.pos.x = A.x;
    p.pos.z = A.z;
    const start = st.progress;
    for (let i = 0; i < SIM_HZ * 21; i++) {
      p.health = 100;
      tick();
    }
    expect(missionView(st).kind, "the file decrypted while the player was at A").toBe("survive");
    expect(st.progress, "progress accrued away from B").toBeCloseTo(start, 5);
  });

  it("standing at B for 20 s does decrypt it", () => {
    const { p, B, st, tick } = toSurvive();
    for (let i = 0; i < SIM_HZ * 21; i++) {
      p.pos.x = B.x;
      p.pos.z = B.z;
      p.health = 100;
      tick();
    }
    expect(missionView(st).kind).toBe("reach");
    expect(missionView(st).objective).toMatch(/CABINET AT E/);
  });

  it("the wave spawns at the terminal, not on the player", () => {
    const { L, w, p, st, tick, B } = toSurvive();
    const A = L.nodes.find((n) => n.label === "A")!.pos;
    p.pos.x = A.x;
    p.pos.z = A.z;
    const wasps0 = w.wasps.length;
    // progress only while at B, so stand there just long enough for the wave (every = 20/2 = 10 s)
    p.pos.x = B.x;
    p.pos.z = B.z;
    for (let i = 0; i < SIM_HZ * 11; i++) {
      p.health = 100;
      tick();
    }
    expect(st.wavesSpawned).toBe(1);
    expect(w.wasps.length).toBeGreaterThan(wasps0);
    const spawned = w.wasps.slice(wasps0);
    for (const wasp of spawned) {
      const d = Math.hypot(wasp.pos.x - B.x, wasp.pos.z - B.z);
      expect(d, "a wave wasp spawned on the player at A instead of at B").toBeLessThan(12);
    }
  });
});

describe("every survive/hold names a place", () => {
  it("the shipped table has none without at", () => {
    expect(lintHoldsAreAnchored()).toEqual([]);
    const loose = MISSIONS.flatMap((m) => [...m.objectives, ...(m.variants ?? []).flatMap((v) => v.objectives ?? [])]).filter((o) => (o.kind === "survive" || o.kind === "hold") && !("at" in o && o.at));
    expect(loose.map((o) => o.text)).toEqual([]);
  });

  it("and the rule fires through lintCampaign, not only by name", () => {
    const m1 = MISSIONS.find((m) => m.id === "m1_wake_unlisted")!;
    const hold = m1.objectives.find((o) => o.kind === "survive") as Extract<(typeof m1.objectives)[number], { kind: "survive" }>;
    const keep = hold.at;
    delete (hold as { at?: unknown }).at;
    try {
      const named = lintHoldsAreAnchored().filter((v) => v.rule === "hold-is-anchored");
      expect(named.length).toBeGreaterThan(0);
      const through = lintCampaign().filter((v) => v.rule === "hold-is-anchored");
      expect(through, "the rule is not reachable through lintCampaign").toHaveLength(named.length);
      expect(through[0]!.where).toMatch(/m1_wake_unlisted/);
    } finally {
      hold.at = keep;
    }
  });
});

describe("the hold/survive clock", () => {
  it("suffixes seconds as S, not 12s / 20s", () => {
    expect(holdClock(12.9, 20)).toBe("12S / 20S");
    expect(holdClock(0, 20)).toBe("0S / 20S");
    expect(holdClock(12.9, 20)).not.toBe("12s / 20s");
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/holdClock\(v\.progress, v\.need\)/);
    expect(src).not.toMatch(/Math\.floor\(v\.progress\)\}s \/ \$\{v\.need\}s/);
  });
});

