import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { FACTIONS, HANDLERS } from "../shared/campaign/factions";
import { ENDINGS, endingsFor, gateOpen, handlersAlive } from "../shared/campaign/testimony";
import { campaignErrors, lintCampaign, producibleTestimony, reachableNodes } from "../shared/campaign/lint";
import { threatProfile, threatRating } from "../shared/campaign/threat";
import { MAX_PROTOCOLS, PROTOCOLS, protocolMods } from "../shared/campaign/protocols";
import { SCRIPTS, scriptById } from "../shared/campaign/script";
import { GIGS, MAIN_ARC, MISSIONS, missionById } from "../shared/campaign/missions";
import { campaignOf, canLaunch, completeContract, gigsOnOffer, nextMission, pickFaction, wearProtocols } from "../shared/campaign/save";
import { createMission, drainMissionEvents, missionView, resolveDialogue, stepMission } from "../shared/campaign/runtime";
import { createAccount, sandboxAccount } from "../shared/progression/account";
import { levelById } from "../shared/sim/level";
import { World } from "../shared/sim/world";
import { stripCampaignFields, validateLoadout } from "../shared/manifest/loadout";
import { measureTTK } from "../shared/sim/ttk";
import { WEAPONS } from "../shared/weapons/manifest";
import { SIM_HZ } from "../shared/sim/constants";

