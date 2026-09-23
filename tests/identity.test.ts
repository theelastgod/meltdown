import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { glyphFor, glyphSeed, glyphSvg, layersForDepth } from "../shared/identity/glyph";
import { CHAPTERS, chapterFor, MONIKERS, monikerUnlocked, unlockedMonikers, wornMoniker } from "../shared/identity/monikers";
import { assertClean, displayName, filesWord, IDENTITY_KEYS, identityTag, mechanicalLeaks, parseTag, publicIdentity, stampsWord } from "../shared/identity/identity";
import { createAccount, rangeCourseName, recordGhost, sandboxAccount, upgradeAccount, validGhost } from "../shared/progression/account";
import { totalXpToReach } from "../shared/progression/depth";
import { deadletterOffice, HUB_LEVEL_ID, overPad } from "../shared/sim/hub";
import { LEVEL_IDS, levelById } from "../shared/sim/level";
import { World } from "../shared/sim/world";
import { buildNav, findPath } from "../shared/sim/nav";

describe("glyphs", () => {
  it("are deterministic from the file id and grow a layer at each Chapter gate without changing the earlier ones", () => {
    const a = glyphFor("file:alpha", 1);
    const b = glyphFor("file:alpha", 1);
    expect(a).toEqual(b);
    expect(a.layers.length).toBe(1);
    const d10 = glyphFor("file:alpha", 10);
    const d25 = glyphFor("file:alpha", 25);
    const d50 = glyphFor("file:alpha", 50);
    expect(d10.layers.length).toBe(2);
    expect(d25.layers.length).toBe(3);
    expect(d50.layers.length).toBe(3);
    expect(d50.named).toBe(true);
    expect(d10.layers[0]).toEqual(a.layers[0]);
    expect(d25.layers.slice(0, 2)).toEqual(d10.layers);
    expect(layersForDepth(9)).toBe(1);
    expect(glyphSeed("file:alpha")).not.toBe(glyphSeed("file:bravo"));
    expect(glyphSvg(d50, 24, "#fff")).toContain("<svg");
  });
});

describe("monikers and Chapters", () => {
  it("chapters fall at Depth 10 / 25 / 50", () => {
    expect(chapterFor(1)).toBe(0);
    expect(chapterFor(9)).toBe(0);
    expect(chapterFor(10)).toBe(1);
    expect(chapterFor(25)).toBe(2);
    expect(chapterFor(50)).toBe(3);
    expect(CHAPTERS.map((c) => c.depth)).toEqual([10, 25, 50]);
  });
  it("a moniker is worn only if earned; the sandbox file earns the Chapter ones and the first-kill ones only once it kills", () => {
    const fresh = createAccount("f:1", "ALPHA");
    expect(unlockedMonikers(fresh).map((m) => m.id)).toEqual(["unlisted"]);
    expect(wornMoniker(fresh, "named")).toBeNull();
    expect(wornMoniker(fresh, "unlisted")?.id).toBe("unlisted");
    const sb = sandboxAccount("sandbox:1");
    const ids = unlockedMonikers(sb).map((m) => m.id);
    expect(ids).toContain("named");
    expect(ids).toContain("divergent");
    expect(ids).not.toContain("lease_breaker");
    sb.stamps.push("first_kill:lease_breaker");
    expect(monikerUnlocked(MONIKERS.find((m) => m.id === "the_breaker")!, sb)).toBe(true);
    fresh.counters["debtsCleared"] = 1;
    expect(unlockedMonikers(fresh).map((m) => m.id)).toContain("debt_collector");
  });
});

