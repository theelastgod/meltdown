/**
 * PlayerFile Durable Object: the hot copy of one Ghostfile. One DO per account
 * id; the match room settles through it so two rooms can never race a write.
 * Durable rows go to D1 (schema.sql) on every save; DO storage is the cache.
 */
import { buyNode, createAccount, refundNode, upgradeAccount, type Account, recordGhost, validGhost } from "../shared/progression/account";
import { claimContract, dailyView } from "../shared/endgame/contracts";
import { buyCosmetic, rewrite, savePreset, setAlias, setTheme } from "../shared/endgame/rewrite";
import { fileAuth, publicFile } from "../shared/progression/account";

/** The one refusal every mutating file route gives, so it reads the same wherever it comes from. */
export const NOT_YOURS = "NOT YOUR FILE: this file has a secret and the request did not carry it";
import type { AccountStore } from "./accounts";
import { MIGRATIONS, SCHEMA } from "./schema";

export interface PlayerEnv {
  DB?: D1Database;
}

const KEY = "file";

async function ensureSchema(db: D1Database): Promise<void> {
  await db.batch(SCHEMA.map((q) => db.prepare(q)));
  for (const q of MIGRATIONS) {
    try {
      await db.prepare(q).run();
    } catch (err) {
      if (!/duplicate column/i.test(String(err))) throw err;
    }
  }
}

