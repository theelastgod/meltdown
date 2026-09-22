/**
 * PlayerFile Durable Object: the hot copy of one Ghostfile. One DO per account
 * id; every write to the file passes through it, one at a time. A save carries
 * the copy the writer started from and is folded into what is stored (Stage 58,
 * server/merge.ts) — before that the object serialised the writes and the last
 * one won, so a match's copy overwrote a payout or a purchase made meanwhile.
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
import { extrasOf, freshLedgerLines } from "./file-row";
import { mergeAccount } from "./merge";

/** The refusal the money route gives while another request holds the file (Stage 58). */
export const FILE_BUSY = "FILE BUSY: another request is moving this file; try again in a moment";
const LEASE = "lease";
/** a lease outlives any one chain round-trip; a Worker that died mid-request lets go this much later */
export const LEASE_MS = 60_000;

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

  /**
   * The file from storage, or from its D1 row when storage has none — and then written back to
   * storage (Stage 58): a cold load that stayed out of storage left the next save with nothing to
   * compare its ledger against, so every line the row already held was inserted again.
   */
  private async loadAccount(id: string): Promise<Account | undefined> {
    let a = await this.state.storage.get<Account>(KEY);
    if (!a && this.env.DB) {
      const db = this.env.DB;
      a = (await withSchema(db, () => loadRow(db, id))) ?? undefined;
      if (a) await this.state.storage.put(KEY, a);
    }
    return a;
  }

  /** Store the file and write the row, appending the ledger lines `prev` did not have. */
  private async persist(a: Account, prev?: Account): Promise<void> {
    const before = prev ?? (await this.state.storage.get<Account>(KEY));
    await this.state.storage.put(KEY, a);
    if (this.env.DB) {
      const db = this.env.DB;
      const fresh = freshLedgerLines(before?.ledger ?? [], a.ledger);
      await withSchema(db, () => saveRow(db, a, fresh));
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/load") {
      const { id, name } = (await request.json()) as { id: string; name: string };
      let a = await this.loadAccount(id);
      if (!a) {
        a = createAccount(id, name);
        await this.state.storage.put(KEY, a);
      }
      return Response.json(upgradeAccount(a));
    }
    if (request.method === "POST" && url.pathname === "/save") {
      const body = (await request.json()) as Account | { account: Account; base?: Account };
      const carried = "account" in body && body.account && typeof body.account === "object" ? body : { account: body as Account, base: undefined };
      const prev = await this.loadAccount(carried.account.id);
      // a save that says where it started from is folded into what is stored; a bare save replaces it
      const a = carried.base && prev ? mergeAccount(prev, carried.base, carried.account) : carried.account;
      await this.persist(a, prev);
      return Response.json({ ok: true });
    }
    /**
     * A lease on the file for the money route (Stage 58). The counter Worker loads a file, asks
     * the chain, and saves; two of those in flight for one file both read the same "owed" and
     * both move it. Requests to one Durable Object run one at a time, so the check and the set
     * here cannot interleave; the Worker holds the lease across its chain calls and lets go after
     * its save, and a lease a dead Worker never released expires on its own.
     */
    if (request.method === "POST" && url.pathname === "/lease") {
      const { key, ttl } = (await request.json()) as { key: string; ttl?: number };
      const cur = await this.state.storage.get<{ key: string; until: number }>(LEASE);
      if (cur && cur.key !== key && cur.until > Date.now()) return Response.json({ ok: false, reason: FILE_BUSY }, { status: 409 });
      await this.state.storage.put(LEASE, { key, until: Date.now() + (typeof ttl === "number" ? ttl : LEASE_MS) });
      return Response.json({ ok: true });
    }
    if (request.method === "POST" && url.pathname === "/release") {
      const { key } = (await request.json()) as { key: string };
      const cur = await this.state.storage.get<{ key: string; until: number }>(LEASE);
      if (cur && cur.key === key) await this.state.storage.delete(LEASE);
      return Response.json({ ok: true });
    }
    if (request.method === "POST" && (url.pathname === "/buy" || url.pathname === "/refund")) {
      const { id, node, secret } = (await request.json()) as { id: string; node?: string; secret?: string };
      const prev = await this.loadAccount(id);
      const a = upgradeAccount(prev ?? createAccount(id, "BLANK"));
      // the id names the file; the secret proves the caller owns it (Stage 26)
      const auth = fileAuth(a, secret);
      if (!auth.ok) return Response.json({ ok: false, reason: NOT_YOURS }, { status: 403 });
      const r = url.pathname === "/buy" ? buyNode(a, String(node ?? "")) : refundNode(a, String(node ?? ""));
      if (r.ok || auth.adopted) await this.persist(a, prev);
      return Response.json({ ok: r.ok, reason: r.reason, account: publicFile(a) });
    }
    if (request.method === "POST" && url.pathname === "/daily") {
      // read-only: the day's contracts as the file sees them. It sat in the gated list below until
      // Stage 56, so every file with a secret got NOT YOUR FILE on the endgame panel in production
      // — the Worker forwards a plain GET here with only the id, and the dev host never gated it.
      const { id } = (await request.json()) as { id: string };
      const prev = await this.loadAccount(id);
      const a = upgradeAccount(prev ?? createAccount(id, "BLANK"));
      const day = a.daily?.day;
      const view = dailyView(a);
      // the view rolls the day: a new base snapshot of the counters. Kept (Stage 58) — a roll that
      // was dropped here was taken again by the first claim after a match, from the post-match
      // counters, and the match's progress with it
      if (prev && a.daily?.day !== day) await this.persist(a, prev);
      return Response.json(view);
    }
    if (request.method === "POST" && ["/claim", "/rewrite", "/cosmetic"].includes(url.pathname)) {
      const body = (await request.json()) as { id: string; op?: string; slot?: number; name?: string; loadout?: unknown; alias?: string; secret?: string };
      const prev = await this.loadAccount(body.id);
      const a = upgradeAccount(prev ?? createAccount(body.id, "BLANK"));
      // a Rewrite resets a Depth-50 file to Depth 1: the one call that must never take a bare id
      const auth = fileAuth(a, body.secret);
      if (!auth.ok) return Response.json({ ok: false, reason: NOT_YOURS }, { status: 403 });
      let r: { ok: boolean; reason?: string } = { ok: true };
      if (url.pathname === "/claim") r = claimContract(a, String((body as { id?: unknown }).id ?? ""));
      else if (url.pathname === "/rewrite") r = rewrite(a);
      else if (url.pathname === "/cosmetic") r = body.op === "buy" ? buyCosmetic(a, String((body as { cosmetic?: unknown }).cosmetic ?? body.id)) : body.op === "theme" ? { ok: setTheme(a, (body as { theme?: string | null }).theme ?? null), reason: "NOT OWNED" } : body.op === "preset" ? savePreset(a, Number(body.slot ?? 0), String(body.name ?? ""), body.loadout) : body.op === "alias" ? setAlias(a, Number(body.slot ?? 0), String(body.alias ?? "")) : { ok: false, reason: "unknown op" };
      dailyView(a); // rolls the day
      // an adopted secret is kept whether or not the operation succeeded: a failed first request
      // must not leave the file still unowned (Stage 56)
      if (r.ok || auth.adopted) await this.persist(a, prev);
      return Response.json({ ...r, account: publicFile(a), daily: dailyView(a) });
    }
    if (request.method === "POST" && url.pathname === "/ghost") {
      const { id, run, secret } = (await request.json()) as { id: string; run?: unknown; secret?: string };
      let a = await this.state.storage.get<Account>(KEY);
      if (!a && this.env.DB) {
        const db = this.env.DB;
        a = (await withSchema(db, () => loadRow(db, id))) ?? undefined;
      }
      if (!a) a = createAccount(id, "BLANK");
      a = upgradeAccount(a);
      // a ghost is written to the file, so the file's secret is asked for (Stage 56): this was the
      // one mutating route on the Workers that still took a bare id, contrary to docs/SECURITY.md
      const auth = fileAuth(a, secret);
      if (!auth.ok) return Response.json({ ok: false, reason: NOT_YOURS }, { status: 403 });
      const g = validGhost(run);
      const ok = g ? recordGhost(a, g) : false;
      if (ok || auth.adopted) {
        const prev = await this.state.storage.get<Account>(KEY);
        await this.state.storage.put(KEY, a);
        if (this.env.DB) {
          const db = this.env.DB;
          const acc = a;
          const fresh = freshLedgerLines(prev?.ledger ?? [], acc.ledger);
          await withSchema(db, () => saveRow(db, acc, fresh));
        }
      }
      return Response.json({ ok, reason: g ? undefined : "malformed run", ghost: g ? a.ghosts[g.level] ?? null : null });
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
      const a = await this.loadAccount(id);
      return Response.json(publicFile(a ? upgradeAccount(a) : createAccount(id, name)));
    }
    if (request.method === "POST" && url.pathname === "/file") {
      // Until Stage 59 a bare `/file` route above this one (Stage 6) matched first and answered
      // `null` for a file not in storage, never reading D1: the counter and campaign Workers, which
      // load through here, threw on any file that had not joined a match on this object yet.
      const { id, name } = (await request.json()) as { id: string; name: string };
      const a = await this.loadAccount(id);
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

  async save(a: Account, base?: Account): Promise<void> {
    const stub = this.ns.get(this.ns.idFromName(a.id));
    await stub.fetch("https://file/save", { method: "POST", body: JSON.stringify(base ? { account: a, base } : a) });
  }
}

/**
 * Run `fn` holding the file's lease (Stage 58); `busy` answers when another request holds it.
 * The lease is released whatever `fn` does.
 */
export async function withLease(ns: DurableObjectNamespace, id: string, busy: (reason: string) => Response, fn: () => Promise<Response>): Promise<Response> {
  const stub = ns.get(ns.idFromName(id));
  const key = crypto.randomUUID();
  const got = (await (await stub.fetch("https://file/lease", { method: "POST", body: JSON.stringify({ id, key }) })).json()) as { ok: boolean; reason?: string };
  if (!got.ok) return busy(got.reason ?? FILE_BUSY);
  try {
    return await fn();
  } finally {
    await stub.fetch("https://file/release", { method: "POST", body: JSON.stringify({ id, key }) });
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
      // `extras` is the whole account minus the ledger (Stage 51). It used to be three fields — mastery,
      // stamps, counters — which meant a cold load from D1 (a file whose Durable Object storage was
      // gone) came back without its secret, its campaign, its wallet link or its cosmetics. The
      // column fields are written twice, which is cheap; a field that only exists in memory is not.
      .bind(a.id, a.name, a.xp, a.depth, a.wallet.scrip, a.wallet.wakelight, a.wallet.salvage, JSON.stringify(a.owned), JSON.stringify(a.loadout), JSON.stringify(a.wears), a.crafts, a.matches, Date.now(), extrasOf(a)),
  ];
  for (const line of freshLines) stmts.push(db.prepare("INSERT INTO ledger (account, line, at) VALUES (?, ?, ?)").bind(a.id, line, Date.now()));
  await db.batch(stmts);
}