describe("public identity", () => {
  it("prints the moniker (or BLANK) until Chapter III, then the name", () => {
    const a = createAccount("f:2", "BRAVO");
    expect(displayName(a, "BRAVO")).toBe("BLANK");
    a.moniker = "unlisted";
    expect(displayName(a, "BRAVO")).toBe("UNLISTED");
    a.moniker = "named"; // not earned
    expect(displayName(a, "BRAVO")).toBe("BLANK");
    a.depth = 50;
    expect(displayName(a, "BRAVO")).toBe("BRAVO");
    expect(displayName(null, "GUEST")).toBe("GUEST");
  });
  it("carries only identity keys and survives the wire tag round trip", () => {
    const sb = sandboxAccount("sandbox:2");
    sb.moniker = "divergent";
    const pi = publicIdentity(sb, "CHARLIE");
    for (const k of Object.keys(pi)) expect(IDENTITY_KEYS).toContain(k);
    expect(pi.display).toBe("BLANK"); // sandbox name is BLANK at Chapter III → the handle would be used only when name is set
    sb.name = "CHARLIE";
    const pi2 = publicIdentity(sb, "CHARLIE");
    expect(pi2.display).toBe("CHARLIE");
    const back = parseTag(identityTag(pi2), pi2.display);
    expect(back.glyph).toBe(pi2.glyph);
    expect(back.chapter).toBe(3);
    expect(back.moniker).toBe("divergent");
  });
  it("one stamp is STAMP, not STAMPS", () => {
    expect(stampsWord(1)).toBe("1 STAMP");
    expect(stampsWord(2)).toBe("2 STAMPS");
    expect(stampsWord(0)).toBe("0 STAMPS");
    expect(stampsWord(1)).not.toBe("1 STAMPS");
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/stampsWord\(e\.stamps\)/);
    expect(hud).not.toMatch(/e\.stamps\} STAMPS/);
    const rewrite = readFileSync(new URL("../shared/endgame/rewrite.ts", import.meta.url), "utf8");
    expect(rewrite).toMatch(/stampsWord\(a\.stamps\.length\)\} KEPT/);
    expect(rewrite).not.toMatch(/a\.stamps\.length\} STAMPS KEPT/);
  });

  it("one file is FILE, not FILES", () => {
    expect(filesWord(1)).toBe("1 FILE");
    expect(filesWord(2)).toBe("2 FILES");
    expect(filesWord(0)).toBe("0 FILES");
    expect(filesWord(1)).not.toBe("1 FILES");
    const hud = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/filesWord\(m\.kills\)/);
    expect(hud).not.toMatch(/m\.kills\} FILES/);
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(file).toMatch(/filesWord\(v\.identity\.debt\.kills\)\} ON YOU/);
    expect(file).not.toMatch(/files on you/);
    const room = readFileSync(new URL("../server/room.ts", import.meta.url), "utf8");
    expect(room).toMatch(/filesWord\(topKills\)/);
    expect(room).toMatch(/filesWord\(rec\.account\.debt\.kills\)/);
    expect(room).not.toMatch(/topKills\} FILES ON YOU/);
  });

  it("the leak scanner catches loadouts, items, chips, firmwares, weapons and stats — and passes a clean identity", () => {
    const sb = sandboxAccount("sandbox:3");
    expect(mechanicalLeaks(publicIdentity(sb, "X"))).toEqual([]);
    expect(mechanicalLeaks({ kind: "dossier", entries: [{ ...publicIdentity(sb, "X"), id: 1, team: 1 }] })).toEqual([]);
    const leaky = { display: "X", loadout: { primary: "lease_breaker" } };
    const leaks = mechanicalLeaks(leaky);
    expect(leaks.some((l) => l.includes('key "loadout"'))).toBe(true);
    expect(leaks.some((l) => l.includes('key "primary"'))).toBe(true);
    expect(leaks.some((l) => l.includes('value "lease_breaker"'))).toBe(true);
    expect(mechanicalLeaks({ note: "slipfile" }).length).toBeGreaterThan(0);
    expect(mechanicalLeaks({ depth: 50 }).length).toBe(1);
    expect(mechanicalLeaks({ moniker: "LEASE-BREAKER" })).toEqual([]); // fiction, not a loadout
    expect(() => assertClean(leaky, "test")).toThrow(/leaks mechanical/);
    expect(() => assertClean({ kind: "rite", chapter: 1, lines: ["THE MODEL HAS A LINE FOR YOU NOW."] }, "rite")).not.toThrow();
  });
});