/** Run a D1 operation; on a missing table, create the schema once and retry. */
async function withSchema<T>(db: D1Database, op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (!/no such table|no such column|has no column/i.test(String(err))) throw err;
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
      return Response.json(upgradeAccount(a));
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
    if (request.method === "POST" && (url.pathname === "/buy" || url.pathname === "/refund")) {
      const { id, node, secret } = (await request.json()) as { id: string; node?: string; secret?: string };
      let a = await this.state.storage.get<Account>(KEY);
      if (!a && this.env.DB) {
        const db = this.env.DB;
        a = (await withSchema(db, () => loadRow(db, id))) ?? undefined;
      }
      if (!a) a = createAccount(id, "BLANK");
      a = upgradeAccount(a);
      // the id names the file; the secret proves the caller owns it (Stage 26)
      if (!fileAuth(a, secret).ok) return Response.json({ ok: false, reason: NOT_YOURS }, { status: 403 });
      const r = url.pathname === "/buy" ? buyNode(a, String(node ?? "")) : refundNode(a, String(node ?? ""));
      if (r.ok) {
        const prev = await this.state.storage.get<Account>(KEY);
        await this.state.storage.put(KEY, a);
        if (this.env.DB) {
          const db = this.env.DB;
          const acc = a;
          const fresh = acc.ledger.slice(prev?.ledger.length ?? 0);
          await withSchema(db, () => saveRow(db, acc, fresh));
        }
      }
      return Response.json({ ok: r.ok, reason: r.reason, account: publicFile(a) });
    }
    if (request.method === "POST" && ["/daily", "/claim", "/rewrite", "/cosmetic"].includes(url.pathname)) {
      const body = (await request.json()) as { id: string; op?: string; slot?: number; name?: string; loadout?: unknown; alias?: string; secret?: string };
      let a = await this.state.storage.get<Account>(KEY);
      if (!a && this.env.DB) {
        const db = this.env.DB;
        a = (await withSchema(db, () => loadRow(db, body.id))) ?? undefined;
      }
      if (!a) a = createAccount(body.id, "BLANK");
      a = upgradeAccount(a);
      // a Rewrite resets a Depth-50 file to Depth 1: the one call that must never take a bare id
      if (!fileAuth(a, body.secret).ok) return Response.json({ ok: false, reason: NOT_YOURS }, { status: 403 });
      let r: { ok: boolean; reason?: string } = { ok: true };
      if (url.pathname === "/claim") r = claimContract(a, String((body as { id?: unknown }).id ?? ""));
      else if (url.pathname === "/rewrite") r = rewrite(a);
      else if (url.pathname === "/cosmetic") r = body.op === "buy" ? buyCosmetic(a, String((body as { cosmetic?: unknown }).cosmetic ?? body.id)) : body.op === "theme" ? { ok: setTheme(a, (body as { theme?: string | null }).theme ?? null), reason: "not owned" } : body.op === "preset" ? savePreset(a, Number(body.slot ?? 0), String(body.name ?? ""), body.loadout) : body.op === "alias" ? setAlias(a, Number(body.slot ?? 0), String(body.alias ?? "")) : { ok: false, reason: "unknown op" };
      if (url.pathname !== "/daily") dailyView(a); // rolls the day
      if (r.ok && url.pathname !== "/daily") {
        const prev = await this.state.storage.get<Account>(KEY);
        await this.state.storage.put(KEY, a);
        if (this.env.DB) {
          const db = this.env.DB;
          const acc = a;
          const fresh = acc.ledger.slice(prev?.ledger.length ?? 0);
          await withSchema(db, () => saveRow(db, acc, fresh));
        }
      }
      return Response.json(url.pathname === "/daily" ? dailyView(a) : { ...r, account: publicFile(a), daily: dailyView(a) });
    }
    if (request.method === "POST" && url.pathname === "/ghost") {
      const { id, run } = (await request.json()) as { id: string; run?: unknown };
      let a = await this.state.storage.get<Account>(KEY);
      if (!a && this.env.DB) {
        const db = this.env.DB;
        a = (await withSchema(db, () => loadRow(db, id))) ?? undefined;
      }
      if (!a) a = createAccount(id, "BLANK");
      a = upgradeAccount(a);
      const g = validGhost(run);
      const ok = g ? recordGhost(a, g) : false;
      if (ok) {
        const prev = await this.state.storage.get<Account>(KEY);
        await this.state.storage.put(KEY, a);
        if (this.env.DB) {
          const db = this.env.DB;
          const acc = a;
          const fresh = acc.ledger.slice(prev?.ledger.length ?? 0);
          await withSchema(db, () => saveRow(db, acc, fresh));
        }
      }
      return Response.json({ ok, reason: g ? undefined : "malformed run", ghost: g ? a.ghosts[g.level] ?? null : null });
    }
    if (url.pathname === "/file") {
      const a = (await this.state.storage.get<Account>(KEY)) ?? null;
      return Response.json(a ? upgradeAccount(a) : null);
    }
    /**
     * The file as a client may read it (Stage 28).
     *
     * `/file` and `/load` above are the *internal* shape: the room and the two Workers load a file,
     * check its secret against what the request carried, apply, and save. They need the secret, and
     * they are reached over the DO binding, never from outside. `/public` is the shape that leaves
     * the edge, and it is a separate route rather than a flag so that a caller has to say which one
     * it wants — the previous arrangement had one route serving both, which is how the secret ended
     * up in the answer to an unauthenticated `GET /file/<id>`.
     */
    if (request.method === "POST" && url.pathname === "/public") {
      const { id, name } = (await request.json()) as { id: string; name: string };
      let a = await this.state.storage.get<Account>(KEY);
      if (!a && this.env.DB) {
        const db = this.env.DB;
        a = (await withSchema(db, () => loadRow(db, id))) ?? undefined;
      }
      return Response.json(publicFile(a ? upgradeAccount(a) : createAccount(id, name)));
    }
    if (request.method === "POST" && url.pathname === "/file") {
      const { id, name } = (await request.json()) as { id: string; name: string };
      let a = await this.state.storage.get<Account>(KEY);
      if (!a && this.env.DB) {
        const db = this.env.DB;
        a = (await withSchema(db, () => loadRow(db, id))) ?? undefined;
      }
      return Response.json(a ? upgradeAccount(a) : createAccount(id, name));
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
  extras?: string;
}

async function loadRow(db: D1Database, id: string): Promise<Account | null> {
  const row = await db.prepare("SELECT * FROM ghostfile WHERE id = ?").bind(id).first<Row>();
  if (!row) return null;
  const ledger = await db.prepare("SELECT line FROM ledger WHERE account = ? ORDER BY seq ASC").bind(id).all<{ line: string }>();
  let extras: Partial<Account> = {};
  try {
    extras = JSON.parse(row.extras ?? "{}");
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
    owned: JSON.parse(row.owned),
    loadout: JSON.parse(row.loadout),
    wears: JSON.parse(row.wears),
    crafts: row.crafts,
    matches: row.matches,
    ledger: (ledger.results ?? []).map((r) => r.line),
  });
}

/** Upsert the file row and append the ledger lines written since the last save. */
async function saveRow(db: D1Database, a: Account, freshLines: readonly string[]): Promise<void> {
  const stmts = [
    db
      .prepare(
        `INSERT INTO ghostfile (id, name, xp, depth, scrip, wakelight, salvage, owned, loadout, wears, crafts, matches, updated_at, extras)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, xp = excluded.xp, depth = excluded.depth, scrip = excluded.scrip,
           wakelight = excluded.wakelight, salvage = excluded.salvage, owned = excluded.owned, loadout = excluded.loadout,
           wears = excluded.wears, crafts = excluded.crafts, matches = excluded.matches, updated_at = excluded.updated_at, extras = excluded.extras`,
      )
      .bind(a.id, a.name, a.xp, a.depth, a.wallet.scrip, a.wallet.wakelight, a.wallet.salvage, JSON.stringify(a.owned), JSON.stringify(a.loadout), JSON.stringify(a.wears), a.crafts, a.matches, Date.now(), JSON.stringify({ mastery: a.mastery, stamps: a.stamps, counters: a.counters })),
  ];
  for (const line of freshLines) stmts.push(db.prepare("INSERT INTO ledger (account, line, at) VALUES (?, ?, ?)").bind(a.id, line, Date.now()));
  await db.batch(stmts);
}
