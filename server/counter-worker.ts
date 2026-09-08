/**
 * The counter-ledger Worker: wallet link (SIWE), sponsored Ghostfile + stamp vouchers, name
 * vouchers, the market view and the rig reconcile. A separate script from meltdown-match so the
 * PvP Durable Object bundle carries no economy module and no chain client; files live in the PvP
 * worker's PlayerFile DO, reached through a cross-script binding (load → apply → save).
 *
 * Secrets (wrangler secret put): SIGNER_KEY, RELAYER_KEY. Vars: CHAIN_ID, CHAIN_RPC, CONTRACTS (JSON).
 */
import { http, type Hex } from "viem";
import { CounterLedger } from "./chain/ledger";
import { D1WalletStore } from "./chain/wallets-d1";
import { D1PrizeStore } from "./chain/prizes-d1";
import { auditPrizes, seasonPrizes } from "../shared/economy/prizes";
import { settleRunDay } from "./chain/settle-run";
import { reconcileRunBacklog, reconcileRunDay } from "./chain/reconcile-run";
import { D1RunStore } from "./run-d1";
import { dayIndex, seasonIndex, weekIndex } from "../shared/endgame/clock";
import type { Contracts } from "./chain/deploy";
import { counterRequest } from "../shared/economy/endpoint";
import { fileAuth, upgradeAccount, type Account } from "../shared/progression/account";
import { NOT_YOURS } from "./player-do";

export interface Env {
  PLAYER_FILE: DurableObjectNamespace;
  /** the PvP worker's Endgame DO (boards, the season) for the prize job */
  ENDGAME?: DurableObjectNamespace;
  DB: D1Database;
  CHAIN_ID: string;
  CHAIN_RPC: string;
  CONTRACTS: string;
  SIGNER_KEY: string;
  RELAYER_KEY: string;
  SIWE_DOMAINS?: string;
  /**
   * The shared secret for `/prizes/post` (`wrangler secret put ADMIN_KEY`).
   *
   * That route runs the same settlement the cron runs, but with a day the *caller* chooses, and a
   * settled day is refused a second time by design — so an anonymous POST naming today could mark
   * today settled before anybody had finished banking, and every unit banked afterwards would be
   * stranded for good. It is an operator's button, and until Stage 28 it had no lock on it.
   *
   * With no ADMIN_KEY configured the route is closed rather than open: a missing secret is the
   * likeliest state of a fresh deploy, and the cron does not need this route.
   */
  ADMIN_KEY?: string;
}

const rateWindows = new Map<string, { at: number; n: number }>();
const rateOk = (id: string, now = Date.now()): boolean => {
  const w = rateWindows.get(id);
  if (!w || now - w.at > 60_000) {
    rateWindows.set(id, { at: now, n: 1 });
    return true;
  }
  w.n++;
  return w.n <= 30;
};
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "content-type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

function ledgerOf(env: Env): CounterLedger {
  return new CounterLedger({
    chainId: Number(env.CHAIN_ID),
    transport: http(env.CHAIN_RPC),
    signerKey: env.SIGNER_KEY as Hex,
    relayerKey: env.RELAYER_KEY as Hex,
    contracts: JSON.parse(env.CONTRACTS) as Contracts,
    wallets: new D1WalletStore(env.DB),
    prizes: new D1PrizeStore(env.DB),
    runs: new D1RunStore(env.DB),
    devnet: false,
    domains: env.SIWE_DOMAINS ? env.SIWE_DOMAINS.split(",") : [],
  });
}

/** Files live in the PvP worker's PlayerFile DO; the counter reaches them by name (load → apply → save). */
function filesOf(env: Env) {
  const stubOf = (id: string) => env.PLAYER_FILE.get(env.PLAYER_FILE.idFromName(id));
  return {
    load: async (id: string): Promise<Account> => upgradeAccount((await (await stubOf(id).fetch(new Request("https://file/file", { method: "POST", body: JSON.stringify({ id, name: "BLANK" }) }))).json()) as Account),
    save: (a: Account) => stubOf(a.id).fetch(new Request("https://file/save", { method: "POST", body: JSON.stringify(a) })),
  };
}