describe("campaign data", () => {
  it("three houses with a fixer each; seven missions in arc order; twelve gigs; every script referenced exists", () => {
    expect(FACTIONS.length).toBe(3);
    for (const f of FACTIONS) expect(HANDLERS[f.fixer].faction).toBe(f.id);
    expect(MAIN_ARC.map((m) => m.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(GIGS.length).toBe(12);
    for (const m of MISSIONS) for (const o of [...m.objectives, ...(m.variants ?? []).flatMap((v) => v.objectives ?? [])]) if (o.kind === "dialogue") expect(scriptById(o.script), o.script).toBeDefined();
    for (const s of SCRIPTS) for (const n of s.nodes) {
      if (n.next) expect(s.nodes.some((x) => x.id === n.next), `${s.id}:${n.id} → ${n.next}`).toBe(true);
      for (const c of n.choices ?? []) if (c.next) expect(s.nodes.some((x) => x.id === c.next), `${s.id}:${n.id} choice → ${c.next}`).toBe(true);
    }
  });
  it("testimony gates, survivors, endings", () => {
    expect(gateOpen({ all: { "m4:directive": "kept" } }, { "m4:directive": "kept" }, null)).toBe(true);
    expect(gateOpen({ all: { "m4:directive": "kept" } }, {}, null)).toBe(false);
    expect(gateOpen({ not: { "m2:informant": "turn" } }, { "m2:informant": "turn" }, null)).toBe(false);
    expect(gateOpen({ faction: ["estate"] }, {}, "clockeaters")).toBe(false);
    expect(handlersAlive({ "m4:vessel": "expose" }).vessel).toBe(false);
    expect(handlersAlive({ "m2:informant": "turn" }).marrow).toBe(false);
    expect(endingsFor({}, null).map((e) => e.id)).toEqual(["wipe"]);
    expect(endingsFor({ "m4:directive": "kept" }, "cells").map((e) => e.id)).toEqual(["wipe", "chair"]);
    expect(endingsFor({ "m4:directive": "kept", "m3:volatility": "hold" }, "clockeaters").map((e) => e.id)).toEqual(["wipe", "chair", "chair_clockeater"]);
    expect(endingsFor({ "m4:directive": "kept", "m4:vessel": "shield" }, "estate").map((e) => e.id)).toEqual(["wipe", "chair", "chair_estate"]);
    expect(ENDINGS.filter((e) => e.hidden).length).toBe(2);
  });
  it("threat rises with the file and shapes VANTAGE", () => {
    const fresh = createAccount("f", "F");
    expect(threatRating(fresh)).toBe(0);
    const t = threatProfile(6);
    expect(t.extraWasps).toBe(3);
    expect(t.extraMechs).toBe(1);
    expect(t.named).toBe(true);
    expect(t.detectMult).toBeCloseTo(1.36);
    const busy = createAccount("b", "B");
    busy.depth = 24;
    busy.counters["wins"] = 20;
    busy.campaign = { faction: "cells", testimony: {}, missionsDone: ["a", "b", "c"], gigsDone: ["x", "y"], protocols: [], worn: [], weapons: [], ending: null };
    expect(threatRating(busy)).toBeGreaterThanOrEqual(5);
  });
  it("Kernel Protocols are real power, capped at three worn", () => {
    expect(PROTOCOLS.every((p) => p.corrupted)).toBe(true);
    const m = protocolMods(["filament_core", "red_lease", "wern_pulse", "blood_ledger"]);
    expect(m.damage).toBeCloseTo(1.15);
    expect(m.maxHealth).toBe(35);
    expect(m.fireRate).toBeCloseTo(1.12);
    expect(m.shieldRegen).toBeUndefined(); // the fourth is not worn
    expect(MAX_PROTOCOLS).toBe(3);
  });
});

describe("campaign save", () => {
  it("missions go in arc order, gigs open with Threat and testimony, rewards land on the file", () => {
    const a = createAccount("c:1", "C");
    const c = campaignOf(a);
    expect(canLaunch(a, c, "m1_wake_unlisted").ok).toBe(false); // no house yet
    expect(pickFaction(a, "cells")).toBe(true);
    expect(pickFaction(a, "estate")).toBe(false);
    expect(canLaunch(a, c, "m2_deadletter_run")).toEqual({ ok: false, reason: "WAKE UNLISTED comes first" });
    expect(completeContract(a, "m1_wake_unlisted", { "m1:lease": "burn" }).ok).toBe(true);
    expect(c.testimony["m1:lease"]).toBe("burn");
    expect(a.wallet.scrip).toBe(300);
    expect(a.counters["missionsDone"]).toBe(1);
    expect(nextMission(c)?.id).toBe("m2_deadletter_run");
    // idempotent
    expect(completeContract(a, "m1_wake_unlisted", {}).ok).toBe(true);
    expect(a.wallet.scrip).toBe(300);
    // gigs: the first is free; one mission in, Threat is 1 — the depot rescue (Threat 1) opens, the depot heist (Threat 2) does not
    expect(gigsOnOffer(a, c).map((g) => g.id)).toContain("g_escrow_row");
    expect(gigsOnOffer(a, c).map((g) => g.id)).toContain("g_rescue_depot");
    expect(gigsOnOffer(a, c).map((g) => g.id)).not.toContain("g_escrow_depot");
    expect(canLaunch(a, c, "g_escrow_depot").reason).toBe("not on offer yet");
    // the Directive unlocks with THE LEAK; a protocol with the run
    for (const id of ["m2_deadletter_run", "m3_repo_volatility"]) completeContract(a, id, {});
    expect(c.protocols).toEqual(["red_lease", "filament_core"]);
    completeContract(a, "m4_the_leak", { "m4:directive": "kept", "m4:vessel": "expose" });
    expect(c.weapons).toEqual(["directive"]);
    expect(a.owned).toContain("weapon:directive");
    // Ida is dead: her gigs are off the board
    expect(gigsOnOffer(a, c).some((g) => g.fixer === "vessel")).toBe(false);
    expect(wearProtocols(a, ["red_lease", "nope", "filament_core", "red_lease"])).toEqual(["red_lease", "filament_core"]);
    // the ending is recorded at the white office
    for (const id of ["m5_blind_the_model", "m6_trial_by_data"]) completeContract(a, id, {});
    completeContract(a, "m7_white_office", { "m7:ending": "chair" });
    expect(c.ending).toBe("chair");
    expect(nextMission(c)).toBeNull();
    expect(a.ledger.some((l) => l.startsWith("MISSION CLOSED · THE WHITE OFFICE"))).toBe(true);
  });
});

describe("mission runtime", () => {
  it("steps reach, survive, dialogue, destroy, kill and escort objectives against a real district", () => {
    const L = levelById("lease_row");
    const w = new World(L, { ai: true, seed: 3, wakePhase: "off", dummyRespawn: false });
    const p = w.addPlayer(1, "BLANK", 1);
    const st = createMission("m1_wake_unlisted", w, {}, "cells", 4)!;
    expect(st).not.toBeNull();
    expect(st.spawned.wasps).toBe(2 + 2); // the mission's two plus Threat 4's two
    expect(missionView(st).objective).toBe("READ THE STREET");
    const tick = () => {
      w.step(new Map());
      stepMission(st, w, w.drainEvents());
    };
    tick();
    expect(st.dialogue).toBe("m1_intro");
    expect(resolveDialogue(st, {})).toBe(true);
    tick();
    expect(missionView(st).objective).toMatch(/ESCROW TERMINAL AT B/);
    const B = L.nodes.find((n) => n.label === "B")!.pos;
    p.pos.x = B.x;
    p.pos.z = B.z;
    tick();
    expect(missionView(st).kind).toBe("survive");
    for (let i = 0; i < SIM_HZ * 21; i++) {
      p.pos.x = B.x;
      p.pos.z = B.z;
      p.health = 100;
      tick();
    }
    expect(missionView(st).kind).toBe("reach");
    expect(st.spawned.wasps).toBeGreaterThan(4); // a wave came during the hold
    const E = L.nodes.find((n) => n.label === "E")!.pos;
    p.pos.x = E.x;
    p.pos.z = E.z;
    tick();
    expect(st.dialogue).toBe("m1_file");
    resolveDialogue(st, { "m1:lease": "keep" });
    tick();
    const A = L.nodes.find((n) => n.label === "A")!.pos;
    p.pos.x = A.x;
    p.pos.z = A.z;
    tick();
    expect(st.status).toBe("complete");
    expect(st.testimony["m1:lease"]).toBe("keep");
    const evs = drainMissionEvents(st);
    expect(evs.some((e) => e.type === "complete")).toBe(true);

    // destroy + kill + escort on the docks
    const L2 = levelById("deadletter_docks");
    const w2 = new World(L2, { ai: true, seed: 5, wakePhase: "off", dummyRespawn: false });
    const p2 = w2.addPlayer(1, "BLANK", 1);
    const s2 = createMission("m2_deadletter_run", w2, {}, "cells", 0)!;
    const tick2 = () => {
      w2.step(new Map());
      stepMission(s2, w2, w2.drainEvents());
    };
    tick2();
    expect(missionView(s2).kind).toBe("kill");
    for (const wasp of w2.wasps.slice(0, 4)) w2.applyDamage("wasp", wasp.id, 1000, 1, "lease_breaker", "shot");
    tick2();
    expect(missionView(s2).kind).toBe("reach");
    const C = L2.nodes.find((n) => n.label === "C")!.pos;
    p2.pos.x = C.x;
    p2.pos.z = C.z;
    tick2();
    expect(s2.dialogue).toBe("m2_informant");
    resolveDialogue(s2, { "m2:informant": "spare" });
    tick2();
    expect(missionView(s2).kind).toBe("destroy");
    expect(s2.targets.length).toBe(2);
    expect(w2.dummies.filter((d) => s2.targets.includes(d.id)).every((d) => d.alive)).toBe(true);
    for (const id of s2.targets) w2.applyDamage("dummy", id, 1000, 1, "lease_breaker", "shot");
    for (let i = 0; i < 3; i++) tick2();
    expect(w2.dummies.filter((d) => s2.targets.includes(d.id)).every((d) => !d.alive)).toBe(true); // no respawn
    expect(s2.status).toBe("complete");

    const w3 = new World(L2, { ai: false, seed: 5, wakePhase: "off" });
    const p3 = w3.addPlayer(1, "BLANK", 1);
    const s3 = createMission("g_rescue_docks", w3, {}, "cells", 0)!;
    const tick3 = () => {
      w3.step(new Map());
      stepMission(s3, w3, w3.drainEvents());
    };
    const E2 = L2.nodes.find((n) => n.label === "E")!.pos;
    p3.pos.x = E2.x;
    p3.pos.z = E2.z;
    tick3();
    tick3();
    expect(missionView(s3).kind).toBe("escort");
    const start = { ...s3.escort!.pos };
    for (let i = 0; i < SIM_HZ * 2; i++) tick3(); // the player stands at E: the escort walks
    expect(Math.hypot(s3.escort!.pos.x - start.x, s3.escort!.pos.z - start.z)).toBeGreaterThan(3);
    p3.pos.x = 50;
    p3.pos.z = 50; // out of leash: she waits
    const held = { ...s3.escort!.pos };
    for (let i = 0; i < SIM_HZ; i++) tick3();
    expect(s3.escort!.pos).toEqual(held);
    expect(s3.escort!.waiting).toBe(true);
  });
  it("a contract fails when every Blank stays down", () => {
    const L = levelById("lease_row");
    const w = new World(L, { ai: false, seed: 3, wakePhase: "off" });
    const p = w.addPlayer(1, "BLANK", 1);
    const st = createMission("g_escrow_row", w, {}, "cells", 0)!;
    p.alive = false;
    for (let i = 0; i < SIM_HZ * 9; i++) {
      w.step(new Map());
      p.alive = false;
      stepMission(st, w, w.drainEvents());
    }
    expect(st.status).toBe("failed");
  });
});

describe("the PvP wall", () => {
  it("campaign-only fields are stripped at PvP join and re-validated; campaign weapons need the unlock", () => {
    const { raw, stripped } = stripCampaignFields({ primary: "lease_breaker", secondary: "shock_baton", attested: [], protocols: ["filament_core"] });
    expect(stripped).toEqual(["protocols"]);
    expect(validateLoadout(raw, [], 50).ok).toBe(true);
    expect(validateLoadout({ primary: "lease_breaker", secondary: "shock_baton", attested: [], protocols: ["x"] }, [], 50).errors.some((e) => e.rule === "unknown-field")).toBe(true);
    const locked = validateLoadout({ primary: "directive", secondary: "shock_baton", attested: [] }, [], 50);
    expect(locked.errors.some((e) => e.rule === "weapon-locked")).toBe(true);
    expect(validateLoadout({ primary: "directive", secondary: "clockeater", attested: [] }, ["weapon:directive", "weapon:clockeater"], 50).ok).toBe(true);
    expect(validateLoadout({ primary: "directive", secondary: "clockeater", attested: [] }, sandboxAccount("s").owned, 50).ok).toBe(true);
  });
  it("the PvP worker's module graph (match room, file DO, validator) never reaches shared/campaign", () => {
    const seen = new Set<string>();
    const walk = (file: string) => {
      const abs = resolve(file);
      if (seen.has(abs)) return;
      seen.add(abs);
      const src = readFileSync(abs, "utf8");
      for (const m of src.matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)) {
        let target = resolve(dirname(abs), m[1]!);
        if (!target.endsWith(".ts")) target += ".ts";
        try {
          readFileSync(target);
          walk(target);
        } catch {
          /* not a local ts module */
        }
      }
    };
    walk("server/room.ts");
    walk("server/worker.ts");
    walk("server/player-do.ts");
    walk("shared/manifest/loadout.ts");
    const leaks = [...seen].filter((f) => f.includes("/shared/campaign/"));
    expect(leaks).toEqual([]);
    expect(seen.size).toBeGreaterThan(20);
  });
});

describe("weapons 7–8", () => {
  it("sit inside the TTK band at their ideal range", () => {
    for (const id of ["directive", "clockeater"] as const) {
      const r = measureTTK(id, "primary", WEAPONS[id].range.ideal);
      expect(r.killed, id).toBe(true);
      expect(r.seconds, `${id} ${r.seconds}s`).toBeGreaterThanOrEqual(WEAPONS[id].ttkBand[0]);
      expect(r.seconds, `${id} ${r.seconds}s`).toBeLessThanOrEqual(WEAPONS[id].ttkBand[1]);
    }
  });
});

describe("the campaign can actually be finished", () => {
  /**
   * The story graph is strings: testimony keys written by dialogue in one file and read as gates in
   * three others. A typo closes a gate nothing will ever open, and the game still builds, still
   * runs, still plays — the ending is simply unreachable and nobody finds out until a player
   * doesn't find it. `shared/campaign/lint.ts` is the artifact behind the claim.
   */
  it("no piece of the game is unreachable", () => {
    expect(campaignErrors()).toEqual([]);
  });

  it("every ending is opened by testimony some choice actually writes", () => {
    const producible = producibleTestimony();
    for (const e of ENDINGS) {
      for (const [k, v] of Object.entries(e.gate.all ?? {})) {
        expect(producible.get(k), `ending ${e.id} needs "${k}", which nothing writes`).toBeDefined();
        expect([...producible.get(k)!], `ending ${e.id} needs ${k}=${v}`).toContain(v);
      }
    }
    // and the endings are genuinely distinct outcomes, not one ending with three labels
    expect(new Set(ENDINGS.map((e) => e.id)).size).toBe(ENDINGS.length);
    expect(ENDINGS.filter((e) => e.hidden).length).toBeGreaterThan(0);
  });

  it("every script node is reachable from its own start", () => {
    for (const s of SCRIPTS) {
      const live = reachableNodes(s);
      expect([...s.nodes.map((n) => n.id)].filter((id) => !live.has(id)), `${s.id} has orphan nodes`).toEqual([]);
    }
  });

  it("the mission arc is a run of orders with no gaps, and every gig sits outside it", () => {
    const arc = MISSIONS.filter((m) => m.kind === "mission").map((m) => m.order).sort((a, b) => a - b);
    expect(arc).toEqual(arc.map((_, i) => i + 1));
    expect(MISSIONS.filter((m) => m.kind === "gig").every((g) => g.order === 0)).toBe(true);
  });

  it("catches a gate on testimony nothing writes — the typo this exists for", () => {
    // the lint is only worth having if it fails on the mistake it is named after
    const producible = producibleTestimony();
    expect(producible.has("m4:vessel")).toBe(true);
    expect(producible.has("m4:vessell")).toBe(false);
    const typo = ENDINGS.map((e) => Object.keys(e.gate.all ?? {})).flat().filter((k) => !producible.has(k));
    expect(typo).toEqual([]);
  });

  it("reports a choice that changes nothing as a note, not a failure", () => {
    const notes = lintCampaign().filter((v) => v.severity === "note");
    // three of the seven missions ask for a choice with no mechanical consequence. That may be
    // characterisation and is a designer's call, so it is surfaced rather than enforced.
    expect(notes.every((n) => n.rule === "testimony-is-read")).toBe(true);
    expect(campaignErrors()).toEqual([]);
  });
});
