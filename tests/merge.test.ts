/**
 * A save is folded into the file, not written over it (Stage 58).
 *
 * The room's copy of a file is a snapshot from join. Every write made to the file while it was
 * in a match — a payout, a node bought at the desk, a contract claimed, a Rewrite — used to be
 * overwritten by the room's next save, and the payout undone that way was paid again by the next.
 * These cases are those writes, each with a match going on at the same time.
 */
import { describe, expect, it } from "vitest";
import { createAccount, sandboxAccount, type Account } from "../shared/progression/account";
import { LEDGER_CAP, mergeAccount } from "../server/merge";
import { depthForXp } from "../shared/progression/depth";

const clone = <T>(x: T): T => structuredClone(x);
const linked = (id: string): Account => {
  const a = createAccount(id, "FILE");
  a.counter = { address: "0xabc", linkedAt: 1, ghostfile: 1, stamps: [], name: null, rig: [], worn: 0, capital: "0", run: { day: 100, banked: 40, owed: 40, paid: 0 } };
  a.wallet.scrip = 500;
  a.xp = 1000;
  a.depth = 3;
  a.ledger = ["LINKED"];
  return a;
};

describe("a match's save folds into what was written meanwhile", () => {
  it("a payout at the desk during a match: the room banks more, the payout is not undone", () => {
    const base = linked("f1");
    // the desk pays out the 40 and records it
    const stored = clone(base);
    stored.counter!.run = { day: 100, banked: 40, owed: 0, paid: 40 };
    stored.ledger.push("PAYOUT 40");
    // the room banks 10 more on its own copy
    const next = clone(base);
    next.counter!.run = { day: 100, banked: 50, owed: 50, paid: 0 };
    next.ledger.push("BANKED 10");
    const out = mergeAccount(stored, base, next);
    expect(out.counter!.run).toEqual({ day: 100, banked: 50, owed: 10, paid: 40 });
    expect(out.ledger).toEqual(["LINKED", "PAYOUT 40", "BANKED 10"]);
  });

  it("a node bought at the desk during a match: the node stays owned and the Scrip stays spent", () => {
    const base = linked("f2");
    const stored = clone(base);
    stored.owned.push("node:x");
    stored.wallet.scrip = 200; // spent 300
    const next = clone(base);
    next.wallet.scrip = 650; // earned 150
    next.xp = 1400;
    const out = mergeAccount(stored, base, next);
    expect(out.owned).toContain("node:x");
    expect(out.wallet.scrip).toBe(350);
    expect(out.xp).toBe(1400);
  });

  it("a contract claimed at the desk during a match: the claim is kept, the match's counters land", () => {
    const base = linked("f3");
    base.daily = { day: 100, base: { kills: 3 }, claimed: [] };
    base.counters = { kills: 3 };
    const stored = clone(base);
    stored.daily!.claimed.push("close_five");
    stored.wallet.scrip += 100;
    const next = clone(base);
    next.counters = { kills: 8 };
    const out = mergeAccount(stored, base, next);
    expect(out.daily).toEqual({ day: 100, base: { kills: 3 }, claimed: ["close_five"] });
    expect(out.counters).toEqual({ kills: 8 });
    expect(out.wallet.scrip).toBe(600);
  });

  it("a Rewrite at the desk during a match: the file stays rewritten, and only the match's XP is on it", () => {
    const base = sandboxAccount("f4");
    base.xp = 500_000;
    base.ledger = ["OLD"];
    const stored = clone(base);
    stored.xp = 0;
    stored.depth = 1;
    stored.owned = [];
    stored.rewrites = 1;
    const next = clone(base);
    next.xp = 500_800; // the match paid 800
    next.depth = 50;
    const out = mergeAccount(stored, base, next);
    expect(out.xp).toBe(800);
    expect(out.depth).toBe(1); // the room did not move depth: the stored value stands
    expect(out.owned).toEqual([]);
    expect(out.rewrites).toBe(1);
    // and when both sides moved depth, the merged XP decides
    next.depth = 51;
    expect(mergeAccount(stored, base, next).depth).toBe(Math.max(1, depthForXp(800)));
  });

  it("a wallet linked at the desk during a match is on the file after the match", () => {
    const base = createAccount("f5", "FILE");
    const stored = clone(base);
    stored.counter = { address: "0xabc", linkedAt: 5, ghostfile: 1, stamps: [], name: null, rig: [], worn: 0, capital: "0" };
    const next = clone(base);
    next.matches = 1;
    next.stamps.push("first_kill");
    const out = mergeAccount(stored, base, next);
    expect(out.counter?.address).toBe("0xabc");
    expect(out.matches).toBe(1);
    expect(out.stamps).toEqual(["first_kill"]);
  });

  it("two rooms banking the same file: both banks count, once each", () => {
    const base = linked("f6");
    const stored = clone(base);
    stored.counter!.run = { day: 100, banked: 55, owed: 55, paid: 0 }; // the other room banked 15
    const next = clone(base);
    next.counter!.run = { day: 100, banked: 60, owed: 60, paid: 0 }; // this one banked 20
    expect(mergeAccount(stored, base, next).counter!.run).toEqual({ day: 100, banked: 75, owed: 75, paid: 0 });
  });

  it("nothing changed: the stored file comes back untouched", () => {
    const base = linked("f7");
    const stored = clone(base);
    stored.wallet.scrip = 1;
    stored.name = "RENAMED";
    stored.counter!.run!.owed = 0;
    expect(mergeAccount(stored, base, clone(base))).toEqual(stored);
  });

  it("the ledger appends past the cap without repeating what the room had already trimmed", () => {
    const base = linked("f8");
    base.ledger = Array.from({ length: LEDGER_CAP }, (_, i) => `L${i}`);
    const stored = clone(base);
    stored.ledger.push("DESK");
    const next = clone(base);
    next.ledger.push("ROOM A", "ROOM B");
    next.ledger.splice(0, next.ledger.length - LEDGER_CAP);
    const out = mergeAccount(stored, base, next);
    expect(out.ledger.length).toBe(LEDGER_CAP);
    expect(out.ledger.slice(-3)).toEqual(["DESK", "ROOM A", "ROOM B"]);
    expect(new Set(out.ledger).size).toBe(LEDGER_CAP);
  });

  it("a field the room replaced is replaced: a conflict on a scalar goes to the writer", () => {
    const base = linked("f9");
    const stored = clone(base);
    stored.moniker = "desk";
    const next = clone(base);
    next.moniker = "room";
    expect(mergeAccount(stored, base, next).moniker).toBe("room");
  });
});
