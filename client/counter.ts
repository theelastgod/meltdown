/**
 * The COUNTER-LEDGER panel's client: the wallet (WalletConnect, an injected EIP-1193 provider,
 * or, headless, a viem local account from `?wallet=<key>`), the
 * SIWE link through the ledger host, the player's own transactions (market buys, the name burn)
 * sent straight to the chain's RPC, and the cache ops on the file. It reads nothing mechanical
 * and writes nothing but identity and ownership.
 */
import { createPublicClient, createWalletClient, custom, defineChain, formatEther, http, parseEther, type Hex, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import type { CounterRecord } from "@shared/progression/account";
import type { counterView } from "@shared/economy/counter";
import artifacts from "../contracts/out/artifacts.json";

import { crtPhrase } from "./crt";
import { CHAIN_DARK_LINE, chitsFromBurn } from "@shared/city/chit";
import { BNB_CHAIN_ID, evmNative, plainEvmAddress, WALLETCONNECT_DARK, walletConnectProjectId } from "@shared/economy/bnb";
import { SOLANA_DEVNET, SOLANA_MAINNET } from "@shared/economy/chain";
import { bytesToHex, decodeBase58, encodeBase58, isEvmAddress, isSolanaAddress, solanaLinkMessage, SOLANA_SETTLEMENT_LINE } from "@shared/economy/solana";

export { crtPhrase };

type Abi = readonly unknown[];
const ABI = artifacts as Record<string, { abi: Abi }>;

export interface CounterInfo {
  chainId: number;
  devnet: boolean;
  contracts: { capital?: Hex; ghostfile?: Hex; stamps?: Hex; names?: Hex; cosmetics?: Hex; market?: Hex; buyout?: Hex; rooms?: Hex };
  signer: Hex;
  statement: string;
  rpc?: string;
  listings: { listing: number; token: number; amount: number; price: number; seller: Hex }[];
  /** the current Deep Wake season, and the sinks' prices in whole $CAPITAL (Stage 19) */
  season?: number;
  sinks?: { seasonPass: number; roomHour: number };
  treasury: { supply: string; burned: string; volume: string } | null;
  /** Published Solana cluster, treasury pubkey, and SPL mint. Empty until a real mint is supplied. */
  solana?: { cluster: "devnet" | "mainnet-beta" | null; treasury: string | null; mint: string | null; rpc?: string | null } | null;
  reason?: string;
}

interface SplAccounts {
  result?: { value?: { account?: { data?: { parsed?: { info?: { tokenAmount?: { uiAmount?: number | null } } } } } }[] };
}

interface SolanaProvider {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  disconnect(): Promise<void>;
  signMessage(message: Uint8Array, display?: "utf8"): Promise<{ signature: Uint8Array } | Uint8Array>;
  on?(event: string, handler: (arg: unknown) => void): void;
}

export type CounterView = ReturnType<typeof counterView>;

/** CRT line for a counter-ledger op. `WEAR · ok` was reaching the FILE tab as written. */
export function counterOpLine(op: string, ok: boolean, reason?: string): string {
  return ok ? `${op.toUpperCase()} · OK` : `${op.toUpperCase()} · ${crtPhrase(reason ?? "")}`;
}

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (arg: unknown) => void): void;
  disconnect?(): Promise<void>;
  providers?: Eip1193[];
  isMetaMask?: boolean;
  isPhantom?: boolean;
  isBraveWallet?: boolean;
  overrideIsMetaMask?: boolean;
}

/** MetaMask sets `isMetaMask`. Phantom, Brave, and other overrides set it too, and those are not MetaMask. */
export function isMetaMaskProvider(provider: Eip1193 | null | undefined): boolean {
  return !!provider && provider.isMetaMask === true && provider.isPhantom !== true && provider.isBraveWallet !== true && provider.overrideIsMetaMask !== true;
}

/**
 * The MetaMask provider. An EIP-6963 announcement with rdns `io.metamask` wins.
 * Otherwise the first real MetaMask among the announcements, `ethereum.providers`, and the page provider.
 * A lone unflagged provider is kept, so a test double and a wallet's own browser still connect.
 * Phantom's `window.ethereum` is not that provider.
 */
