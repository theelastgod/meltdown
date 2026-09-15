/**
 * A file row's `extras` is the whole account minus the ledger (Stage 51).
 *
 * The PlayerFile Durable Object writes through to D1 on every save and reads D1 only on a cold
 * load; its `extras` column used to carry three fields, so a cold load came back without the
 * secret, the campaign, the wallet link and the cosmetics. This drives the real Durable Object
 * against a D1 shaped over Node's SQLite: save from one object, load from a fresh one with no
 * storage, and compare the whole account.
 */
import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { PlayerFile, type PlayerEnv } from "../server/player-do";
import { createAccount, type Account } from "../shared/progression/account";
import { extrasOf } from "../server/file-row";

/** D1's surface — prepare/bind/first/all/run/batch — over a synchronous SQLite. */
function fakeD1(db: DatabaseSync): D1Database {
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async <T>() => (db.prepare(sql).get(...(args as never[])) as T | undefined) ?? null,
    all: async <T>() => ({ results: db.prepare(sql).all(...(args as never[])) as T[] }),
    run: async () => {
      db.prepare(sql).run(...(args as never[]));
      return { success: true };
    },
  });
  return { prepare: (sql: string) => stmt(sql), batch: async (stmts: { run: () => Promise<unknown> }[]) => Promise.all(stmts.map((s) => s.run())) } as unknown as D1Database;
}

function fakeState(): DurableObjectState {
  const m = new Map<string, unknown>();
  return { storage: { get: async (k: string) => m.get(k), put: async (k: string, v: unknown) => void m.set(k, v) } } as unknown as DurableObjectState;
}

describe("a cold load from D1 is the whole file", () => {
  it("what one Durable Object saved, a fresh one with no storage loads back: secret, campaign, wallet link, cosmetics, mastery", async () => {
    const db = new DatabaseSync(":memory:");
    const env: PlayerEnv = { DB: fakeD1(db) };
    const a: Account = createAccount("cold", "COLD");
    a.secret = "kept";
    a.xp = 999;
    a.campaign = { ...(a.campaign ?? {}), faction: "estate" } as typeof a.campaign;
    a.counter = { address: "0xabc", linkedAt: 1, ghostfile: 2, stamps: [], name: null, rig: [3], worn: 3, capital: "0" };
    a.theme = "phosphor";
    a.counters["runBanked"] = 7;
    a.ledger.push("ONE");
    const warm = new PlayerFile(fakeState(), env);
    await warm.fetch(new Request("https://file/save", { method: "POST", body: JSON.stringify(a) }));
    const cold = new PlayerFile(fakeState(), env);
    const b = (await (await cold.fetch(new Request("https://file/load", { method: "POST", body: JSON.stringify({ id: "cold", name: "BLANK" }) }))).json()) as Account;
    expect(b.secret).toBe("kept");
    expect(b.xp).toBe(999);
    expect(b.campaign?.faction).toBe("estate");
    expect(b.counter?.rig).toEqual([3]);
    expect(b.theme).toBe("phosphor");
    expect(b.counters["runBanked"]).toBe(7);
    expect(b.ledger).toEqual(["ONE"]);
    // the rule itself: every field but the ledger is in extras
    const extras = JSON.parse(extrasOf(a)) as Record<string, unknown>;
    expect(Object.keys(extras).sort()).toEqual(Object.keys(a).filter((k) => k !== "ledger").sort());
  });
});
