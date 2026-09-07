/**
 * Stage 15 probe — hardening.
 *  Matchmaking: /match hands out the first public room with space, and a full room rolls to the
 *  next shard; the menu's district pick asks the host and navigates to the answer. Prizes: an Audit
 *  round settles to the board, the weekly job posts a Merkle epoch to the PrizeVault (files without a
 *  wallet skipped), the file sees its prize and claims it sponsored — the wallet's $CAPITAL rises;
 *  the Deep Wake epoch pays the round's contributor. The safe zone has a market kiosk: the strip
 *  says [TAB] MARKET and Tab opens the panel on the market. The counter-ledger rate limit answers
 *  429 past 30 a minute.
 *
 *   npm run probe:harden
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { shot } from "./shot";
import WebSocket from "ws";
import { createPublicClient, defineChain, http, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { BotStep } from "../client/bot";
import { ARTIFACTS } from "../server/chain/deploy";
// the board publishes a label, not the id (Stage 26) — assert against the same projection
import { publicLabel } from "../shared/progression/account";
import { DEV_KEYS } from "../server/chain/boot";
import { encodeJoin } from "../shared/net/protocol";
import { MAX_PLAYERS_PER_ROOM } from "../shared/net/matchmaking";
import { levelById } from "../shared/sim/level";
import { buildNav, findPath } from "../shared/sim/nav";
import { AUDIT_POOL } from "../shared/economy/prizes";

const VITE_PORT = 5212;
const HOST_PORT = 8814;
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
  const get = async <T>(path: string): Promise<T> => (await (await fetch(`${HOST}${path}`)).json()) as T;
  /**
   * A file's secret (Stage 26): the id names a file, this proves the caller owns it, and every
   * mutating route wants it. The probe fixes one and hands the same value to the pages via
   * `?secret=`, which is exactly what a real client does with the one it generated. Routes that are
   * not a file's — `/prizes/post`, `/match` — ignore the extra field.
   */
  const SECRET = "probestage15secretaaaaaa";
  const post = async <T = { ok: boolean; reason?: string }>(path: string, body: unknown): Promise<T & { status: number }> => {
    const r = await fetch(`${HOST}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...(body as object), secret: SECRET }) });
    return { ...((await r.json()) as T), status: r.status };
  };
  const stats = async () => get<{ rooms: Record<string, { players: number; match: { phase: string } | null; audit: { week: number } | null }>; logs: string[] }>("/stats");
  const newPage = async (viewport: { width: number; height: number }, tag: string): Promise<Page> => {
    const pg = await browser.newPage({ viewport });
    pg.on("pageerror", (e) => errors.push(`${tag}: ${String(e)}`));
    pg.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
    return pg;
  };
  const sockets: WebSocket[] = [];
  try {
    // ---------------- matchmaking ----------------
    const m0 = await get<{ room: string; url: string; players: number; max: number }>("/match?district=lease_row&mode=wake");
    // fill the room with plain sockets (the join handshake is enough to count)
    for (let i = 0; i < MAX_PLAYERS_PER_ROOM; i++) {
      const ws = new WebSocket(m0.url);
      sockets.push(ws);
      await new Promise<void>((res, rej) => {
        ws.once("open", () => {
          ws.send(encodeJoin(`FILL${i}`, "", `fill-${i}`, JSON.stringify({ primary: "lease_breaker", secondary: "shock_baton", attested: [] }), ""));
          res();
        });
        ws.once("error", rej);
      });
    }
    await new Promise((r) => setTimeout(r, 800));
    const full = (await stats()).rooms[m0.room]?.players ?? 0;
    const m1 = await get<{ room: string; url: string; players: number }>("/match?district=lease_row&mode=wake");
    const mRun = await get<{ room: string; url: string }>("/match?district=repo_depot&mode=run");
    check("matchmaking: /match names the first public room with space; a full room (8) rolls to the next shard; the run has its own rooms", m0.room === "neochina-lease_row" && full >= MAX_PLAYERS_PER_ROOM && m1.room === "neochina-lease_row-2" && /neochina-lease_row-2\?level=lease_row/.test(m1.url) && mRun.room === "neochina-run-repo_depot" && /mode=run/.test(mRun.url), `first ${m0.room} · filled ${full} · next ${m1.room} · run ${mRun.room}`);
    for (const ws of sockets) ws.close();
    // the menu asks the host
    const c = await newPage({ width: 800, height: 450 }, "menu");
    await c.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&menu=1&crawl=0&nonav=1&menuspeed=8&level=drainage_yard&shop=${HOST}`, { waitUntil: "load" });
    await c.waitForFunction(() => window.__game?.ready === true && window.__game.menu()?.screen === "main", null, { timeout: 40000, polling: 50 });
    await c.evaluate(() => window.__game.menuChoose("wake"));
    await c.evaluate(() => window.__game.menuChoose("wake:lease_row"));
    const matched = await c.waitForFunction(() => window.__game.menu()?.matched === true && /neochina-lease_row-2/.test(window.__game.menu()?.target ?? ""), null, { timeout: 10000, polling: 50 }).then(() => true, () => false);
    const target = await c.evaluate(() => window.__game.menu()!.target);
    await c.close();
    check("the menu's district pick asks the host for a room and navigates to the shard with space", matched && /8814\/room\/neochina-lease_row-2/.test(new URL(target ?? "http://x/").searchParams.get("net") ?? ""), `target net → ${new URL(target ?? "http://x/").searchParams.get("net")}`);

    // ---------------- prizes: an Audit round, the weekly job, a sponsored claim ----------------
    const level = levelById("lease_row");
    const nav = buildNav(level);
    const route = (from: { x: number; z: number }, to: { x: number; z: number }): BotStep[] => (findPath(nav, { x: from.x, y: 0, z: from.z }, { x: to.x, y: 0, z: to.z }) ?? [{ x: from.x, y: 0, z: from.z }, { x: to.x, y: 0, z: to.z }]).slice(1).map((p, i, arr) => ({ kind: "goto" as const, x: p.x, z: p.z, sprint: true, radius: i === arr.length - 1 ? 1.2 : 1.4, timeoutTicks: 700, stop: i === arr.length - 1 }));
    const eg = await get<{ audit: { week: number; weapons: string[] } }>("/endgame");
    const au = eg.audit;
    const loadout = { primary: au.weapons.length && !au.weapons.includes("lease_breaker") ? au.weapons[0] : "lease_breaker", secondary: "shock_baton", attested: [] };
    const acct = "sandbox-hard";
    await post(`/file/${acct}/campaign`, { op: "faction", faction: "cells" });
    // 25 s was not enough round for ALPHA to walk to B and hold it through a flip (4 s at
    // WAKE.baseFlipSeconds for one Blank on a neutral node), so the Deep Wake check had never once
    // seen a contributor — it read "ALPHA flips 0" from Stage 15 until Stage 28 went looking.
    const roomUrl = `ws://127.0.0.1:${HOST_PORT}/room/audit-h?audit=1&ai=0&level=lease_row&warmup=0.5&round=60`;
    const a = await newPage({ width: 960, height: 540 }, "A");
    await a.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&level=lease_row&account=${acct}&secret=${SECRET}&name=ALPHA&shop=${HOST}&wallet=${DEV_KEYS.player}&loadout=${encodeURIComponent(JSON.stringify(loadout))}&net=${encodeURIComponent(roomUrl)}`, { waitUntil: "load" });
    const b = await newPage({ width: 640, height: 360 }, "B");
    // BRAVO is a sandbox file too (a Depth-1 file cannot hold most playlists' weapons) with no wallet linked: the post skips it
    await b.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&level=lease_row&account=sandbox-hardb&secret=${SECRET}&name=BRAVO&loadout=${encodeURIComponent(JSON.stringify(loadout))}&net=${encodeURIComponent(roomUrl)}`, { waitUntil: "load" });
    for (const p of [a, b]) await p.waitForFunction(() => window.__game?.ready === true && window.__game.net()?.status === "joined" && window.__game.net()?.synced === true, null, { timeout: 40000, polling: 100 }).catch(async (e) => {
      console.log("join state:", JSON.stringify(await p.evaluate(() => ({ status: window.__game.net()?.status, kick: window.__game.net()?.kickReason, synced: window.__game.net()?.synced, snapshots: window.__game.net()?.stats.snapshots, tick: window.__game.state().tick }))));
      console.log((await stats()).logs.slice(-12).join("\n"));
      throw e;
    });
    const link = await a.evaluate(() => window.__game.link());
    const pa = await a.evaluate(() => window.__game.state().pos);
    const B = level.nodes.find((n) => n.label === "B")!.pos;
    await a.evaluate((plan) => window.__game.setBot(plan), [...route(pa, { x: B.x, z: B.z }), { kind: "hold", ticks: 9000 }] as BotStep[]);
    await b.evaluate(() => window.__game.setBot([{ kind: "hold", ticks: 9000 }]));
    for (const p of [a, b]) await p.evaluate(() => window.__game.setRealtime(true));
    const t0 = Date.now();
    let phase = "";
    while (Date.now() - t0 < 90000 && phase !== "results") {
      await a.waitForTimeout(500);
      phase = (await stats()).rooms["audit-h"]?.match?.phase ?? "";
    }
    await a.waitForTimeout(800);
    const flipsA = await a.evaluate(() => window.__game.state().stats.flips);
    const posted = await post<{ ok: boolean; reason?: string; epoch: { epoch: number; total: string; leaves: { file: string; amount: string; reason: string }[] } | null; skipped: string[]; lines: { account: string; amount: number }[] }>("/prizes/post", { kind: "audit", week: au.week });
    const again = await post("/prizes/post", { kind: "audit", week: au.week });
    const listed = await a.evaluate(() => window.__game.prizes());
    const info = await get<{ chainId: number; rpc: string; contracts: { capital: Hex; vault: Hex } }>("/counter");
    const chain = defineChain({ id: info.chainId, name: "devnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [info.rpc] } } });
    const pub = createPublicClient({ chain, transport: http(info.rpc) });
    const player = privateKeyToAccount(DEV_KEYS.player);
    const bal0 = (await pub.readContract({ address: info.contracts.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "balanceOf", args: [player.address] })) as bigint;
    const claim = listed[0] ? await a.evaluate((e) => window.__game.claimPrize(e), listed[0].epoch) : { ok: false, reason: "nothing listed" };
    const bal1 = (await pub.readContract({ address: info.contracts.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "balanceOf", args: [player.address] })) as bigint;
    const after = await a.evaluate(() => window.__game.prizes());
    const ethA = await pub.getBalance({ address: player.address });
    const myLine = posted.lines.find((l) => l.account === acct);
    check("the weekly job posts the Audit's prizes as a Merkle epoch to the PrizeVault: the placed file with a wallet gets a leaf, the file without one is skipped, a second post is refused; the file sees its prize and a sponsored claim moves the $CAPITAL to the wallet", phase === "results" && link.ok && posted.ok && !!posted.epoch && posted.epoch.leaves.length === 1 && posted.epoch.leaves[0]!.file === publicLabel(acct) && !again.ok && listed.length === 1 && !listed[0]!.claimed && claim.ok && !!myLine && bal1 - bal0 === parseEther(String(myLine.amount)) && after[0]!.claimed && ethA === 0n, `epoch ${posted.epoch?.epoch} · leaves ${posted.epoch?.leaves.map((l) => `${l.file}:${l.amount.slice(0, 4)}…`).join(",")} · skipped ${posted.skipped.join(",")} · line ${myLine?.amount}/${AUDIT_POOL} · claim ${claim.ok} ${claim.reason ?? ""} · wallet +${Number(bal1 - bal0) / 1e18} · gas paid by wallet ${ethA > 0n}`);
    // the Deep Wake epoch: ALPHA (Depth 50) flipped B this round
    const season = await post<{ ok: boolean; reason?: string; epoch: { leaves: { file: string; amount: string }[] } | null; lines: { account: string; amount: number }[] }>("/prizes/post", { kind: "season" });
    const seasonList = await a.evaluate(() => window.__game.prizes());
    const seasonPrize = seasonList.find((p) => p.kind === "season");
    check("the Deep Wake epoch pays the round's contributor (a Depth-15+ file that flipped a node) and the file can claim it too", season.ok && !!season.epoch && season.epoch.leaves.some((l) => l.file === publicLabel(acct)) && !!seasonPrize && !seasonPrize.claimed && /DEEP WAKE/.test(seasonPrize.reason), `ALPHA flips ${flipsA} · season lines ${season.lines.map((l) => `${l.account}:${l.amount}`).join(",")} · listed ${seasonPrize?.reason} ${seasonPrize?.amount}`);
    await a.evaluate(() => window.__game.toggleFile(true));
    await a.waitForTimeout(300);
    await a.evaluate(() => document.querySelector("#hud .file .cl")?.scrollIntoView());
    await shotCheck(a, `stage15-prizes.png`);
    await a.evaluate(() => window.__game.toggleFile(false));
    await b.close();

    // ---------------- the rate limit ----------------
    let limited = 0;
    let firstLimitedAt = -1;
    for (let i = 0; i < 34; i++) {
      const r = await post(`/file/${acct}/counter`, { op: "view" });
      if (r.status === 429) {
        limited++;
        if (firstLimitedAt < 0) firstLimitedAt = i;
      }
    }
    check("the counter-ledger rate limit: past 30 requests a minute a file gets 429 with the reason", limited >= 3 && firstLimitedAt >= 20 && firstLimitedAt <= 30, `limited ${limited} of 34 · first at #${firstLimitedAt + 1}`);
    await a.close();

    // ---------------- the kiosk in the safe zone ----------------
    const yard = levelById("drainage_yard");
    const gate = yard.zones![0]!;
    const k = await newPage({ width: 960, height: 540 }, "kiosk");
    await k.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&level=drainage_yard&mode=run&ai=0&account=sandbox-kiosk&secret=${SECRET}&shop=${HOST}`, { waitUntil: "load" });
    await k.waitForFunction(() => window.__game?.ready === true && !!window.__game.run(), null, { timeout: 40000, polling: 100 });
    const pk = await k.evaluate(() => window.__game.state().pos);
    const ynav = buildNav(yard);
    const path = (findPath(ynav, { x: pk.x, y: 0, z: pk.z }, { x: gate.pos.x, y: 0, z: gate.pos.z }) ?? [{ x: gate.pos.x, y: 0, z: gate.pos.z }]).slice(1);
    await k.evaluate((plan) => window.__game.setBot(plan), [...path.map((p, i, arr) => ({ kind: "goto" as const, x: p.x, z: p.z, sprint: true, radius: i === arr.length - 1 ? 1.2 : 1.4, timeoutTicks: 700, stop: i === arr.length - 1 })), { kind: "hold", ticks: 9000 }] as BotStep[]);
    await k.evaluate(() => window.__game.setRealtime(true));
    const inGate = await k.waitForFunction(() => window.__game.run()?.inSafe === true, null, { timeout: 40000, polling: 100 }).then(() => true, () => false);
    await k.waitForTimeout(400);
    const strip = await k.evaluate(() => (document.querySelector("#hud .runstrip") as HTMLElement).textContent ?? "");
    await shotCheck(k, `stage15-kiosk.png`);
    await k.keyboard.press("Tab");
    await k.waitForTimeout(400);
    const opened = await k.evaluate(() => {
      const panel = document.querySelector("#hud .file") as HTMLElement | null;
      const cl = document.querySelector("#hud .file .cl") as HTMLElement | null;
      if (!panel || !cl || panel.hidden) return { open: false, marketVisible: false };
      const pr = panel.getBoundingClientRect();
      const cr = cl.getBoundingClientRect();
      return { open: true, marketVisible: cr.top < pr.bottom && cr.bottom > pr.top };
    });
    await k.close();
    check("the safe zone has a market kiosk: inside the gate the strip offers [TAB] MARKET and Tab opens the file panel on the market", inGate && /\[TAB\] MARKET/.test(strip) && opened.open && opened.marketVisible, `in gate ${inGate} · strip "${strip.slice(-40)}" · panel ${opened.open} market visible ${opened.marketVisible}`);
    check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean console");
    results["harden"] = { match: [m0.room, m1.room, mRun.room], epoch: posted.epoch?.epoch, prize: myLine?.amount, season: season.lines };
    writeFileSync(`${OUT}/stage15.json`, JSON.stringify({ results, checks }, null, 2));
    const failed = checks.filter((x) => !x.pass);
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
    if (failed.length) {
      console.log((await stats()).logs.slice(-40).join("\n"));
      process.exitCode = 1;
    }
  } finally {
    for (const ws of sockets) ws.close();
    await browser.close();
    host.kill();
    vite.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
