/**
 * One server that remembers (Stage 51): the five store interfaces on Node's built-in SQLite.
 *
 * Each store is driven by the same script as its memory twin and must answer the same; then the
 * database is closed and reopened from disk and must still answer — that is the whole point, and
 * the memory store cannot pass it.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDatabase, SqliteAccountStore, SqliteEndgameStore, SqlitePrizeStore, SqliteRunStore, SqliteWalletStore } from "../server/sqlite";
import { MemoryAccountStore, devSeed } from "../server/accounts";
import { MemoryEndgameStore } from "../server/endgame";
import { MemoryRunStore, type RunStore } from "../server/run-store";
import { MemoryWalletStore, type WalletStore } from "../server/chain/wallets";
import { MemoryPrizeStore, type PrizeStore, type StoredEpoch } from "../server/chain/prizes-store";
import { SCHEMA } from "../server/schema";
import type { AuditEntry } from "../shared/endgame/audits";

const dir = mkdtempSync(join(tmpdir(), "meltdown-sqlite-"));
const file = (name: string) => join(dir, name);

describe("the database", () => {
  it("opens with every table the schema declares, and a second open is not a second schema", () => {
    const db = openDatabase(":memory:");
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((r) => r.name).sort();
    const declared = SCHEMA.map((q) => /CREATE TABLE IF NOT EXISTS (\w+)/.exec(q)?.[1]).filter((x): x is string => !!x).sort();
    expect(tables).toEqual(declared);
    expect(tables).toContain("ghostfile");
    expect(tables).toContain("audit_entry");
    expect(tables).toContain("season");
    expect(tables).toContain("perf_report");
    db.close();
    const path = file("twice.sqlite");
    openDatabase(path).close();
    expect(() => openDatabase(path).close()).not.toThrow();
  });
});

describe("files", () => {
  it("seeds on first load like the memory store, hands every holder the same object, and writes through on save", () => {
    const db = openDatabase(":memory:");
    const store = new SqliteAccountStore(db, devSeed);
    const mem = new MemoryAccountStore(devSeed);
    const a = store.load("rich-one", "RICH");
    const m = mem.load("rich-one", "RICH");
    expect(a.depth).toBe(m.depth);
    expect(a.wallet.scrip).toBe(m.wallet.scrip);
    expect(store.load("rich-one", "X")).toBe(a); // identity: a room and a route mutate one object
    expect(store.count()).toBe(1);
    a.wallet.scrip -= 100;
    a.ledger.push("SPENT 100");
    store.save(a);
    store.save(a); // a second save appends nothing twice
    const rows = db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE account = 'rich-one'").get() as { n: number };
    expect(Number(rows.n)).toBe(1);
    db.close();
  });

  it("survives a close and a reopen with everything a file carries: depth, scrip, owned, secret, campaign, wallet link, mastery, ledger", () => {
    const path = file("files.sqlite");
    const db1 = openDatabase(path);
    const s1 = new SqliteAccountStore(db1, devSeed);
    const a = s1.load("keeper", "KEEPER");
    a.xp = 4200;
    a.depth = 7;
    a.wallet.scrip = 321;
    a.owned.push("slipfile");
    a.secret = "the-files-own-secret";
    a.campaign = { ...(a.campaign ?? {}), faction: "cells" } as typeof a.campaign;
    a.counter = { address: "0xabc", linkedAt: 5, ghostfile: 1, stamps: ["s1"], name: "THE_KEEPER", rig: [], worn: 0, capital: "12" };
    a.counters["runBanked"] = 40;
    a.ledger.push("LINE ONE", "LINE TWO");
    s1.save(a);
    db1.close();

    const db2 = openDatabase(path);
    const s2 = new SqliteAccountStore(db2, devSeed);
    const b = s2.load("keeper", "IGNORED");
    expect(b).not.toBe(a); // a new process has no hot copy
    expect(b.xp).toBe(4200);
    expect(b.depth).toBe(7);
    expect(b.wallet.scrip).toBe(321);
    expect(b.owned).toContain("slipfile");
    expect(b.secret).toBe("the-files-own-secret");
    expect(b.campaign?.faction).toBe("cells");
    expect(b.counter?.name).toBe("THE_KEEPER");
    expect(b.counters["runBanked"]).toBe(40);
    expect(b.ledger.slice(-2)).toEqual(["LINE ONE", "LINE TWO"]);
    b.ledger.push("LINE THREE");
    s2.save(b);
    expect(Number((db2.prepare("SELECT COUNT(*) AS n FROM ledger WHERE account = 'keeper'").get() as { n: number }).n)).toBe(3); // the reopen counted the saved lines, so nothing is written twice
    db2.close();
  });
});

const entry = (account: string, score: number): AuditEntry => ({ account, display: account.toUpperCase(), score, at: score });

describe("a full file keeps banking", () => {
  it("after the room trims a 200-line ledger, the new line is still written and comes back on reopen", () => {
    const path = file("full.sqlite");
    const db1 = openDatabase(path);
    const s1 = new SqliteAccountStore(db1, devSeed);
    const a = s1.load("full", "FULL");
    a.ledger = Array.from({ length: 200 }, (_, i) => `LINE ${i}`);
    s1.save(a);
    a.ledger.push("BANKED 40 AT GATE");
    if (a.ledger.length > 200) a.ledger.splice(0, a.ledger.length - 200); // server/room.ts's cap
    s1.save(a);
    db1.close();
    const db2 = openDatabase(path);
    const b = new SqliteAccountStore(db2, devSeed).load("full", "X");
    expect(b.ledger).toHaveLength(201);
    expect(b.ledger[200]).toBe("BANKED 40 AT GATE");
    db2.close();
  });
});

describe("the endgame", () => {
  it("keeps the week's board and the season across a reopen, and answers like the memory store", () => {
    const path = file("endgame.sqlite");
    const mem = new MemoryEndgameStore();
    const db1 = openDatabase(path);
    const s1 = new SqliteEndgameStore(db1);
    for (const st of [mem, s1]) {
      st.submitAudit(7, entry("a", 10));
      st.submitAudit(7, entry("b", 30));
      st.submitAudit(8, entry("c", 5));
    }
    expect(s1.audit(7)).toEqual(mem.audit(7));
    expect(s1.audit(7).map((e) => e.account)).toEqual(["b", "a"]);
    expect(s1.audit(9)).toEqual([]);
    const seasonBefore = JSON.stringify(s1.season());
    db1.close();
    const db2 = openDatabase(path);
    const s2 = new SqliteEndgameStore(db2);
    expect(s2.audit(7).map((e) => e.account)).toEqual(["b", "a"]);
    expect(JSON.stringify(s2.season())).toBe(seasonBefore);
    db2.close();
  });
});

describe("the run's day", () => {
  const script = (st: RunStore) => {
    st.add(20000, "f1", 40);
    st.add(20000, "f1", 10);
    st.add(20000, "f2", 5);
    st.add(20000, "f3", 0); // nothing banked is nothing recorded
    st.seen(20000, "f4", true);
    st.seen(20000, "f5", false);
    st.spend(20000, "f1", 30);
    st.restore(20000, "f1", 10); // the reconciliation's repair: ledger only, the gross record untouched
    st.markSettled({ day: 19999, epoch: 3, units: 100, minted: 12.5, rate: 0.125, settledAt: 1 });
    st.markSettled({ day: 19999, epoch: 4, units: 1, minted: 1, rate: 1, settledAt: 2 }); // a second settlement of the same day is refused
  };
  const read = async (st: RunStore) => ({ day: [...(await st.day(20000))].sort((a, b) => a.file.localeCompare(b.file)), stat: await st.stat(20000), settled: await st.settled(19999), unsettled: await st.settled(20000) });
  it("answers exactly like the memory store, then the same after a reopen", async () => {
    const mem = new MemoryRunStore();
    script(mem);
    const path = file("run.sqlite");
    const db1 = openDatabase(path);
    const s1 = new SqliteRunStore(db1);
    script(s1);
    const want = await read(mem);
    expect(await read(s1)).toEqual(want);
    expect(want.day).toEqual([{ file: "f1", units: 30 }, { file: "f2", units: 5 }]); // 50 banked − 30 paid + 10 restored
    expect(want.stat).toEqual({ day: 20000, grossUnits: 55, runners: 2, active: 4, eligible: 3 }); // the restore did not touch gross
    expect(want.settled?.epoch).toBe(3);
    expect(want.unsettled).toBeNull();
    db1.close();
    const db2 = openDatabase(path);
    expect(await read(new SqliteRunStore(db2))).toEqual(want);
    db2.close();
  });
});

describe("wallets", () => {
  const script = async (st: WalletStore) => {
    await st.bind("file-a", "0xAAAA", 1);
    await st.bind("file-a", "0xaaaa", 2); // the same binding again is fine
    await expect(Promise.resolve().then(() => st.bind("file-b", "0xaaaa", 3))).rejects.toThrow(/already bound to another file/);
    await expect(Promise.resolve().then(() => st.bind("file-a", "0xbbbb", 3))).rejects.toThrow(/already bound to another wallet/);
    await st.bind("file-c", "0xCCCC", 4);
  };
  it("binds 1:1 like the memory store, spends a nonce once and not after ten minutes, and keeps the bindings across a reopen", async () => {
    let now = 1_000_000;
    const clock = () => now;
    const mem = new MemoryWalletStore(clock);
    await script(mem);
    const path = file("wallets.sqlite");
    const db1 = openDatabase(path);
    const s1 = new SqliteWalletStore(db1, clock);
    await script(s1);
    for (const st of [mem, s1]) {
      expect(await st.accountOf("0xAAAA")).toBe("file-a");
      expect(await st.addressOf("file-c")).toBe("0xcccc");
      expect([...(await st.accounts())].sort()).toEqual(["file-a", "file-c"]);
      const n = await st.issueNonce("file-a");
      expect(await st.takeNonce("file-a", "wrong")).toBe(false);
      expect(await st.takeNonce("file-a", n)).toBe(true);
      expect(await st.takeNonce("file-a", n)).toBe(false); // spent
      const late = await st.issueNonce("file-c");
      now += 600_001;
      expect(await st.takeNonce("file-c", late)).toBe(false);
      now -= 600_001;
    }
    db1.close();
    const db2 = openDatabase(path);
    const s2 = new SqliteWalletStore(db2, clock);
    expect(await s2.accountOf("0xaaaa")).toBe("file-a");
    expect([...(await s2.accounts())].sort()).toEqual(["file-a", "file-c"]);
    await s2.unbind("file-a");
    expect(await s2.accountOf("0xaaaa")).toBeNull();
    db2.close();
  });
});

describe("posted epochs", () => {
  const ep = (epoch: number): StoredEpoch => ({ epoch, kind: "audit", period: epoch, root: "0x00", total: "1", postedAt: epoch, leaves: [] } as StoredEpoch);
  it("lists in epoch order like the memory store and keeps them across a reopen", async () => {
    const mem = new MemoryPrizeStore();
    const path = file("prizes.sqlite");
    const db1 = openDatabase(path);
    const s1 = new SqlitePrizeStore(db1);
    for (const st of [mem, s1] as PrizeStore[]) {
      await st.put(ep(5));
      await st.put(ep(2));
      await st.put({ ...ep(5), total: "9" }); // an epoch is replaced, not duplicated
    }
    expect(await s1.list()).toEqual(await mem.list());
    expect((await s1.list()).map((e) => e.epoch)).toEqual([2, 5]);
    expect((await s1.get(5))?.total).toBe("9");
    expect(await s1.get(9)).toBeNull();
    db1.close();
    const db2 = openDatabase(path);
    expect((await new SqlitePrizeStore(db2).list()).map((e) => e.epoch)).toEqual([2, 5]);
    db2.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

// keep the type in scope for the schema comparison above
void DatabaseSync;
