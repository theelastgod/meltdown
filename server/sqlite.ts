/**
 * One server that remembers (Stage 51).
 *
 * `server/node-host.ts` has always been the whole stack in one process — rooms, co-op, files, the
 * endgame, the counter-ledger — and it forgot everything on restart, because every store behind it
 * was a Map. These are the same five store interfaces on Node's built-in SQLite (`node:sqlite`,
 * no dependency), on the schema `server/schema.sql` already declares for D1, so a single box can
 * run the backend and keep it. `MELTDOWN_DB=meltdown.sqlite npx tsx server/node-host.ts`.
 *
 * The account store keeps a hot copy per file exactly as the PlayerFile Durable Object does: a
 * room holds the Account object it loaded and mutates it, so two loads of one id must be the same
 * object or the last save would win over the other's changes. Rows are written through on save.
 *
 * Nothing here decides anything. A store remembers what the room, the ledger and the settlement
 * told it, and the Workers' D1 implementations use the same SQL where one exists.
 */
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS, SCHEMA } from "./schema";
import { extrasOf } from "./file-row";
import type { AccountStore } from "./accounts";
import type { EndgameStore } from "./endgame";
import type { RunDayLine, RunDayStat, RunSettledRow, RunStore } from "./run-store";
import type { WalletStore } from "./chain/wallets";
import type { PrizeStore, StoredEpoch } from "./chain/prizes-store";
import { createAccount, upgradeAccount, type Account } from "../shared/progression/account";
import { leaderboard, type AuditEntry } from "../shared/endgame/audits";
import { applyRound, emptySeason, rollSeason, type RoundPush, type SeasonState } from "../shared/endgame/season";

/** Open (or create) the database and bring it to the current schema. `:memory:` works for tests. */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  for (const q of SCHEMA) db.exec(q);
  for (const q of MIGRATIONS) {
    try {
      db.exec(q);
    } catch (err) {
      if (!/duplicate column/i.test(String(err))) throw err;
    }
  }
  return db;
}

interface FileRow {
  id: string;
  name: string;
  xp: number;
  depth: number;
  scrip: number;
  wakelight: number;
  salvage: number;
  owned: string;
  loadout: string;
  wears: string;
  crafts: number;
  matches: number;
  extras: string;
}


export function accountOfRow(row: FileRow, ledger: string[]): Account {
  let extras: Partial<Account> = {};
  try {
    extras = JSON.parse(row.extras || "{}") as Partial<Account>;
  } catch {
    extras = {};
  }
  return upgradeAccount({
    ...extras,
    id: row.id,
    name: row.name,
    xp: row.xp,
    depth: row.depth,
    wallet: { scrip: row.scrip, wakelight: row.wakelight, salvage: row.salvage },
    owned: JSON.parse(row.owned) as string[],
    loadout: JSON.parse(row.loadout) as Account["loadout"],
    wears: JSON.parse(row.wears) as Account["wears"],
    crafts: row.crafts,
    matches: row.matches,
    ledger,
  } as Account);
}

export class SqliteAccountStore implements AccountStore {
  /** the hot copies: one object per id, so every holder of a file mutates the same one */
  private cache = new Map<string, Account>();
  private ledgerSaved = new Map<string, number>();
  saves = 0;
  constructor(private db: DatabaseSync, private seed: (id: string, name: string) => Account = createAccount) {}

  /** the hot copies, for the host's /stats — the same shape the memory store exposes */
  get accounts(): ReadonlyMap<string, Account> {
    return this.cache;
  }

  /** how many files the database holds (the host logs it at boot) */
  count(): number {
    return Number((this.db.prepare("SELECT COUNT(*) AS n FROM ghostfile").get() as { n: number }).n);
  }

  load(id: string, name: string): Account {
    const hot = this.cache.get(id);
    if (hot) return hot;
    const row = this.db.prepare("SELECT * FROM ghostfile WHERE id = ?").get(id) as FileRow | undefined;
    let a: Account;
    if (row) {
      const lines = (this.db.prepare("SELECT line FROM ledger WHERE account = ? ORDER BY seq ASC").all(id) as { line: string }[]).map((r) => r.line);
      a = accountOfRow(row, lines);
      this.ledgerSaved.set(id, lines.length);
    } else {
      a = upgradeAccount(this.seed(id, name));
      this.ledgerSaved.set(id, 0);
      this.cache.set(id, a);
      this.save(a);
      return a;
    }
    this.cache.set(id, a);
    return a;
  }