describe("account identity fields", () => {
  it("upgrade fills the Stage 8 fields on rows written before them", () => {
    const old = { id: "f:old", name: "OLD", xp: 0, depth: 1 } as never;
    const a = upgradeAccount(old);
    expect(a.moniker).toBeNull();
    expect(a.chapters).toEqual([]);
    expect(a.debt).toBeNull();
    expect(a.social).toEqual({});
    expect(a.ghosts).toEqual({});
  });
  it("ghost runs are validated for shape and kept only when faster", () => {
    const a = createAccount("f:g", "G");
    expect(validGhost({ level: "deadletter_office", seconds: 3, samples: [1, 2] })).toBeNull();
    expect(validGhost({ level: "../x", seconds: 3, samples: new Array(8).fill(0) })).toBeNull();
    const run = validGhost({ level: HUB_LEVEL_ID, seconds: 12.5, samples: new Array(40).fill(1.2345) })!;
    expect(run.samples[0]).toBe(1.23);
    expect(recordGhost(a, run)).toBe(true);
    expect(recordGhost(a, { ...run, seconds: 13 })).toBe(false);
    expect(recordGhost(a, { ...run, seconds: 11 })).toBe(true);
    expect(a.ghosts[HUB_LEVEL_ID]!.seconds).toBe(11);
    expect(a.ledger.filter((l) => l.startsWith("RANGE")).length).toBe(2);
    expect(a.ledger.some((l) => l.startsWith("RANGE · DEADLETTER OFFICE (HUB)"))).toBe(true);
    expect(a.ledger.some((l) => /RANGE · DEADLETTER_OFFICE/.test(l))).toBe(false);
    const src = readFileSync(new URL("../shared/progression/account.ts", import.meta.url), "utf8");
    expect(src).toMatch(/RANGE · \$\{rangeCourseName\(run\.level\)\}/);
    expect(src).not.toMatch(/run\.level\.toUpperCase\(\)/);
    expect(rangeCourseName("white_office")).toBe("THE WHITE OFFICE");
    expect(rangeCourseName("white_office")).not.toBe("WHITE OFFICE");
    expect(totalXpToReach(10)).toBeGreaterThan(0);
  });

  it("the RANGE ledger suffixes times as S, not 12.50s", () => {
    const a = createAccount("f:g2", "G2");
    const run = validGhost({ level: HUB_LEVEL_ID, seconds: 12.5, samples: new Array(40).fill(1) })!;
    expect(recordGhost(a, run)).toBe(true);
    expect(a.ledger.at(-1)).toBe("RANGE · DEADLETTER OFFICE (HUB) · 12.50S · FIRST RUN");
    expect(recordGhost(a, { ...run, seconds: 11 })).toBe(true);
    expect(a.ledger.at(-1)).toBe("RANGE · DEADLETTER OFFICE (HUB) · 11.00S (−1.50S)");
    expect(a.ledger.at(-1)).not.toBe("RANGE · DEADLETTER OFFICE (HUB) · 11.00s (−1.50s)");
    const src = readFileSync(new URL("../shared/progression/account.ts", import.meta.url), "utf8");
    expect(src).toMatch(/toFixed\(2\)\}S/);
    expect(src).not.toMatch(/toFixed\(2\)\}s/);
  });
});

describe("the Deadletter Office", () => {
  it("is a registered level with no wake, a range course that the nav crosses, and pads the sim reads by position", () => {
    expect(LEVEL_IDS).toContain(HUB_LEVEL_ID);
    const L = levelById(HUB_LEVEL_ID);
    expect(L.nodes.length).toBe(0);
    expect(L.hub).toBeDefined();
    const w = new World(L, { ai: false, seed: 1, wakePhase: "wake" });
    expect(w.wake).toBeNull();
    const nav = buildNav(L);
    const hub = deadletterOffice().hub;
    const start = { x: (hub.start.min.x + hub.start.max.x) / 2, y: 0, z: 0 };
    const end = { x: (hub.end.min.x + hub.end.max.x) / 2, y: 0, z: 0 };
    const path = findPath(nav, L.spawns[0]!.pos, start);
    expect(path).not.toBeNull();
    const course = findPath(nav, start, end);
    expect(course).not.toBeNull();
    expect(overPad(hub.start, start)).toBe(true);
    expect(overPad(hub.end, start)).toBe(false);
    expect(hub.renovation.filter((r) => r.chapter <= 1).length).toBe(2);
  });
});

