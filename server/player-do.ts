/**
 * PlayerFile Durable Object: the hot copy of one Ghostfile. One DO per account
 * id; the match room settles through it so two rooms can never race a write.
 * Durable rows go to D1 (schema.sql) on every save; DO storage is the cache.
 */
import { createAccount, type Account } from "../shared/progression/account";
import type { AccountStore } from "./accounts";
import { SCHEMA } from "./schema";

export interface PlayerEnv {
  DB?: D1Database;
}

const KEY = "file";

async function ensureSchema(db: D1Database): Promise<void> {
  await db.batch(SCHEMA.map((q) => db.prepare(q)));
}

/** Run a D1 operation; on a missing table, create the schema once and retry. */
async function withSchema<T>(db: D1Database, op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (!/no such table/i.test(String(err))) throw err;
    await ensureSchema(db);
    return await op();
  }
}

export class PlayerFile implements DurableObject {
  constructor(private state: DurableObjectState, private env: PlayerEnv) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/load") {
      const { id, name } = (await request.json()) as { id: string; name: string };
      let a = await this.state.storage.get<Account>(KEY);
      if (!a && this.env.DB) {
        const db = this.env.DB;
        a = (await withSchema(db, () => loadRow(db, id))) ?? undefined;
      }
      if (!a) {
        a = createAccount(id, name);
        await this.state.storage.put(KEY, a);
      }
      return Response.json(a);
    }
    if (request.method === "POST" && url.pathname === "/save") {
      const a = (await request.json()) as Account;
      const prev = await this.state.storage.get<Account>(KEY);
      await this.state.storage.put(KEY, a);
      if (this.env.DB) {
        const db = this.env.DB;
        const fresh = a.ledger.slice(prev?.ledger.length ?? 0);
        await withSchema(db, () => saveRow(db, a, fresh));
      }
      return Response.json({ ok: true });
    }
    if (url.pathname === "/file") {
      const a = (await this.state.storage.get<Account>(KEY)) ?? null;
      return Response.json(a);
    }
    return new Response("player file", { status: 404 });
  }
}

/** Room-side store that talks to the PlayerFile DO namespace. */
export class DoAccountStore implements AccountStore {
  constructor(private ns: DurableObjectNamespace) {}

  async load(id: string, name: string): Promise<Account> {
    const stub = this.ns.get(this.ns.idFromName(id));
    const res = await stub.fetch("https://file/load", { method: "POST", body: JSON.stringify({ id, name }) });
    return (await res.json()) as Account;
  }

  async save(a: Account): Promise<void> {
    const stub = this.ns.get(this.ns.idFromName(a.id));
    await stub.fetch("https://file/save", { method: "POST", body: JSON.stringify(a) });
  }
}

// ---- D1 rows (see server/schema.sql) ----

interface Row {
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
}

async function loadRow(db: D1Database, id: string): Promise<Account | null> {
  const row = await db.prepare("SELECT * FROM ghostfile WHERE id = ?").bind(id).first<Row>();
  if (!row) return null;
  const ledger = await db.prepare("SELECT line FROM ledger WHERE account = ? ORDER BY seq ASC").bind(id).all<{ line: string }>();
  return {
    id: row.id,
    name: row.name,
    xp: row.xp,
    depth: row.depth,
    wallet: { scrip: row.scrip, wakelight: row.wakelight, salvage: row.salvage },
    owned: JSON.parse(row.owned),
    loadout: JSON.parse(row.loadout),
    wears: JSON.parse(row.wears),
    crafts: row.crafts,
    matches: row.matches,
    ledger: (ledger.results ?? []).map((r) => r.line),
  };
}

/** Upsert the file row and append the ledger lines written since the last save. */
async function saveRow(db: D1Database, a: Account, freshLines: readonly string[]): Promise<void> {
  const stmts = [
    db
      .prepare(
        `INSERT INTO ghostfile (id, name, xp, depth, scrip, wakelight, salvage, owned, loadout, wears, crafts, matches, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, xp = excluded.xp, depth = excluded.depth, scrip = excluded.scrip,
           wakelight = excluded.wakelight, salvage = excluded.salvage, owned = excluded.owned, loadout = excluded.loadout,
           wears = excluded.wears, crafts = excluded.crafts, matches = excluded.matches, updated_at = excluded.updated_at`,
      )
      .bind(a.id, a.name, a.xp, a.depth, a.wallet.scrip, a.wallet.wakelight, a.wallet.salvage, JSON.stringify(a.owned), JSON.stringify(a.loadout), JSON.stringify(a.wears), a.crafts, a.matches, Date.now()),
  ];
  for (const line of freshLines) stmts.push(db.prepare("INSERT INTO ledger (account, line, at) VALUES (?, ?, ?)").bind(a.id, line, Date.now()));
  await db.batch(stmts);
}