  save(a: Account): void {
    this.saves++;
    this.cache.set(a.id, a);
    const saved = this.ledgerSaved.get(a.id) ?? 0;
    const fresh = a.ledger.slice(saved);
    const now = Date.now();
    const upsert = this.db.prepare(
      `INSERT INTO ghostfile (id, name, xp, depth, scrip, wakelight, salvage, owned, loadout, wears, crafts, matches, updated_at, extras)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, xp = excluded.xp, depth = excluded.depth, scrip = excluded.scrip,
         wakelight = excluded.wakelight, salvage = excluded.salvage, owned = excluded.owned, loadout = excluded.loadout,
         wears = excluded.wears, crafts = excluded.crafts, matches = excluded.matches, updated_at = excluded.updated_at, extras = excluded.extras`,
    );
    const line = this.db.prepare("INSERT INTO ledger (account, line, at) VALUES (?, ?, ?)");
    this.db.exec("BEGIN");
    try {
      upsert.run(a.id, a.name, a.xp, a.depth, a.wallet.scrip, a.wallet.wakelight, a.wallet.salvage, JSON.stringify(a.owned), JSON.stringify(a.loadout), JSON.stringify(a.wears), a.crafts, a.matches, now, extrasOf(a));
      for (const l of fresh) line.run(a.id, l, now);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    // the ledger is capped in memory (the room trims it to 200), so a trimmed list is shorter than what was saved: count from its current length
    this.ledgerSaved.set(a.id, a.ledger.length);
  }
}

export class SqliteEndgameStore implements EndgameStore {
  constructor(private db: DatabaseSync) {}
  audit(week: number): AuditEntry[] {
    const rows = this.db.prepare("SELECT json FROM audit_entry WHERE week = ? ORDER BY seq ASC").all(week) as { json: string }[];
    return leaderboard(rows.map((r) => JSON.parse(r.json) as AuditEntry));
  }
  submitAudit(week: number, entry: AuditEntry): void {
    this.db.prepare("INSERT INTO audit_entry (week, json) VALUES (?, ?)").run(week, JSON.stringify(entry));
  }
  private loadSeason(): SeasonState {
    const row = this.db.prepare("SELECT json FROM season WHERE id = 1").get() as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as SeasonState) : emptySeason();
  }
  private saveSeason(st: SeasonState): void {
    this.db.prepare("INSERT INTO season (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json").run(JSON.stringify(st));
  }
  season(): SeasonState {
    const st = this.loadSeason();
    if (rollSeason(st)) this.saveSeason(st);
    return st;
  }
  pushSeason(push: RoundPush): SeasonState {
    const st = this.loadSeason();
    rollSeason(st);
    applyRound(st, push);
    this.saveSeason(st);
    return st;
  }
}

/** The same SQL as `run-d1.ts`, synchronous. */
export class SqliteRunStore implements RunStore {
  constructor(private db: DatabaseSync) {}
  add(day: number, file: string, units: number): void {
    if (!(units > 0)) return;
    this.db.prepare("INSERT INTO run_day (day, file, units) VALUES (?1, ?2, ?3) ON CONFLICT(day, file) DO UPDATE SET units = units + ?3").run(day, file, units);
    this.db.prepare("INSERT INTO run_day_stat (day, file, gross, eligible) VALUES (?1, ?2, ?3, 1) ON CONFLICT(day, file) DO UPDATE SET gross = gross + ?3, eligible = 1").run(day, file, units);
  }
  seen(day: number, file: string, eligible: boolean): void {
    this.db.prepare("INSERT INTO run_day_stat (day, file, gross, eligible) VALUES (?1, ?2, 0, ?3) ON CONFLICT(day, file) DO UPDATE SET eligible = MAX(eligible, ?3)").run(day, file, eligible ? 1 : 0);
  }
  stat(day: number): RunDayStat {
    const r = this.db
      .prepare("SELECT COALESCE(SUM(gross),0) AS gross, COALESCE(SUM(CASE WHEN gross > 0 THEN 1 ELSE 0 END),0) AS runners, COUNT(*) AS active, COALESCE(SUM(eligible),0) AS eligible FROM run_day_stat WHERE day = ?1")
      .get(day) as { gross: number; runners: number; active: number; eligible: number };
    return { day, grossUnits: Number(r.gross), runners: Number(r.runners), active: Number(r.active), eligible: Number(r.eligible) };
  }
  day(day: number): RunDayLine[] {
    // plain objects, not the driver's null-prototype rows: a consumer (and a deep-equality test) should see the memory store's shape
    return (this.db.prepare("SELECT file, units FROM run_day WHERE day = ?1 AND units > 0").all(day) as { file: string; units: number }[]).map((r) => ({ file: r.file, units: Number(r.units) }));
  }
  spend(day: number, file: string, units: number): void {
    this.db.prepare("UPDATE run_day SET units = MAX(0, units - ?3) WHERE day = ?1 AND file = ?2").run(day, file, units);
  }
  settled(day: number): RunSettledRow | null {
    const r = this.db.prepare("SELECT day, epoch, units, minted, rate, settled_at FROM run_settled WHERE day = ?1").get(day) as { day: number; epoch: number; units: number; minted: string; rate: string; settled_at: number } | undefined;
    return r ? { day: r.day, epoch: r.epoch, units: r.units, minted: Number(r.minted), rate: Number(r.rate), settledAt: r.settled_at } : null;
  }
  markSettled(row: RunSettledRow): void {
    this.db.prepare("INSERT INTO run_settled (day, epoch, units, minted, rate, settled_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(day) DO NOTHING").run(row.day, row.epoch, row.units, String(row.minted), String(row.rate), row.settledAt);
  }
}

