import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createWalletClient, defineChain, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { bootDevnetLedger, DEV_KEYS } from "../server/chain/boot";
import { ARTIFACTS } from "../server/chain/deploy";
import { economyManifest, SKINS, skinByToken } from "../shared/economy/catalog";
import { lintEconomy } from "../shared/economy/lint";
import { counterRequest } from "../shared/economy/endpoint";
import { NAME_DEPTH, SIWE_STATEMENT, LAUNCH_GRANT, nameFee, wearSkin } from "../shared/economy/counter";
import { devSeed, MemoryAccountStore } from "../server/accounts";
import { identityTag, parseTag, publicIdentity } from "../shared/identity/identity";
import { Room, type Conn } from "../server/room";
import { decodeServerMessage, encodeJoin } from "../shared/net/protocol";

type Boot = Awaited<ReturnType<typeof bootDevnetLedger>>;

describe("the counter-ledger on the devnet", () => {
  let b: Boot;
  const store = new MemoryAccountStore(devSeed);
  const player = privateKeyToAccount(DEV_KEYS.player);
  const player2 = privateKeyToAccount(DEV_KEYS.player2);
  let chain: ReturnType<typeof defineChain>;
  beforeAll(async () => {
    b = await bootDevnetLedger({ onLog: () => {} });
    chain = defineChain({ id: b.devnet.chainId, name: "devnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [] } } });
  }, 60_000);

  const siwe = async (account: { address: Hex; signMessage: (a: { message: string }) => Promise<Hex> }, fileId: string, statement = SIWE_STATEMENT) => {
    const nonce = await b.ledger.nonce(fileId);
    const message = createSiweMessage({ address: account.address, chainId: b.devnet.chainId, domain: "127.0.0.1", nonce, uri: "http://127.0.0.1/", version: "1", statement });
    return { message, signature: await account.signMessage({ message }) };
  };

  it("links a wallet over SIWE, binds it 1:1, mints the soulbound Ghostfile with sponsored gas and attests the file's stamps", async () => {
    const a = store.load("sandbox-link", "LINK");
    a.stamps.push("slide_jump_kill", "mantle_kill"); // earned stamps reach the chain at link
    // wrong statement: refused before anything else
    const bad = await siwe(player, a.id, "sign this to win");
    expect((await b.ledger.link(a, bad.message, bad.signature)).reason).toMatch(/statement/);
    const good = await siwe(player, a.id);
    const r = await b.ledger.link(a, good.message, good.signature);
    expect(r.ok).toBe(true);
    expect(a.counter?.address).toBe(player.address);
    expect(a.counter?.ghostfile).toBe(1);
    // the nonce is spent: a replay of the same signed message is stale
    expect((await b.ledger.link(a, good.message, good.signature)).reason).toMatch(/stale nonce/);
    // 1:1: another file cannot bind the same wallet
    const other = store.load("fresh-other", "OTHER");
    const again = await siwe(player, other.id);
    expect((await b.ledger.link(other, again.message, again.signature)).reason).toMatch(/already bound/);
    // sponsored: the wallet holds no ETH and never paid gas
    expect(await b.pub.getBalance({ address: player.address })).toBe(0n);
    // soulbound: the token cannot move
    await expect(b.pub.simulateContract({ address: b.contracts.ghostfile, abi: ARTIFACTS.Ghostfile!.abi, functionName: "transferFrom", args: [player.address, player2.address, 1n], account: player })).rejects.toThrow();
    // every stamp on the sandbox file reached the chain (bounded per call; the rest on the next)
    expect(a.counter!.stamps).toEqual(["slide_jump_kill", "mantle_kill"]);
    const first = a.stamps[0]!;
    const at = (await b.pub.readContract({ address: b.contracts.stamps, abi: ARTIFACTS.Stamps!.abi, functionName: "attestedAt", args: [player.address, (await import("../server/chain/signer")).stampIdOf(first)] })) as bigint;
    expect(at).toBeGreaterThan(0n);
    // launch grant on the devnet: a Depth-50 file holds $CAPITAL now
    expect(Number(a.counter!.capital)).toBe(LAUNCH_GRANT);
  }, 60_000);

  it("a market buy is player-signed, takes the 2/2/1 fee on chain, and lands on the rig through reconcile — as an ID only", async () => {
    const a = store.accounts.get("sandbox-link")!;
    // the wallet pays its own gas for a trade: the devnet faucet stands in for a bridge
    await b.devnet.fund(player.address);
    const wal = createWalletClient({ chain, transport: b.transport, account: player });
    const listings = await b.ledger.listings();
    const rust = listings.find((l) => l.token === 1)!;
    expect(rust.price).toBe(skinByToken(1)!.capital);
    const price = parseEther(String(rust.price));
    const burnedBefore = (await b.pub.readContract({ address: b.contracts.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "burned" })) as bigint;
    await b.pub.waitForTransactionReceipt({ hash: await wal.writeContract({ chain, address: b.contracts.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "approve", args: [b.contracts.market, price] }) });
    const rc = await b.pub.waitForTransactionReceipt({ hash: await wal.writeContract({ chain, address: b.contracts.market, abi: ARTIFACTS.LedgerMarket!.abi, functionName: "buy", args: [BigInt(rust.listing), 1n] }) });
    expect(rc.status).toBe("success");
    const burnedAfter = (await b.pub.readContract({ address: b.contracts.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "burned" })) as bigint;
    expect(burnedAfter - burnedBefore).toBe((price * 200n) / 10_000n);
    const r = await counterRequest(a, { op: "reconcile" }, b.ledger);
    expect(r.ok).toBe(true);
    expect(a.counter!.rig).toEqual([1]);
    expect(Number(a.counter!.capital)).toBe(LAUNCH_GRANT - rust.price);
    expect(wearSkin(a, 2).ok).toBe(false);
    expect(wearSkin(a, 1).ok).toBe(true);
    // the identity carries the token id and nothing else of the purchase
    const pi = publicIdentity(a, "LINK");
    expect(pi.skin).toBe(1);
    expect(parseTag(identityTag(pi), "LINK").skin).toBe(1);
    expect(identityTag({ ...pi, skin: 0 }).split(".").length).toBe(4);
  }, 60_000);

  it("a name at Depth 50 burns $CAPITAL by length through a game voucher; a Depth-1 file gets no voucher", async () => {
    const a = store.accounts.get("sandbox-link")!;
    expect((await b.ledger.nameVoucher(a, "x")).reason).toMatch(/3–24/);
    const v = await b.ledger.nameVoucher(a, "the auditor");
    expect(v.ok).toBe(false); // spaces are not a name
    const ok = await b.ledger.nameVoucher(a, "the_auditor");
    expect(ok.ok).toBe(true);
    expect(ok.voucher!.fee).toBe(nameFee(11));
    const wal = createWalletClient({ chain, transport: b.transport, account: player });
    const fee = parseEther(String(ok.voucher!.fee));
    await b.pub.waitForTransactionReceipt({ hash: await wal.writeContract({ chain, address: b.contracts.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "approve", args: [b.contracts.names, fee] }) });
    const burnedBefore = (await b.pub.readContract({ address: b.contracts.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "burned" })) as bigint;
    const rc = await b.pub.waitForTransactionReceipt({ hash: await wal.writeContract({ chain, address: b.contracts.names, abi: ARTIFACTS.Names!.abi, functionName: "register", args: [ok.voucher!.name, BigInt(ok.voucher!.nonce), BigInt(ok.voucher!.deadline), ok.voucher!.signature] }) });
    expect(rc.status).toBe("success");
    const burnedAfter = (await b.pub.readContract({ address: b.contracts.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "burned" })) as bigint;
    expect(burnedAfter - burnedBefore).toBe(fee);
    await b.ledger.reconcile(a);
    expect(a.counter!.name).toBe("THE_AUDITOR");
    const fresh = store.load("fresh-name", "F");
    expect((await b.ledger.nameVoucher(fresh, "someone")).reason).toMatch(/no wallet/);
    /**
     * The Depth gate itself, which nothing tested until Stage 28: the case above refuses for the
     * missing wallet and never reaches Depth, so it read like a Depth test and was a wallet test.
     * A linked file dropped below the gate is the only shape that reaches the second line.
     */
    const wasDepth = a.depth;
    a.depth = NAME_DEPTH - 1;
    a.counter!.name = null;
    expect((await b.ledger.nameVoucher(a, "second_try")).reason).toMatch(new RegExp(`Depth ${NAME_DEPTH}`));
    a.depth = wasDepth;
  }, 60_000);

  it("chain down, game up: with the RPC dead, link and reconcile fail soft with a reason while wear, the join and the settlement still work", async () => {
    const a = store.accounts.get("sandbox-link")!;
    b.devnet.outage = true;
    const s = await siwe(player2, "fresh-outage");
    const link = await b.ledger.link(store.load("fresh-outage", "O"), s.message, s.signature);
    // the SIWE part is pure; the mint is what needs the chain
    expect(link.ok).toBe(true);
    expect(link.reason).toMatch(/CHAIN UNREACHABLE/);
    expect((await b.ledger.reconcile(a)).reason).toMatch(/CHAIN UNREACHABLE/);
    expect((await counterRequest(a, { op: "wear", token: 1 }, b.ledger)).ok).toBe(true);
    // the room takes the file as it is and settles: nothing in it waits on a chain read
    const msgs: ReturnType<typeof decodeServerMessage>[] = [];
    const conn: Conn = { send: (buf) => void msgs.push(decodeServerMessage(buf, () => null)), close: () => {} };
    const room = new Room({ ai: false, seed: 3, level: "lease_row", accounts: store, warmupSeconds: 0.5, roundSeconds: 2 });
    room.onOpen(conn);
    room.onMessage(conn, encodeJoin("LINK", "", a.id, JSON.stringify({ primary: "lease_breaker", secondary: "shock_baton", attested: [] }), ""));
    expect(msgs.some((m) => m?.type === "welcome")).toBe(true);
    for (let t = 0; t < 60 * 4; t++) room.step();
    expect(room.stats().settlements).toBe(1);
    expect(room.stats().clients[0]?.identity.display).toBe("LINK");
    b.devnet.outage = false;
    expect((await b.ledger.reconcile(a)).ok).toBe(true);
  }, 60_000);
});

describe("the one rule, in CI", () => {
  it("the full manifest lints clean, and a priced item with a stat fails the build", () => {
    const items = economyManifest();
    expect(items.length).toBeGreaterThan(200);
    expect(lintEconomy(items)).toEqual([]);
    const paid = { ...items.find((i) => i.id === SKINS[0]!.id)!, mechanical: { benefits: [{ stat: "damage", delta: 0.05 }], costs: [{ stat: "recoil", delta: 0.05 }] } };
    expect(lintEconomy([...items, { ...paid, id: "skin_with_stats" }]).map((v) => v.rule)).toContain("no-paid-power");
  });
  it("the PvP bundle (match room, file DO, PvP worker) never reaches shared/economy or server/chain", () => {
    const seen = new Set<string>();
    const walk = (file: string) => {
      const abs = resolve(file);
      if (seen.has(abs)) return;
      seen.add(abs);
      const src = readFileSync(abs, "utf8");
      for (const m of src.matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)) {
        let target = resolve(dirname(abs), m[1]!);
        if (!target.endsWith(".ts") && !target.endsWith(".json")) target += ".ts";
        try {
          readFileSync(target);
          if (target.endsWith(".ts")) walk(target);
        } catch {
          /* not a local module */
        }
      }
    };
    walk("server/room.ts");
    walk("server/worker.ts");
    walk("server/player-do.ts");
    const leaks = [...seen].filter((f) => f.includes("/shared/economy/") || f.includes("/server/chain/") || f.includes("/server/counter-worker"));
    expect(leaks).toEqual([]);
    expect([...seen].some((f) => f.endsWith("/server/room.ts"))).toBe(true);
    // and viem itself is nowhere in that bundle
    for (const f of seen) expect(readFileSync(f, "utf8")).not.toMatch(/from "viem/);
  });
});
