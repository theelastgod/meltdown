/**
 * The WALLET page on the main menu: what the connected wallet is, on which chain, what it holds.
 *
 * It owns no connection. The wallet is the Counter-Ledger's `CounterClient` (client/counter.ts),
 * the same instance the FILE page's Counter-Ledger uses, reached through `GhostFile.ensureCounter()`
 * — so connecting here is connected there, and the chain client stays its own chunk (Stage 48):
 * this module imports nothing from counter.ts but its shape, and nothing from viem.
 *
 * Everything here is a pure function of that client's fields, so the page's every state is testable
 * without a browser or a chain.
 */
import { capitalMark } from "./brand";

/** What the page reads off the Counter-Ledger's client. `CounterClient` has this shape. */
export interface WalletSource {
  info: { chainId: number; devnet: boolean; reason?: string } | null;
  address: string | null;
  connecting: boolean;
  /** the chain the wallet itself is on (null: not asked yet) */
  walletChain: number | null;
  /** the connected address's own holdings, read from the chain (null: not read yet) */
  holdings: { capital: string; ghostfile: number | null } | null;
  last: string;
}

/** What the page's buttons ask the client to do. `CounterClient` has these. */
export interface WalletActor {
  connect(via: "walletconnect" | "injected"): Promise<boolean>;
  disconnect(): Promise<void>;
  switchChain(): Promise<boolean>;
  copyAddress(): Promise<boolean>;
}

export type WalletStatus = "none" | "connecting" | "connected" | "wrong-chain";

export interface WalletState {
  status: WalletStatus;
  /** false: no ledger host in this build or on this URL, so there is nothing to connect to */
  reachable: boolean;
  /** the chain client or the host's chain parameters are still on their way */
  loading: boolean;
  address: string | null;
  chainId: number | null;
  chainName: string;
  walletChain: number | null;
  capital: string | null;
  /** true once a holdings read has returned, including a token with no ghostfile contract */
  tokenKnown: boolean;
  ghostfile: number | null;
  line: string;
  /** the host's own reason, when the ledger has no chain to read */
  note: string;
}

export const WALLET_SAFETY = "THE GAME NEVER ASKS FOR YOUR SEED PHRASE, AND NEVER SENDS FROM YOUR WALLET WITHOUT A SIGNATURE PROMPT IN YOUR WALLET.";
/** The token is whatever the launchpad deploys. This page does not mint it and does not hold it. */
export const WALLET_TOKEN = "THE TOKEN COMES FROM A LAUNCHPAD. THIS GAME DOES NOT HOLD IT AND DOES NOT PAY IT OUT. THE BALANCE APPEARS HERE AFTER THE LAUNCHPAD PUBLISHES IT.";

/** 0x1234…abcd: six in front (0x and four), four behind. Anything shorter is shown whole. */
export function shortAddress(a: string | null | undefined): string {
  if (!a) return "—";
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export function chainName(info: WalletSource["info"]): string {
  return info ? (info.devnet ? "MELTDOWN DEVNET" : "ROBINHOOD CHAIN") : "ROBINHOOD CHAIN";
}

/**
 * The chain the ledger can actually sign against.
 * Chain 0 is not a network: comparing the wallet to it marked every real wallet WRONG NETWORK
 * and SWITCH NETWORK asked for chain 0. A reason beside a real chain id is a note, not a missing chain.
 */
export function ledgerChainId(info: WalletSource["info"]): number | null {
  if (!info || !info.chainId) return null;
  return info.chainId;
}

/** The page's state from the client (null: the chain client is not loaded, or there is no host). */
export function walletState(c: WalletSource | null, reachable: boolean): WalletState {
  const info = c?.info ?? null;
  const address = c?.address ?? null;
  const walletChain = c?.walletChain ?? null;
  const chainId = ledgerChainId(info);
  const status: WalletStatus = c?.connecting ? "connecting" : !address ? "none" : chainId !== null && walletChain !== null && walletChain !== chainId ? "wrong-chain" : "connected";
  return {
    status,
    reachable,
    loading: reachable && (!c || !info),
    address,
    chainId,
    chainName: chainName(info),
    walletChain,
    capital: address ? (c?.holdings?.capital ?? null) : null,
    tokenKnown: !!c?.holdings,
    ghostfile: address ? (c?.holdings?.ghostfile ?? null) : null,
    line: c?.last ?? "",
    note: info?.reason ?? "",
  };
}

const STATUS_WORD: Record<WalletStatus, string> = { none: "NOT CONNECTED", connecting: "CONNECTING", connected: "CONNECTED", "wrong-chain": "WRONG NETWORK" };

function capitalText(v: string): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v;
}

