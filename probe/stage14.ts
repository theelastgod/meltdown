/**
 * Stage 14 probe — THE RUN: $CAPITAL play-to-earn, PvP zones, safe zones, the markets.
 *  A run room on the yard: claims lie in the PvP zone, a gate is the safe zone. ALPHA (Depth 50,
 *  linked wallet) picks a claim up and carries it; BRAVO kills ALPHA in the PvP zone and the
 *  carried value drops where ALPHA fell; BRAVO takes it and banks it at the gate (Scrip — BRAVO is
 *  Depth 1); ALPHA banks the next claim for $CAPITAL owed and withdraws it to the wallet on chain;
 *  inside the gate no shot lands; the safe zone and the claims render; the menu offers THE RUN as
 *  a district URL; the market is player to player: ALPHA lists a skin, the second wallet buys it
 *  and the fee lands on chain.
 *
 *   npm run probe:run
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { shot } from "./shot";
import { WebSocket as WsClient } from "ws";
import { createPublicClient, createWalletClient, defineChain, http, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { BotStep } from "../client/bot";
import { ARTIFACTS } from "../server/chain/deploy";
import { DEV_KEYS } from "../server/chain/boot";
import { levelById } from "../shared/sim/level";
import { buildNav, findPath } from "../shared/sim/nav";
import { RUN } from "../shared/sim/run";
import { RUN_DEPTH, RUN_SCRIP_PER_UNIT } from "../shared/economy/counter";
import { ROOM_HOUR_PRICE, SEASON_PASS_PRICE } from "../shared/economy/sinks";
import { SEASON_PASS_GRANTS } from "../shared/economy/catalog";

const VITE_PORT = 5211;
const HOST_PORT = 8813;
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

interface FileRec {
  depth: number;
  owned: string[];
  wallet: { scrip: number };
  ledger: string[];
  counter: { address: string | null; run?: { day: number; banked: number; owed: number; paid: number }; capital: string; seasons?: number[]; roomHours?: number } | null;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const checks: Check[] = [];
  const check = (name: string, pass: boolean, detail: string) => {
    checks.push({ name, pass, detail });
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}  — ${detail}`);
  };
  /** Take a proof screenshot and count "it shows what it is named for" as a check (Stage 33). */
  const shotCheck = async (pg: Page, file: string, sel?: string): Promise<Buffer> => {
    const s = await shot(pg, `${OUT}/${file}`, sel);
    check(`artifact: ${file}`, s.ok, s.detail);
    return s.png;
  };
  const host = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "server/node-host.ts", String(HOST_PORT)], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(host, /listening/, "node host");
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(VITE_PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(vite, /127\.0\.0\.1/, "vite");
  const browser = await chromium.launch({ args: ARGS });
  const errors: string[] = [];
  const results: Record<string, unknown> = {};
  const file = async (id: string): Promise<FileRec> => (await (await fetch(`${HOST}/file/${id}`)).json()) as FileRec;
  /**
   * A file's secret (Stage 26): the id names a file, this proves the caller owns it, and every
   * mutating route wants it. The probe fixes one and hands the same value to the pages via
   * `?secret=`, which is exactly what a real client does with the one it generated.
   */
  const SECRET = "probestage14secretaaaaaa";
  const post = async (path: string, body: unknown) => (await (await fetch(`${HOST}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...(body as object), secret: SECRET }) })).json()) as { ok: boolean; reason?: string };
  const stats = async () => (await (await fetch(`${HOST}/stats`)).json()) as { rooms: Record<string, { run: { totalBanked: number; claims: number; carried: Record<string, number>; banked: Record<string, number>; credits: string[] } | null; clients: { name: string; kills: number; deaths: number }[] }>; logs: string[] };
  const newPage = async (viewport: { width: number; height: number }, tag: string): Promise<Page> => {
    const pg = await browser.newPage({ viewport });
    pg.on("pageerror", (e) => errors.push(`${tag}: ${String(e)}`));
    pg.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
    return pg;
  };
  const level = levelById("drainage_yard");
  const gate = level.zones![0]!;
  const claims = level.claims!;
  const player = privateKeyToAccount(DEV_KEYS.player);
  const player2 = privateKeyToAccount(DEV_KEYS.player2);
  const info = (await (await fetch(`${HOST}/counter`)).json()) as { chainId: number; rpc: string; contracts: { capital: Hex; cosmetics: Hex; market: Hex }; listings: { listing: number; token: number; price: number; seller: Hex }[] };
  const chain = defineChain({ id: info.chainId, name: "devnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [info.rpc] } } });
  const pub = createPublicClient({ chain, transport: http(info.rpc) });
  const read = <T>(address: Hex, name: string, fn: string, args: unknown[] = []) => pub.readContract({ address, abi: ARTIFACTS[name]!.abi, functionName: fn, args }) as Promise<T>;
  const nav = buildNav(level);
  /** a nav-routed walk to a point, then hold there */
  const goto = (to: { x: number; z: number }, radius = 1.0, from?: { x: number; z: number }): BotStep[] => {
    const path = from ? findPath(nav, { x: from.x, y: 0, z: from.z }, { x: to.x, y: 0, z: to.z }) : null;
    const pts = (path ?? [{ x: to.x, y: 0, z: to.z }]).slice(from && path ? 1 : 0);
    return [...pts.map((p, i, arr) => ({ kind: "goto" as const, x: p.x, z: p.z, sprint: true, radius: i === arr.length - 1 ? radius : 1.4, timeoutTicks: 700, stop: i === arr.length - 1 })), { kind: "hold" as const, ticks: 9000 }];
  };
  try {
    const roomUrl = `ws://127.0.0.1:${HOST_PORT}/room/run-yard?mode=run&ai=0&level=drainage_yard`;
    const acct = "sandbox-run";
    const a = await newPage({ width: 960, height: 540 }, "A");
    await a.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&level=drainage_yard&mode=run&account=${acct}&secret=${SECRET}&name=ALPHA&shop=${HOST}&wallet=${DEV_KEYS.player}&net=${encodeURIComponent(roomUrl)}`, { waitUntil: "load" });
    const b = await newPage({ width: 640, height: 360 }, "B");
    await b.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&level=drainage_yard&mode=run&account=fresh-runb&secret=${SECRET}&name=BRAVO&net=${encodeURIComponent(roomUrl)}`, { waitUntil: "load" });
    for (const p of [a, b]) await p.waitForFunction(() => window.__game?.ready === true && window.__game.net()?.status === "joined" && window.__game.net()?.synced === true, null, { timeout: 40000, polling: 100 });
    await a.waitForFunction(() => !!window.__game.run(), null, { timeout: 20000, polling: 100 });
    const mode = await a.evaluate(() => window.__game.endgame().mode);
    const v0 = await a.evaluate(() => window.__game.run()!);
    const strip0 = await a.evaluate(() => (document.querySelector("#hud .runstrip") as HTMLElement).textContent ?? "");
    check("a run room: the Welcome says run, the wake is off, the client sees the gate and every claim, and the strip reads PVP ZONE", mode === "run" && v0.zones.length === 1 && v0.zones[0]!.label === gate.label && v0.claims.length === claims.length && !v0.inSafe && /PVP ZONE/.test(strip0) && /CARRYING 0/.test(strip0), `mode ${mode} · zones ${v0.zones.map((z) => z.label).join(",")} · claims ${v0.claims.length}/${claims.length} · "${strip0.slice(0, 60)}"`);

    // ---- ALPHA carries a claim ----
    const pa = await a.evaluate(() => window.__game.state().pos);
    const target = claims.map((c) => ({ c, d: Math.hypot(c.pos.x - pa.x, c.pos.z - pa.z) })).sort((x, y) => x.d - y.d)[0]!.c;
    await a.evaluate((plan) => window.__game.setBot(plan), goto({ x: target.pos.x, z: target.pos.z }, 0.9, pa));
    for (const p of [a, b]) await p.evaluate(() => window.__game.setRealtime(true));
    const picked = await a.waitForFunction(() => (window.__game.run()?.carried ?? 0) > 0, null, { timeout: 40000, polling: 100 }).then(() => true, () => false);
    const v1 = await a.evaluate(() => window.__game.run()!);
    const st1 = (await stats()).rooms["run-yard"]!;
    await shotCheck(a, `stage14-carry.png`);
    check("walking over a claim carries it: the strip counts it, the room counts it, the claim leaves the street until it respawns", picked && v1.carried === target.value && st1.run?.carried["ALPHA"] === target.value && v1.claims.length === claims.length - 1 && st1.run.claims === claims.length - 1, `carried ${v1.carried} (claim ${target.value}) · room ${JSON.stringify(st1.run?.carried)} · claims out ${v1.claims.length}`);

    // ---- BRAVO kills ALPHA in the PvP zone: the claim drops where ALPHA fell ----
    const pa1 = await a.evaluate(() => window.__game.state().pos);
    await b.evaluate(({ to, id }) => window.__game.setBot([{ kind: "goto", x: to.x, z: to.z, sprint: true, radius: 6, timeoutTicks: 900 }, { kind: "killPlayer", targetId: id, ticks: 5400 }]), { to: { x: pa1.x, z: pa1.z }, id: await a.evaluate(() => window.__game.net()!.playerId) });
    const t0 = Date.now();
    let dropSeen: { x: number; z: number; value: number } | null = null;
    let aDead = -1;
    while (Date.now() - t0 < 90000) {
      const v = await b.evaluate(() => window.__game.run());
      const d = v?.claims.find((c) => c.dropped);
      if (d) {
        dropSeen = { x: d.x, z: d.z, value: d.value };
        aDead = (await stats()).rooms["run-yard"]!.run?.carried["ALPHA"] ?? -1; // the room's truth, not a client view that lags a push
        break;
      }
      await b.waitForTimeout(300);
    }
    const kills = (await stats()).rooms["run-yard"]!.clients.find((c) => c.name === "BRAVO")?.kills ?? 0;
    check("a death in the PvP zone drops the carried claim where the file fell: it burns magenta on the street, ALPHA carries nothing", !!dropSeen && dropSeen.value === target.value && kills >= 1 && aDead === 0, `BRAVO kills ${kills} · drop ${dropSeen ? `${dropSeen.value} at (${dropSeen.x.toFixed(1)},${dropSeen.z.toFixed(1)})` : "none"} · ALPHA carrying ${aDead}`);

    // ---- BRAVO takes the drop and banks it at the gate: Depth 1 → Scrip ----
    await a.evaluate(() => window.__game.setBot([{ kind: "hold", ticks: 9000 }]));
    const pb0 = await b.evaluate(() => window.__game.state().pos);
    await b.evaluate((plan) => window.__game.setBot(plan), goto({ x: dropSeen!.x, z: dropSeen!.z }, 0.9, pb0));
    const took = await b.waitForFunction(() => (window.__game.run()?.carried ?? 0) > 0, null, { timeout: 40000, polling: 100 }).then(() => true, () => false);
    const scrip0 = (await file("fresh-runb")).wallet.scrip;
    const pb1 = await b.evaluate(() => window.__game.state().pos);
    await b.evaluate((plan) => window.__game.setBot(plan), goto({ x: gate.pos.x, z: gate.pos.z }, 1.2, pb1));
    await b.waitForFunction(() => window.__game.run()?.inSafe === true, null, { timeout: 40000, polling: 100 }).catch(() => null);
    const stripSafe = await b.evaluate(() => (document.querySelector("#hud .runstrip") as HTMLElement).textContent ?? "");
    const safeClass = await b.evaluate(() => document.getElementById("hud")!.classList.contains("safe"));
    const banked = await b.waitForFunction(() => (window.__game.run()?.banked ?? 0) > 0, null, { timeout: 30000, polling: 100 }).then(() => true, () => false);
    await shotCheck(b, `stage14-gate.png`);
    const fb = await file("fresh-runb");
    check("BRAVO takes the drop, walks it into the gate (the strip says SAFE ZONE, the edge glows), stands the dwell and banks it — a Depth-1 file is paid in Scrip, not $CAPITAL", took && /SAFE ZONE|BANKING/.test(stripSafe) && safeClass && banked && fb.depth < RUN_DEPTH && fb.wallet.scrip - scrip0 === target.value * RUN_SCRIP_PER_UNIT && (fb.counter?.run?.owed ?? 0) === 0 && fb.ledger.some((l) => /BANKED .* SCRIP/.test(l)), `took ${took} · strip "${stripSafe.slice(0, 50)}" · scrip +${fb.wallet.scrip - scrip0} · owed ${fb.counter?.run?.owed ?? 0}`);

    // ---- no shot lands inside the gate ----
    const hpB0 = await b.evaluate(() => window.__game.state().health);
    // BRAVO's own death count, not ALPHA's kill tally. The tally counts every kind the sim can
    // kill, and drainage_yard's training dummies stand OUTSIDE the gate — dummy 3 sits 8.9 m from
    // its centre, well inside a spray aimed past BRAVO. A round that clips one is ALPHA shooting a
    // dummy in the street, which is the game working; asserting on the tally called that a safe
    // zone leak, and it went red on CI reading "health 70 → 70 · ALPHA kills 0 → 1".
    //
    // The health half could not settle it either: BASE_HEALTH is 70, so "70 → 70" reads the same
    // whether BRAVO was never touched or died and respawned at full. A death count can tell those
    // apart, and tests/safezone.test.ts holds the rule itself at the sim layer.
    const bravo = async () => (await stats()).rooms["run-yard"]!.clients.find((c) => c.name === "BRAVO");
    const alpha = async () => (await stats()).rooms["run-yard"]!.clients.find((c) => c.name === "ALPHA");
    const deathsB0 = (await bravo())?.deaths ?? 0;
    const killsA0 = (await alpha())?.kills ?? 0;
    const idB = await b.evaluate(() => window.__game.net()!.playerId);
    await a.evaluate(({ to, id }) => window.__game.setBot([{ kind: "goto", x: to.x, z: to.z, sprint: true, radius: 9, timeoutTicks: 900 }, { kind: "killPlayer", targetId: id, ticks: 900 }]), { to: { x: gate.pos.x + 9, z: gate.pos.z }, id: idB });
    await a.waitForTimeout(9000);
    const hpB1 = await b.evaluate(() => window.__game.state().health);
    const deathsB1 = (await bravo())?.deaths ?? 0;
    const killsA1 = (await alpha())?.kills ?? 0;
    check("inside the safe zone no damage lands: ALPHA empties a magazine at BRAVO standing in the gate and BRAVO neither loses health nor dies", hpB1 === hpB0 && deathsB1 === deathsB0, `health ${hpB0} → ${hpB1} · BRAVO deaths ${deathsB0} → ${deathsB1} · (ALPHA's tally ${killsA0} → ${killsA1}, dummies in the street included)`);

    // ---- ALPHA links, banks for $CAPITAL owed, withdraws to the wallet ----
    await a.evaluate(() => window.__game.setBot([{ kind: "hold", ticks: 9000 }]));
    const link = await a.evaluate(() => window.__game.link());
    await b.evaluate(() => window.__game.setBot([{ kind: "goto", x: 20, z: 20, sprint: true, radius: 2, timeoutTicks: 900 }, { kind: "hold", ticks: 9000 }]));
    const t1 = Date.now();
    while (Date.now() - t1 < RUN.respawnSeconds * 1000 + 5000 && (await a.evaluate(() => window.__game.run()!.claims.length)) < claims.length) await a.waitForTimeout(500);
    const pa2 = await a.evaluate(() => window.__game.state().pos);
    const target2 = claims.map((c) => ({ c, d: Math.hypot(c.pos.x - pa2.x, c.pos.z - pa2.z) })).sort((x, y) => x.d - y.d)[0]!.c;
    await a.evaluate((plan) => window.__game.setBot(plan), goto({ x: target2.pos.x, z: target2.pos.z }, 0.9, pa2));
    await a.waitForFunction(() => (window.__game.run()?.carried ?? 0) > 0, null, { timeout: 60000, polling: 100 }).catch(() => null);
    const pa3 = await a.evaluate(() => window.__game.state().pos);
    await a.evaluate((plan) => window.__game.setBot(plan), goto({ x: gate.pos.x, z: gate.pos.z }, 1.2, pa3));
    const bankedA = await a.waitForFunction(() => (window.__game.run()?.owed ?? 0) > 0, null, { timeout: 60000, polling: 100 }).then(() => true, () => false);
    const va = await a.evaluate(() => window.__game.run()!);
    const fa = await file(acct);
    const bal0 = await read<bigint>(info.contracts.capital, "$CAPITAL", "balanceOf", [player.address]);
    const pay = await a.evaluate(() => window.__game.payout());
    const bal1 = await read<bigint>(info.contracts.capital, "$CAPITAL", "balanceOf", [player.address]);
    const fa2 = await file(acct);
    await a.evaluate(() => window.__game.toggleFile(true));
    await a.waitForTimeout(300);
    await a.evaluate(() => document.querySelector("#hud .file .cl")?.scrollIntoView());
    await shotCheck(a, `stage14-ledger.png`);
    await a.evaluate(() => window.__game.toggleFile(false));
    check("a Depth-50 file with a linked wallet banks for $CAPITAL owed (today against the day's cap) and WITHDRAW pays it from the treasury to the wallet on chain", link.ok && bankedA && va.owed === target2.value && va.today === target2.value && (fa.counter?.run?.owed ?? 0) === target2.value && pay.ok && bal1 - bal0 === parseEther(String(target2.value)) && (fa2.counter?.run?.owed ?? -1) === 0 && fa2.counter?.run?.paid === target2.value, `owed ${va.owed} today ${va.today}/${va.cap} · payout ${pay.ok} ${pay.reason ?? ""} · wallet +${Number(bal1 - bal0) / 1e18} $CAPITAL · paid ${fa2.counter?.run?.paid}`);

    // ---- the nightly settlement (Stage 18): bank again, settle the day, claim the epoch ----
    // The withdrawal above already spent its units, so this proves the other half: units that were
    // *not* withdrawn are paid by the night, and the same day cannot be settled twice.
    const t3 = Date.now();
    while (Date.now() - t3 < RUN.respawnSeconds * 1000 + 5000 && (await a.evaluate(() => window.__game.run()!.claims.length)) < claims.length) await a.waitForTimeout(500);
    const pa4 = await a.evaluate(() => window.__game.state().pos);
    const target4 = claims.map((c) => ({ c, d: Math.hypot(c.pos.x - pa4.x, c.pos.z - pa4.z) })).sort((x, y) => x.d - y.d)[0]!.c;
    await a.evaluate((plan) => window.__game.setBot(plan), goto({ x: target4.pos.x, z: target4.pos.z }, 0.9, pa4));
    await a.waitForFunction(() => (window.__game.run()?.carried ?? 0) > 0, null, { timeout: 60000, polling: 100 }).catch(() => null);
    const pa5 = await a.evaluate(() => window.__game.state().pos);
    await a.evaluate((plan) => window.__game.setBot(plan), goto({ x: gate.pos.x, z: gate.pos.z }, 1.2, pa5));
    const bankedB = await a.waitForFunction(() => (window.__game.run()?.owed ?? 0) > 0, null, { timeout: 60000, polling: 100 }).then(() => true, () => false);
    const owedB = (await file(acct)).counter?.run?.owed ?? 0;
    const day = Math.floor(Date.now() / 86_400_000);
    const settle = (await (await fetch(`${HOST}/prizes/post`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "run", day }) })).json()) as { ok: boolean; reason?: string; units: number; rate: number; minted: number; pot: number; epoch?: number; paid: number };
    const twice = (await (await fetch(`${HOST}/prizes/post`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "run", day }) })).json()) as { ok: boolean; reason?: string };
    const balS0 = await read<bigint>(info.contracts.capital, "$CAPITAL", "balanceOf", [player.address]);
    const claimed = await a.evaluate((e) => window.__game.claimPrize(e), settle.epoch ?? 0);
    const balS1 = await read<bigint>(info.contracts.capital, "$CAPITAL", "balanceOf", [player.address]);
    const fa3 = await file(acct);
    check("the night settles the day: unwithdrawn units become an epoch at the day's rate, the file claims it on chain, and the same day cannot be settled twice", bankedB && settle.ok && settle.units === owedB && settle.rate === 1 && settle.minted === owedB && settle.paid === 1 && !twice.ok && /already settled/.test(twice.reason ?? "") && claimed.ok && balS1 - balS0 === parseEther(String(owedB)) && (fa3.counter?.run?.owed ?? -1) === 0, `banked ${owedB} · settle ${settle.ok} units ${settle.units} rate ${settle.rate} minted ${settle.minted} of pot ${Math.round(settle.pot)} epoch ${settle.epoch} · twice "${twice.reason ?? ""}" · claim ${claimed.ok} wallet +${Number(balS1 - balS0) / 1e18} · owed ${fa3.counter?.run?.owed}`);

    // ---- the market is player to player ----
    await post("/chain/faucet", { address: player.address });
    await post("/chain/faucet", { address: player2.address });
    const rust = info.listings.find((l) => l.token === 1)!;
    const bought = await a.evaluate((l) => window.__game.buySkin(l), rust.listing);
    const listed = await a.evaluate(() => window.__game.sellSkin(1, 60));
    const after = (await (await fetch(`${HOST}/counter`)).json()) as { listings: { listing: number; token: number; price: number; seller: Hex; amount: number }[] };
    const mine = after.listings.find((l) => l.seller.toLowerCase() === player.address.toLowerCase() && l.token === 1);
    // the second wallet buys it straight on chain (its own transactions), the seller nets 95%
    const wal2 = createWalletClient({ chain, transport: http(info.rpc), account: player2 });
    // fund the second wallet with $CAPITAL from the first (a transfer), then approve + buy
    const wal1 = createWalletClient({ chain, transport: http(info.rpc), account: player });
    await pub.waitForTransactionReceipt({ hash: await wal1.writeContract({ chain, address: info.contracts.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "transfer", args: [player2.address, parseEther("100")] }) });
    const sellerBefore = await read<bigint>(info.contracts.capital, "$CAPITAL", "balanceOf", [player.address]);
    const burnedBefore = await read<bigint>(info.contracts.capital, "$CAPITAL", "burned");
    let sale = false;
    if (mine) {
      await pub.waitForTransactionReceipt({ hash: await wal2.writeContract({ chain, address: info.contracts.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "approve", args: [info.contracts.market, parseEther("60")] }) });
      const rc = await pub.waitForTransactionReceipt({ hash: await wal2.writeContract({ chain, address: info.contracts.market, abi: ARTIFACTS.LedgerMarket!.abi, functionName: "buy", args: [BigInt(mine.listing), 1n] }) });
      sale = rc.status === "success";
    }
    const sellerAfter = await read<bigint>(info.contracts.capital, "$CAPITAL", "balanceOf", [player.address]);
    const burnedAfter = await read<bigint>(info.contracts.capital, "$CAPITAL", "burned");
    const buyerHas = await read<bigint>(info.contracts.cosmetics, "Cosmetics", "balanceOf", [1n, player2.address]);
    const price = parseEther("60");
    check("the market is player to player: ALPHA buys a skin from the studio, lists it for 60 $CAPITAL, a second wallet buys it — ALPHA nets 95%, 2% burns, the skin moves", bought.ok && listed.ok && !!mine && mine.price === 60 && sale && sellerAfter - sellerBefore === (price * 9500n) / 10_000n && burnedAfter - burnedBefore === (price * 200n) / 10_000n && buyerHas === 1n, `bought ${bought.ok} · listed ${listed.ok} ${listed.reason ?? ""} · listing ${mine?.listing} @${mine?.price} · sale ${sale} · seller +${Number(sellerAfter - sellerBefore) / 1e18} · burned +${Number(burnedAfter - burnedBefore) / 1e18} · buyer has ${buyerHas}`);
    // ---- the sinks (Stage 19): the pass and the room-hours, both burned ----
    const supply0 = await read<bigint>(info.contracts.capital, "$CAPITAL", "totalSupply");
    const burn0 = await read<bigint>(info.contracts.capital, "$CAPITAL", "burned");
    const buyS = await a.evaluate(() => window.__game.buySeason());
    const buyR = await a.evaluate(() => window.__game.buyRoomHours(3));
    const supply1 = await read<bigint>(info.contracts.capital, "$CAPITAL", "totalSupply");
    const burn1 = await read<bigint>(info.contracts.capital, "$CAPITAL", "burned");
    const fs = await file(acct);
    const season = (await (await fetch(`${HOST}/counter`)).json() as { season: number }).season;
    const owed = parseEther(String(SEASON_PASS_PRICE + ROOM_HOUR_PRICE * 3));
    /**
     * The economy's own inputs, measured off this run (Stage 38).
     *
     * docs/ECONOMY.md has called `capUse` and `runnerShare` guesses since Stage 19 and named them
     * the first thing to replace with telemetry. Nothing was collecting it, and nothing could have:
     * the day's gross banking existed nowhere, because `run_day` is spent down as files are paid.
     * This checks both halves of the fix on a live host — that the banking this probe just did is
     * recorded gross, and that a sample this small is refused rather than dressed up as a number.
     */
    const econ = (await (await fetch(`${HOST}/economy`)).json()) as { observed: { days: number; runnerDays: number; grossUnits: number; capUse: number | null; runnerShare: number | null; why: string[] }; note: string; projection: string[] };
    check(
      "the day's banking is recorded gross for the economy, and a sample of one day is declined rather than published as a measurement",
      econ.observed.grossUnits > 0 && econ.observed.runnerDays > 0 && econ.observed.capUse === null && econ.observed.runnerShare === null && /capUse assumed/.test(econ.note) && econ.projection.some((l) => /^inputs:/.test(l)),
      `gross ${econ.observed.grossUnits} units over ${econ.observed.runnerDays} runner-days · ${econ.note}`,
    );

    check("the sinks burn: the Deep Wake pass and three room-hours leave the supply for good, the pass grants cosmetics and nothing the sim reads", buyS.ok && buyR.ok && supply0 - supply1 === owed && burn1 - burn0 === owed && (fs.counter?.seasons ?? []).includes(season) && fs.counter?.roomHours === 3 && SEASON_PASS_GRANTS.every((g) => fs.owned.includes(g)), `pass ${buyS.ok} ${buyS.reason ?? ""} · hours ${buyR.ok} ${buyR.reason ?? ""} · supply -${Number(supply0 - supply1) / 1e18} · burned +${Number(burn1 - burn0) / 1e18} · seasons [${(fs.counter?.seasons ?? []).join(",")}] · hours ${fs.counter?.roomHours} · granted ${SEASON_PASS_GRANTS.filter((g) => fs.owned.includes(g)).length}/${SEASON_PASS_GRANTS.length}`);

    // ---- private rooms (Stage 20): the hours open a room, the code is the door, it mints nothing ----
    const hoursBefore = (await file(acct)).counter?.roomHours ?? 0;
    const opened = await a.evaluate(() => window.__game.openRoom(1, { district: "lease_row", mode: "run", roundSeconds: 120 }));
    const hoursAfter = (await file(acct)).counter?.roomHours ?? 0;
    const found = opened.code ? await a.evaluate((c) => window.__game.lookupRoom(c), opened.code) : { ok: false };
    const wrong = await a.evaluate(() => window.__game.lookupRoom("ZZZZZZZZ"));
    // the door: the room name without the code
    const noCode = await new Promise<number>((resolve) => {
      const ws = new WsClient(`ws://127.0.0.1:${HOST_PORT}/room/${opened.room ?? "priv-xxxxxxxx"}`);
      ws.on("close", (code: number) => resolve(code));
      ws.on("error", () => resolve(-1));
    });
    check("a room-hour opens a private room: the credit is spent on chain first, the code is the only door, and a wrong code opens nothing", opened.ok && hoursBefore - hoursAfter === 1 && found.ok && !wrong.ok && noCode === 4003, `opened ${opened.ok} ${opened.reason ?? ""} · code ${opened.code} · hours ${hoursBefore}→${hoursAfter} · lookup ${found.ok} · wrong ${wrong.ok} · no-code close ${noCode}`);

    await a.close();
    await b.close();

    // ---- offline: the same sim, and the menu ----
    const c = await newPage({ width: 800, height: 450 }, "offline");
    await c.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&level=drainage_yard&mode=run&ai=0&account=sandbox-off&secret=${SECRET}`, { waitUntil: "load" });
    await c.waitForFunction(() => window.__game?.ready === true && !!window.__game.run(), null, { timeout: 40000, polling: 100 });
    const off = await c.evaluate(() => window.__game.run()!);
    await c.evaluate((plan) => window.__game.setBot(plan), goto({ x: claims[0]!.pos.x, z: claims[0]!.pos.z }, 0.9));
    await c.evaluate(() => window.__game.setRealtime(true));
    const offPick = await c.waitForFunction(() => (window.__game.run()?.carried ?? 0) > 0, null, { timeout: 40000, polling: 100 }).then(() => true, () => false);
    await shotCheck(c, `stage14-offline.png`);
    await c.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&menu=1&crawl=0&nonav=1&menuspeed=8&level=drainage_yard`, { waitUntil: "load" });
    await c.waitForFunction(() => window.__game?.ready === true && window.__game.menu()?.screen === "main", null, { timeout: 40000, polling: 50 });
    const entries = await c.evaluate(() => window.__game.menu()!.entries);
    await c.evaluate(() => window.__game.menuChoose("run"));
    const pick = await c.evaluate(() => window.__game.menu()!);
    await c.evaluate(() => window.__game.menuKey("Enter"));
    const target3 = await c.evaluate(() => window.__game.menu()!.target);
    const u = new URL(target3 ?? "http://x/");
    await c.close();
    check("offline the yard runs the same sim (`?mode=run`), and the menu's THE RUN entry picks a district and names the run room", off.zones.length === 1 && off.claims.length === claims.length && offPick && entries.includes("THE RUN") && pick.screen === "wake" && u.searchParams.get("mode") === "run" && /mode=run/.test(u.searchParams.get("net") ?? "") && /-run-lease_row/.test(u.searchParams.get("net") ?? ""), `offline claims ${off.claims.length} picked ${offPick} · entries [${entries.join(", ")}] · run → ${u.searchParams.get("net")}`);
    check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean console");
    results["run"] = { target: target.value, drop: dropSeen, scripPaid: fb.wallet.scrip - scrip0, owed: va.owed, paid: fa2.counter?.run?.paid };
    writeFileSync(`${OUT}/stage14.json`, JSON.stringify({ results, checks }, null, 2));
    const failed = checks.filter((x) => !x.pass);
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
    if (failed.length) {
      console.log((await stats()).logs.slice(-40).join("\n"));
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
