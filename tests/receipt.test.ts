/**
 * The Ledger Entry, read the way a player reads it (Stage 29).
 *
 * The receipt is the only place the game explains what a match paid, and it printed three XP
 * buckets above a total those buckets did not sum to — `participation` and the win bonus are terms
 * of `matchXp` and appeared nowhere, so several hundred XP arrived from nothing. It also never said
 * what the player *did*: objective play is the heaviest weight in Depth and the counts behind it
 * were converted to XP at settlement and discarded.
 *
 * These cases parse the printed lines rather than reading the numbers back out of `matchXp`. A test
 * that asks the code what it computed cannot see a receipt that fails to print it — which is the
 * whole defect.
 */
import { describe, expect, it } from "vitest";
import { applyMatch, createAccount } from "../shared/progression/account";
import { World } from "../shared/sim/world";
import { levelById } from "../shared/sim/level";
import { XP_UNITS, type MatchContribution } from "../shared/progression/depth";

const contribution = (over: Partial<MatchContribution> = {}): MatchContribution => ({
  flips: 0,
  nodeSeconds: 0,
  kills: 0,
  assists: 0,
  supportPoints: 0,
  seconds: 600,
  won: false,
  ...over,
});

/** Every XP term the receipt names, taken from the text. */
function termsOf(lines: readonly string[]): number[] {
  const out: number[] = [];
  for (const l of lines) {
    const bucket = /→ (?:OBJECTIVE|COMBAT|SUPPORT) (-?\d+)$/.exec(l);
    if (bucket) out.push(Number(bucket[1]));
    for (const m of l.matchAll(/(?:PARTICIPATION|WOKE THE DISTRICT) (\d+)/g)) out.push(Number(m[1]));
  }
  return out;
}

/** The total the receipt claims. */
const totalOf = (lines: readonly string[]): number => Number(/XP \+(-?\d+)/.exec(lines.find((l) => l.startsWith("XP +")) ?? "")?.[1] ?? NaN);

const receipt = (c: MatchContribution): string[] => applyMatch(createAccount(`f${Math.random()}`, "BLANK"), c).lines;

describe("the receipt adds up", () => {
  const cases: [string, MatchContribution][] = [
    ["a strong win", contribution({ flips: 3, nodeSeconds: 84.2, kills: 5, assists: 2, supportPoints: 10, won: true })],
    ["a quiet loss with nothing on it", contribution()],
    ["a win with no objective play at all", contribution({ kills: 9, assists: 1, won: true })],
    ["an objective game with no kills", contribution({ flips: 6, nodeSeconds: 240, supportPoints: 40 })],
    ["fractional node seconds and support", contribution({ flips: 1, nodeSeconds: 17.6, supportPoints: 3.4, kills: 1, won: true })],
  ];
  for (const [name, c] of cases) {
    it(`${name}: the named terms sum to the printed total`, () => {
      const lines = receipt(c);
      const terms = termsOf(lines);
      expect(terms.length).toBeGreaterThan(0);
      expect(terms.reduce((s, n) => s + n, 0)).toBe(totalOf(lines));
    });
  }

  it("the win bonus is a term only when the round was won, and is named when it is", () => {
    const won = receipt(contribution({ won: true }));
    const lost = receipt(contribution());
    expect(won.some((l) => l.includes(`WOKE THE DISTRICT ${XP_UNITS.winBonus}`))).toBe(true);
    expect(lost.some((l) => l.includes("WOKE THE DISTRICT"))).toBe(false);
    // and both still close, which is the point of naming it rather than hiding it
    expect(termsOf(won).reduce((s, n) => s + n, 0)).toBe(totalOf(won));
    expect(termsOf(lost).reduce((s, n) => s + n, 0)).toBe(totalOf(lost));
    expect(totalOf(won) - totalOf(lost)).toBe(XP_UNITS.winBonus);
  });
});