describe("the FILE names how a moniker was earned in CRT", () => {
  it("UNLISTED's how is CRT, not every file starts here", () => {
    const src = readFileSync(new URL("../shared/identity/monikers.ts", import.meta.url), "utf8");
    const how = MONIKERS.find((m) => m.id === "unlisted")!.how;
    expect(how).toBe("EVERY FILE STARTS HERE");
    expect(how).not.toBe("every file starts here");
    expect(src).toMatch(/m\("unlisted", "UNLISTED", \{ kind: "free" \}, "EVERY FILE STARTS HERE"\)/);
    expect(src).not.toMatch(/m\("unlisted", "UNLISTED", \{ kind: "free" \}, "every file starts here"\)/);
  });

  it("TENANT's how is CRT, not play a match", () => {
    const src = readFileSync(new URL("../shared/identity/monikers.ts", import.meta.url), "utf8");
    const how = MONIKERS.find((m) => m.id === "tenant")!.how;
    expect(how).toBe("PLAY A MATCH");
    expect(how).not.toBe("play a match");
    expect(src).toMatch(/m\("tenant", "TENANT", \{ kind: "counter", counter: "matches", need: 1 \}, "PLAY A MATCH"\)/);
    expect(src).not.toMatch(/m\("tenant", "TENANT", \{ kind: "counter", counter: "matches", need: 1 \}, "play a match"\)/);
  });

  it("LEASE-BREAKER's how is CRT, not first file closed with the Lease-Breaker", () => {
    const src = readFileSync(new URL("../shared/identity/monikers.ts", import.meta.url), "utf8");
    const how = MONIKERS.find((m) => m.id === "the_breaker")!.how;
    expect(how).toBe("FIRST FILE CLOSED WITH THE LEASE-BREAKER");
    expect(how).not.toBe("first file closed with the Lease-Breaker");
    expect(src).toMatch(/m\("the_breaker", "LEASE-BREAKER", \{ kind: "stamp", stamp: "first_kill:lease_breaker" \}, "FIRST FILE CLOSED WITH THE LEASE-BREAKER"\)/);
    expect(src).not.toMatch(/m\("the_breaker", "LEASE-BREAKER", \{ kind: "stamp", stamp: "first_kill:lease_breaker" \}, "first file closed with the Lease-Breaker"\)/);
  });

  it("REPO MAN's how is CRT, not first file closed with the Repo Hammer", () => {
    const src = readFileSync(new URL("../shared/identity/monikers.ts", import.meta.url), "utf8");
    const how = MONIKERS.find((m) => m.id === "repo_man")!.how;
    expect(how).toBe("FIRST FILE CLOSED WITH THE REPO HAMMER");
    expect(how).not.toBe("first file closed with the Repo Hammer");
    expect(src).toMatch(/m\("repo_man", "REPO MAN", \{ kind: "stamp", stamp: "first_kill:repo_hammer" \}, "FIRST FILE CLOSED WITH THE REPO HAMMER"\)/);
    expect(src).not.toMatch(/m\("repo_man", "REPO MAN", \{ kind: "stamp", stamp: "first_kill:repo_hammer" \}, "first file closed with the Repo Hammer"\)/);
  });

  it("STACKER's how is CRT, not first file closed with the Stack", () => {
    const src = readFileSync(new URL("../shared/identity/monikers.ts", import.meta.url), "utf8");
    const how = MONIKERS.find((m) => m.id === "stacker")!.how;
    expect(how).toBe("FIRST FILE CLOSED WITH THE STACK");
    expect(how).not.toBe("first file closed with the Stack");
    expect(src).toMatch(/m\("stacker", "STACKER", \{ kind: "stamp", stamp: "first_kill:stack_smg" \}, "FIRST FILE CLOSED WITH THE STACK"\)/);
    expect(src).not.toMatch(/m\("stacker", "STACKER", \{ kind: "stamp", stamp: "first_kill:stack_smg" \}, "first file closed with the Stack"\)/);
  });

  it("LONGWAVE's how is CRT, not first file closed with the Longwave", () => {
    const src = readFileSync(new URL("../shared/identity/monikers.ts", import.meta.url), "utf8");
    const how = MONIKERS.find((m) => m.id === "the_longwave")!.how;
    expect(how).toBe("FIRST FILE CLOSED WITH THE LONGWAVE");
    expect(how).not.toBe("first file closed with the Longwave");
    expect(src).toMatch(/m\("the_longwave", "LONGWAVE", \{ kind: "stamp", stamp: "first_kill:longwave" \}, "FIRST FILE CLOSED WITH THE LONGWAVE"\)/);
    expect(src).not.toMatch(/m\("the_longwave", "LONGWAVE", \{ kind: "stamp", stamp: "first_kill:longwave" \}, "first file closed with the Longwave"\)/);
  });

  it("CARRIER's how is CRT, not first file closed with the Phage", () => {
    const src = readFileSync(new URL("../shared/identity/monikers.ts", import.meta.url), "utf8");
    const how = MONIKERS.find((m) => m.id === "carrier")!.how;
    expect(how).toBe("FIRST FILE CLOSED WITH THE PHAGE");
    expect(how).not.toBe("first file closed with the Phage");
    expect(src).toMatch(/m\("carrier", "CARRIER", \{ kind: "stamp", stamp: "first_kill:phage" \}, "FIRST FILE CLOSED WITH THE PHAGE"\)/);
    expect(src).not.toMatch(/m\("carrier", "CARRIER", \{ kind: "stamp", stamp: "first_kill:phage" \}, "first file closed with the Phage"\)/);
  });

  it("LIVE WIRE's how is CRT, not first file closed with the Shock Baton", () => {
    const src = readFileSync(new URL("../shared/identity/monikers.ts", import.meta.url), "utf8");
    const how = MONIKERS.find((m) => m.id === "live_wire")!.how;
    expect(how).toBe("FIRST FILE CLOSED WITH THE SHOCK BATON");
    expect(how).not.toBe("first file closed with the Shock Baton");
    expect(src).toMatch(/m\("live_wire", "LIVE WIRE", \{ kind: "stamp", stamp: "first_kill:shock_baton" \}, "FIRST FILE CLOSED WITH THE SHOCK BATON"\)/);
    expect(src).not.toMatch(/m\("live_wire", "LIVE WIRE", \{ kind: "stamp", stamp: "first_kill:shock_baton" \}, "first file closed with the Shock Baton"\)/);
  });

  it("SLIDER's how is CRT, not a slide-jump kill", () => {
    const src = readFileSync(new URL("../shared/identity/monikers.ts", import.meta.url), "utf8");
    const how = MONIKERS.find((m) => m.id === "slider")!.how;
    expect(how).toBe("A SLIDE-JUMP KILL");
    expect(how).not.toBe("a slide-jump kill");
    expect(src).toMatch(/m\("slider", "SLIDER", \{ kind: "counter", counter: "slideJumpKills", need: 1 \}, "A SLIDE-JUMP KILL"\)/);
    expect(src).not.toMatch(/m\("slider", "SLIDER", \{ kind: "counter", counter: "slideJumpKills", need: 1 \}, "a slide-jump kill"\)/);
  });

  it("LEDGER HAND's how is CRT, not ten nodes pulled off the model", () => {
    const src = readFileSync(new URL("../shared/identity/monikers.ts", import.meta.url), "utf8");
    const how = MONIKERS.find((m) => m.id === "ledger_hand")!.how;
    expect(how).toBe("TEN NODES PULLED OFF THE MODEL");
    expect(how).not.toBe("ten nodes pulled off the model");
    expect(src).toMatch(/m\("ledger_hand", "LEDGER HAND", \{ kind: "counter", counter: "flips", need: 10 \}, "TEN NODES PULLED OFF THE MODEL"\)/);
    expect(src).not.toMatch(/m\("ledger_hand", "LEDGER HAND", \{ kind: "counter", counter: "flips", need: 10 \}, "ten nodes pulled off the model"\)/);
  });

  it("FULL WAKE's how is CRT, not a district fully woken", () => {
    const src = readFileSync(new URL("../shared/identity/monikers.ts", import.meta.url), "utf8");
    const how = MONIKERS.find((m) => m.id === "full_wake")!.how;
    expect(how).toBe("A DISTRICT FULLY WOKEN");
    expect(how).not.toBe("a district fully woken");
    expect(src).toMatch(/m\("full_wake", "FULL WAKE", \{ kind: "counter", counter: "fullWakes", need: 1 \}, "A DISTRICT FULLY WOKEN"\)/);
    expect(src).not.toMatch(/m\("full_wake", "FULL WAKE", \{ kind: "counter", counter: "fullWakes", need: 1 \}, "a district fully woken"\)/);
  });

  it("DRONE BANE's how is CRT, not ten wasps downed", () => {
    const src = readFileSync(new URL("../shared/identity/monikers.ts", import.meta.url), "utf8");
    const how = MONIKERS.find((m) => m.id === "drone_bane")!.how;
    expect(how).toBe("TEN WASPS DOWNED");
    expect(how).not.toBe("ten wasps downed");
    expect(src).toMatch(/m\("drone_bane", "DRONE BANE", \{ kind: "counter", counter: "waspKills", need: 10 \}, "TEN WASPS DOWNED"\)/);
    expect(src).not.toMatch(/m\("drone_bane", "DRONE BANE", \{ kind: "counter", counter: "waspKills", need: 10 \}, "ten wasps downed"\)/);
  });

  it("MECH BREAKER's how is CRT, not a repo mech disabled", () => {
    const src = readFileSync(new URL("../shared/identity/monikers.ts", import.meta.url), "utf8");
    const how = MONIKERS.find((m) => m.id === "mech_breaker")!.how;
    expect(how).toBe("A REPO MECH DISABLED");
    expect(how).not.toBe("a repo mech disabled");
    expect(src).toMatch(/m\("mech_breaker", "MECH BREAKER", \{ kind: "counter", counter: "mechKills", need: 1 \}, "A REPO MECH DISABLED"\)/);
    expect(src).not.toMatch(/m\("mech_breaker", "MECH BREAKER", \{ kind: "counter", counter: "mechKills", need: 1 \}, "a repo mech disabled"\)/);
  });

  it("DEBT COLLECTOR's how is CRT, not a Debt cleared", () => {
    const src = readFileSync(new URL("../shared/identity/monikers.ts", import.meta.url), "utf8");
    const how = MONIKERS.find((m) => m.id === "debt_collector")!.how;
    expect(how).toBe("A DEBT CLEARED");
    expect(how).not.toBe("a Debt cleared");
    expect(src).toMatch(/m\("debt_collector", "DEBT COLLECTOR", \{ kind: "counter", counter: "debtsCleared", need: 1 \}, "A DEBT CLEARED"\)/);
    expect(src).not.toMatch(/m\("debt_collector", "DEBT COLLECTOR", \{ kind: "counter", counter: "debtsCleared", need: 1 \}, "a Debt cleared"\)/);
  });

  it("NINE LIVES's how is CRT, not a round without a death", () => {
    const src = readFileSync(new URL("../shared/identity/monikers.ts", import.meta.url), "utf8");
    const how = MONIKERS.find((m) => m.id === "nine_lives")!.how;
    expect(how).toBe("A ROUND WITHOUT A DEATH");
    expect(how).not.toBe("a round without a death");
    expect(src).toMatch(/m\("nine_lives", "NINE LIVES", \{ kind: "counter", counter: "noDeathRounds", need: 1 \}, "A ROUND WITHOUT A DEATH"\)/);
    expect(src).not.toMatch(/m\("nine_lives", "NINE LIVES", \{ kind: "counter", counter: "noDeathRounds", need: 1 \}, "a round without a death"\)/);
  });

  it("CITIZEN's how is CRT, not all three districts played", () => {
    const src = readFileSync(new URL("../shared/identity/monikers.ts", import.meta.url), "utf8");
    const how = MONIKERS.find((m) => m.id === "citizen")!.how;
    expect(how).toBe("ALL THREE DISTRICTS PLAYED");
    expect(how).not.toBe("all three districts played");
    expect(src).toMatch(/m\("citizen", "CITIZEN", \{ kind: "counter", counter: "districts", need: 3 \}, "ALL THREE DISTRICTS PLAYED"\)/);
    expect(src).not.toMatch(/m\("citizen", "CITIZEN", \{ kind: "counter", counter: "districts", need: 3 \}, "all three districts played"\)/);
  });
});
