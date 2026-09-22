/**
 * What closed it (Stage 91): which of my rounds the receipt may name, and what it is called.
 *
 * The attribution is the part worth testing. The server credits the kill without saying which round
 * did it, so the client's claim rests entirely on the rule below — and the failure that matters is
 * not a missing line, it is a confident wrong one.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { WEAPON_LIST } from "../shared/weapons/manifest";
import { bodyKey, closeLine, closeRead, CLOSE_WINDOW, forgetOldHits, HIT_MEMORY, ledgered, rememberHit, stampTitle, ttkNote, type LandedHit, victimLabel } from "../client/hud/kill";

const P7 = bodyKey("player", 7);
const P8 = bodyKey("player", 8);
const hit = (over: Partial<LandedHit> = {}): LandedHit => ({ at: 100, zone: "body", distance: 20, weapon: "lease_breaker", ...over });

describe("which round closed it", () => {
  it("names the round that landed as the file went down", () => {
    const book = new Map<string, LandedHit>();
    rememberHit(book, P7, hit({ at: 100, zone: "head", distance: 41 }));
    const r = closeRead(book, P7, 100.05);
    expect(r?.zone).toBe("head");
    expect(r?.distance).toBe(41);
  });

  it("says nothing about a body this client never hit", () => {
    expect(closeRead(new Map(), P7, 100)).toBeNull();
  });

  it("will not put a rifle round on a kill that came later by other means", () => {
    // the grenade case: shot them ten seconds ago, finished them with something this book never saw
    const book = new Map<string, LandedHit>();
    rememberHit(book, P7, hit({ at: 90, zone: "head" }));
    expect(closeRead(book, P7, 100)).toBeNull();
  });

  it("holds right up to the edge of the window and lets go past it", () => {
    const book = new Map<string, LandedHit>();
    rememberHit(book, P7, hit({ at: 100 }));
    expect(closeRead(book, P7, 100 + CLOSE_WINDOW)).not.toBeNull();
    expect(closeRead(book, P7, 100 + CLOSE_WINDOW + 0.001)).toBeNull();
  });

  it("treats a clock that went backwards as no answer at all", () => {
    const book = new Map<string, LandedHit>();
    rememberHit(book, P7, hit({ at: 100 }));
    expect(closeRead(book, P7, 99)).toBeNull();
  });

  it("keeps only the last round landed on each body", () => {
    const book = new Map<string, LandedHit>();
    rememberHit(book, P7, hit({ at: 100, zone: "head" }));
    rememberHit(book, P7, hit({ at: 100.2, zone: "legs" }));
    expect(closeRead(book, P7, 100.3)?.zone).toBe("legs");
    expect(book.size).toBe(1);
  });

  it("keeps a target in the range apart from the file with the same number", () => {
    const book = new Map<string, LandedHit>();
    rememberHit(book, bodyKey("dummy", 7), hit({ at: 100, zone: "head" }));
    expect(closeRead(book, bodyKey("player", 7), 100.1)).toBeNull();
    expect(closeRead(book, bodyKey("dummy", 7), 100.1)?.zone).toBe("head");
  });

  it("keeps the bodies apart", () => {
    const book = new Map<string, LandedHit>();
    rememberHit(book, P7, hit({ at: 100, zone: "head" }));
    rememberHit(book, P8, hit({ at: 100, zone: "legs" }));
    expect(closeRead(book, P7, 100.1)?.zone).toBe("head");
    expect(closeRead(book, P8, 100.1)?.zone).toBe("legs");
  });

  it("forgets what is too old to close anything, and keeps what is not", () => {
    const book = new Map<string, LandedHit>();
    rememberHit(book, P7, hit({ at: 100 }));
    rememberHit(book, P8, hit({ at: 100 + HIT_MEMORY }));
    forgetOldHits(book, 100 + HIT_MEMORY + 0.5);
    expect(book.has(P7)).toBe(false);
    expect(book.has(P8)).toBe(true);
  });
});

describe("what it is called", () => {
  it("does not call a target in the range a closed file", () => {
    expect(stampTitle("dummy")).toBe("TARGET DOWN");
    expect(stampTitle("player")).toBe("FILE CLOSED");
    expect(stampTitle("wasp")).toBe("KILL CONFIRMED");
  });

  it("FILE CLOSED BY suffixes metres as M, not 12 m", () => {
    const src = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(src).toMatch(/d\.toFixed\(0\)\} M/);
    expect(src).not.toMatch(/d\.toFixed\(0\)\} m/);
  });

  it("RE-LEASING IN suffixes the wait as S, not 3s", () => {
    const src = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(src).toMatch(/RE-LEASING IN 3S/);
    expect(src).not.toMatch(/RE-LEASING IN 3s/);
  });

  it("and does not put the range on the ledger", () => {
    expect(ledgered("dummy")).toBe(false);
    expect(ledgered("player")).toBe(true);
    expect(ledgered("mech")).toBe(true);
  });
});

describe("the line under it", () => {
  it("says where it landed, how far, and what fired it", () => {
    expect(closeLine(hit({ zone: "head", distance: 41.4, weapon: "lease_breaker" }))).toBe("HEAD · 41 M · LEASE-BREAKER");
    expect(closeLine(hit({ zone: "legs", distance: 7.25 }))).toBe("LEGS · 7.3 M · LEASE-BREAKER");
    expect(closeLine(hit({ zone: "body", distance: 100 }))).toBe("BODY · 100 M · LEASE-BREAKER");
  });

  it("names the gun the way the rack does, not a hyphenated id", () => {
    expect(closeLine(hit({ weapon: "repo_hammer" }))).toBe("BODY · 20 M · REPO HAMMER");
    expect(closeLine(hit({ weapon: "stack_smg" }))).toBe("BODY · 20 M · STACK SMG");
    expect(closeLine(hit({ weapon: "longwave" }))).toBe("BODY · 20 M · LONGWAVE RAIL");
    expect(closeLine(hit({ weapon: "phage" }))).toBe("BODY · 20 M · PHAGE LAUNCHER");
    expect(closeLine(hit({ weapon: "shock_baton" }))).toBe("BODY · 20 M · SHOCK BATON");
    expect(closeLine(hit({ weapon: "directive" }))).toBe("BODY · 20 M · THE DIRECTIVE");
    expect(closeLine(hit({ weapon: "clockeater" }))).toBe("BODY · 20 M · CLOCKEATER");
    for (const w of WEAPON_LIST) {
      const line = closeLine(hit({ weapon: w.id }));
      expect(line, w.id).toContain(w.name);
      expect(line, w.id).not.toMatch(/_/);
    }
  });

  it("builds that name through weaponName, not a second spelling of the id", () => {
    const src = readFileSync(new URL("../client/hud/kill.ts", import.meta.url), "utf8");
    const fn = src.slice(src.indexOf("export function closeLine"), src.indexOf("export function weaponName"));
    expect(fn).toMatch(/weaponName\(read\.weapon\)/);
    expect(fn).not.toMatch(/replace\(\/_\/g/);
  });

  it("says nothing at all when there is nothing to say", () => {
    expect(closeLine(null)).toBe("");
  });
});

describe("the kill log names the body the city does", () => {
  it("calls a player a FILE, not PLAYER", () => {
    expect(victimLabel("player")).toBe("FILE");
    expect(victimLabel("player")).not.toBe("PLAYER");
    expect(victimLabel("dummy")).toBe("DUMMY");
    expect(victimLabel("wasp")).toBe("WASP");
    expect(victimLabel("mech")).toBe("MECH");
  });

  it("the offline log and the wire log both call victimLabel", () => {
    const src = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(src).toMatch(/victimLabel\(ev\.victimKind\)/);
    expect(src).toMatch(/victimLabel\(kind\)/);
    expect(src).not.toMatch(/ev\.victimKind\.toUpperCase\(\)/);
    expect(src).not.toMatch(/\["DUMMY", "FILE", "WASP", "MECH"\]/);
  });
});

describe("kill TTK is CRT", () => {
  it("suffixes S, not s", () => {
    expect(ttkNote(0.8)).toBe(" · TTK 0.80S");
    expect(ttkNote(0.8)).not.toMatch(/s$/);
    const src = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(src).toMatch(/ttkNote\(ev\.ttkTicks \/ SIM_HZ\)/);
    expect(src).toMatch(/ttkNote\(ev\.ttkSeconds\)/);
    expect(src).not.toMatch(/TTK \$\{.*\}\.toFixed\(2\)\}s/);
  });
});
