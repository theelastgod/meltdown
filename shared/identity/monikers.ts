/**
 * Monikers and Chapters. A moniker is the name the city calls you before it
 * learns your real one; each is earned (a stamp, a counter, a Chapter) and
 * equipped in the Ghostfile. Chapters are the three rites of Depth: at 10
 * you are LISTED, at 25 DIVERGENT, at 50 NAMED — the file's empty NAME
 * field fills and the killfeed stops reading BLANK. None of this touches
 * a stat: the server only checks that an equipped moniker was earned.
 */
import type { Account } from "../progression/account";

export type MonikerUnlock =
  | { kind: "free" }
  | { kind: "chapter"; chapter: number }
  | { kind: "stamp"; stamp: string }
  | { kind: "counter"; counter: string; need: number };

export interface MonikerDef {
  id: string;
  text: string;
  unlock: MonikerUnlock;
  /** one line of how it was earned, for the FILE panel */
  how: string;
}

const m = (id: string, text: string, unlock: MonikerUnlock, how: string): MonikerDef => ({ id, text, unlock, how });

export const MONIKERS: readonly MonikerDef[] = [
  m("unlisted", "UNLISTED", { kind: "free" }, "every file starts here"),
  m("tenant", "TENANT", { kind: "counter", counter: "matches", need: 1 }, "play a match"),
  m("the_breaker", "LEASE-BREAKER", { kind: "stamp", stamp: "first_kill:lease_breaker" }, "first file closed with the Lease-Breaker"),
  m("repo_man", "REPO MAN", { kind: "stamp", stamp: "first_kill:repo_hammer" }, "first file closed with the Repo Hammer"),
  m("stacker", "STACKER", { kind: "stamp", stamp: "first_kill:stack_smg" }, "first file closed with the Stack"),
  m("the_longwave", "LONGWAVE", { kind: "stamp", stamp: "first_kill:longwave" }, "first file closed with the Longwave"),
  m("carrier", "CARRIER", { kind: "stamp", stamp: "first_kill:phage" }, "first file closed with the Phage"),
  m("live_wire", "LIVE WIRE", { kind: "stamp", stamp: "first_kill:shock_baton" }, "first file closed with the Shock Baton"),
  m("slider", "SLIDER", { kind: "counter", counter: "slideJumpKills", need: 1 }, "a slide-jump kill"),
  m("ledger_hand", "LEDGER HAND", { kind: "counter", counter: "flips", need: 10 }, "ten nodes pulled off the model"),
  m("full_wake", "FULL WAKE", { kind: "counter", counter: "fullWakes", need: 1 }, "a district fully woken"),
  m("drone_bane", "DRONE BANE", { kind: "counter", counter: "waspKills", need: 10 }, "ten wasps downed"),
  m("mech_breaker", "MECH BREAKER", { kind: "counter", counter: "mechKills", need: 1 }, "a repo mech disabled"),
  m("debt_collector", "DEBT COLLECTOR", { kind: "counter", counter: "debtsCleared", need: 1 }, "a Debt cleared"),
  m("nine_lives", "NINE LIVES", { kind: "counter", counter: "noDeathRounds", need: 1 }, "a round without a death"),
  m("citizen", "CITIZEN", { kind: "counter", counter: "districts", need: 3 }, "all three districts played"),
  m("listed", "LISTED", { kind: "chapter", chapter: 1 }, "Chapter I — Depth 10"),
  m("divergent", "DIVERGENT", { kind: "chapter", chapter: 2 }, "Chapter II — Depth 25"),
  m("named", "NAMED", { kind: "chapter", chapter: 3 }, "Chapter III — Depth 50"),
  m("wern_case", "WERN CASE", { kind: "counter", counter: "wins", need: 25 }, "twenty-five wakes won"),
];

export interface ChapterDef {
  chapter: 1 | 2 | 3;
  depth: number;
  numeral: string;
  title: string;
  lines: string[];
}

export const CHAPTERS: readonly ChapterDef[] = [
  { chapter: 1, depth: 10, numeral: "I", title: "LISTED", lines: ["THE MODEL HAS A LINE FOR YOU NOW.", "IT DOES NOT HAVE A NAME. IT HAS A GLYPH.", "THE GLYPH GROWS A LAYER."] },
  { chapter: 2, depth: 25, numeral: "II", title: "DIVERGENT", lines: ["FLAGGED UNDER THE WERN DIRECTIVE.", "EVERY WAKE YOU JOIN DEGRADES ITS CONFIDENCE.", "THE GLYPH GROWS A LAYER. VANTAGE STARTS TO LISTEN."] },
  { chapter: 3, depth: 50, numeral: "III", title: "NAMED", lines: ["THE NAME FIELD FILLS.", "THE CITY LEARNS YOUR NAME.", "THE KILLFEED STOPS READING BLANK."] },
];

/** 0 before Depth 10; 1 at 10; 2 at 25; 3 at 50. */
export function chapterFor(depth: number): number {
  return depth >= 50 ? 3 : depth >= 25 ? 2 : depth >= 10 ? 1 : 0;
}

export function monikerById(id: string | null | undefined): MonikerDef | null {
  return id ? (MONIKERS.find((x) => x.id === id) ?? null) : null;
}

export function monikerUnlocked(def: MonikerDef, a: Account): boolean {
  const u = def.unlock;
  switch (u.kind) {
    case "free":
      return true;
    case "chapter":
      return chapterFor(a.depth) >= u.chapter;
    case "stamp":
      return a.stamps.includes(u.stamp);
    case "counter":
      return (a.counters[u.counter] ?? 0) >= u.need;
  }
}

export function unlockedMonikers(a: Account): MonikerDef[] {
  return MONIKERS.filter((d) => monikerUnlocked(d, a));
}

/** The moniker the server lets a file wear: equipped and earned, else none. Never a kick. */
export function wornMoniker(a: Account | null, requested: string | null | undefined): MonikerDef | null {
  if (!a) return null;
  const def = monikerById(requested ?? a.moniker);
  return def && monikerUnlocked(def, a) ? def : null;
}