export function pickMetaMask(page: Eip1193 | null | undefined, announced: readonly { rdns?: string; provider: Eip1193 }[]): Eip1193 | null {
  const named = announced.find((row) => row.rdns === "io.metamask");
  if (named) return named.provider;
  const candidates = [...announced.map((row) => row.provider), ...(page?.providers ?? []), ...(page ? [page] : [])];
  for (const provider of candidates) {
    if (isMetaMaskProvider(provider)) return provider;
  }
  const crowded = announced.length > 0 || (page?.providers?.length ?? 0) > 0;
  if (!crowded && page && page.isPhantom !== true && page.isBraveWallet !== true) return page;
  return null;
}

/** How long to wait for wallets that announce EIP-6963 after the request event. */
const METAMASK_ANNOUNCE_MS = 40;

/**
 * Which provider to ask. EIP-6963 announcements win over a multiplexer.
 * `providers[0]` is left alone: that slot is often the wrong wallet.
 * The page's own `ethereum` is used when it is one of the announced providers,
 * and when nothing has announced.
 */
export function chooseProvider(page: Eip1193 | null | undefined, announced: readonly Eip1193[]): Eip1193 | null {
  if (announced.length > 0) {
    if (page && announced.includes(page)) return page;
    return announced[0] ?? null;
  }
  return page ?? null;
}

/** Wallets that answer `eip6963:requestProvider`. Announcements that arrive a tick later still count. */
function discoverAnnounced(win: Window): Promise<{ rdns?: string; provider: Eip1193 }[]> {
  if (typeof win.addEventListener !== "function" || typeof win.removeEventListener !== "function" || typeof win.dispatchEvent !== "function") return Promise.resolve([]);
  return new Promise((resolve) => {
    const found: { rdns?: string; provider: Eip1193 }[] = [];
    const on = (event: Event) => {
      const detail = (event as CustomEvent<{ info?: { rdns?: string }; provider?: Eip1193 }>).detail;
      if (!detail?.provider || found.some((row) => row.provider === detail.provider)) return;
      found.push({ rdns: detail.info?.rdns, provider: detail.provider });
    };
    win.addEventListener("eip6963:announceProvider", on);
    win.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(() => {
      win.removeEventListener("eip6963:announceProvider", on);
      resolve(found);
    }, METAMASK_ANNOUNCE_MS);
  });
}

/** Phantom when the button asks for it. Any injected Solana provider otherwise. */
function solanaProvider(via: "any" | "phantom" | "injected"): SolanaProvider | null {
  const w = window as unknown as { solana?: SolanaProvider; phantom?: { solana?: SolanaProvider } };
  const phantom = w.phantom?.solana?.isPhantom ? w.phantom.solana : w.solana?.isPhantom ? w.solana : null;
  if (via === "phantom") return phantom;
  return w.solana ?? phantom;
}

/** MetaMask, including a wallet app's own browser when that browser is the only provider. */
async function metamaskProvider(): Promise<Eip1193 | null> {
  const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum ?? null;
  return pickMetaMask(eth, await discoverAnnounced(window));
}

/** Vite inlines this only when the property access is a literal. A cast lookup stays empty in the production build. */
function walletConnectId(): string {
  return walletConnectProjectId({ VITE_WALLETCONNECT_PROJECT_ID: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID });
}

