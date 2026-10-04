/**
 * The WALLET page on the main menu.
 *
 * The page is a pure function of the Counter-Ledger's own client (client/wallet.ts), so each of its
 * states is pinned here from the client's fields; then the real `CounterClient` is driven against
 * the in-process devnet behind a local JSON-RPC endpoint — the headless `?wallet=` account and a
 * fake injected provider on the wrong chain — so the page's states are the ones the client really
 * reaches, and the FILE page's Counter-Ledger reads the same connection. Last, the real `Menu`,
 * over a minimal stand-in DOM, lists WALLET after FILE and opens the page.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { privateKeyToAccount } from "viem/accounts";
import { bootDevnetLedger, DEV_KEYS } from "../server/chain/boot";
import { emptyCounter, SIWE_STATEMENT } from "../shared/economy/counter";
import { sandboxAccount } from "../shared/progression/account";
import { CounterClient } from "../client/counter";
import { ledgerChainId, shortAddress, walletAct, walletEntries, walletHtml, walletState, WALLET_SAFETY, type WalletActor, type WalletSource } from "../client/wallet";
import { MAIN, Menu, type MenuHost } from "../client/menu";
import { DEFAULT_SETTINGS } from "../client/settings";
import { GhostFile } from "../client/file";
import { reachable } from "./helpers/imports";

const ADDR = "0x1234567890abcdef1234567890abcdef1234abcd";
const INFO = { chainId: 46630, devnet: false };
const src = (over: Partial<WalletSource> = {}): WalletSource => ({ info: INFO, address: null, connecting: false, walletChain: null, holdings: null, last: "", ...over });
const text = (html: string) => html.replace(/<[^>]*>/g, "");

describe("the address shortener", () => {
  it("keeps 0x and four in front, four behind, and never cuts a short string", () => {
    expect(shortAddress(ADDR)).toBe("0x1234…abcd");
    expect(shortAddress(null)).toBe("—");
    expect(shortAddress("0xabc")).toBe("0xabc");
  });
});

describe("the WALLET page, state by state", () => {
  it("not connected: says so, offers both connects, shows no address and still carries the safety line", () => {
    const s = walletState(src(), true);
    expect(s.status).toBe("none");
    const t = text(walletHtml(s));
    expect(t).toMatch(/STATUS NOT CONNECTED/);
    expect(t).not.toMatch(/ADDRESS|STATUS CONNECTED/);
    expect(t).toContain(WALLET_SAFETY);
    expect(WALLET_SAFETY).toMatch(/NEVER ASKS FOR YOUR SEED PHRASE/);
    expect(WALLET_SAFETY).toMatch(/NEVER SENDS FROM YOUR WALLET WITHOUT A SIGNATURE PROMPT/);
    expect(walletEntries(s).map((e) => e.label)).toEqual(["CONNECT — WALLETCONNECT", "CONNECT — BROWSER WALLET"]);
  });

  it("connecting: says CONNECTING while the wallet is asked, even over a stale address", () => {
    const s = walletState(src({ connecting: true, address: ADDR }), true);
    expect(s.status).toBe("connecting");
    expect(text(walletHtml(s))).toMatch(/STATUS CONNECTING/);
    expect(text(walletHtml(s))).not.toMatch(/ADDRESS/);
  });

  it("connected on the right chain: the chain, the short address (full in the title), the $CAPITAL balance and the bound Ghostfile", () => {
    const s = walletState(src({ address: ADDR, walletChain: INFO.chainId, holdings: { capital: "1234.5", ghostfile: 7 } }), true);
    expect(s.status).toBe("connected");
    const html = walletHtml(s);
    const t = text(html);
    expect(t).toMatch(/STATUS CONNECTED ON ROBINHOOD CHAIN/);
    expect(t).toMatch(/ROBINHOOD CHAIN · CHAIN 46630/);
    expect(t).toMatch(/ADDRESS 0x1234…abcd/);
    expect(html).toContain(`title="${ADDR}"`);
    expect(t).toMatch(/\$CAPITAL 1,234\.5/);
    expect(t).toMatch(/GHOSTFILE #7 BOUND/);
    expect(t).not.toMatch(/WRONG NETWORK|NOT CONNECTED/);
    expect(html).toMatch(/<img class="cap-mark"/);
    expect(walletEntries(s).map((e) => e.label)).toEqual(["DISCONNECT", "COPY ADDRESS"]);
    expect(walletEntries(s).find((e) => e.id === "copy")!.line).toContain(ADDR);
  });

  it("connected with no Ghostfile says NOT BOUND and where to bind it; a balance not read yet is an ellipsis, not a zero", () => {
    expect(text(walletHtml(walletState(src({ address: ADDR, walletChain: INFO.chainId, holdings: { capital: "0", ghostfile: 0 } }), true)))).toMatch(/GHOSTFILE NOT BOUND SIGN THE LINK IN FILE/);
    const pending = text(walletHtml(walletState(src({ address: ADDR, walletChain: INFO.chainId }), true)));
    expect(pending).toMatch(/\$CAPITAL …/);
    expect(pending).not.toMatch(/\$CAPITAL 0/);
  });

  it("wrong chain: a clear WRONG NETWORK naming both chains, and a SWITCH NETWORK button first", () => {
    const s = walletState(src({ address: ADDR, walletChain: 1, holdings: { capital: "5", ghostfile: 0 } }), true);
    expect(s.status).toBe("wrong-chain");
    const t = text(walletHtml(s));
    expect(t).toMatch(/STATUS WRONG NETWORK/);
    expect(t).toMatch(/YOUR WALLET IS ON CHAIN 1; THE LEDGER IS ROBINHOOD CHAIN · CHAIN 46630/);
    expect(t).not.toMatch(/STATUS CONNECTED/);
    expect(walletEntries(s).map((e) => e.id)).toEqual(["switch", "disconnect", "copy"]);
  });

  it("no ledger host, and a client still loading, both read as not connected with the reason", () => {
    const none = walletState(null, false);
    expect(none.status).toBe("none");
    expect(text(walletHtml(none))).toMatch(/NO LEDGER HOST ON THIS PAGE/);
    const loading = walletState(null, true);
    expect(loading.loading).toBe(true);
    expect(text(walletHtml(loading))).toMatch(/STATUS NOT CONNECTED.*FETCHING THE CHAIN CLIENT/);
  });

  it("each button reaches the client's own method, with the button's own connector", async () => {
    const calls: string[] = [];
    const actor: WalletActor = {
      connect: async (via) => (calls.push(`connect:${via}`), true),
      disconnect: async () => void calls.push("disconnect"),
      switchChain: async () => (calls.push("switch"), true),
      copyAddress: async () => (calls.push("copy"), true),
    };
    for (const id of ["walletconnect", "injected", "disconnect", "switch", "copy", "nonsense"]) await walletAct(actor, id);
    expect(calls).toEqual(["connect:walletconnect", "connect:injected", "disconnect", "switch", "copy"]);
  });

  it("the page module never pulls the chain client into the first download", () => {
    const seen = [...reachable("client/wallet.ts", { valueOnly: true })];
    expect(seen.some((f) => /client[\\/]counter\.ts$/.test(f))).toBe(false);
  });
});

describe("the WALLET page against the real Counter-Ledger client", () => {
  let b: Awaited<ReturnType<typeof bootDevnetLedger>>;
  let server: Server;
  let host = "";
  const player = privateKeyToAccount(DEV_KEYS.player);
  const player2 = privateKeyToAccount(DEV_KEYS.player2);
  beforeAll(async () => {
    b = await bootDevnetLedger({ onLog: () => {}, seedMarket: false });
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", async () => {
        res.setHeader("content-type", "application/json");
        if (req.url === "/counter") res.end(JSON.stringify({ chainId: b.devnet.chainId, devnet: true, contracts: b.contracts, signer: player.address, statement: SIWE_STATEMENT, rpc: `${host}/rpc`, listings: [], treasury: null }));
        else res.end(JSON.stringify(await b.devnet.handle(JSON.parse(body))));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);
  afterAll(
    () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  );
  afterEach(() => vi.unstubAllGlobals());

  const at = (search: string) => vi.stubGlobal("location", { search, host: "127.0.0.1", origin: "http://127.0.0.1" });

  it("the headless account: NOT CONNECTED, CONNECTING, then CONNECTED with the chain's own balance and Ghostfile; DISCONNECT forgets it", async () => {
    at(`?wallet=${DEV_KEYS.player}`);
    const c = new CounterClient(host, "sandbox-wallet", () => {});
    expect(walletState(c, true).loading).toBe(true);
    await c.load();
    expect(walletState(c, true).status).toBe("none");
    const pending = walletAct(c, "injected");
    expect(walletState(c, true).status).toBe("connecting");
    await pending;
    expect(walletState(c, true).status).toBe("connected");
    expect(await c.readHoldings()).toEqual({ capital: "0", ghostfile: 0 });
    expect(text(walletHtml(walletState(c, true)))).toMatch(new RegExp(`MELTDOWN DEVNET · CHAIN ${b.devnet.chainId}.*STATUS CONNECTED.*ADDRESS ${player.address.slice(0, 6)}…${player.address.slice(-4)}.*\\$CAPITAL 0.*GHOSTFILE NOT BOUND`));
    // the ledger binds the wallet and grants the launch $CAPITAL; the page reads both off the chain
    const a = sandboxAccount("sandbox-wallet");
    a.counter = { ...emptyCounter(), address: player.address };
    expect((await b.ledger.mintGhostfile(a)).ok).toBe(true);
    expect((await b.ledger.grant(a)).ok).toBe(true);
    await c.readHoldings();
    const t = text(walletHtml(walletState(c, true)));
    expect(t).toMatch(/\$CAPITAL 1,000/);
    expect(t).toMatch(/GHOSTFILE #1 BOUND/);
    await walletAct(c, "disconnect");
    expect(walletState(c, true).status).toBe("none");
    expect(c.address).toBeNull();
    expect(text(walletHtml(walletState(c, true)))).not.toMatch(/ADDRESS|\$CAPITAL 1,000/);
  });

  it("COPY ADDRESS writes the full address, not the short one", async () => {
    at(`?wallet=${DEV_KEYS.player}`);
    const copied: string[] = [];
    vi.stubGlobal("navigator", { clipboard: { writeText: async (t: string) => void copied.push(t) } });
    const c = new CounterClient(host, "sandbox-copy", () => {});
    await c.connect("injected");
    expect(await walletAct(c, "copy")).toBe(true);
    expect(copied).toEqual([player.address]);
    expect(c.last).toContain(player.address);
  });

  it("an injected wallet on another chain is WRONG NETWORK until SWITCH NETWORK moves it; emptying its accounts disconnects", async () => {
    at("");
    let chain = "0x1";
    const handlers: Record<string, (x: unknown) => void> = {};
    const asked: string[] = [];
    const ethereum = {
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        asked.push(method);
        if (method === "eth_requestAccounts") return [player2.address];
        if (method === "eth_chainId") return chain;
        if (method === "wallet_switchEthereumChain") {
          chain = (params![0] as { chainId: string }).chainId;
          handlers.chainChanged?.(chain);
          return null;
        }
        return null;
      },
      on: (e: string, h: (x: unknown) => void) => void (handlers[e] = h),
    };
    vi.stubGlobal("window", { ethereum });
    const c = new CounterClient(host, "sandbox-injected", () => {});
    expect(await walletAct(c, "injected")).toBe(true);
    expect(walletState(c, true).status).toBe("wrong-chain");
    expect(text(walletHtml(walletState(c, true)))).toMatch(new RegExp(`YOUR WALLET IS ON CHAIN 1; THE LEDGER IS MELTDOWN DEVNET · CHAIN ${b.devnet.chainId}`));
    expect(await walletAct(c, "switch")).toBe(true);
    expect(walletState(c, true).status).toBe("connected");
    // the wallet moves on its own: the page follows
    handlers.chainChanged?.("0x5");
    expect(walletState(c, true).status).toBe("wrong-chain");
    handlers.accountsChanged?.([]);
    await Promise.resolve();
    expect(walletState(c, true).status).toBe("none");
    expect(asked).toContain("wallet_revokePermissions");
  });

  it("a wallet on a real chain stays connected when the ledger has published no chain", async () => {
    const bare = { chainId: 0, devnet: false, reason: "CHAIN NOT CONFIGURED: the counter-ledger waits for Robinhood Chain's testnet parameters (CHAIN_ID, CHAIN_RPC, CONTRACTS)" };
    expect(ledgerChainId(bare)).toBeNull();
    const s = walletState(src({ info: bare, address: ADDR, walletChain: 4663 }), true);
    expect(s.status).toBe("connected");
    expect(s.chainId).toBeNull();
    const t = text(walletHtml(s));
    expect(t).toMatch(/STATUS CONNECTED/);
    expect(t).toMatch(/CHAIN NOT CONFIGURED/);
    expect(t).not.toMatch(/WRONG NETWORK|CHAIN 0/);
    expect(walletEntries(s).map((e) => e.id)).not.toContain("switch");
  });

  it("WALLETCONNECT with no headless account says it is not in this build, and connects nothing", async () => {
    at("");
    vi.stubGlobal("window", {});
    const c = new CounterClient(host, "sandbox-wc", () => {});
    expect(await walletAct(c, "walletconnect")).toBe(false);
    expect(walletState(c, true).status).toBe("none");
    expect(c.last).toMatch(/WALLETCONNECT IS NOT IN THIS BUILD YET/);
  });

  it("WALLETCONNECT uses the browser wallet when the page is open inside one, and an unpublished chain does not fail the read", async () => {
    at("");
    const ethereum = {
      request: async ({ method }: { method: string }) => (method === "eth_requestAccounts" ? [player2.address] : method === "eth_chainId" ? "0x1" : null),
      on: () => undefined,
    };
    vi.stubGlobal("window", { ethereum });
    vi.stubGlobal("fetch", async (url: string) => {
      if (String(url).endsWith("/counter")) {
        return { json: async () => ({ chainId: 0, devnet: false, contracts: {}, signer: null, statement: "", listings: [], treasury: null, reason: "CHAIN NOT CONFIGURED: the counter-ledger waits" }) };
      }
      throw new Error(String(url));
    });
    const c = new CounterClient("https://ledger.test", "sandbox-wc-injected", () => {});
    expect(await walletAct(c, "walletconnect")).toBe(true);
    expect(c.address).toBe(player2.address);
    expect(walletState(c, true).status).toBe("connected");
    expect(c.last).not.toMatch(/WALLET READ FAILED/);
    expect(await c.readHoldings()).toBeNull();
  });

  it("a launchpad token with no ghostfile still shows a balance", async () => {
    const CAP = "0x1111111111111111111111111111111111111111";
    const one = `0x${(10n ** 18n).toString(16).padStart(64, "0")}`;
    at("");
    const ethereum = {
      request: async ({ method }: { method: string }) => (method === "eth_requestAccounts" ? [player2.address] : method === "eth_chainId" ? "0x1237" : null),
      on: () => undefined,
    };
    vi.stubGlobal("window", { ethereum });
    const reply = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
    vi.stubGlobal("fetch", async (_url: string, init?: { body?: BodyInit | null }) => {
      const url = String(_url);
      if (url.endsWith("/counter")) {
        return reply({ chainId: 4663, devnet: false, rpc: "https://rpc.example", contracts: { capital: CAP }, signer: null, statement: "", listings: [], treasury: null, reason: "THE TOKEN IS PUBLISHED. LINK, VOUCHERS AND THE MARKET STAY CLOSED UNTIL THEIR CONTRACTS ARE." });
      }
      const raw = typeof init?.body === "string" ? init.body : "{}";
      const body = JSON.parse(raw) as { method?: string };
      if (body.method === "eth_chainId") return reply({ jsonrpc: "2.0", id: 1, result: "0x1237" });
      if (body.method === "eth_call") return reply({ jsonrpc: "2.0", id: 1, result: one });
      return reply({ jsonrpc: "2.0", id: 1, result: "0x0" });
    });
    const c = new CounterClient("https://ledger.test", "sandbox-token", () => {});
    expect(await walletAct(c, "injected")).toBe(true);
    const held = await c.readHoldings();
    expect(held?.capital).toBe("1");
    expect(held?.ghostfile).toBeNull();
    expect(c.last).not.toMatch(/WALLET READ FAILED/);
    const s = walletState(c, true);
    expect(s.status).toBe("connected");
    expect(s.chainId).toBe(4663);
    const t = text(walletHtml(s));
    expect(t).toMatch(/\$CAPITAL/);
    expect(t).toMatch(/GHOSTFILE NOT ON THIS LEDGER/);
    expect(t).not.toMatch(/SIGN THE LINK/);
    expect(walletEntries(s).map((e) => e.id)).not.toContain("switch");
    expect(await c.buy(1)).toEqual({ ok: false, reason: "no market" });
  });

  it("one connection: a wallet connected on the WALLET page is the FILE page's Counter-Ledger wallet, and the FILE page's connect is the WALLET page's", async () => {
    at(`?wallet=${DEV_KEYS.player}&account=sandbox-shared`);
    const file = new GhostFile(() => false);
    const c = new CounterClient(host, file.account, () => {});
    file.counter = c;
    await c.load();
    expect(file.counterHtml()).toMatch(/LINK A WALLET/);
    await walletAct(c, "injected"); // the WALLET page's button
    expect(file.counterHtml()).toContain(`WALLET <b>${shortAddress(player.address)}</b>`);
    await c.disconnect();
    expect(file.counterHtml()).toMatch(/LINK A WALLET/);
    await c.connect(); // what the FILE page's link and buys call
    expect(walletState(file.counter, true).status).toBe("connected");
  });
});

/** Just enough DOM for the menu: every selector answers with its own element, made on first ask. */
class FakeEl {
  innerHTML = "";
  textContent = "";
  hidden = false;
  className = "";
  id = "";
  src = "";
  onerror: unknown = null;
  classList = { toggle: () => false };
  private kids = new Map<string, FakeEl>();
  querySelector(sel: string): FakeEl {
    let k = this.kids.get(sel);
    if (!k) this.kids.set(sel, (k = new FakeEl()));
    return k;
  }
  addEventListener(): void {}
  appendChild(): void {}
  play(): Promise<void> {
    return Promise.resolve();
  }
  remove(): void {}
}