/** Until Robinhood Chain's parameters land, the Worker answers every chain route with one reason instead of building a client on an empty RPC. */
const unconfigured = (env: Env): boolean => !env.CHAIN_RPC || !Number(env.CHAIN_ID) || !env.SIGNER_KEY || !env.RELAYER_KEY;
const NOT_ADMIN = "NOT AN OPERATOR: /prizes/post runs the settlement for a day of the caller's choosing and needs the x-admin-key header";
const NOT_CONFIGURED = "CHAIN NOT CONFIGURED: the counter-ledger waits for Robinhood Chain's testnet parameters (CHAIN_ID, CHAIN_RPC, CONTRACTS)";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (url.pathname === "/health") return new Response("ok");
    if (unconfigured(env)) {
      if (url.pathname === "/counter") return json({ chainId: Number(env.CHAIN_ID) || 0, devnet: false, contracts: {}, signer: null, statement: "", listings: [], treasury: null, reason: NOT_CONFIGURED });
      if (url.pathname === "/link/nonce") return json({ ok: false, reason: NOT_CONFIGURED }, 503);
      return json({ ok: false, reason: NOT_CONFIGURED, counter: null }, 503);
    }
    const { load, save } = filesOf(env);
    if (url.pathname === "/counter") {
      const ledger = ledgerOf(env);
      try {
        return json({ ...ledger.info(), listings: await ledger.listings(), treasury: await ledger.treasury() });
      } catch (e) {
        return json({ ...ledger.info(), listings: [], treasury: null, reason: `CHAIN UNREACHABLE: ${String((e as Error).message).slice(0, 80)}` });
      }
    }
    if (request.method === "POST" && url.pathname === "/link/nonce") {
      const { account } = (await request.json()) as { account: string };
      const ledger = ledgerOf(env);
      return json({ nonce: await ledger.nonce(account), statement: ledger.info().statement, chainId: ledger.info().chainId });
    }
    if (request.method === "POST" && url.pathname === "/link/verify") {
      const { account, message, signature, secret } = (await request.json()) as { account: string; message: string; signature: Hex; secret?: string };
      const a = await load(account);
      // linking binds a wallet to a file for good; the SIWE signature proves the wallet, and this
      // proves the file (Stage 28)
      if (!fileAuth(a, secret).ok) return json({ ok: false, reason: NOT_YOURS, counter: a.counter ?? null }, 403);
      const r = await ledgerOf(env).link(a, message, signature);
      if (r.ok) await save(a);
      return json({ ok: r.ok, reason: r.reason, counter: a.counter ?? null });
    }
    const f = decodeURIComponent(url.pathname).match(/^\/file\/([a-zA-Z0-9_:.-]{1,64})\/counter$/);
    if (f && request.method === "POST") {
      if (!rateOk(f[1]!)) return json({ ok: false, reason: "RATE LIMITED: the counter-ledger takes 30 requests a minute per file" }, 429);
      const a = await load(f[1]!);
      const body = (await request.json().catch(() => ({}))) as { secret?: string };
      // the id names the file; the secret proves the caller owns it (Stage 26). This is the money
      // route — it links a wallet, banks the run and asks for signed vouchers — and it was never
      // checking (Stage 28).
      if (!fileAuth(a, body.secret).ok) return json({ ok: false, reason: NOT_YOURS, counter: a.counter ?? null }, 403);
      const ledger = ledgerOf(env);
      const r = await counterRequest(a, body, ledger);
      if (r.ok) await save(a);
      return json(r);
    }
    if (request.method === "POST" && url.pathname === "/prizes/post") {
      if (!env.ADMIN_KEY || request.headers.get("x-admin-key") !== env.ADMIN_KEY) return json({ ok: false, reason: NOT_ADMIN }, 403);
      // the same jobs the cron runs (`scheduled` below), callable by hand: the boards come from the
      // PvP worker's Endgame DO, the run's day from the shared database
      const body = (await request.json().catch(() => ({}))) as { kind?: string; week?: number; day?: number };
      if (body.kind === "run") {
        const day = Number(body.day ?? dayIndex(Date.now()) - 1);
        return json(await settleRunDay(day, { ledger: ledgerOf(env), runs: new D1RunStore(env.DB), load, save, log: (l) => console.log(l) }));
      }
      if (!env.ENDGAME) return json({ ok: false, reason: "no ENDGAME binding" }, 500);
      const stub = env.ENDGAME.get(env.ENDGAME.idFromName("endgame"));
      const kind = body.kind === "season" ? "season" : "audit";
      let period: number;
      let lines;
      if (kind === "audit") {
        period = Number(body.week ?? 0);
        const board = (await (await stub.fetch(new Request(`https://endgame/audit?week=${period}`))).json()) as { account: string; score: number }[];
        lines = auditPrizes(board);
      } else {
        const season = (await (await stub.fetch(new Request("https://endgame/season"))).json()) as { season: number; contributors?: Record<string, number> };
        period = season.season;
        lines = seasonPrizes(season.contributors ?? {});
      }
      const r = await ledgerOf(env).postEpoch(kind, period, lines);
      return json({ ok: r.ok, reason: r.reason, epoch: r.epoch ? { epoch: r.epoch.epoch, root: r.epoch.root, total: r.epoch.total, leaves: r.epoch.leaves.length } : null, skipped: r.skipped ?? [] });
    }
    if (url.pathname === "/health") return new Response("ok");
    return new Response("meltdown counter-ledger worker", { status: 404 });
  },

  /**
   * The cron (`wrangler.counter.toml`), 01:00 UTC daily.
   *
   * THE RUN settles every night: yesterday's banking, priced out of yesterday's share of the
   * emission schedule (docs/ECONOMY.md). The Audit posts on Mondays, the Deep Wake at a season
   * boundary. Each is guarded against a second run of the same period, so a retry after a failed
   * deploy or a duplicated trigger costs nothing.
   *
   * A day with nothing to settle is still marked settled — otherwise the job retries an empty day
   * for the rest of the game's life.
   */
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      const at = event.scheduledTime ?? Date.now();
      if (unconfigured(env)) return console.log(`cron ${new Date(at).toISOString()}: skipped — ${NOT_CONFIGURED}`);
      const { load, save } = filesOf(env);
      const ledger = ledgerOf(env);

      const day = dayIndex(at) - 1; // yesterday: today is not over
      try {
        const r = await settleRunDay(day, { ledger, runs: new D1RunStore(env.DB), load, save, now: () => at, log: (l) => console.log(l) });
        if (!r.ok) console.log(`cron: run day ${day} not settled — ${r.reason}`);
      } catch (e) {
        console.log(`cron: run day ${day} threw — ${String((e as Error).message).slice(0, 200)}`);
      }

      // Reconcile yesterday before anything else reads it, and sweep anything nobody claimed. Both
      // are cheap when there is nothing to do, which is the normal case.
      try {
        const rec = await reconcileRunDay(day, { ledger, runs: new D1RunStore(env.DB), wallets: new D1WalletStore(env.DB), load, save, log: (l) => console.log(l) }, { fix: true });
        if (rec.drift.length) console.log(`cron: day ${day} drifted on ${rec.drift.length} file(s) — restored ${rec.restored}, cleared ${rec.cleared}`);
      } catch (e) {
        console.log(`cron: reconcile day ${day} threw — ${String((e as Error).message).slice(0, 200)}`);
      }
      /**
       * And then the backlog (Stage 40).
       *
       * The line above reconciles the day it just settled, which is the day drift is most likely to
       * appear on and the only one anything had ever looked at. Drift older than that has no way of
       * being noticed: the file still says it is owed, the night has moved on, and nothing walks
       * back. This pass is driven off the files rather than the calendar — each file names its own
       * run day — so it costs one walk however far back the oldest one goes.
       */
      try {
        const back = await reconcileRunBacklog(
          { ledger, runs: new D1RunStore(env.DB), wallets: new D1WalletStore(env.DB), load, save, log: (l) => console.log(l), today: dayIndex(at) },
          { fix: true },
        );
        if (back.drift.length) console.log(`cron: backlog drifted on ${back.drift.length} file(s) across ${back.days.length} day(s) — restored ${back.restored}, cleared ${back.cleared}`);
      } catch (e) {
        console.log(`cron: backlog reconcile threw — ${String((e as Error).message).slice(0, 200)}`);
      }
      try {
        for (const e of await ledger.epochs()) {
          // the vault holds the deadline; asking early simply fails and costs a reverted call
          if (Number(e.total) <= 0 || at - e.postedAt < 90 * 86_400_000) continue;
          const r = await ledger.reclaimEpoch(e.epoch);
          if (r.ok) console.log(`cron: epoch ${e.epoch} swept ${r.swept} $CAPITAL to the treasury`);
        }
      } catch (e) {
        console.log(`cron: reclaim threw — ${String((e as Error).message).slice(0, 200)}`);
      }

      if (!env.ENDGAME) return;
      const stub = env.ENDGAME.get(env.ENDGAME.idFromName("endgame"));
      const d = new Date(at);
      try {
        if (d.getUTCDay() === 1) {
          // the Audit week that just ended
          const week = weekIndex(at) - 1;
          const board = (await (await stub.fetch(new Request(`https://endgame/audit?week=${week}`))).json()) as { account: string; score: number }[];
          const r = await ledger.postEpoch("audit", week, auditPrizes(board));
          console.log(`cron: audit week ${week} — ${r.ok ? `${r.epoch?.leaves.length} leaves` : r.reason}`);
        }
        const season = (await (await stub.fetch(new Request("https://endgame/season"))).json()) as { season: number; contributors?: Record<string, number> };
        if (seasonIndex(at) > season.season) {
          const r = await ledger.postEpoch("season", season.season, seasonPrizes(season.contributors ?? {}));
          console.log(`cron: season ${season.season} — ${r.ok ? `${r.epoch?.leaves.length} leaves` : r.reason}`);
        }
      } catch (e) {
        console.log(`cron: prize job threw — ${String((e as Error).message).slice(0, 200)}`);
      }
    })());
  },
};