describe("the receipt says what you did, not only what you earned", () => {
  it("the counts behind every bucket are on the receipt, beside the XP they paid", () => {
    const lines = receipt(contribution({ flips: 3, nodeSeconds: 84.2, kills: 5, assists: 2, supportPoints: 10, won: true }));
    expect(lines.some((l) => /^3 FLIPS · 84 NODE SECONDS → OBJECTIVE \d+$/.test(l))).toBe(true);
    expect(lines.some((l) => /^5 CLOSED · 2 ASSISTS → COMBAT \d+$/.test(l))).toBe(true);
    expect(lines.some((l) => /^10 SUPPORT → SUPPORT \d+$/.test(l))).toBe(true);
  });

  it("a bucket that paid nothing still prints its zero, because a receipt lists its terms", () => {
    const lines = receipt(contribution({ kills: 4 }));
    expect(lines.some((l) => l.startsWith("0 FLIPS · 0 NODE SECONDS →"))).toBe(true);
    expect(lines.some((l) => l.startsWith("0 SUPPORT →"))).toBe(true);
  });

  it("the flips a player is scored on are the flips the receipt shows", () => {
    // XP_WEIGHTS.flips is the heaviest term in Depth; before Stage 29 the number behind it was
    // never shown anywhere in the game
    const a = receipt(contribution({ flips: 2, won: false }));
    const b = receipt(contribution({ flips: 7, won: false }));
    expect(a.find((l) => l.includes("FLIPS"))).toContain("2 FLIPS");
    expect(b.find((l) => l.includes("FLIPS"))).toContain("7 FLIPS");
    expect(totalOf(b)).toBeGreaterThan(totalOf(a));
  });
});

describe("the trophy wall still recognises a match, and nothing else on the receipt", () => {
  /**
   * `trophiesFromLedger` picks lines out of the ledger by prefix. The receipt grew three lines in
   * Stage 29, and a new line that happened to start like a trophy would have quietly filled the
   * Deadletter Office with XP arithmetic.
   */
  it("only the MATCH line is a trophy", async () => {
    const { trophiesFromLedger } = await import("../client/render/hub");
    const lines = receipt(contribution({ flips: 3, nodeSeconds: 84, kills: 5, assists: 2, supportPoints: 10, won: true }));
    expect(trophiesFromLedger(lines)).toEqual([lines[0]]);
  });
});

describe("what a networked client is allowed to believe about its own counters", () => {
  /**
   * `LocalAuth` reconciles four of the thirteen counters in `PlayerStats`. The other nine are only
   * right on whoever runs the authoritative sim, and in a room that is the server. Nothing
   * player-facing reads them on the client — but a probe did in Stage 28, got a zero for a flip the
   * room had credited, and the stage's write-up carried a wrong diagnosis because of it.
   *
   * This pins the set. Adding a counter to `PlayerStats` fails it, which is the point: the fix is
   * to decide whether the client may believe the new one, not to widen the list on reflex.
   */
  it("the reconciled set is exactly the four the wire carries", () => {
    const w = new World(levelById("drainage_yard"));
    const p = w.addPlayer(1, "A");
    p.stats.kills = 7;
    p.stats.deaths = 3;
    p.stats.shots = 40;
    p.stats.hits = 22;
    p.stats.flips = 5;
    p.stats.nodeSeconds = 91;
    p.stats.support = 12;
    p.stats.assists = 2;
    p.stats.jumps = 4;

    const wire = w.exportLocal(p, 0);
    const other = new World(levelById("drainage_yard"));
    const q = other.addPlayer(1, "A"); // a fresh player: every counter at zero
    other.importLocal(q, wire);

    const reconciled = Object.keys(p.stats).filter((k) => (q.stats as unknown as Record<string, number>)[k] === (p.stats as unknown as Record<string, number>)[k] && (p.stats as unknown as Record<string, number>)[k] !== 0);
    expect(reconciled.sort()).toEqual(["deaths", "hits", "kills", "shots"]);
    // and the objective counters really do arrive as nothing, which is the trap being pinned
    expect(q.stats.flips).toBe(0);
    expect(q.stats.nodeSeconds).toBe(0);
    expect(q.stats.support).toBe(0);
  });
});
