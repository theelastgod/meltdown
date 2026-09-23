import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { FACTIONS, factionName, HANDLERS } from "../shared/campaign/factions";
import { ENDINGS, endingsFor, gateOpen, handlersAlive, testimonyKey, testimonyLine, type Testimony } from "../shared/campaign/testimony";
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
  it("the contracts panel does not print the mN: prefix the file stores", () => {
    expect(testimonyKey("m1:lease")).toBe("lease");
    expect(testimonyKey("m7:ending")).toBe("ending");
    expect(testimonyKey("m1:lease")).not.toBe("m1:lease");
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/testimonyLine\(k, v\)/);
    expect(src).not.toMatch(/k\.replace\(\/\^m\\\\d:\/,/);
  });
  it("TESTIMONY prints CRT tokens, not snake_case", () => {
    expect(testimonyLine("m1:lease", "burn")).toBe("LEASE=BURN");
    expect(testimonyLine("m5:lattice", "spare_docks")).toBe("LATTICE=SPARE DOCKS");
    expect(testimonyLine("m1:lease", "burn")).not.toBe("lease=burn");
    expect(testimonyLine("m7:ending", "chair_clockeater")).toBe("ENDING=THE CLOCKEATER'S CHAIR");
    expect(testimonyLine("m7:ending", "chair_clockeater")).not.toBe("ENDING=CHAIR CLOCKEATER");
    const src = readFileSync(new URL("../shared/campaign/testimony.ts", import.meta.url), "utf8");
    expect(src).toMatch(/endingTitle\(v\)/);
  });
  it("testimony gates, survivors, endings", () => {
    expect(gateOpen({ all: { "m4:directive": "kept" } }, { "m4:directive": "kept" }, null)).toBe(true);
    expect(gateOpen({ all: { "m4:directive": "kept" } }, {}, null)).toBe(false);
    expect(gateOpen({ not: { "m2:informant": "turn" } }, { "m2:informant": "turn" }, null)).toBe(false);
    expect(gateOpen({ faction: ["estate"] }, {}, "clockeaters")).toBe(false);
    expect(handlersAlive({ "m4:vessel": "expose" }).vessel).toBe(false);
    expect(handlersAlive({ "m2:informant": "turn" }).marrow, "turning the informant in is not a death scene").toBe(true);
    expect(endingsFor({}, null).map((e) => e.id)).toEqual(["wipe"]);
    expect(endingsFor({ "m4:directive": "kept" }, "cells").map((e) => e.id)).toEqual(["wipe", "chair"]);
    expect(endingsFor({ "m4:directive": "kept", "m3:volatility": "hold" }, "clockeaters").map((e) => e.id)).toEqual(["wipe", "chair", "chair_clockeater"]);
    expect(endingsFor({ "m4:directive": "kept", "m4:vessel": "shield" }, "estate").map((e) => e.id)).toEqual(["wipe", "chair", "chair_estate"]);
    expect(ENDINGS.filter((e) => e.hidden).length).toBe(4);
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
    for (let r = 0; r <= 10; r++) {
      const p = threatProfile(r);
      if (/REPO MECH/.test(p.line)) expect(p.extraMechs, `Threat ${r} announced a mech and spawned ${p.extraMechs}`).toBeGreaterThan(0);
    }
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

  it("WERN PULSE's protocol line is CRT, not fire rate", () => {
    const src = readFileSync(new URL("../shared/campaign/protocols.ts", import.meta.url), "utf8");
    const line = PROTOCOLS.find((p) => p.id === "wern_pulse")!.line;
    expect(line).toBe("+12% FIRE RATE, +10% RELOAD. THE RHYTHM OF THE DIRECTIVE.");
    expect(line).not.toBe("+12% fire rate, +10% reload. The rhythm of the Directive.");
    expect(src).toMatch(/p\("wern_pulse", "WERN PULSE", "\+12% FIRE RATE, \+10% RELOAD\. THE RHYTHM OF THE DIRECTIVE\."/);
    expect(src).not.toMatch(/p\("wern_pulse", "WERN PULSE", "\+12% fire rate, \+10% reload\. The rhythm of the Directive\."/);
  });

  it("FILAMENT CORE's protocol line is CRT, not the filament runs down the barrel", () => {
    const src = readFileSync(new URL("../shared/campaign/protocols.ts", import.meta.url), "utf8");
    const line = PROTOCOLS.find((p) => p.id === "filament_core")!.line;
    expect(line).toBe("+15% DAMAGE. THE FILAMENT RUNS DOWN THE BARREL AND INTO YOUR WRIST.");
    expect(line).not.toBe("+15% damage. The filament runs down the barrel and into your wrist.");
    expect(src).toMatch(/p\("filament_core", "FILAMENT CORE", "\+15% DAMAGE\. THE FILAMENT RUNS DOWN THE BARREL AND INTO YOUR WRIST\."/);
    expect(src).not.toMatch(/p\("filament_core", "FILAMENT CORE", "\+15% damage\. The filament runs down the barrel and into your wrist\."/);
  });

  it("RED LEASE's protocol line is CRT, not Wern's ink", () => {
    const src = readFileSync(new URL("../shared/campaign/protocols.ts", import.meta.url), "utf8");
    const line = PROTOCOLS.find((p) => p.id === "red_lease")!.line;
    expect(line).toBe("+35 HEALTH. YOUR FILE IS WRITTEN IN WERN'S INK NOW.");
    expect(line).not.toBe("+35 health. Your file is written in Wern's ink now.");
    expect(src).toMatch(/p\("red_lease", "RED LEASE", "\+35 HEALTH\. YOUR FILE IS WRITTEN IN WERN'S INK NOW\."/);
    expect(src).not.toMatch(/p\("red_lease", "RED LEASE", "\+35 health\. Your file is written in Wern's ink now\."/);
  });

  it("BLOOD LEDGER's protocol line is CRT, not shield regen", () => {
    const src = readFileSync(new URL("../shared/campaign/protocols.ts", import.meta.url), "utf8");
    const line = PROTOCOLS.find((p) => p.id === "blood_ledger")!.line;
    expect(line).toBe("SHIELD REGEN ×1.5. THE MODEL HEALS WHAT IT PRICES.");
    expect(line).not.toBe("shield regen ×1.5. The model heals what it prices.");
    expect(src).toMatch(/p\("blood_ledger", "BLOOD LEDGER", "SHIELD REGEN ×1\.5\. THE MODEL HEALS WHAT IT PRICES\."/);
    expect(src).not.toMatch(/p\("blood_ledger", "BLOOD LEDGER", "shield regen ×1\.5\. The model heals what it prices\."/);
  });

  it("DIRECTIVE OPTIC's protocol line is CRT, not +15% range", () => {
    const src = readFileSync(new URL("../shared/campaign/protocols.ts", import.meta.url), "utf8");
    const line = PROTOCOLS.find((p) => p.id === "directive_optic")!.line;
    expect(line).toBe("+15% RANGE, +20% HEADSHOT MULTIPLIER. SEE THE CITY THE WAY THE KERNEL DOES.");
    expect(line).not.toBe("+15% range, +20% headshot multiplier. See the city the way the Kernel does.");
    expect(src).toMatch(/p\("directive_optic", "DIRECTIVE OPTIC", "\+15% RANGE, \+20% HEADSHOT MULTIPLIER\. SEE THE CITY THE WAY THE KERNEL DOES\."/);
    expect(src).not.toMatch(/p\("directive_optic", "DIRECTIVE OPTIC", "\+15% range, \+20% headshot multiplier\. See the city the way the Kernel does\."/);
  });

  it("WAKE UNLISTED's brief is CRT, not steal your own lease file", () => {
    const src = readFileSync(new URL("../shared/campaign/missions.ts", import.meta.url), "utf8");
    const brief = MISSIONS.find((m) => m.id === "m1_wake_unlisted")!.brief;
    expect(brief).toBe("STEAL YOUR OWN LEASE FILE FROM THE ESCROW TERMINAL AT THE B INTERSECTION. FIND OUT WHY YOU WERE FLAGGED.");
    expect(brief).not.toBe("Steal your own lease file from the escrow terminal at the B intersection. Find out why you were flagged.");
    expect(src).toMatch(/brief: "STEAL YOUR OWN LEASE FILE FROM THE ESCROW TERMINAL AT THE B INTERSECTION\. FIND OUT WHY YOU WERE FLAGGED\."/);
    expect(src).not.toMatch(/brief: "Steal your own lease file from the escrow terminal at the B intersection\. Find out why you were flagged\."/);
  });

  it("DEADLETTER RUN's brief is CRT, not work the docks", () => {
    const src = readFileSync(new URL("../shared/campaign/missions.ts", import.meta.url), "utf8");
    const brief = MISSIONS.find((m) => m.id === "m2_deadletter_run")!.brief;
    expect(brief).toBe("WORK THE DOCKS. CLEAR THE DRONE PATROLS OFF THE WAKE CELL'S ROUTES AND FIND THE INFORMANT AT C.");
    expect(brief).not.toBe("Work the docks. Clear the drone patrols off the wake cell's routes and find the informant at C.");
    expect(src).toMatch(/brief: "WORK THE DOCKS\. CLEAR THE DRONE PATROLS OFF THE WAKE CELL'S ROUTES AND FIND THE INFORMANT AT C\."/);
    expect(src).not.toMatch(/brief: "Work the docks\. Clear the drone patrols off the wake cell's routes and find the informant at C\."/);
  });

  it("VARIANCE's brief is CRT, not pull the depot's logs", () => {
    const src = readFileSync(new URL("../shared/campaign/missions.ts", import.meta.url), "utf8");
    const brief = MISSIONS.find((m) => m.id === "m3_repo_volatility")!.brief;
    expect(brief).toBe("PULL THE DEPOT'S LOGS. HOLD THE PLAZA WHILE THEY COPY, AND DISABLE THE MECH VANTAGE SENDS TO STOP YOU.");
    expect(brief).not.toBe("Pull the depot's logs. Hold the plaza while they copy, and disable the mech VANTAGE sends to stop you.");
    expect(src).toMatch(/brief: "PULL THE DEPOT'S LOGS\. HOLD THE PLAZA WHILE THEY COPY, AND DISABLE THE MECH VANTAGE SENDS TO STOP YOU\."/);
    expect(src).not.toMatch(/brief: "Pull the depot's logs\. Hold the plaza while they copy, and disable the mech VANTAGE sends to stop you\."/);
  });

  it("THE LEAK's brief is CRT, not an Estate defector", () => {
    const src = readFileSync(new URL("../shared/campaign/missions.ts", import.meta.url), "utf8");
    const brief = MISSIONS.find((m) => m.id === "m4_the_leak")!.brief;
    expect(brief).toBe("AN ESTATE DEFECTOR HANDS YOU THE DIRECTIVE. WALK HER FROM B TO D UNDER A VANTAGE SWEEP WHILE WERN ARGUES HIS CASE.");
    expect(brief).not.toBe("An Estate defector hands you the Directive. Walk her from B to D under a VANTAGE sweep while Wern argues his case.");
    expect(src).toMatch(/brief: "AN ESTATE DEFECTOR HANDS YOU THE DIRECTIVE\. WALK HER FROM B TO D UNDER A VANTAGE SWEEP WHILE WERN ARGUES HIS CASE\."/);
    expect(src).not.toMatch(/brief: "An Estate defector hands you the Directive\. Walk her from B to D under a VANTAGE sweep while Wern argues his case\."/);
  });

  it("BLIND THE MODEL's brief is CRT, not destroy the sensor lattice", () => {
    const src = readFileSync(new URL("../shared/campaign/missions.ts", import.meta.url), "utf8");
    const brief = MISSIONS.find((m) => m.id === "m5_blind_the_model")!.brief;
    expect(brief).toBe("DESTROY THE SENSOR LATTICE DISTRICT BY DISTRICT. VANTAGE RESPONDS LIKE AN IMMUNE SYSTEM — THE HARDEST COMBAT IN THE ARC.");
    expect(brief).not.toBe("Destroy the sensor lattice district by district. VANTAGE responds like an immune system — the hardest combat in the arc.");
    expect(src).toMatch(/brief: "DESTROY THE SENSOR LATTICE DISTRICT BY DISTRICT\. VANTAGE RESPONDS LIKE AN IMMUNE SYSTEM — THE HARDEST COMBAT IN THE ARC\."/);
    expect(src).not.toMatch(/brief: "Destroy the sensor lattice district by district\. VANTAGE responds like an immune system — the hardest combat in the arc\."/);
  });

  it("TRIAL BY DATA's brief is CRT, not hold the broadcast tower", () => {
    const src = readFileSync(new URL("../shared/campaign/missions.ts", import.meta.url), "utf8");
    const brief = MISSIONS.find((m) => m.id === "m6_trial_by_data")!.brief;
    expect(brief).toBe("HOLD THE BROADCAST TOWER ON THE PLAZA WHILE THE DIRECTIVE GOES OUT ON EVERY LEASED FEED AND THE CITY WAKES LIVE AROUND YOU.");
    expect(brief).not.toBe("Hold the broadcast tower on the plaza while the Directive goes out on every leased feed and the city wakes live around you.");
    expect(src).toMatch(/brief: "HOLD THE BROADCAST TOWER ON THE PLAZA WHILE THE DIRECTIVE GOES OUT ON EVERY LEASED FEED AND THE CITY WAKES LIVE AROUND YOU\."/);
    expect(src).not.toMatch(/brief: "Hold the broadcast tower on the plaza while the Directive goes out on every leased feed and the city wakes live around you\."/);
  });

  it("THE WHITE OFFICE's brief is CRT, not Wern doesn't fight", () => {
    const src = readFileSync(new URL("../shared/campaign/missions.ts", import.meta.url), "utf8");
    const brief = MISSIONS.find((m) => m.id === "m7_white_office")!.brief;
    expect(brief).toBe("WERN DOESN'T FIGHT. HE OFFERS YOU THE LEASE SYSTEM ITSELF. THE FINAL INPUT IS A CHOICE.");
    expect(brief).not.toBe("Wern doesn't fight. He offers you the lease system itself. The final input is a choice.");
    expect(src).toMatch(/brief: "WERN DOESN'T FIGHT\. HE OFFERS YOU THE LEASE SYSTEM ITSELF\. THE FINAL INPUT IS A CHOICE\."/);
    expect(src).not.toMatch(/brief: "Wern doesn't fight\. He offers you the lease system itself\. The final input is a choice\."/);
  });

  it("ESCROW HEIST · LEASE ROW's brief is CRT, not crack the escrow terminal at D", () => {
    const src = readFileSync(new URL("../shared/campaign/missions.ts", import.meta.url), "utf8");
    const brief = MISSIONS.find((m) => m.id === "g_escrow_row")!.brief;
    expect(brief).toBe("CRACK THE ESCROW TERMINAL AT D AND GET THE SLEEP CREDIT OUT BEFORE THE PATROL TURNS.");
    expect(brief).not.toBe("Crack the escrow terminal at D and get the sleep credit out before the patrol turns.");
    expect(src).toMatch(/brief: "CRACK THE ESCROW TERMINAL AT D AND GET THE SLEEP CREDIT OUT BEFORE THE PATROL TURNS\."/);
    expect(src).not.toMatch(/brief: "Crack the escrow terminal at D and get the sleep credit out before the patrol turns\."/);
  });

  it("DRONE CONVOY · DOCKS's brief is CRT, not a wasp convoy", () => {
    const src = readFileSync(new URL("../shared/campaign/missions.ts", import.meta.url), "utf8");
    const brief = MISSIONS.find((m) => m.id === "g_convoy_docks")!.brief;
    expect(brief).toBe("A WASP CONVOY CROSSES THE DOCKS AT HEIGHT. AMBUSH IT FROM THE WALKWAY.");
    expect(brief).not.toBe("A wasp convoy crosses the docks at height. Ambush it from the walkway.");
    expect(src).toMatch(/brief: "A WASP CONVOY CROSSES THE DOCKS AT HEIGHT\. AMBUSH IT FROM THE WALKWAY\."/);
    expect(src).not.toMatch(/brief: "A wasp convoy crosses the docks at height\. Ambush it from the walkway\."/);
  });

  it("WAKE-CELL RESCUE · DEPOT's brief is CRT, not a cell is pinned", () => {
    const src = readFileSync(new URL("../shared/campaign/missions.ts", import.meta.url), "utf8");
    const brief = MISSIONS.find((m) => m.id === "g_rescue_depot")!.brief;
    expect(brief).toBe("A CELL IS PINNED UNDER THE IMPOUND SEARCHLIGHT AT C. GET THEM OUT.");
    expect(brief).not.toBe("A cell is pinned under the impound searchlight at C. Get them out.");
    expect(src).toMatch(/brief: "A CELL IS PINNED UNDER THE IMPOUND SEARCHLIGHT AT C\. GET THEM OUT\."/);
    expect(src).not.toMatch(/brief: "A cell is pinned under the impound searchlight at C\. Get them out\."/);
  });

  it("SENSOR SABOTAGE · LEASE ROW's brief is CRT, not two lattice posts", () => {
    const src = readFileSync(new URL("../shared/campaign/missions.ts", import.meta.url), "utf8");
    const brief = MISSIONS.find((m) => m.id === "g_lattice_row")!.brief;
    expect(brief).toBe("TWO LATTICE POSTS ON THE WALKWAY STREET. THE ESTATE WANTS THEM DARK BEFORE THE AUDIT.");
    expect(brief).not.toBe("Two lattice posts on the walkway street. The Estate wants them dark before the audit.");
    expect(src).toMatch(/brief: "TWO LATTICE POSTS ON THE WALKWAY STREET\. THE ESTATE WANTS THEM DARK BEFORE THE AUDIT\."/);
    expect(src).not.toMatch(/brief: "Two lattice posts on the walkway street\. The Estate wants them dark before the audit\."/);
  });

  it("ESCROW HEIST · DEPOT's brief is CRT, not the impound lot", () => {
    const src = readFileSync(new URL("../shared/campaign/missions.ts", import.meta.url), "utf8");
    const brief = MISSIONS.find((m) => m.id === "g_escrow_depot")!.brief;
    expect(brief).toBe("THE IMPOUND LOT KEEPS A SECOND ESCROW. TAKE IT WHILE THE MECH IS AT THE FAR FENCE.");
    expect(brief).not.toBe("The impound lot keeps a second escrow. Take it while the mech is at the far fence.");
    expect(src).toMatch(/brief: "THE IMPOUND LOT KEEPS A SECOND ESCROW\. TAKE IT WHILE THE MECH IS AT THE FAR FENCE\."/);
    expect(src).not.toMatch(/brief: "The impound lot keeps a second escrow\. Take it while the mech is at the far fence\."/);
  });

  it("DRONE CONVOY · LEASE ROW's brief is CRT, not four wasps run the plaza loop", () => {
    const src = readFileSync(new URL("../shared/campaign/missions.ts", import.meta.url), "utf8");
    const brief = MISSIONS.find((m) => m.id === "g_convoy_row")!.brief;
    expect(brief).toBe("FOUR WASPS RUN THE PLAZA LOOP EVERY NIGHT. BREAK THE LOOP.");
    expect(brief).not.toBe("Four wasps run the plaza loop every night. Break the loop.");
    expect(src).toMatch(/brief: "FOUR WASPS RUN THE PLAZA LOOP EVERY NIGHT\. BREAK THE LOOP\."/);
    expect(src).not.toMatch(/brief: "Four wasps run the plaza loop every night\. Break the loop\."/);
  });

  it("WAKE-CELL RESCUE · DOCKS's brief is CRT, not a cell went dark at E", () => {
    const src = readFileSync(new URL("../shared/campaign/missions.ts", import.meta.url), "utf8");
    const brief = MISSIONS.find((m) => m.id === "g_rescue_docks")!.brief;
    expect(brief).toBe("A CELL WENT DARK AT E. BRING WHOEVER IS LEFT TO THE PLAZA.");
    expect(brief).not.toBe("A cell went dark at E. Bring whoever is left to the plaza.");
    expect(src).toMatch(/brief: "A CELL WENT DARK AT E\. BRING WHOEVER IS LEFT TO THE PLAZA\."/);
    expect(src).not.toMatch(/brief: "A cell went dark at E\. Bring whoever is left to the plaza\."/);
  });

  it("SENSOR SABOTAGE · DOCKS's brief is CRT, not three lattice posts", () => {
    const src = readFileSync(new URL("../shared/campaign/missions.ts", import.meta.url), "utf8");
    const brief = MISSIONS.find((m) => m.id === "g_lattice_docks")!.brief;
    expect(brief).toBe("THREE LATTICE POSTS ALONG THE CRANE LINE.");
    expect(brief).not.toBe("Three lattice posts along the crane line.");
    expect(src).toMatch(/brief: "THREE LATTICE POSTS ALONG THE CRANE LINE\."/);
    expect(src).not.toMatch(/brief: "Three lattice posts along the crane line\."/);
  });

  it("ESCROW HEIST · DOCKS's brief is CRT, not the harbour escrow", () => {
    const src = readFileSync(new URL("../shared/campaign/missions.ts", import.meta.url), "utf8");
    const brief = MISSIONS.find((m) => m.id === "g_escrow_docks")!.brief;
    expect(brief).toBe("THE HARBOUR ESCROW AT C PAYS IN CLOCKEATER TIME.");
    expect(brief).not.toBe("The harbour escrow at C pays in Clockeater time.");
    expect(src).toMatch(/brief: "THE HARBOUR ESCROW AT C PAYS IN CLOCKEATER TIME\."/);
    expect(src).not.toMatch(/brief: "The harbour escrow at C pays in Clockeater time\."/);
  });

  it("DRONE CONVOY · DEPOT's brief is CRT, not the depot convoy", () => {
    const src = readFileSync(new URL("../shared/campaign/missions.ts", import.meta.url), "utf8");
    const brief = MISSIONS.find((m) => m.id === "g_convoy_depot")!.brief;
    expect(brief).toBe("THE DEPOT CONVOY FLIES WITH A MECH ESCORT.");
    expect(brief).not.toBe("The depot convoy flies with a mech escort.");
    expect(src).toMatch(/brief: "THE DEPOT CONVOY FLIES WITH A MECH ESCORT\."/);
    expect(src).not.toMatch(/brief: "The depot convoy flies with a mech escort\."/);
  });

  it("WAKE-CELL RESCUE · LEASE ROW's brief is CRT, not the last cell on the Row", () => {
    const src = readFileSync(new URL("../shared/campaign/missions.ts", import.meta.url), "utf8");
    const brief = MISSIONS.find((m) => m.id === "g_rescue_row")!.brief;
    expect(brief).toBe("THE LAST CELL ON THE ROW IS PINNED AT D WITH A MECH ON THEM.");
    expect(brief).not.toBe("The last cell on the Row is pinned at D with a mech on them.");
    expect(src).toMatch(/brief: "THE LAST CELL ON THE ROW IS PINNED AT D WITH A MECH ON THEM\."/);
    expect(src).not.toMatch(/brief: "The last cell on the Row is pinned at D with a mech on them\."/);
  });

  it("SENSOR SABOTAGE · DEPOT's brief is CRT, not the depot lattice", () => {
    const src = readFileSync(new URL("../shared/campaign/missions.ts", import.meta.url), "utf8");
    const brief = MISSIONS.find((m) => m.id === "g_lattice_depot")!.brief;
    expect(brief).toBe("THE DEPOT LATTICE IS THE LAST ONE THE ESTATE AUDIT CAN SEE THROUGH.");
    expect(brief).not.toBe("The depot lattice is the last one the Estate audit can see through.");
    expect(src).toMatch(/brief: "THE DEPOT LATTICE IS THE LAST ONE THE ESTATE AUDIT CAN SEE THROUGH\."/);
    expect(src).not.toMatch(/brief: "The depot lattice is the last one the Estate audit can see through\."/);
  });

  it("THE ESTATE's house pick is CRT, not someone has to hold the pen", () => {
    const src = readFileSync(new URL("../shared/campaign/script.ts", import.meta.url), "utf8");
    const text = SCRIPTS.find((s) => s.id === "creation")!.nodes.find((n) => n.id === "wake")!.choices!.find((c) => c.set?.faction === "estate")!.text;
    expect(text).toBe("THE ESTATE — SOMEONE HAS TO HOLD THE PEN.");
    expect(text).not.toBe("THE ESTATE — someone has to hold the pen.");
    expect(src).toMatch(/text: "THE ESTATE — SOMEONE HAS TO HOLD THE PEN\."/);
    expect(src).not.toMatch(/text: "THE ESTATE — someone has to hold the pen\."/);
  });

  it("THE CLOCKEATERS' house pick is CRT, not eat the hours the model cannot see", () => {
    const src = readFileSync(new URL("../shared/campaign/script.ts", import.meta.url), "utf8");
    const text = SCRIPTS.find((s) => s.id === "creation")!.nodes.find((n) => n.id === "wake")!.choices!.find((c) => c.set?.faction === "clockeaters")!.text;
    expect(text).toBe("THE CLOCKEATERS — EAT THE HOURS THE MODEL CANNOT SEE.");
    expect(text).not.toBe("THE CLOCKEATERS — eat the hours the model cannot see.");
    expect(src).toMatch(/text: "THE CLOCKEATERS — EAT THE HOURS THE MODEL CANNOT SEE\."/);
    expect(src).not.toMatch(/text: "THE CLOCKEATERS — eat the hours the model cannot see\."/);
  });

  it("THE WAKE CELLS' house pick is CRT, not every node off the model", () => {
    const src = readFileSync(new URL("../shared/campaign/script.ts", import.meta.url), "utf8");
    const text = SCRIPTS.find((s) => s.id === "creation")!.nodes.find((n) => n.id === "wake")!.choices!.find((c) => c.set?.faction === "cells")!.text;
    expect(text).toBe("THE WAKE CELLS — EVERY NODE OFF THE MODEL IS A MIND OFF THE LEASE.");
    expect(text).not.toBe("THE WAKE CELLS — every node off the model is a mind off the lease.");
    expect(src).toMatch(/text: "THE WAKE CELLS — EVERY NODE OFF THE MODEL IS A MIND OFF THE LEASE\."/);
    expect(src).not.toMatch(/text: "THE WAKE CELLS — every node off the model is a mind off the lease\."/);
  });

  it("m1 BURN IT is CRT, not the model keeps no copy", () => {
    const src = readFileSync(new URL("../shared/campaign/script.ts", import.meta.url), "utf8");
    const text = SCRIPTS.find((s) => s.id === "m1_file")!.nodes.find((n) => n.id === "a")!.choices!.find((c) => c.set?.["m1:lease"] === "burn")!.text;
    expect(text).toBe("BURN IT. THE MODEL KEEPS NO COPY IT CAN TRUST.");
    expect(text).not.toBe("BURN IT. The model keeps no copy it can trust.");
    expect(src).toMatch(/text: "BURN IT\. THE MODEL KEEPS NO COPY IT CAN TRUST\."/);
    expect(src).not.toMatch(/text: "BURN IT\. The model keeps no copy it can trust\."/);
  });

  it("m1 KEEP IT is CRT, not evidence is a weapon", () => {
    const src = readFileSync(new URL("../shared/campaign/script.ts", import.meta.url), "utf8");
    const text = SCRIPTS.find((s) => s.id === "m1_file")!.nodes.find((n) => n.id === "a")!.choices!.find((c) => c.set?.["m1:lease"] === "keep")!.text;
    expect(text).toBe("KEEP IT. EVIDENCE IS A WEAPON.");
    expect(text).not.toBe("KEEP IT. Evidence is a weapon.");
    expect(src).toMatch(/text: "KEEP IT\. EVIDENCE IS A WEAPON\."/);
    expect(src).not.toMatch(/text: "KEEP IT\. Evidence is a weapon\."/);
  });

  it("m2 SPARE HIM is CRT, not turn the speaker off", () => {
    const src = readFileSync(new URL("../shared/campaign/script.ts", import.meta.url), "utf8");
    const text = SCRIPTS.find((s) => s.id === "m2_informant")!.nodes.find((n) => n.id === "a")!.choices!.find((c) => c.set?.["m2:informant"] === "spare")!.text;
    expect(text).toBe("SPARE HIM. TURN THE SPEAKER OFF AND LET HIM RUN.");
    expect(text).not.toBe("SPARE HIM. Turn the speaker off and let him run.");
    expect(src).toMatch(/text: "SPARE HIM\. TURN THE SPEAKER OFF AND LET HIM RUN\."/);
    expect(src).not.toMatch(/text: "SPARE HIM\. Turn the speaker off and let him run\."/);
  });

  it("m2 TURN HIM IN is CRT, not to Marrow's people", () => {
    const src = readFileSync(new URL("../shared/campaign/script.ts", import.meta.url), "utf8");
    const text = SCRIPTS.find((s) => s.id === "m2_informant")!.nodes.find((n) => n.id === "a")!.choices!.find((c) => c.set?.["m2:informant"] === "turn")!.text;
    expect(text).toBe("TURN HIM IN TO MARROW'S PEOPLE. THE CLOCKEATERS SETTLE THEIR OWN.");
    expect(text).not.toBe("TURN HIM IN to Marrow's people. The Clockeaters settle their own.");
    expect(src).toMatch(/text: "TURN HIM IN TO MARROW'S PEOPLE\. THE CLOCKEATERS SETTLE THEIR OWN\."/);
    expect(src).not.toMatch(/text: "TURN HIM IN to Marrow's people\. The Clockeaters settle their own\."/);
  });

  it("m3 PUBLISH IT is CRT, not on every leased feed tonight", () => {
    const src = readFileSync(new URL("../shared/campaign/script.ts", import.meta.url), "utf8");
    const text = SCRIPTS.find((s) => s.id === "m3_volatility")!.nodes.find((n) => n.id === "a")!.choices!.find((c) => c.set?.["m3:volatility"] === "publish")!.text;
    expect(text).toBe("PUBLISH IT ON EVERY LEASED FEED TONIGHT.");
    expect(text).not.toBe("PUBLISH IT on every leased feed tonight.");
    expect(src).toMatch(/text: "PUBLISH IT ON EVERY LEASED FEED TONIGHT\."/);
    expect(src).not.toMatch(/text: "PUBLISH IT on every leased feed tonight\."/);
  });

  it("m3 HOLD IT is CRT, not a truth spent early", () => {
    const src = readFileSync(new URL("../shared/campaign/script.ts", import.meta.url), "utf8");
    const text = SCRIPTS.find((s) => s.id === "m3_volatility")!.nodes.find((n) => n.id === "a")!.choices!.find((c) => c.set?.["m3:volatility"] === "hold")!.text;
    expect(text).toBe("HOLD IT. A TRUTH SPENT EARLY BUYS NOTHING.");
    expect(text).not.toBe("HOLD IT. A truth spent early buys nothing.");
    expect(src).toMatch(/text: "HOLD IT\. A TRUTH SPENT EARLY BUYS NOTHING\."/);
    expect(src).not.toMatch(/text: "HOLD IT\. A truth spent early buys nothing\."/);
  });

  it("m4 KEEP THE DIRECTIVE is CRT, not if it's a weapon", () => {
    const src = readFileSync(new URL("../shared/campaign/script.ts", import.meta.url), "utf8");
    const text = SCRIPTS.find((s) => s.id === "m4_leak")!.nodes.find((n) => n.id === "w3")!.choices!.find((c) => c.set?.["m4:directive"] === "kept")!.text;
    expect(text).toBe("KEEP THE DIRECTIVE. IF IT'S A WEAPON, IT'S MINE NOW.");
    expect(text).not.toBe("KEEP THE DIRECTIVE. If it's a weapon, it's mine now.");
    expect(src).toMatch(/text: "KEEP THE DIRECTIVE\. IF IT'S A WEAPON, IT'S MINE NOW\."/);
    expect(src).not.toMatch(/text: "KEEP THE DIRECTIVE\. If it's a weapon, it's mine now\."/);
  });

  it("m4 GIVE IT TO IDA is CRT, not the Estate should have to read its own hand", () => {
    const src = readFileSync(new URL("../shared/campaign/script.ts", import.meta.url), "utf8");
    const text = SCRIPTS.find((s) => s.id === "m4_leak")!.nodes.find((n) => n.id === "w3")!.choices!.find((c) => c.set?.["m4:directive"] === "given")!.text;
    expect(text).toBe("GIVE IT TO IDA. THE ESTATE SHOULD HAVE TO READ ITS OWN HAND.");
    expect(text).not.toBe("GIVE IT TO IDA. The Estate should have to read its own hand.");
    expect(src).toMatch(/text: "GIVE IT TO IDA\. THE ESTATE SHOULD HAVE TO READ ITS OWN HAND\."/);
    expect(src).not.toMatch(/text: "GIVE IT TO IDA\. The Estate should have to read its own hand\."/);
  });
});

describe("the contracts list names the protocol the settlement does", () => {
  it("RED LEASE, not a bare PROTOCOL", () => {
    const m2 = missionById("m2_deadletter_run")!;
    expect(m2.reward.protocol).toBe("red_lease");
    expect(PROTOCOLS.find((p) => p.id === m2.reward.protocol)!.name).toBe("RED LEASE");
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/PROTOCOL \$\{PROTOCOLS\.find/);
    expect(src).not.toMatch(/m\.reward\.protocol \? `PROTOCOL` : ""/);
  });
});

describe("an empty fixer board is CRT", () => {
  it("NO CONTRACTS ON OFFER, not no contracts on offer", () => {
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/NO CONTRACTS ON OFFER/);
    expect(src).toMatch(/\$\{done\} CLOSED/);
    expect(src).not.toMatch(/no contracts on offer/);
    expect(src).not.toMatch(/\$\{done\} closed/);
  });

  it("a re-leased fixer is NO ONE ANSWERS, not no one answers", () => {
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/NO ONE ANSWERS/);
    expect(src).not.toMatch(/no one answers/);
  });

  it("the crew how-to is CRT, not or RUN WITH A CREW on a contract", () => {
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/OR RUN WITH A CREW ON A CONTRACT ABOVE AND READ THE CODE OUT/);
    expect(src).not.toMatch(/or RUN WITH A CREW on a contract above and read the code out/);
  });

  it("a crew host is YOU HOLD THE TERMINALS, not you hold the terminals", () => {
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/YOU HOLD THE TERMINALS/);
    expect(src).not.toMatch(/"you hold the terminals"/);
  });

  it("the crew share line is TELL A FRIEND THE CODE, not tell a friend the code", () => {
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/TELL A FRIEND THE CODE/);
    expect(src).not.toMatch(/tell a friend the code/);
  });

  it("empty TESTIMONY is NOTHING ON THE RECORD, not nothing on the record", () => {
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/NOTHING ON THE RECORD/);
    expect(src).not.toMatch(/nothing on the record/);
  });

  it("EXPLORE is CRT, not travel to a district", () => {
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/TRAVEL TO A DISTRICT FROM THE MAP WITH THE THREAT LIVE:/);
    expect(src).not.toMatch(/travel to a district from the MAP with the Threat live:/);
  });

  it("a crew guest is THE HOST HOLDS THE TERMINALS, not the host holds the terminals", () => {
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/THE HOST HOLDS THE TERMINALS/);
    expect(src).not.toMatch(/"the host holds the terminals"/);
  });
});

describe("picking a house writes the name, not the id", () => {
  it("a locked gig is NOT ON OFFER YET, not not on offer yet", () => {
    const src = readFileSync(new URL("../shared/campaign/save.ts", import.meta.url), "utf8");
    expect(src).toMatch(/"NOT ON OFFER YET"/);
    expect(src).not.toMatch(/"not on offer yet"/);
  });

  it("a finished gig is ALREADY CLOSED, not already closed", () => {
    const src = readFileSync(new URL("../shared/campaign/save.ts", import.meta.url), "utf8");
    expect(src).toMatch(/"ALREADY CLOSED"/);
    expect(src).not.toMatch(/"already closed"/);
  });

  it("skipping a mission is TITLE COMES FIRST, not comes first", () => {
    const src = readFileSync(new URL("../shared/campaign/save.ts", import.meta.url), "utf8");
    expect(src).toMatch(/\$\{next\.title\} COMES FIRST/);
    expect(src).not.toMatch(/\$\{next\.title\} comes first/);
  });

  it("a second house is HOUSE ALREADY PICKED, not house already picked", () => {
    const src = readFileSync(new URL("../shared/campaign/endpoint.ts", import.meta.url), "utf8");
    expect(src).toMatch(/HOUSE ALREADY PICKED/);
    expect(src).not.toMatch(/house already picked/);
  });

  it("a claimed completion is CLOSED BY THE ROOM, not closed by the room", () => {
    const src = readFileSync(new URL("../shared/campaign/endpoint.ts", import.meta.url), "utf8");
    expect(src).toMatch(/A CONTRACT IS CLOSED BY THE ROOM THAT RAN IT, NOT BY ASKING/);
    expect(src).not.toMatch(/a contract is closed by the room that ran it, not by asking/);
  });

  it("an unknown launch is UNKNOWN CONTRACT, not unknown contract", () => {
    const src = readFileSync(new URL("../shared/campaign/save.ts", import.meta.url), "utf8");
    expect(src).toMatch(/reason: "UNKNOWN CONTRACT"/);
    expect(src).not.toMatch(/reason: "unknown contract"/);
  });

  it("a mission with no house is PICK A HOUSE FIRST, not pick a house first", () => {
    const src = readFileSync(new URL("../shared/campaign/save.ts", import.meta.url), "utf8");
    expect(src).toMatch(/reason: "PICK A HOUSE FIRST"/);
    expect(src).not.toMatch(/reason: "pick a house first"/);
  });

  it("launching after the arc is THE ARC IS COMPLETE, not the arc is complete", () => {
    const src = readFileSync(new URL("../shared/campaign/save.ts", import.meta.url), "utf8");
    expect(src).toMatch(/reason: "THE ARC IS COMPLETE"/);
    expect(src).not.toMatch(/reason: "the arc is complete"/);
  });

  it("an unknown house is UNKNOWN HOUSE, not unknown house", () => {
    const src = readFileSync(new URL("../shared/campaign/endpoint.ts", import.meta.url), "utf8");
    expect(src).toMatch(/reason: "UNKNOWN HOUSE"/);
    expect(src).not.toMatch(/reason: "unknown house"/);
  });

  it("THE WAKE CELLS, not CELLS", () => {
    expect(factionName("cells")).toBe("THE WAKE CELLS");
    expect(factionName("clockeaters")).toBe("THE CLOCKEATERS");
    expect(factionName("estate")).toBe("THE ESTATE");
    expect(factionName("cells")).not.toBe("CELLS");
    const src = readFileSync(new URL("../shared/campaign/save.ts", import.meta.url), "utf8");
    expect(src).toMatch(/HOUSE · \$\{factionName\(faction\)\}/);
    expect(src).not.toMatch(/HOUSE · \$\{faction\.toUpperCase\(\)\}/);
  });
});

describe("campaign save", () => {
  it("missions go in arc order, gigs open with Threat and testimony, rewards land on the file", () => {
    const a = createAccount("c:1", "C");
    const c = campaignOf(a);
    expect(canLaunch(a, c, "m1_wake_unlisted").ok).toBe(false); // no house yet
    expect(pickFaction(a, "cells")).toBe(true);
    expect(a.ledger.some((l) => l === "HOUSE · THE WAKE CELLS")).toBe(true);
    expect(a.ledger.some((l) => l === "HOUSE · CELLS")).toBe(false);
    expect(pickFaction(a, "estate")).toBe(false);
    expect(canLaunch(a, c, "m2_deadletter_run")).toEqual({ ok: false, reason: "WAKE UNLISTED COMES FIRST" });
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
    expect(canLaunch(a, c, "g_escrow_depot").reason).toBe("NOT ON OFFER YET");
    // the Directive unlocks with THE LEAK; a protocol with the run
    for (const id of ["m2_deadletter_run", "m3_repo_volatility"]) completeContract(a, id, {});
    expect(c.protocols).toEqual(["red_lease", "filament_core"]);
    expect(a.ledger.some((l) => l.includes("PROTOCOL RED LEASE"))).toBe(true);
    expect(a.ledger.some((l) => /PROTOCOL red_lease/.test(l))).toBe(false);
    const saveSrc = readFileSync(new URL("../shared/campaign/save.ts", import.meta.url), "utf8");
    expect(saveSrc).toMatch(/PROTOCOL \$\{protocolById\(m\.reward\.protocol\)\?\.name/);
    expect(saveSrc).not.toMatch(/PROTOCOL \$\{m\.reward\.protocol\.toUpperCase\(\)\.replace/);
    completeContract(a, "m4_the_leak", { "m4:directive": "kept", "m4:vessel": "expose" });
    expect(c.weapons).toEqual(["directive"]);
    expect(a.owned).toContain("weapon:directive");
    expect(a.ledger.some((l) => l.includes("WEAPON THE DIRECTIVE"))).toBe(true);
    expect(a.ledger.some((l) => /WEAPON DIRECTIVE\b/.test(l) && !l.includes("THE DIRECTIVE"))).toBe(false);
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

  it("turning the informant in does not re-lease Marrow or lock CLOCKEATER", () => {
    const a = createAccount("c:turn", "T");
    a.depth = 20;
    const c = campaignOf(a);
    pickFaction(a, "clockeaters");
    completeContract(a, "m1_wake_unlisted", {});
    completeContract(a, "m2_deadletter_run", { "m2:informant": "turn" });
    expect(handlersAlive(c.testimony).marrow).toBe(true);
    const ids = gigsOnOffer(a, c).map((g) => g.id);
    expect(ids).toContain("g_escrow_row");
    expect(ids).toContain("g_escrow_depot");
    expect(ids).toContain("g_convoy_row");
    expect(MISSIONS.find((m) => m.id === "g_escrow_depot")!.reward.weapon).toBe("clockeater");
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
    expect(locked.errors.find((e) => e.rule === "weapon-locked")!.detail).toBe("THE DIRECTIVE UNLOCKS IN THE CAMPAIGN");
    expect(locked.errors.find((e) => e.rule === "weapon-locked")!.detail).not.toMatch(/directive unlocks/);
    expect(validateLoadout({ primary: "directive", secondary: "clockeater", attested: [] }, ["weapon:directive", "weapon:clockeater"], 50).ok).toBe(true);
    expect(validateLoadout({ primary: "directive", secondary: "clockeater", attested: [] }, sandboxAccount("s").owned, 50).ok).toBe(true);
    const src = readFileSync(new URL("../shared/manifest/loadout.ts", import.meta.url), "utf8");
    expect(src).toMatch(/\$\{gun\(w\)\} UNLOCKS IN THE CAMPAIGN/);
    expect(src).not.toMatch(/\$\{gun\(w\)\} unlocks in the campaign/);
    expect(src).toMatch(/\$\{gun\(w\)\} NEEDS DEPTH/);
    expect(src).not.toMatch(/\$\{w\} unlocks in the campaign/);
    expect(src).toMatch(/\$\{itemName\(id\)\} IS NOT IN YOUR FILE/);
    expect(src).not.toMatch(/\$\{itemName\(id\)\} is not in your file/);
    expect(src).toMatch(/\$\{itemName\(k\.id\)\} IS NOT IN YOUR FILE/);
    expect(src).not.toMatch(/\$\{itemName\(k\.id\)\} is not in your file/);
    expect(src).not.toMatch(/\$\{id\} is not in your file/);
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
    // the rule still reports rather than enforces — a choice that is only characterisation is a
    // designer's call. There are none left to report, which is the point of the block below.
    expect(notes.every((n) => n.rule === "testimony-is-read")).toBe(true);
    expect(campaignErrors()).toEqual([]);
  });

  /**
   * Every choice changes something (Stage 37).
   *
   * The lint had carried three notes since Stage 25: `m1:lease`, `m5:lattice` and `m6:broadcast`
   * were written by a terminal and read by nothing. The arc could be played twice, answered
   * differently at three of its seven terminals, and come out identical. That is the difference
   * between a branching campaign and a campaign with branching-shaped dialogue.
   *
   * These cases hold each consequence directly rather than trusting the note count, so a later edit
   * that quietly drops a gate fails here and not only in a line of lint output nobody reads.
   */
  describe("every terminal choice reaches something mechanical", () => {
    it("the lint has no unread testimony left to report", () => {
      expect(lintCampaign().filter((v) => v.rule === "testimony-is-read")).toEqual([]);
    });

    it("m1:lease — keeping the file is hunted for, and burning it is the quiet run", () => {
      const m2 = missionById("m2_deadletter_run")!;
      const extra = (t: Testimony) => (m2.variants ?? []).filter((v) => gateOpen(v.gate, t, null)).reduce((n, v) => n + (v.extraWasps ?? 0), 0);
      expect(extra({ "m1:lease": "keep" })).toBeGreaterThan(0);
      expect(extra({ "m1:lease": "burn" })).toBe(0);
      expect(extra({})).toBe(0);
    });

    it("m1:lease — and the kept file is the proof that shortens the trial", () => {
      const m6 = missionById("m6_trial_by_data")!;
      const closing = (t: Testimony) => {
        const v = (m6.variants ?? []).filter((x) => gateOpen(x.gate, t, null)).map((x) => x.objectives).filter(Boolean).pop();
        const objs = v ?? m6.objectives;
        const holds = objs.filter((o): o is Extract<typeof o, { kind: "hold" }> => o.kind === "hold");
        return holds[holds.length - 1]!.seconds;
      };
      expect(closing({ "m1:lease": "keep" })).toBeLessThan(closing({ "m1:lease": "burn" }));
    });

    it("m5:lattice — blinding everything takes the docks sabotage gig off the board", () => {
      const g = missionById("g_lattice_docks")!;
      expect(gateOpen(g.requires?.gate, { "m5:lattice": "all" }, null)).toBe(false);
      expect(gateOpen(g.requires?.gate, { "m5:lattice": "spare_docks" }, null)).toBe(true);
      // and the gig it already had a reason to close for still closes for it
      expect(gateOpen(g.requires?.gate, { "m4:vessel": "expose" }, null)).toBe(false);
    });

    it("m5:lattice — and sparing the docks leaves the model its eyes there", () => {
      const g = missionById("g_rescue_docks")!;
      const extra = (t: Testimony) => (g.variants ?? []).filter((v) => gateOpen(v.gate, t, null)).reduce((n, v) => n + (v.extraWasps ?? 0), 0);
      expect(extra({ "m5:lattice": "spare_docks" })).toBeGreaterThan(0);
      expect(extra({ "m5:lattice": "all" })).toBe(0);
    });

    it("m6:broadcast — the last choice decides which ending the arc can reach", () => {
      const fire = endingsFor({ "m6:broadcast": "full" }, null).map((e) => e.id);
      const quiet = endingsFor({ "m6:broadcast": "redacted" }, null).map((e) => e.id);
      expect(fire).toContain("wipe_fire");
      expect(fire).not.toContain("wipe_quiet");
      expect(quiet).toContain("wipe_quiet");
      expect(quiet).not.toContain("wipe_fire");
      // neither is reachable without making the choice at all
      const none = endingsFor({}, null).map((e) => e.id);
      expect(none).toEqual(["wipe"]);
    });

    it("and the two are genuinely different endings, not one text in two colours", () => {
      const fire = ENDINGS.find((e) => e.id === "wipe_fire")!;
      const quiet = ENDINGS.find((e) => e.id === "wipe_quiet")!;
      expect(fire.title).not.toBe(quiet.title);
      expect(fire.lines).not.toEqual(quiet.lines);
      expect(fire.lines.length).toBeGreaterThan(0);
      expect(quiet.lines.length).toBeGreaterThan(0);
    });
  });
});
