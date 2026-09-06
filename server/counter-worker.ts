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
import type { Contracts } from "./chain/deploy";
import { counterRequest } from "../shared/economy/endpoint";
import { upgradeAccount, type Account } from "../shared/progression/account";

export interface Env {
  PLAYER_FILE: DurableObjectNamespace;
  DB: D1Database;
  CHAIN_ID: string;
  CHAIN_RPC: string;
  CONTRACTS: string;
  SIGNER_KEY: string;
  RELAYER_KEY: string;
  SIWE_DOMAINS?: string;
}

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
    devnet: false,
    domains: env.SIWE_DOMAINS ? env.SIWE_DOMAINS.split(",") : [],
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const stubOf = (id: string) => env.PLAYER_FILE.get(env.PLAYER_FILE.idFromName(id));
    const load = async (id: string): Promise<Account> => upgradeAccount((await (await stubOf(id).fetch(new Request("https://file/file", { method: "POST", body: JSON.stringify({ id, name: "BLANK" }) }))).json()) as Account);
    const save = (a: Account) => stubOf(a.id).fetch(new Request("https://file/save", { method: "POST", body: JSON.stringify(a) }));
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
      const { account, message, signature } = (await request.json()) as { account: string; message: string; signature: Hex };
      const a = await load(account);
      const r = await ledgerOf(env).link(a, message, signature);
      if (r.ok) await save(a);
      return json({ ok: r.ok, reason: r.reason, counter: a.counter ?? null });
    }
    const f = url.pathname.match(/^\/file\/([a-zA-Z0-9_:.-]{1,64})\/counter$/);
    if (f && request.method === "POST") {
      const a = await load(f[1]!);
      const ledger = ledgerOf(env);
      const r = await counterRequest(a, await request.json().catch(() => ({})), ledger);
      if (r.ok) await save(a);
      return json(r);
    }
    if (url.pathname === "/health") return new Response("ok");
    return new Response("meltdown counter-ledger worker", { status: 404 });
  },
};