/** The same SQL as `chain/wallets-d1.ts`, synchronous. */
export class SqliteWalletStore implements WalletStore {
  constructor(private db: DatabaseSync, private now: () => number = Date.now) {}
  issueNonce(account: string): string {
    const nonce = Array.from({ length: 16 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
    this.db.prepare("INSERT INTO siwe_nonce (account, nonce, at) VALUES (?1, ?2, ?3) ON CONFLICT(account) DO UPDATE SET nonce = ?2, at = ?3").run(account, nonce, this.now());
    return nonce;
  }
  takeNonce(account: string, nonce: string): boolean {
    const row = this.db.prepare("SELECT nonce, at FROM siwe_nonce WHERE account = ?1").get(account) as { nonce: string; at: number } | undefined;
    if (!row || row.nonce !== nonce || this.now() - row.at > 600_000) return false;
    this.db.prepare("DELETE FROM siwe_nonce WHERE account = ?1").run(account);
    return true;
  }
  accounts(): string[] {
    return (this.db.prepare("SELECT account FROM wallet").all() as { account: string }[]).map((r) => r.account);
  }
  accountOf(address: string): string | null {
    const row = this.db.prepare("SELECT account FROM wallet WHERE address = ?1").get(address.toLowerCase()) as { account: string } | undefined;
    return row?.account ?? null;
  }
  addressOf(account: string): string | null {
    const row = this.db.prepare("SELECT address FROM wallet WHERE account = ?1").get(account) as { address: string } | undefined;
    return row?.address ?? null;
  }
  bind(account: string, address: string, at: number): void {
    const a = address.toLowerCase();
    const other = this.accountOf(a);
    if (other && other !== account) throw new Error("wallet already bound to another file");
    const prev = this.addressOf(account);
    if (prev && prev !== a) throw new Error("file already bound to another wallet");
    if (!prev) this.db.prepare("INSERT INTO wallet (address, account, linked_at) VALUES (?1, ?2, ?3)").run(a, account, at);
  }
  unbind(account: string): void {
    this.db.prepare("DELETE FROM wallet WHERE account = ?1").run(account);
  }
}

/** The same SQL as `chain/prizes-d1.ts`, synchronous. */
export class SqlitePrizeStore implements PrizeStore {
  constructor(private db: DatabaseSync) {}
  list(): StoredEpoch[] {
    return (this.db.prepare("SELECT json FROM prize_epoch ORDER BY epoch").all() as { json: string }[]).map((r) => JSON.parse(r.json) as StoredEpoch);
  }
  get(epoch: number): StoredEpoch | null {
    const row = this.db.prepare("SELECT json FROM prize_epoch WHERE epoch = ?1").get(epoch) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as StoredEpoch) : null;
  }
  put(e: StoredEpoch): void {
    this.db.prepare("INSERT INTO prize_epoch (epoch, json) VALUES (?1, ?2) ON CONFLICT(epoch) DO UPDATE SET json = ?2").run(e.epoch, JSON.stringify(e));
  }
}
