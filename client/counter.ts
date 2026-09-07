/**
 * The COUNTER-LEDGER panel's client: the wallet (an injected EIP-1193 provider — Robinhood Wallet
 * over WalletConnect / MetaMask — or, headless, a viem local account from `?wallet=<key>`), the
 * SIWE link through the ledger host, the player's own transactions (market buys, the name burn)
 * sent straight to the chain's RPC, and the cache ops on the file. It reads nothing mechanical
 * and writes nothing but identity and ownership.
 */
import { createPublicClient, createWalletClient, custom, defineChain, http, parseEther, type Hex, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import type { CounterRecord } from "@shared/progression/account";
import type { counterView } from "@shared/economy/counter";
import artifacts from "../contracts/out/artifacts.json";

type Abi = readonly unknown[];
const ABI = artifacts as Record<string, { abi: Abi }>;

export interface CounterInfo {
  chainId: number;
  devnet: boolean;
  contracts: { capital: Hex; ghostfile: Hex; stamps: Hex; names: Hex; cosmetics: Hex; market: Hex; buyout: Hex; rooms: Hex };
  signer: Hex;
  statement: string;
  rpc?: string;
  listings: { listing: number; token: number; amount: number; price: number; seller: Hex }[];
  /** the current Deep Wake season, and the sinks' prices in whole $CAPITAL (Stage 19) */
  season?: number;
  sinks?: { seasonPass: number; roomHour: number };
  treasury: { supply: string; burned: string; volume: string } | null;
  reason?: string;
}

export type CounterView = ReturnType<typeof counterView>;

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export class CounterClient {
  info: CounterInfo | null = null;
  /** the wallet address as the provider reports it (null: no wallet) */
  address: Hex | null = null;
  /** last line for the panel */
  last = "";
  busy = false;
  onChange: (() => void) | null = null;
  private wallet: WalletClient | null = null;
  private pub: PublicClient | null = null;

  /** the file's credential: the counter-ledger changes the file, so it needs it like every other mutation */
  secret = "";

  constructor(private shop: string, private account: string, private applyCounter: (c: CounterRecord | null, view: CounterView) => void) {}

  private say(line: string): void {
    this.last = line;
    this.onChange?.();
  }

  /** chain id + addresses + listings from the host; the RPC the panel's own transactions go to */
  async load(): Promise<boolean> {
    try {
      this.info = (await (await fetch(`${this.shop}/counter`)).json()) as CounterInfo;
      this.onChange?.();
      return !this.info.reason;
    } catch (e) {
      this.say(`COUNTER-LEDGER: ${String(e)}`);
      return false;
    }
  }

  private chain() {
    const id = this.info?.chainId ?? 0;
    return defineChain({ id, name: this.info?.devnet ? "MELTDOWN devnet" : "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [this.info?.rpc ?? ""] } } });
  }

  /** Connect: `?wallet=<key>` (headless / tests) or the injected provider. */
  async connect(): Promise<boolean> {
    if (!this.info) await this.load();
    if (!this.info) return false;
    const q = new URLSearchParams(location.search);
    const key = q.get("wallet");
    const chain = this.chain();
    const transport = http(this.info.rpc ?? "");
    this.pub = createPublicClient({ chain, transport });
    if (key && /^0x[0-9a-fA-F]{64}$/.test(key)) {
      const acct = privateKeyToAccount(key as Hex);
      this.wallet = createWalletClient({ chain, transport, account: acct });
      this.address = acct.address;
      this.say(`WALLET · ${this.short()} (local account)`);
      return true;
    }
    const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
    if (!eth) {
      this.say("NO WALLET: open in a browser with Robinhood Wallet, MetaMask or Rabby, or link over WalletConnect");
      return false;
    }
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as Hex[];
      this.address = accounts[0] ?? null;
      this.wallet = createWalletClient({ chain, transport: custom(eth), account: this.address ?? undefined });
      this.say(`WALLET · ${this.short()}`);
      return !!this.address;
    } catch (e) {
      this.say(`WALLET REFUSED: ${String((e as Error).message ?? e).slice(0, 80)}`);
      return false;
    }
  }

  short(): string {
    return this.address ? `${this.address.slice(0, 6)}…${this.address.slice(-4)}` : "—";
  }

  /** SIWE: the host's nonce, one signed statement, the host verifies and binds; the Ghostfile mints sponsored. */
  async link(): Promise<{ ok: boolean; reason?: string }> {
    if (!this.wallet || !this.address) {
      if (!(await this.connect())) return { ok: false, reason: "no wallet" };
    }
    this.busy = true;
    try {
      const n = (await (await fetch(`${this.shop}/link/nonce`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account: this.account }) })).json()) as { nonce: string; statement: string; chainId: number };
      const message = createSiweMessage({ address: this.address!, chainId: n.chainId, domain: location.host || "127.0.0.1", nonce: n.nonce, uri: location.origin && location.origin !== "null" ? location.origin : "http://127.0.0.1/", version: "1", statement: n.statement });
      const signature = await this.wallet!.signMessage({ account: this.wallet!.account!, message });
      const r = (await (await fetch(`${this.shop}/link/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account: this.account, message, signature, secret: this.secret }) })).json()) as { ok: boolean; reason?: string; counter: CounterRecord | null };
      if (r.ok) await this.op("view");
      this.say(r.ok ? `LINKED · ${this.short()}${r.reason ? " · " + r.reason : ""}` : `LINK REFUSED: ${r.reason}`);
      return { ok: r.ok, reason: r.reason };
    } catch (e) {
      const reason = String((e as Error).message ?? e).split("\n")[0]!.slice(0, 100);
      this.say(`LINK FAILED: ${reason}`);
      return { ok: false, reason };
    } finally {
      this.busy = false;
    }
  }

  /** wear / reconcile / stamps / name on the file through the host */
  /** posted prizes for this wallet, as the last op reported them */
  prizes: { epoch: number; kind: string; period: number; amount: string; reason: string; claimed: boolean }[] = [];
  async op(op: "view" | "wear" | "reconcile" | "stamps" | "name" | "payout" | "prizes" | "claimPrize", body: Record<string, unknown> = {}): Promise<{ ok: boolean; reason?: string; voucher?: { name: string; nonce: string; deadline: string; signature: Hex; fee: number } }> {
    try {
      const r = (await (await fetch(`${this.shop}/file/${encodeURIComponent(this.account)}/counter`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ...body, secret: this.secret }) })).json()) as { ok: boolean; reason?: string; counter: CounterRecord | null; view: CounterView; voucher?: { name: string; nonce: string; deadline: string; signature: Hex; fee: number }; prizes?: CounterClient["prizes"] };
      if (r.prizes) this.prizes = r.prizes;
      this.applyCounter(r.counter, r.view);
      if (op !== "view") this.say(r.ok ? `${op.toUpperCase()} · ok` : `${op.toUpperCase()} · ${r.reason}`);
      return r;
    } catch (e) {
      const reason = String(e).slice(0, 100);
      this.say(`${op.toUpperCase()} FAILED: ${reason}`);
      return { ok: false, reason };
    }
  }

  private async tx(address: Hex, abi: Abi, functionName: string, args: unknown[]): Promise<boolean> {
    const hash = await this.wallet!.writeContract({ account: this.wallet!.account!, chain: this.chain(), address, abi: abi as never, functionName, args });
    const rc = await this.pub!.waitForTransactionReceipt({ hash });
    return rc.status === "success";
  }

  /** A market buy: the player's own two transactions (approve, buy); then the host reconciles the rig from the chain. */
  async buy(listing: number): Promise<{ ok: boolean; reason?: string }> {
    if (!this.wallet && !(await this.connect())) return { ok: false, reason: "no wallet" };
    if (!this.wallet || !this.info) return { ok: false, reason: "no wallet" };
    const L = this.info.listings.find((l) => l.listing === listing);
    if (!L) return { ok: false, reason: "no such listing" };
    this.busy = true;
    try {
      const price = parseEther(String(L.price));
      if (!(await this.tx(this.info.contracts.capital, ABI["$CAPITAL"]!.abi, "approve", [this.info.contracts.market, price]))) return { ok: false, reason: "approve reverted" };
      if (!(await this.tx(this.info.contracts.market, ABI.LedgerMarket!.abi, "buy", [BigInt(listing), 1n]))) return { ok: false, reason: "buy reverted" };
      await this.op("reconcile");
      await this.load();
      this.say(`BOUGHT · listing ${listing} · ${L.price} $CAPITAL`);
      return { ok: true };
    } catch (e) {
      const reason = String((e as Error).message ?? e).split("\n").find((l) => /revert|Error|fetch|failed/i.test(l))?.slice(0, 100) ?? "failed";
      this.say(`BUY FAILED: ${reason}`);
      return { ok: false, reason };
    } finally {
      this.busy = false;
    }
  }

  /**
   * The sinks (Stage 19): approve, then burn. Both are the player's own transactions from their own
   * wallet, like a market buy — the game never holds the money and never needs to.
   *
   * The price is passed to the contract as well as to `approve`, so a steward retuning the price
   * cannot land between the two and burn more than the player agreed to.
   */
  private async burnSink(kind: "season" | "rooms", target: Hex, abi: Abi, fn: string, args: (p: bigint) => unknown[], fee: number, unit: number, label: string): Promise<{ ok: boolean; reason?: string }> {
    if (!this.wallet && !(await this.connect())) return { ok: false, reason: "no wallet" };
    if (!this.wallet || !this.info) return { ok: false, reason: "no wallet" };
    this.busy = true;
    try {
      const price = parseEther(String(fee));
      if (!(await this.tx(this.info.contracts.capital, ABI["$CAPITAL"]!.abi, "approve", [target, price]))) return { ok: false, reason: "approve reverted" };
      if (!(await this.tx(target, abi, fn, args(parseEther(String(unit)))))) return { ok: false, reason: `${kind} reverted` };
      await this.op("reconcile");
      await this.load();
      this.say(`${label} · ${fee} $CAPITAL BURNED`);
      return { ok: true };
    } catch (e) {
      const reason = String((e as Error).message ?? e).split("\n").find((l) => /revert|Error|fetch|failed/i.test(l))?.slice(0, 100) ?? "failed";
      this.say(`${label} FAILED: ${reason}`);
      return { ok: false, reason };
    } finally {
      this.busy = false;
    }
  }

  /**
   * Open a private room against the file's room-hours (Stage 20). The host spends the credit on
   * chain before the room exists, and answers with an invite code — which is the whole access
   * control, so the code is the thing worth copying, not the URL.
   */
  async openRoom(hours = 1, rules: Record<string, unknown> = {}): Promise<{ ok: boolean; reason?: string; code?: string; room?: string; join?: string }> {
    try {
      const r = (await (await fetch(`${this.shop}/rooms/open`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account: this.account, hours, rules }) })).json()) as { ok: boolean; reason?: string; code?: string; room?: string; join?: string };
      if (r.ok) await this.op("reconcile");
      this.say(r.ok ? `PRIVATE ROOM · CODE ${r.code} · ${hours}h` : `ROOM REFUSED: ${r.reason}`);
      return r;
    } catch (e) {
      const reason = String((e as Error).message ?? e).slice(0, 100);
      this.say(`ROOM FAILED: ${reason}`);
      return { ok: false, reason };
    }
  }

  /** What a code opens, for the join screen. Never lists rooms: a code is the access control. */
  async lookupRoom(code: string): Promise<{ ok: boolean; reason?: string; url?: string; rules?: unknown; players?: number }> {
    try {
      return (await (await fetch(`${this.shop}/rooms/${encodeURIComponent(code.toUpperCase())}`)).json()) as { ok: boolean; reason?: string; url?: string };
    } catch (e) {
      return { ok: false, reason: String((e as Error).message ?? e).slice(0, 100) };
    }
  }

  /** The Deep Wake pass: one season, burned, cosmetics back. */
  async buySeason(): Promise<{ ok: boolean; reason?: string }> {
    const price = this.info?.sinks?.seasonPass ?? 0;
    const season = this.info?.season ?? 0;
    if (!price) return { ok: false, reason: "no price" };
    return this.burnSink("season", this.info!.contracts.buyout, ABI.SeasonBuyout!.abi, "buy", (p) => [BigInt(season), p], price, price, `DEEP WAKE SEASON ${season}`);
  }

  /** Private room-hours: a server of your own, burned by the hour. */
  async buyRoomHours(hours: number): Promise<{ ok: boolean; reason?: string }> {
    const unit = this.info?.sinks?.roomHour ?? 0;
    const n = Math.max(1, Math.min(1000, Math.floor(hours)));
    if (!unit) return { ok: false, reason: "no price" };
    return this.burnSink("rooms", this.info!.contracts.rooms, ABI.RoomCredits!.abi, "buy", (p) => [BigInt(n), p], unit * n, unit, `${n} ROOM-HOUR${n === 1 ? "" : "S"}`);
  }

  /** A market listing: the player's own two transactions (approve the market for the rig, list); the host's market view refreshes. */
  async sell(token: number, price: number): Promise<{ ok: boolean; reason?: string }> {
    if (!this.wallet || !this.info) return { ok: false, reason: "no wallet" };
    if (!(price > 0)) return { ok: false, reason: "price must be positive" };
    this.busy = true;
    try {
      if (!(await this.tx(this.info.contracts.cosmetics, ABI.Cosmetics!.abi, "setApprovalForAll", [this.info.contracts.market, true]))) return { ok: false, reason: "approval reverted" };
      if (!(await this.tx(this.info.contracts.market, ABI.LedgerMarket!.abi, "list", [BigInt(token), 1n, parseEther(String(price))]))) return { ok: false, reason: "list reverted" };
      await this.op("reconcile");
      await this.load();
      this.say(`LISTED · token ${token} · ${price} $CAPITAL`);
      return { ok: true };
    } catch (e) {
      const reason = String((e as Error).message ?? e).split("\n").find((l) => /revert|Error|fetch|failed/i.test(l))?.slice(0, 100) ?? "failed";
      this.say(`SELL FAILED: ${reason}`);
      return { ok: false, reason };
    } finally {
      this.busy = false;
    }
  }

  /** The name: a Depth-50 voucher from the host, then the player's own approve + register (the fee burns). */
  async registerName(name: string): Promise<{ ok: boolean; reason?: string }> {
    if (!this.wallet && !(await this.connect())) return { ok: false, reason: "no wallet" };
    if (!this.wallet || !this.info) return { ok: false, reason: "no wallet" };
    this.busy = true;
    try {
      const v = await this.op("name", { name });
      if (!v.ok || !v.voucher) return { ok: false, reason: v.reason ?? "no voucher" };
      const fee = parseEther(String(v.voucher.fee));
      if (!(await this.tx(this.info.contracts.capital, ABI["$CAPITAL"]!.abi, "approve", [this.info.contracts.names, fee]))) return { ok: false, reason: "approve reverted" };
      if (!(await this.tx(this.info.contracts.names, ABI.Names!.abi, "register", [v.voucher.name, BigInt(v.voucher.nonce), BigInt(v.voucher.deadline), v.voucher.signature]))) return { ok: false, reason: "register reverted" };
      await this.op("reconcile");
      this.say(`NAMED · ${v.voucher.name} · ${v.voucher.fee} $CAPITAL BURNED`);
      return { ok: true };
    } catch (e) {
      const reason = String((e as Error).message ?? e).split("\n").find((l) => /revert|Error|fetch|failed/i.test(l))?.slice(0, 100) ?? "failed";
      this.say(`NAME FAILED: ${reason}`);
      return { ok: false, reason };
    } finally {
      this.busy = false;
    }
  }
}