export class CounterClient {
  info: CounterInfo | null = null;
  /** the wallet address as the provider reports it: an EVM hex or a Solana pubkey (null: no wallet) */
  address: string | null = null;
  /** last line for the panel */
  last = "";
  busy = false;
  /** a connect is waiting on the wallet (the WALLET page's CONNECTING) */
  connecting = false;
  /** the chain the wallet itself is on; the WALLET page compares it with `info.chainId` */
  walletChain: number | null = null;
  /** the connected address's own $CAPITAL (whole-token string) and Ghostfile token id (0: none), read from the chain */
  holdings: { capital: string; ghostfile: number | null } | null = null;
  onChange: (() => void) | null = null;
  private wallet: WalletClient | null = null;
  private pub: PublicClient | null = null;
  /** the injected provider this client connected through (null: none, or the headless local account) */
  private eth: Eip1193 | null = null;
  /** the Solana provider this client connected through */
  private solana: SolanaProvider | null = null;
  /** headless `?solana=<seed>`: 32-byte ed25519 seed. Never logged. */
  private solanaSeed: Uint8Array | null = null;
  private heard = new WeakSet<Eip1193>();
  private heardSolana = new WeakSet<SolanaProvider>();

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
      await this.mergeSolanaFile();
      this.onChange?.();
      return !this.info.reason;
    } catch (e) {
      this.say(`COUNTER-LEDGER: ${crtPhrase(String(e).slice(0, 100))}`);
      return false;
    }
  }

  private chain() {
    const id = this.info?.chainId ?? 0;
    const named = evmNative(id, !!this.info?.devnet);
    return defineChain({
      id,
      name: named.name,
      nativeCurrency: named.nativeCurrency,
      rpcUrls: { default: { http: [this.info?.rpc ?? ""] } },
      ...(named.explorerUrl ? { blockExplorers: { default: { name: "Explorer", url: named.explorerUrl } } } : {}),
    });
  }

  /**
   * Connect: `?wallet=<key>` (headless EVM account, tests), `?solana=<seed>` (headless Solana
   * seed), or an injected Solana wallet. `via` is the WALLET page's button.
   */
  async connect(via: "any" | "phantom" | "injected" | "evm" | "walletconnect" = "any"): Promise<boolean> {
    this.connecting = true;
    this.onChange?.();
    try {
      if (via === "walletconnect" && !walletConnectId()) {
        this.say(WALLETCONNECT_DARK);
        return false;
      }
      const ok = await this.connectVia(via);
      // WalletConnect binds on the same signature, so a banked claim has an address the night can pay.
      if (ok && via === "walletconnect") {
        const linked = await this.link();
        if (!linked.ok) this.say(`WALLET · ${this.short()} · ${crtPhrase(linked.reason ?? "SIGN THE LINK IN FILE")}`);
      }
      if (ok) void this.readHoldings();
      return ok;
    } catch (e) {
      this.say(`WALLET REFUSED: ${crtPhrase(String((e as Error).message ?? e).slice(0, 80))}`);
      return false;
    } finally {
      this.connecting = false;
      this.onChange?.();
    }
  }

  /** MetaMask. Asks for the account and reads the chain. Sends no transaction and does not sign the link. */
  private async connectEvm(): Promise<boolean> {
    if (!this.info) return false;
    const eth = await metamaskProvider();
    if (!eth) {
      this.say("METAMASK IS NOT IN THIS BROWSER");
      return false;
    }
    const accounts = (await eth.request({ method: "eth_requestAccounts" })) as unknown[];
    const address = plainEvmAddress(accounts?.[0]);
    if (!isEvmAddress(address)) {
      this.say("THE WALLET RETURNED NO EVM ADDRESS");
      return false;
    }
    this.eth = eth;
    this.solana = null;
    this.solanaSeed = null;
    this.address = address;
    const chain = this.chain();
    this.wallet = createWalletClient({ chain, transport: custom(eth), account: address as Hex });
    if (!this.pub && this.info.rpc) this.pub = createPublicClient({ chain, transport: http(this.info.rpc) });
    this.walletChain = await this.askChain(eth);
    this.listen(eth);
    this.say(`WALLET · ${this.short()}`);
    return true;
  }

  /** WalletConnect. A missing project id is refused before this runs, and it never falls through to an injected wallet. */
  private async connectWalletConnect(): Promise<boolean> {
    if (!this.info) return false;
    const projectId = walletConnectId();
    if (!projectId) {
      this.say(WALLETCONNECT_DARK);
      return false;
    }
    const origin = typeof location !== "undefined" && location.origin && location.origin !== "null" ? location.origin : "https://meltdown-45y.pages.dev";
    const { openWalletConnect } = await import("./walletconnect");
    const eth = await openWalletConnect({ projectId, chainId: this.info.chainId || BNB_CHAIN_ID, rpc: this.info.rpc, origin });
    const accounts = (await eth.request({ method: "eth_requestAccounts" })) as unknown[];
    const address = plainEvmAddress(accounts?.[0]);
    if (!isEvmAddress(address)) {
      this.say("THE WALLET RETURNED NO EVM ADDRESS");
      return false;
    }
    this.eth = eth;
    this.solana = null;
    this.solanaSeed = null;
    this.address = address;
    const chain = this.chain();
    this.wallet = createWalletClient({ chain, transport: custom(eth), account: address as Hex });
    if (!this.pub && this.info.rpc) this.pub = createPublicClient({ chain, transport: http(this.info.rpc) });
    this.walletChain = await this.askChain(eth);
    this.listen(eth);
    this.say(`WALLET · ${this.short()}`);
    return true;
  }

  private async connectVia(via: "any" | "phantom" | "injected" | "evm" | "walletconnect"): Promise<boolean> {
    if (!this.info) await this.load();
    // A down counter host must not block the wallet popup. Headless `?wallet=` and `?solana=` still need the host.
    if (!this.info && (via === "evm" || via === "walletconnect")) {
      this.info = { chainId: 0, devnet: false, contracts: {}, signer: "0x0000000000000000000000000000000000000000", statement: "", listings: [], treasury: null };
    }
    if (!this.info) return false;
    const q = new URLSearchParams(location.search);
    const key = q.get("wallet");
    const chain = this.chain();
    const rpc = this.info.rpc ?? "";
    const transport = rpc ? http(rpc) : null;
    this.pub = transport ? createPublicClient({ chain, transport }) : null;
    if (key && /^0x[0-9a-fA-F]{64}$/.test(key)) {
      if (!transport) {
        this.say("THE LEDGER HAS NO CHAIN PUBLISHED YET");
        return false;
      }
      const acct = privateKeyToAccount(key as Hex);
      this.wallet = createWalletClient({ chain, transport, account: acct });
      this.address = acct.address;
      this.walletChain = this.info.chainId; // a local account is built on the ledger's chain
      this.say(`WALLET · ${this.short()} (LOCAL ACCOUNT)`);
      return true;
    }
    const seedParam = q.get("solana");
    if (seedParam) {
      const seed = decodeBase58(seedParam);
      if (!seed || seed.length !== 32) {
        this.say("THE SOLANA SEED IS NOT 32 BYTES");
        return false;
      }
      const { ed25519 } = await import("@noble/curves/ed25519");
      this.solanaSeed = seed;
      this.solana = null;
      this.address = encodeBase58(ed25519.getPublicKey(seed));
      this.walletChain = this.info.chainId || null;
      this.say(`WALLET · ${this.short()} (LOCAL SOLANA ACCOUNT)`);
      return true;
    }
    if (via === "walletconnect") return this.connectWalletConnect();
    if (via === "evm") return this.connectEvm();
    const provider = solanaProvider(via);
    if (via === "phantom" && !provider) {
      this.say("PHANTOM IS NOT IN THIS BROWSER");
      return false;
    }
    if (!provider) {
      this.say("NO SOLANA WALLET: INSTALL PHANTOM, OR OPEN THIS PAGE IN A WALLET THAT INJECTS WINDOW.SOLANA");
      return false;
    }
    try {
      const res = await provider.connect();
      this.address = res.publicKey.toString();
      this.solana = provider;
      this.solanaSeed = null;
      this.wallet = null;
      this.walletChain = this.info.chainId || null;
      this.listenSolana(provider);
      this.say(`WALLET · ${this.short()}`);
      return !!this.address;
    } catch (e) {
      this.say(`WALLET REFUSED: ${crtPhrase(String((e as Error).message ?? e).slice(0, 80))}`);
      return false;
    }
  }

  /** A published /solana.json fills a mint the worker has not been told about. An empty file changes nothing. */
  private async mergeSolanaFile(): Promise<void> {
    if (this.info?.solana?.mint && this.info.solana.treasury) return;
    try {
      const file = (await (await fetch("/solana.json")).json()) as { mint?: unknown; treasury?: unknown; cluster?: unknown; rpc?: unknown };
      const mint = typeof file.mint === "string" ? file.mint : "";
      const treasury = typeof file.treasury === "string" ? file.treasury : "";
      const cluster = file.cluster === "devnet" || file.cluster === "mainnet-beta" ? file.cluster : null;
      if (!isSolanaAddress(mint) || !isSolanaAddress(treasury) || !cluster || mint === treasury) return;
      const rpc = typeof file.rpc === "string" && file.rpc ? file.rpc : cluster === "devnet" ? SOLANA_DEVNET.rpcUrl : SOLANA_MAINNET.rpcUrl;
      const base = this.info ?? { chainId: 0, devnet: cluster === "devnet", contracts: {}, signer: "0x" as Hex, statement: "", listings: [], treasury: null };
      this.info = { ...base, solana: { cluster, mint, treasury, rpc } };
    } catch {
      /* no published file, or the host has no /solana.json */
    }
  }

  short(): string {
    return this.address ? `${this.address.slice(0, 6)}…${this.address.slice(-4)}` : "—";
  }

  private async askChain(eth: Eip1193): Promise<number | null> {
    try {
      const id = Number.parseInt(String(await eth.request({ method: "eth_chainId" })), 16);
      return Number.isFinite(id) ? id : null;
    } catch {
      return null;
    }
  }

  /** The wallet moves chain or account on its own: follow it (once per provider). */
  private listen(eth: Eip1193): void {
    if (!eth.on || this.heard.has(eth)) return;
    this.heard.add(eth);
    eth.on("chainChanged", (id) => {
      if (this.eth !== eth) return;
      const n = Number.parseInt(String(id), 16);
      this.walletChain = Number.isFinite(n) ? n : null;
      this.onChange?.();
    });
    eth.on("accountsChanged", (list) => {
      if (this.eth !== eth) return;
      const next = plainEvmAddress(Array.isArray(list) ? list[0] : undefined);
      if (!next) {
        void this.disconnect();
        return;
      }
      this.address = next;
      this.wallet = createWalletClient({ chain: this.chain(), transport: custom(eth), account: next as Hex });
      this.holdings = null;
      this.say(`WALLET · ${this.short()}`);
      void this.readHoldings();
    });
  }

  /** Forget the wallet on this page. A file already linked stays linked: that lives on the ledger. */
  async disconnect(): Promise<void> {
    const eth = this.eth;
    const provider = this.solana;
    this.eth = null;
    this.solana = null;
    this.solanaSeed = null;
    this.wallet = null;
    this.address = null;
    this.walletChain = null;
    this.holdings = null;
    if (provider) await provider.disconnect().catch(() => undefined);
    if (eth?.disconnect) await eth.disconnect().catch(() => undefined);
    else if (eth) await eth.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }).catch(() => undefined);
    this.say("WALLET DISCONNECTED");
  }

  private listenSolana(provider: SolanaProvider): void {
    if (!provider.on || this.heardSolana.has(provider)) return;
    this.heardSolana.add(provider);
    provider.on("accountChanged", (key) => {
      if (this.solana !== provider) return;
      const next = key && typeof (key as { toString?: () => string }).toString === "function" ? (key as { toString: () => string }).toString() : "";
      if (!next) {
        void this.disconnect();
        return;
      }
      this.address = next;
      this.holdings = null;
      this.say(`WALLET · ${this.short()}`);
      void this.readHoldings();
    });
    provider.on("disconnect", () => {
      if (this.solana !== provider) return;
      void this.disconnect();
    });
  }

  /** Ask the injected wallet to move to the ledger's chain, adding the chain when the wallet does not know it. */
  async switchChain(): Promise<boolean> {
    const eth = this.eth;
    if (!this.info || !this.info.chainId || this.info.reason) {
      this.say("THE LEDGER HAS NO CHAIN PUBLISHED YET");
      return false;
    }
    if (!eth) return this.walletChain === this.info.chainId;
    const chainId = `0x${this.info.chainId.toString(16)}`;
    const refused = (e: unknown) => {
      this.say(`SWITCH REFUSED: ${crtPhrase(String((e as Error).message ?? e).slice(0, 80))}`);
      return false;
    };
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    } catch (e) {
      if ((e as { code?: number }).code !== 4902 || !this.info.rpc) return refused(e);
      try {
        const added = this.chain();
        await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId, chainName: added.name, rpcUrls: [this.info.rpc], nativeCurrency: added.nativeCurrency, ...(added.blockExplorers ? { blockExplorerUrls: [added.blockExplorers.default.url] } : {}) }] });
      } catch (e2) {
        return refused(e2);
      }
    }
    this.walletChain = await this.askChain(eth);
    const ok = this.walletChain === this.info.chainId;
    this.say(ok ? `ON ${this.chain().name.toUpperCase()}` : "THE WALLET IS STILL ON ANOTHER NETWORK");
    return ok;
  }

  /** The full address to the clipboard (the WALLET page shows it shortened). */
  async copyAddress(): Promise<boolean> {
    if (!this.address) return false;
    try {
      await navigator.clipboard.writeText(this.address);
      this.say(`ADDRESS COPIED · ${this.address}`);
      return true;
    } catch {
      this.say(`THE BROWSER BLOCKED THE COPY · ${this.address}`);
      return false;
    }
  }

  /**
   * $CAPITAL named by the buyer, burned in full, for chits. With the chain dark the desk says so.
   * A configured chain still does not burn: a receipt this host cannot turn into chits would destroy the tokens.
   */
  async burnForChits(namedPrice: number): Promise<{ ok: boolean; reason: string; chits: number }> {
    const quote = chitsFromBurn(namedPrice);
    if (quote.chits <= 0) {
      this.say("NAME A PRICE");
      return { ok: false, reason: "NAME A PRICE", chits: 0 };
    }
    const capital = this.info?.contracts?.capital;
    if (!this.info?.chainId || !this.info.rpc || !capital) {
      this.say(CHAIN_DARK_LINE);
      return { ok: false, reason: CHAIN_DARK_LINE, chits: 0 };
    }
    this.say("THE EXCHANGE WILL NOT BURN WHAT IT CANNOT CREDIT");
    return { ok: false, reason: "THE EXCHANGE WILL NOT BURN WHAT IT CANNOT CREDIT", chits: 0 };
  }

  /** The connected address's $CAPITAL balance and Ghostfile token, read from the chain the ledger runs on. */
  async readHoldings(): Promise<CounterClient["holdings"]> {
    const pub = this.pub;
    const address = this.address;
    if (!address || !this.info) return null;
    if (isSolanaAddress(address)) return this.readSolanaHoldings(address);
    if (!pub) return null;
    // chain 0, or a token the launchpad has not printed yet: do not call the chain and do not call that a failed wallet
    const capital = this.info.contracts?.capital;
    if (!this.info.chainId || !capital) return null;
    const evm = address as Hex;
    try {
      const bal = (await pub.readContract({ address: capital, abi: ABI["$CAPITAL"]!.abi as never, functionName: "balanceOf", args: [evm] })) as bigint;
      const ghost = this.info.contracts?.ghostfile;
      const token = ghost ? ((await pub.readContract({ address: ghost, abi: ABI.Ghostfile!.abi as never, functionName: "tokenOf", args: [evm] })) as bigint) : null;
      if (this.address !== address) return this.holdings; // the wallet moved on while this read was out
      this.holdings = { capital: formatEther(bal), ghostfile: token === null ? null : Number(token) };
      this.onChange?.();
    } catch (e) {
      this.say(`WALLET READ FAILED: ${crtPhrase(String((e as Error).message ?? e).split("\n")[0]!.slice(0, 80))}`);
    }
    return this.holdings;
  }

  /** SPL balance of the published mint. No mint: no read, and no invented figure. */
  private async readSolanaHoldings(address: string): Promise<CounterClient["holdings"]> {
    const mint = this.info?.solana?.mint;
    const rpc = this.info?.solana?.rpc;
    if (!mint || !rpc || !isSolanaAddress(mint)) return null;
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTokenAccountsByOwner", params: [address, { mint }, { encoding: "jsonParsed" }] }),
      });
      const body = (await res.json()) as SplAccounts;
      const rows = body.result?.value ?? [];
      const raw = rows.reduce((sum, row) => sum + Number(row.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0), 0);
      if (this.address !== address) return this.holdings;
      this.holdings = { capital: String(raw), ghostfile: null };
      this.onChange?.();
    } catch (e) {
      this.say(`WALLET READ FAILED: ${crtPhrase(String((e as Error).message ?? e).split("\n")[0]!.slice(0, 80))}`);
    }
    return this.holdings;
  }

  /** The host's nonce, one signed statement, the host verifies and binds. A Solana signature moves nothing. */
  async link(): Promise<{ ok: boolean; reason?: string }> {
    if (!this.address) {
      if (!(await this.connect("evm"))) return { ok: false, reason: "no wallet" };
    }
    if (this.address && isSolanaAddress(this.address)) return this.linkSolana();
    if (!this.wallet || !this.address) {
      if (!(await this.connect("evm"))) return { ok: false, reason: "no wallet" };
    }
    this.busy = true;
    try {
      const n = (await (await fetch(`${this.shop}/link/nonce`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account: this.account, secret: this.secret }) })).json()) as { nonce?: string; statement: string; chainId: number; ok?: boolean; reason?: string };
      if (!n.nonce) return { ok: false, reason: n.reason ?? "no nonce" };
      const hostChain = Number(n.chainId) || 0;
      // Chain 0 is not a network. Sign the wallet's own chain, which on a dark ledger is BNB.
      const signChain = hostChain || this.walletChain || BNB_CHAIN_ID;
      const message = createSiweMessage({ address: this.address as Hex, chainId: signChain, domain: location.host || "127.0.0.1", nonce: n.nonce, uri: location.origin && location.origin !== "null" ? location.origin : "http://127.0.0.1/", version: "1", statement: n.statement });
      const signature = await this.wallet!.signMessage({ account: this.wallet!.account!, message });
      const r = (await (await fetch(`${this.shop}/link/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account: this.account, message, signature, secret: this.secret }) })).json()) as { ok: boolean; reason?: string; counter: CounterRecord | null };
      if (r.ok) await Promise.all([this.op("view"), this.readHoldings()]);
      this.say(r.ok ? `LINKED · ${this.short()}${r.reason ? " · " + crtPhrase(r.reason) : ""}` : `LINK REFUSED: ${crtPhrase(r.reason ?? "")}`);
      return { ok: r.ok, reason: r.reason };
    } catch (e) {
      const reason = String((e as Error).message ?? e).split("\n")[0]!.slice(0, 100);
      this.say(`LINK FAILED: ${crtPhrase(reason)}`);
      return { ok: false, reason };
    } finally {
      this.busy = false;
    }
  }

  private async linkSolana(): Promise<{ ok: boolean; reason?: string }> {
    this.busy = true;
    try {
      const n = (await (await fetch(`${this.shop}/link/nonce`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account: this.account, secret: this.secret }) })).json()) as { nonce?: string; statement: string; cluster?: string; ok?: boolean; reason?: string };
      if (!n.nonce) return { ok: false, reason: n.reason ?? "no nonce" };
      const cluster = n.cluster === "devnet" || n.cluster === "mainnet-beta" ? n.cluster : this.info?.devnet ? "devnet" : "mainnet-beta";
      const message = solanaLinkMessage({ address: this.address!, account: this.account, nonce: n.nonce, cluster, statement: n.statement });
      const signature = await this.signSolana(message);
      const r = (await (await fetch(`${this.shop}/link/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account: this.account, message, signature, secret: this.secret }) })).json()) as { ok: boolean; reason?: string };
      if (r.ok) await this.op("view");
      this.say(r.ok ? `LINKED · ${this.short()}${r.reason ? " · " + crtPhrase(r.reason) : ""}` : `LINK REFUSED: ${crtPhrase(r.reason ?? "")}`);
      return { ok: r.ok, reason: r.reason };
    } catch (e) {
      const reason = String((e as Error).message ?? e).split("\n")[0]!.slice(0, 100);
      this.say(`LINK FAILED: ${crtPhrase(reason)}`);
      return { ok: false, reason };
    } finally {
      this.busy = false;
    }
  }

  private async signSolana(message: string): Promise<string> {
    const bytes = new TextEncoder().encode(message);
    if (this.solanaSeed) {
      const { ed25519 } = await import("@noble/curves/ed25519");
      return bytesToHex(ed25519.sign(bytes, this.solanaSeed));
    }
    const provider = this.solana;
    if (!provider) throw new Error("NO SOLANA WALLET");
    const signed = await provider.signMessage(bytes, "utf8");
    const sig = signed instanceof Uint8Array ? signed : signed.signature;
    return bytesToHex(sig);
  }

  /** wear / reconcile / stamps / name on the file through the host */
  /** posted prizes for this wallet, as the last op reported them */
  prizes: { epoch: number; kind: string; period: number; amount: string; reason: string; claimed: boolean }[] = [];
  async op(op: "view" | "wear" | "reconcile" | "stamps" | "name" | "payout" | "prizes" | "claimPrize", body: Record<string, unknown> = {}): Promise<{ ok: boolean; reason?: string; voucher?: { name: string; nonce: string; deadline: string; signature: Hex; fee: number } }> {
    try {
      const r = (await (await fetch(`${this.shop}/file/${encodeURIComponent(this.account)}/counter`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ...body, secret: this.secret }) })).json()) as { ok: boolean; reason?: string; counter: CounterRecord | null; view: CounterView; voucher?: { name: string; nonce: string; deadline: string; signature: Hex; fee: number }; prizes?: CounterClient["prizes"] };
      if (r.prizes) this.prizes = r.prizes;
      this.applyCounter(r.counter, r.view);
      if (op !== "view") this.say(counterOpLine(op, r.ok, r.reason));
      return r;
    } catch (e) {
      const reason = String(e).slice(0, 100);
      this.say(`${op.toUpperCase()} FAILED: ${crtPhrase(reason)}`);
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
    if (this.address && isSolanaAddress(this.address)) return { ok: false, reason: SOLANA_SETTLEMENT_LINE };
    if (!this.wallet && !(await this.connect("evm"))) return { ok: false, reason: "no wallet" };
    if (!this.wallet || !this.info) return { ok: false, reason: "no wallet" };
    if (!this.info.contracts.capital || !this.info.contracts.market) return { ok: false, reason: "no market" };
    const L = this.info.listings.find((l) => l.listing === listing);
    if (!L) return { ok: false, reason: "no such listing" };
    this.busy = true;
    try {
      const price = parseEther(String(L.price));
      if (!(await this.tx(this.info.contracts.capital, ABI["$CAPITAL"]!.abi, "approve", [this.info.contracts.market, price]))) return { ok: false, reason: "approve reverted" };
      if (!(await this.tx(this.info.contracts.market, ABI.LedgerMarket!.abi, "buy", [BigInt(listing), 1n]))) return { ok: false, reason: "buy reverted" };
      await this.op("reconcile");
      await this.load();
      this.say(`BOUGHT · LISTING ${listing} · ${L.price} $CAPITAL`);
      return { ok: true };
    } catch (e) {
      const reason = String((e as Error).message ?? e).split("\n").find((l) => /revert|Error|fetch|failed/i.test(l))?.slice(0, 100) ?? "failed";
      this.say(`BUY FAILED: ${crtPhrase(reason)}`);
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
  private async burnSink(kind: "season" | "rooms", target: Hex | undefined, abi: Abi, fn: string, args: (p: bigint) => unknown[], fee: number, unit: number, label: string): Promise<{ ok: boolean; reason?: string }> {
    if (this.address && isSolanaAddress(this.address)) return { ok: false, reason: SOLANA_SETTLEMENT_LINE };
    if (!this.wallet && !(await this.connect("evm"))) return { ok: false, reason: "no wallet" };
    if (!this.wallet || !this.info) return { ok: false, reason: "no wallet" };
    if (!this.info.contracts.capital || !target) return { ok: false, reason: "no market" };
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
      this.say(`${label} FAILED: ${crtPhrase(reason)}`);
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
      const r = (await (await fetch(`${this.shop}/rooms/open`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account: this.account, hours, rules, secret: this.secret }) })).json()) as { ok: boolean; reason?: string; code?: string; room?: string; join?: string };
      if (r.ok) await this.op("reconcile");
      this.say(r.ok ? `PRIVATE ROOM · CODE ${r.code} · ${hours}H` : `ROOM REFUSED: ${crtPhrase(r.reason ?? "")}`);
      return r;
    } catch (e) {
      const reason = String((e as Error).message ?? e).slice(0, 100);
      this.say(`ROOM FAILED: ${crtPhrase(reason)}`);
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
    if (!this.info.contracts.cosmetics || !this.info.contracts.market) return { ok: false, reason: "no market" };
    if (!(price > 0)) return { ok: false, reason: "price must be positive" };
    this.busy = true;
    try {
      if (!(await this.tx(this.info.contracts.cosmetics, ABI.Cosmetics!.abi, "setApprovalForAll", [this.info.contracts.market, true]))) return { ok: false, reason: "approval reverted" };
      if (!(await this.tx(this.info.contracts.market, ABI.LedgerMarket!.abi, "list", [BigInt(token), 1n, parseEther(String(price))]))) return { ok: false, reason: "list reverted" };
      await this.op("reconcile");
      await this.load();
      this.say(`LISTED · TOKEN ${token} · ${price} $CAPITAL`);
      return { ok: true };
    } catch (e) {
      const reason = String((e as Error).message ?? e).split("\n").find((l) => /revert|Error|fetch|failed/i.test(l))?.slice(0, 100) ?? "failed";
      this.say(`SELL FAILED: ${crtPhrase(reason)}`);
      return { ok: false, reason };
    } finally {
      this.busy = false;
    }
  }

  /** The name: a Depth-50 voucher from the host, then the player's own approve + register (the fee burns). */
  async registerName(name: string): Promise<{ ok: boolean; reason?: string }> {
    if (this.address && isSolanaAddress(this.address)) return { ok: false, reason: SOLANA_SETTLEMENT_LINE };
    if (!this.wallet && !(await this.connect("evm"))) return { ok: false, reason: "no wallet" };
    if (!this.wallet || !this.info) return { ok: false, reason: "no wallet" };
    if (!this.info.contracts.capital || !this.info.contracts.names) return { ok: false, reason: "no market" };
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
      this.say(`NAME FAILED: ${crtPhrase(reason)}`);
      return { ok: false, reason };
    } finally {
      this.busy = false;
    }
  }
}