describe("the main menu's WALLET entry", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is listed right after FILE and before SETTINGS, with its line in the menu's voice", () => {
    const ids = MAIN.map((e) => e.id);
    expect(ids.indexOf("wallet")).toBe(ids.indexOf("file") + 1);
    expect(ids.indexOf("settings")).toBe(ids.indexOf("wallet") + 1);
    const w = MAIN.find((e) => e.id === "wallet")!;
    expect(w.label).toBe("WALLET");
    expect(w.line).toBe("CONNECT A WALLET: YOUR ADDRESS, YOUR $CAPITAL, YOUR GHOSTFILE ON-CHAIN");
  });

  it("opens the WALLET page in place, routes its buttons to the wallet, and ESC goes back to the main menu", () => {
    vi.stubGlobal("location", { search: "?nonav=1", href: "http://127.0.0.1/?nonav=1" });
    vi.stubGlobal("document", { createElement: () => new FakeEl(), body: new FakeEl(), addEventListener: () => {} });
    vi.stubGlobal(
      "KeyboardEvent",
      class {
        code: string;
        constructor(_type: string, init: { code: string }) {
          this.code = init.code;
        }
        preventDefault(): void {}
      },
    );
    const acts: string[] = [];
    let opened = 0;
    let source = src();
    const host: MenuHost = {
      audio: null,
      settings: { ...DEFAULT_SETTINGS },
      applySettings: () => {},
      openFile: () => {},
      resume: () => {},
      identityLine: () => "BLANK · DEPTH 01 · test",
      look: () => 0,
      setLook: () => {},
      wallet: { state: () => walletState(source, true), open: () => void opened++, act: (id) => void acts.push(id) },
    };
    const menu = new Menu(host);
    menu.choose("wallet");
    const page = () => text(menu.root.querySelector(".page")!.innerHTML);
    expect(menu.view().screen).toBe("wallet");
    expect(opened).toBe(1);
    expect(page()).toMatch(/STATUS NOT CONNECTED/);
    expect(menu.view().entries).toEqual(["CONNECT — WALLETCONNECT", "CONNECT — BROWSER WALLET", "BACK"]);
    menu.key("ArrowDown");
    menu.key("Enter");
    expect(acts).toEqual(["injected"]);
    // the client connected: the page redraws on the client's word, with the other buttons
    source = src({ address: ADDR, walletChain: INFO.chainId, holdings: { capital: "10", ghostfile: 2 } });
    menu.refresh();
    expect(page()).toMatch(/STATUS CONNECTED.*ADDRESS 0x1234…abcd.*\$CAPITAL 10.*GHOSTFILE #2 BOUND/);
    expect(menu.view().entries).toEqual(["DISCONNECT", "COPY ADDRESS", "BACK"]);
    menu.choose("wallet:copy");
    expect(acts).toEqual(["injected", "copy"]);
    menu.key("Escape");
    expect(menu.view().screen).toBe("main");
    expect(menu.root.querySelector(".page")!.innerHTML).toBe("");
    expect(menu.view().entries).toContain("WALLET");
  });
});
