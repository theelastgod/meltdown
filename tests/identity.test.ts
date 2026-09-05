import { describe, expect, it } from "vitest";
import { glyphFor, glyphSeed, glyphSvg, layersForDepth } from "../shared/identity/glyph";
import { CHAPTERS, chapterFor, MONIKERS, monikerUnlocked, unlockedMonikers, wornMoniker } from "../shared/identity/monikers";
import { assertClean, displayName, IDENTITY_KEYS, identityTag, mechanicalLeaks, parseTag, publicIdentity } from "../shared/identity/identity";
import { createAccount, recordGhost, sandboxAccount, upgradeAccount, validGhost } from "../shared/progression/account";
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
    expect(totalXpToReach(10)).toBeGreaterThan(0);
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
