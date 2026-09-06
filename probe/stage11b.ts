/**
 * Stage 11b probe — the counter-ledger.
 *  The ledger host runs a real EVM devnet with the six contracts deployed and the market seeded.
 *  A headless client links a wallet over SIWE (a viem local account in place of WalletConnect);
 *  the host verifies, binds 1:1 and mints the soulbound Ghostfile with sponsored gas. The client
 *  buys a skin on the LedgerMarket with its own transactions (the 2/2/1 fee lands on chain), the
 *  host reconciles the rig from the chain, the file wears the skin, and in the next match the
 *  other client's snapshot carries it as a token id only. The round's stamps attest on chain
 *  through vouchers; a Depth-50 file writes its name (WAKE burned by length). A second file cannot
 *  bind the same wallet. With the chain dead, link and reconcile fail soft while equip, the match
 *  and the settlement keep working. The one rule lints the full manifest.
 *
 *   npm run probe:counter
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { createPublicClient, defineChain, http, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARTIFACTS } from "../server/chain/deploy";
import { DEV_KEYS } from "../server/chain/boot";
import { stampIdOf } from "../server/chain/signer";
import { economyManifest, SKINS } from "../shared/economy/catalog";
import { lintEconomy } from "../shared/economy/lint";
import { LAUNCH_GRANT, nameFee } from "../shared/economy/counter";

const VITE_PORT = 5206;
const HOST_PORT = 8809;
const OUT = "probe/out";
const HOST = `http://127.0.0.1:${HOST_PORT}`;

function waitFor(child: ChildProcess, re: RegExp, what: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let ok = false;
    const on = (d: Buffer) => {
      if (!ok && re.test(d.toString())) {
        ok = true;
        resolve();
      }
    };
    child.stdout?.on("data", on);
    child.stderr?.on("data", on);
    child.on("exit", (c) => !ok && reject(new Error(`${what} exited (${c})`)));
    setTimeout(() => !ok && reject(new Error(`${what} did not start`)), 60000);
  });
}

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

const ARGS = ["--no-proxy-server", "--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"];

interface Info {
  chainId: number;
  devnet: boolean;
  contracts: { wake: Hex; ghostfile: Hex; stamps: Hex; names: Hex; cosmetics: Hex; market: Hex };
  signer: Hex;
  rpc: string;
  listings: { listing: number; token: number; amount: number; price: number }[];
  treasury: { supply: string; burned: string; volume: string } | null;
  reason?: string;
}

interface FileRec {
  depth: number;
  xp: number;
  stamps: string[];
  counter: { address: string | null; ghostfile: number; stamps: string[]; name: string | null; rig: number[]; worn: number; wake: string } | null;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const checks: Check[] = [];
  const check = (name: string, pass: boolean, detail: string) => {
    checks.push({ name, pass, detail });
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}  — ${detail}`);
  };
  const host = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "server/node-host.ts", String(HOST_PORT)], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(host, /listening/, "node host");
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(VITE_PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(vite, /127\.0\.0\.1/, "vite");
  const browser = await chromium.launch({ args: ARGS });
  const errors: string[] = [];
  const results: Record<string, unknown> = {};
  const info = async (): Promise<Info> => (await (await fetch(`${HOST}/counter`)).json()) as Info;
  const file = async (id: string): Promise<FileRec> => (await (await fetch(`${HOST}/file/${id}`)).json()) as FileRec;
  const post = async (path: string, body: unknown) => (await (await fetch(`${HOST}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json()) as { ok: boolean; reason?: string };
  const stats = async () => (await (await fetch(`${HOST}/stats`)).json()) as { rooms: Record<string, { settlements: number; clients: { name: string; identity: { display: string }; file: { settlements: number } | null }[]; match: { phase: string } | null }>; logs: string[] };
  const newPage = async (viewport: { width: number; height: number }, tag: string): Promise<Page> => {
    const pg = await browser.newPage({ viewport });
    pg.on("pageerror", (e) => errors.push(`${tag}: ${String(e)}`));
    pg.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
    return pg;
  };
  const player = privateKeyToAccount(DEV_KEYS.player);
  try {
    // ---------------- the devnet and the contracts ----------------
    const i0 = await info();
    const chain = defineChain({ id: i0.chainId, name: "devnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [i0.rpc] } } });
    const pub = createPublicClient({ chain, transport: http(i0.rpc) });
    const rpcChain = await pub.getChainId();
    const code = await pub.getCode({ address: i0.contracts.ghostfile });
    const read = <T>(address: Hex, name: string, fn: string, args: unknown[] = []) => pub.readContract({ address, abi: ARTIFACTS[name]!.abi, functionName: fn, args }) as Promise<T>;
    const supply = await read<bigint>(i0.contracts.wake, "WAKE", "totalSupply");
    check("the ledger host runs an EVM devnet behind JSON-RPC with the six contracts deployed, WAKE at its fixed cap and the market seeded with every skin", rpcChain === i0.chainId && !!code && code.length > 100 && Object.keys(i0.contracts).length === 6 && supply === parseEther("1000000000") && i0.listings.length === SKINS.length && i0.listings.every((l) => SKINS.some((s) => s.token === l.token && s.wake === l.price)), `chain ${rpcChain} · ghostfile code ${code ? code.length / 2 - 1 : 0} B · listings ${i0.listings.map((l) => `#${l.token}@${l.price}`).join(" ")}`);

    // ---------------- the link ----------------
    const acct = "sandbox-cl";
    const a = await newPage({ width: 960, height: 560 }, "A");
    await a.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&level=drainage_yard&account=${acct}&shop=${HOST}&wallet=${DEV_KEYS.player}`, { waitUntil: "load" });
    await a.waitForFunction(() => window.__game?.ready === true && !!window.__game.counter().info, null, { timeout: 40000, polling: 100 });
    await a.evaluate(() => window.__game.toggleFile(true));
    await a.waitForTimeout(300);
    const panel0 = await a.evaluate(() => (document.querySelector("#hud .file .cl") as HTMLElement)?.textContent ?? "");
    const ethBefore = await pub.getBalance({ address: player.address });
    const link = await a.evaluate(() => window.__game.link());
    await a.waitForTimeout(300);
    const v1 = await a.evaluate(() => window.__game.counter());
    const f1 = await file(acct);
    const owner = await read<Hex>(i0.contracts.ghostfile, "Ghostfile", "ownerOf", [1n]);
    const ethAfter = await pub.getBalance({ address: player.address });
    check("the panel offers the link; SIWE with a local account in place of WalletConnect: the host verifies, binds the wallet 1:1 to the file, and mints the soulbound Ghostfile with sponsored gas", /COUNTER-LEDGER/.test(panel0) && /LINK A WALLET/.test(panel0) && link.ok && v1.view?.linked === true && v1.view.address?.toLowerCase() === player.address.toLowerCase() && v1.view.ghostfile === 1 && f1.counter?.ghostfile === 1 && owner.toLowerCase() === player.address.toLowerCase() && ethBefore === 0n && ethAfter === 0n && Number(v1.view.wake) === LAUNCH_GRANT, `link ${link.ok} ${link.reason ?? ""} · wallet ${v1.wallet} · ghostfile #${v1.view?.ghostfile} owner ${owner.slice(0, 8)} · wallet ETH ${ethAfter} · WAKE ${v1.view?.wake}`);
    let soulbound = false;
    try {
      await pub.simulateContract({ address: i0.contracts.ghostfile, abi: ARTIFACTS.Ghostfile!.abi, functionName: "transferFrom", args: [player.address, i0.signer, 1n], account: player });
    } catch {
      soulbound = true;
    }
    const twice = await newPage({ width: 640, height: 360 }, "twice");
    await twice.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&level=drainage_yard&account=fresh-cl2&shop=${HOST}&wallet=${DEV_KEYS.player}`, { waitUntil: "load" });
    await twice.waitForFunction(() => window.__game?.ready === true && !!window.__game.counter().info, null, { timeout: 40000, polling: 100 });
    const link2 = await twice.evaluate(() => window.__game.link());
    await twice.close();
    check("the Ghostfile cannot move (soulbound), and a second file cannot bind the same wallet", soulbound && !link2.ok && /already bound/.test(link2.reason ?? ""), `transfer reverted ${soulbound} · second link: ${link2.reason}`);

    // ---------------- the market ----------------
    await post("/chain/faucet", { address: player.address }); // gas for the wallet's own transactions (devnet)
    const rust = i0.listings.find((l) => l.token === 1)!;
    const burned0 = await read<bigint>(i0.contracts.wake, "WAKE", "burned");
    const buy = await a.evaluate((l) => window.__game.buySkin(l), rust.listing);
    await a.waitForTimeout(300);
    const burned1 = await read<bigint>(i0.contracts.wake, "WAKE", "burned");
    const bal = await read<bigint>(i0.contracts.cosmetics, "Cosmetics", "balanceOf", [1n, player.address]);
    const v2 = await a.evaluate(() => window.__game.counter());
    const wear = await a.evaluate(() => window.__game.wearSkin(1));
    await a.waitForTimeout(300);
    const v3 = await a.evaluate(() => window.__game.counter());
    await a.evaluate(() => window.__game.toggleFile(true));
    await a.waitForTimeout(300);
    await a.evaluate(() => document.querySelector("#hud .file .cl")?.scrollIntoView());
    await a.screenshot({ path: `${OUT}/stage11b-file.png` });
    const panel1 = await a.evaluate(() => (document.querySelector("#hud .file .cl") as HTMLElement)?.textContent ?? "");
    const price = parseEther(String(rust.price));
    check("a market buy is the player's own signed transactions: the 2% burn lands on chain, the skin lands in the wallet, the host reconciles it onto the rig, the file wears it and the local viewmodel takes the tint", !!buy.ok && burned1 - burned0 === (price * 200n) / 10_000n && bal === 1n && !!v2.view?.rig.some((r) => r.token === 1) && Number(v2.view.wake) === LAUNCH_GRANT - rust.price && wear.ok && v3.view?.worn === 1 && v3.tint === SKINS[0]!.tint && /WORN/.test(panel1), `buy ${buy.ok} ${buy.reason ?? ""} · burned +${(burned1 - burned0).toString()} wei · 1155 balance ${bal} · rig [${v2.view?.rig.map((r) => r.id).join(", ")}] · worn ${v3.view?.worn} tint ${v3.tint}`);

    // ---------------- the match: the skin travels as an ID ----------------
    const roomUrl = (room: string) => `ws://127.0.0.1:${HOST_PORT}/room/${room}?warmup=0.5&round=6&ai=0&level=drainage_yard`;
    const b = await newPage({ width: 800, height: 450 }, "B");
    await b.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&level=drainage_yard&account=fresh-cl&name=BRAVO&net=${encodeURIComponent(roomUrl("cl"))}`, { waitUntil: "load" });
    await a.evaluate(() => window.__game.toggleFile(false));
    await a.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&level=drainage_yard&account=${acct}&name=ALPHA&shop=${HOST}&wallet=${DEV_KEYS.player}&net=${encodeURIComponent(roomUrl("cl"))}`, { waitUntil: "load" });
    for (const p of [a, b]) await p.waitForFunction(() => window.__game?.ready === true && window.__game.net()?.status === "joined", null, { timeout: 40000, polling: 100 });
    await b.waitForFunction(() => window.__game.counter().remotes.length >= 1, null, { timeout: 20000, polling: 100 });
    await a.waitForFunction(() => window.__game.counter().remotes.length >= 1, null, { timeout: 20000, polling: 100 });
    for (const p of [a, b]) await p.evaluate(() => window.__game.setRealtime(true));
    await b.waitForTimeout(800);
    const seenByB = await b.evaluate(() => window.__game.counter().remotes);
    const seenByA = await a.evaluate(() => window.__game.counter().remotes);
    const rawRemote = await b.evaluate(() => JSON.stringify((window.__game.net()?.remotes ?? [])[0] ?? {}));
    await b.screenshot({ path: `${OUT}/stage11b-rig.png` });
    const alphaSeen = seenByB.find((r) => r.name === "ALPHA" || r.skin === 1);
    const bravoSeen = seenByA[0];
    check("in the next match the other client's snapshot carries the worn skin as a token id in the tag and nothing else of the purchase; the file that wears nothing keeps the four-segment tag", !!alphaSeen && alphaSeen.skin === 1 && /^[0-9a-z]+\.\d\.-?\d+\.\d\.1$/.test(alphaSeen.tag) && !!bravoSeen && bravoSeen.skin === 0 && bravoSeen.tag.split(".").length === 4 && !/rust|#d86a2a|wake|price/i.test(rawRemote), `BRAVO sees ${alphaSeen?.name} [${alphaSeen?.tag}] skin ${alphaSeen?.skin} · ALPHA sees [${bravoSeen?.tag}] · remote keys ${Object.keys(JSON.parse(rawRemote)).join(",")}`);
    const t0 = Date.now();
    let phase = "";
    while (Date.now() - t0 < 60000 && phase !== "results") {
      await a.waitForTimeout(500);
      phase = (await stats()).rooms["cl"]?.match?.phase ?? "";
    }
    await a.waitForTimeout(600);

    // ---------------- stamps and the name ----------------
    const fAfter = await file(acct);
    const st = await post(`/file/${acct}/counter`, { op: "stamps" });
    const onChain = await read<bigint>(i0.contracts.stamps, "Stamps", "count", [player.address]);
    const firstAt = fAfter.stamps.length ? await read<bigint>(i0.contracts.stamps, "Stamps", "attestedAt", [player.address, stampIdOf(fAfter.stamps[0]!)]) : 0n;
    const fStamped = await file(acct);
    check("the round's stamps reach the chain as server-signed attestations (one voucher each, gas sponsored), readable by anyone", phase === "results" && fAfter.stamps.length > 0 && st.ok && Number(onChain) === Math.min(12, fAfter.stamps.length) && firstAt > 0n && fStamped.counter?.stamps.length === Number(onChain), `stamps on file ${fAfter.stamps.length} · on chain ${onChain} · first at ${firstAt}`);
    const burned2 = await read<bigint>(i0.contracts.wake, "WAKE", "burned");
    const named = await a.evaluate(() => window.__game.registerName("the_auditor"));
    await a.waitForTimeout(300);
    const burned3 = await read<bigint>(i0.contracts.wake, "WAKE", "burned");
    const nameOnChain = await read<string>(i0.contracts.names, "Names", "nameOf", [player.address]);
    const v4 = await a.evaluate(() => window.__game.counter());
    await a.evaluate(() => window.__game.toggleFile(true));
    await a.waitForTimeout(300);
    await a.evaluate(() => document.querySelector("#hud .file .cl")?.scrollIntoView());
    await a.screenshot({ path: `${OUT}/stage11b-name.png` });
    await a.evaluate(() => window.__game.toggleFile(false));
    check("at Depth 50 the file writes its name: a game voucher, the player's own transaction, the fee burned by length (11 characters → 250 WAKE), soulbound", named.ok && nameOnChain === "THE_AUDITOR" && burned3 - burned2 === parseEther(String(nameFee(11))) && v4.view?.name === "THE_AUDITOR", `name ${nameOnChain} · burned +${Number(burned3 - burned2) / 1e18} WAKE · ${named.reason ?? ""}`);
    const fresh = await file("fresh-cl");
    const noVoucher = await post(`/file/fresh-cl/counter`, { op: "name", name: "someone" });
    check("a Depth-1 file gets no name voucher", fresh.depth < 50 && !noVoucher.ok, `${noVoucher.reason}`);

    // ---------------- chain down, game up ----------------
    await post("/chain/outage", { on: true });
    const rec = await a.evaluate(() => window.__game.reconcile());
    const off = await a.evaluate(() => window.__game.wearSkin(0));
    const on = await a.evaluate(() => window.__game.wearSkin(1));
    const c2 = await newPage({ width: 640, height: 360 }, "outage");
    await c2.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&level=drainage_yard&account=fresh-cl3&shop=${HOST}&wallet=${DEV_KEYS.player2}`, { waitUntil: "load" });
    await c2.waitForFunction(() => window.__game?.ready === true && !!window.__game.counter().info, null, { timeout: 40000, polling: 100 });
    const linkDown = await c2.evaluate(() => window.__game.link());
    await c2.close();
    const xpBefore = (await file(acct)).xp;
    // both files into a fresh room together (a late joiner would miss the round BRAVO alone would settle)
    await Promise.all([
      b.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&level=drainage_yard&account=fresh-cl&name=BRAVO&net=${encodeURIComponent(roomUrl("cl2"))}`, { waitUntil: "load" }),
      a.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&level=drainage_yard&account=${acct}&name=ALPHA&shop=${HOST}&wallet=${DEV_KEYS.player}&net=${encodeURIComponent(roomUrl("cl2"))}`, { waitUntil: "load" }),
    ]);
    for (const p of [a, b]) await p.waitForFunction(() => window.__game?.ready === true && window.__game.net()?.status === "joined", null, { timeout: 40000, polling: 100 });
    await b.waitForFunction(() => window.__game.counter().remotes.length >= 1, null, { timeout: 20000, polling: 100 });
    for (const p of [a, b]) await p.evaluate(() => window.__game.setRealtime(true));
    const seenDown = await b.evaluate(() => window.__game.counter().remotes);
    const t1 = Date.now();
    let alphaSettled = 0;
    while (Date.now() - t1 < 60000 && alphaSettled < 1) {
      await a.waitForTimeout(500);
      alphaSettled = (await stats()).rooms["cl2"]?.clients.find((c) => c.name === "ALPHA")?.file?.settlements ?? 0;
    }
    await a.waitForTimeout(400);
    const phase2 = alphaSettled >= 1 ? "results" : "";
    const xpAfter = (await file(acct)).xp;
    const s2 = (await stats()).rooms["cl2"]!;
    await post("/chain/outage", { on: false });
    const rec2 = await a.evaluate(() => window.__game.reconcile());
    check("chain down, game up: reconcile and a new link fail soft with CHAIN UNREACHABLE while wear (the cache), the join with the worn skin, the round and the settlement all still work; back up, reconcile succeeds", !rec.ok && /CHAIN UNREACHABLE/.test(rec.reason ?? "") && off.ok && on.ok && linkDown.ok && /CHAIN UNREACHABLE/.test(linkDown.reason ?? "") && seenDown.some((r) => r.skin === 1) && phase2 === "results" && s2.settlements >= 2 && xpAfter > xpBefore && rec2.ok, `reconcile: ${rec.reason} · link: ${linkDown.reason} · skin seen ${seenDown.map((r) => r.skin).join(",")} · settlements ${s2.settlements} · xp ${xpBefore} → ${xpAfter} · after: ${rec2.ok}`);
    await a.close();
    await b.close();

    // ---------------- the one rule ----------------
    const items = economyManifest();
    const clean = lintEconomy(items);
    const dirty = lintEconomy([...items, { id: "skin_with_stats", kind: "cosmetic", mechanical: { benefits: [{ stat: "damage", delta: 0.05 }], costs: [{ stat: "recoil", delta: 0.05 }] }, market: { wake: 40, onChain: true, tradable: true, randomness: "wear_seed" } }]);
    const tr = (await info()).treasury;
    check("the one rule over the full manifest: every node, chip, firmware, theme, skin and registry item lints clean; a priced item with a stat fails the build; the treasury line reconciles burns", clean.length === 0 && items.length > 200 && dirty.some((v) => v.rule === "no-paid-power") && !!tr && Number(tr.burned) > 0 && Number(tr.volume) === rust.price, `${items.length} items · 0 violations · dirty: ${dirty.map((v) => v.rule).join(",")} · burned ${Number(tr?.burned).toFixed(2)} · volume ${tr?.volume}`);
    check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean console");
    results["counter"] = { chainId: i0.chainId, contracts: i0.contracts, ghostfile: v1.view?.ghostfile, rig: v3.view?.rig, tagSeen: alphaSeen?.tag, stampsOnChain: Number(onChain), name: nameOnChain, burned: tr?.burned };
    writeFileSync(`${OUT}/stage11b.json`, JSON.stringify({ results, checks }, null, 2));
    const failed = checks.filter((c) => !c.pass);
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
    if (failed.length) {
      const logs = (await stats()).logs;
      console.log(logs.slice(-40).join("\n"));
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    host.kill();
    vite.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