/** The page body above the buttons. */
export function walletHtml(s: WalletState): string {
  const chain = s.chainId !== null ? `${s.chainName} · CHAIN ${s.chainId}` : s.chainName;
  const rows: string[] = [`<div class="sh">${capitalMark()}WALLET // $CAPITAL <span class="dim">${chain}</span></div>`];
  rows.push(`<div class="ln st ${s.status}">STATUS <b>${STATUS_WORD[s.status]}</b>${s.status === "connected" ? ` <span class="dim">ON ${s.chainName}</span>` : ""}</div>`);
  if (!s.reachable) rows.push(`<div class="ln dim">NO LEDGER HOST ON THIS PAGE: THE WALLET CONNECTS WHERE THE COUNTER-LEDGER RUNS (A ROOM, THE OFFICE, OR ?SHOP=)</div>`);
  else if (s.loading) rows.push(`<div class="ln dim">FETCHING THE CHAIN CLIENT…</div>`);
  if (s.status === "wrong-chain") rows.push(`<div class="ln bad">YOUR WALLET IS ON CHAIN ${s.walletChain}; THE LEDGER IS ${chain}. SWITCH NETWORK BEFORE YOU SIGN ANYTHING.</div>`);
  if (s.address && s.status !== "connecting") {
    rows.push(`<div class="ln">ADDRESS <b title="${s.address}">${shortAddress(s.address)}</b></div>`);
    rows.push(`<div class="ln">$CAPITAL <b>${s.capital === null ? "…" : capitalText(s.capital)}</b></div>`);
    if (!s.tokenKnown) rows.push(`<div class="ln">GHOSTFILE <b>…</b></div>`);
    else if (s.ghostfile === null) rows.push(`<div class="ln dim">GHOSTFILE NOT ON THIS LEDGER</div>`);
    else rows.push(`<div class="ln">GHOSTFILE ${s.ghostfile > 0 ? `<b>#${s.ghostfile} BOUND</b> <span class="dim">SOULBOUND TO THIS WALLET</span>` : `<b>NOT BOUND</b> <span class="dim">SIGN THE LINK IN FILE → COUNTER-LEDGER</span>`}</div>`);
  }
  rows.push(`<div class="ln safe">${WALLET_SAFETY}</div>`);
  rows.push(`<div class="ln dim">${WALLET_TOKEN}</div>`);
  if (s.note) rows.push(`<div class="ln dim">${s.note}</div>`);
  if (s.line) rows.push(`<div class="ln am">${s.line}</div>`);
  return rows.join("");
}

export interface WalletEntry {
  id: string;
  label: string;
  line: string;
}

/** The page's buttons: connect while there is nothing connected; disconnect and copy once there is. */
export function walletEntries(s: WalletState): WalletEntry[] {
  if (s.status === "none" || s.status === "connecting") {
    return [
      { id: "walletconnect", label: "CONNECT — WALLETCONNECT", line: "ROBINHOOD WALLET, METAMASK, RABBY OR ANY WALLETCONNECT WALLET ON YOUR PHONE" },
      { id: "injected", label: "CONNECT — BROWSER WALLET", line: "THE WALLET IN THIS BROWSER: METAMASK, RABBY, OR A WALLET APP'S OWN BROWSER" },
    ];
  }
  const out: WalletEntry[] = [];
  if (s.status === "wrong-chain") out.push({ id: "switch", label: "SWITCH NETWORK", line: `ASK THE WALLET TO MOVE TO ${s.chainName}` });
  out.push({ id: "disconnect", label: "DISCONNECT", line: "FORGET THIS WALLET ON THIS PAGE; A FILE ALREADY LINKED STAYS LINKED ON THE LEDGER" });
  out.push({ id: "copy", label: "COPY ADDRESS", line: `COPIES THE FULL ADDRESS: ${s.address ?? ""}` });
  return out;
}

/** A button pressed on the page, handed to the client. */
export function walletAct(c: WalletActor, id: string): Promise<unknown> {
  switch (id) {
    case "walletconnect":
    case "injected":
      return c.connect(id);
    case "disconnect":
      return c.disconnect();
    case "switch":
      return c.switchChain();
    case "copy":
      return c.copyAddress();
    default:
      return Promise.resolve(false);
  }
}
