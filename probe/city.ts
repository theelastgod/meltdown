/**
 * The city probe (Stage 692) — the campaign's shared open world.
 *  Two files walk into LEASE ROW's city on the campaign host: the same room, each on the other's
 *  screen, the objective line naming THE CITY. No player can hurt another there, and the patrols
 *  run. The contracts desk opens on J and crouch (C) no longer opens it. A contract taken in the
 *  city is played off it and knows the way back.
 *
 *   npm run probe:world
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { shot } from "./shot";
import { cityPageUrl, cityRoomName } from "../shared/net/city";
import { gateArrival, neighbourAt } from "../shared/net/citygates";
import { levelById } from "../shared/sim/level";
import { buildNav } from "../shared/sim/nav";
import type { BotStep } from "../client/bot";
import { sprintRoute } from "./route";

const VITE_PORT = 5231;
const HOST_PORT = 8871;
const OUT = "probe/out";
const HOST = `http://127.0.0.1:${HOST_PORT}`;
const SECRET = "probecitysecretaaaaaaaaa";

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

const ARGS = ["--no-proxy-server", "--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"];

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const checks: { name: string; pass: boolean; detail: string }[] = [];
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
  const newPage = async (tag: string): Promise<Page> => {
    const pg = await browser.newPage({ viewport: { width: 960, height: 540 } });
    pg.on("pageerror", (e) => errors.push(`${tag}: ${String(e)}`));
    pg.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
    return pg;
  };
  const cityUrl = (acct: string, name: string) => {
    const base = `http://127.0.0.1:${VITE_PORT}/?headless=1&crawl=0&account=${acct}&secret=${SECRET}&name=${name}`;
    return cityPageUrl(base, { wsBase: `ws://127.0.0.1:${HOST_PORT}`, level: "lease_row", shop: HOST });
  };
  try {
    // two fresh files, each with a house picked (a contract needs one)
    for (const id of ["city-alpha", "city-bravo"]) await fetch(`${HOST}/file/${id}/campaign`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "faction", faction: "cells", secret: SECRET }) });
    // ---------------- two files walk into the same city ----------------
    const a = await newPage("alpha");
    const b = await newPage("bravo");
    // one at a time: the dev server compiles on the first page's requests
    await a.goto(cityUrl("city-alpha", "ALPHA"), { waitUntil: "domcontentloaded", timeout: 120000 });
    await a.waitForFunction(() => window.__game?.ready === true, null, { timeout: 90000, polling: 100 });
    await b.goto(cityUrl("city-bravo", "BRAVO"), { waitUntil: "domcontentloaded", timeout: 120000 });
    // headless pages step only when asked: both run in real time, as a player's would
    for (const pg of [a, b]) {
      await pg.waitForFunction(() => window.__game?.ready === true, null, { timeout: 90000, polling: 100 });
      await pg.evaluate(() => window.__game.setRealtime(true));
    }
    // both at once: each page is waiting for the other to be on its wire
    await Promise.all([a, b].map((pg) => pg.waitForFunction(() => window.__game?.ready === true && (window.__game.net()?.remotes.length ?? 0) >= 1 && window.__game.campaign().mode === "city", null, { timeout: 60000, polling: 100 }).catch(() => undefined)));
    const seenA = await a.evaluate(() => ({ remotes: window.__game.net()!.remotes.map((r) => r.name ?? ""), mode: window.__game.campaign().mode, objective: (document.querySelector("#hud .mtitle") as HTMLElement | null)?.textContent ?? "" }));
    const seenB = await b.evaluate(() => window.__game.net()!.remotes.map((r) => r.name ?? ""));
    const st = (await (await fetch(`${HOST}/stats`)).json()) as { rooms: Record<string, { clients?: unknown[]; city?: { district: string; players: number; pvp: boolean } }> };
    const room = st.rooms[`city:lease_row`];
    check(
      "two files who press PLAY walk the same city: one room on the campaign host, each on the other's screen, the objective naming THE CITY",
      !!room && room.city?.players === 2 && room.city.pvp === false && seenA.remotes.length === 1 && seenB.length === 1 && seenA.mode === "city" && /THE CITY/.test(seenA.objective),
      `room ${cityRoomName("lease_row")}: ${JSON.stringify(room?.city)} · ALPHA sees [${seenA.remotes.join(", ")}] · BRAVO sees [${seenB.join(", ")}] · mode ${seenA.mode} · objective "${seenA.objective.replace(/\s+/g, " ").slice(0, 80)}"`,
    );
    await shot(a, `${OUT}/city-alpha.png`);

    // ---------------- the desk is on J; crouch does not open it ----------------
    await a.keyboard.press("KeyC");
    await a.waitForTimeout(150);
    const afterC = await a.evaluate(() => window.__game.campaign().contractsOpen);
    await a.keyboard.press("KeyJ");
    await a.waitForTimeout(250);
    const afterJ = await a.evaluate(() => ({ open: window.__game.campaign().contractsOpen, hint: (document.querySelector("#hud .contracts .hd .x") as HTMLElement | null)?.textContent ?? "" }));
    check("the contracts desk opens on J, and crouching (C) no longer opens it", !afterC && afterJ.open && /\[J\]/.test(afterJ.hint), `after C: open ${afterC} · after J: open ${afterJ.open} · close hint "${afterJ.hint}"`);

    // ---------------- a contract taken in the city knows the way back ----------------
    const nav = a.waitForURL(/mission=/, { timeout: 20000, waitUntil: "commit" }).then(() => true, () => false);
    // the desk reads the file the ledger host keeps, house and all
    await a.waitForFunction(() => window.__game.campaign().faction === "cells", null, { timeout: 20000, polling: 100 }).catch(() => undefined);
    await a.evaluate(() => window.__game.game.campaign.launch("m1_wake_unlisted"));
    const left = await nav;
    const q = new URL(a.url()).searchParams;
    await a.waitForFunction(() => window.__game?.ready === true, null, { timeout: 60000, polling: 100 });
    const back = await a.evaluate(() => window.__game.campaign().backToCity);
    const bq = back ? new URL(back).searchParams : null;
    check(
      "a contract taken in the city is played off it, and knows the way back to the same city",
      left && q.get("mission") === "m1_wake_unlisted" && !q.has("net") && !q.has("city") && q.get("back") === "lease_row" && !!bq && bq.get("city") === "1" && !bq.has("back") && !bq.has("mission") && new URL(bq.get("net") ?? "http://x").pathname === `/campaign/${cityRoomName("lease_row")}`,
      `left ${left} · mission ${q.get("mission")} net ${q.get("net")} back ${q.get("back")} · way back ${back}`,
    );
    // ---------------- the districts are joined: BRAVO walks through LEASE ROW's east gate ----------------
    // (Stage 697) Gate 3 is the east gate on the south avenue. BRAVO sprints to a point inside it, then
    // into its mouth, and stands there: the HUD names the neighbour, and a second later the page goes.
    const lease = levelById("lease_row");
    const EAST = 3;
    const to = neighbourAt("lease_row", EAST)!;
    const inside = gateArrival(lease, EAST)!.pos;
    const mouth = lease.exits![EAST]!;
    const pb = await b.evaluate(() => window.__game.state().pos);
    const walk: BotStep[] = [...sprintRoute(buildNav(lease), pb, inside, 1.4), { kind: "goto", x: mouth.x, z: mouth.z, sprint: false, radius: 0.3, timeoutTicks: 400, stop: true }, { kind: "hold", ticks: 9000 }];
    const crossed = b.waitForURL((u) => new URL(u).searchParams.get("level") === to.district, { timeout: 60000, waitUntil: "commit" }).then(() => true, () => false);
    await b.evaluate((plan) => window.__game.setBot(plan), walk);
    // the line the HUD showed on the way in, read until the page goes
    const lines = new Set<string>();
    let going = true;
    void crossed.then(() => (going = false));
    while (going) {
      const line = await b.evaluate(() => window.__game.campaign().gate.line).catch(() => "");
      if (line) lines.add(line.replace(/[▮▯]+/g, "▮"));
      await b.waitForTimeout(100).catch(() => undefined);
    }
    const went = await crossed;
    const bu = new URL(b.url()).searchParams;
    await b.waitForFunction(() => window.__game?.ready === true && window.__game.net()?.status === "joined" && window.__game.net()?.synced === true, null, { timeout: 90000, polling: 100 }).catch(() => undefined);
    await b.evaluate(() => window.__game.setRealtime(true)).catch(() => undefined);
    // Where the file stands for its first second in the docks, while it is alive. The city has no
    // spawn protection (a spawn has none either), and a file standing still under a patrol at the
    // gate is worn down and respawns: a sample after that says where the room respawned it, not where
    // the gate put it. Every live sample must be at the gate, and there must be some.
    const docks = levelById(to.district);
    const want = gateArrival(docks, to.gate)!.pos;
    let landed: { mode: string } | null = null;
    let off = 0;
    let live = 0;
    for (let i = 0; i < 10; i++) {
      const at = await b.evaluate(() => ({ pos: window.__game.state().pos, health: window.__game.state().health, mode: window.__game.campaign().mode })).catch(() => null);
      if (at) landed = at;
      if (at && at.health > 0) {
        live++;
        off = Math.max(off, Math.hypot(at.pos.x - want.x, at.pos.z - want.z));
      }
      await b.waitForTimeout(100);
    }
    if (live === 0) off = Infinity;
    const st2 = (await (await fetch(`${HOST}/stats`)).json()) as { rooms: Record<string, { city?: { players: number } }> };
    check(
      "the districts are joined: walking into LEASE ROW's east gate names DEADLETTER DOCKS, and standing in it walks the file into the docks' city at the gate that leads back",
      went && [...lines].some((l) => l.includes(`→ ${docks.displayName}`)) && [...lines].some((l) => /CROSSING/.test(l)) && bu.get("city") === "1" && bu.get("from") === "lease_row" && bu.get("gate") === String(to.gate) && landed?.mode === "city" && live >= 3 && off < 1.5 && (st2.rooms[`city:${to.district}`]?.city?.players ?? 0) >= 1,
      `lines [${[...lines].join(" | ")}] · went ${went} → level ${bu.get("level")} from ${bu.get("from")} gate ${bu.get("gate")} · mode ${landed?.mode} · at most ${off.toFixed(2)} m from the arrival point over ${live} live samples in its first second · docks room ${JSON.stringify(st2.rooms[`city:${to.district}`]?.city)}`,
    );
    await shot(b, `${OUT}/city-gate-arrival.png`);

    // ---------------- a page that lies about where it came from is placed like anyone else ----------------
    // gate 5 of the docks leads to REPO DEPOT, not LEASE ROW: the room ignores the hint and spawns the file
    const liar = await newPage("liar");
    await liar.goto(`${cityPageUrl(`http://127.0.0.1:${VITE_PORT}/?headless=1&crawl=0&account=city-liar&secret=${SECRET}&name=LIAR`, { wsBase: `ws://127.0.0.1:${HOST_PORT}`, level: to.district, shop: HOST })}&from=lease_row&gate=5`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await liar.waitForFunction(() => window.__game?.ready === true && window.__game.net()?.status === "joined" && window.__game.net()?.synced === true, null, { timeout: 90000, polling: 100 }).catch(() => undefined);
    await liar.evaluate(() => window.__game.setRealtime(true)).catch(() => undefined);
    await liar.waitForTimeout(600);
    const lp = await liar.evaluate(() => window.__game.state().pos).catch(() => ({ x: NaN, z: NaN }));
    const lie = gateArrival(docks, 5)!.pos;
    const fromLie = Math.hypot(lp.x - lie.x, lp.z - lie.z);
    const nearSpawn = Math.min(...docks.spawns.map((sp) => Math.hypot(lp.x - sp.pos.x, lp.z - sp.pos.z)));
    check("a page that names a gate that does not lead where it says is placed at an ordinary spawn, not at the gate", fromLie > 3 && nearSpawn < 1.5, `${fromLie.toFixed(1)} m from gate 5's arrival · ${nearSpawn.toFixed(2)} m from the nearest spawn`);
    await liar.close();

    check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean console");
    writeFileSync(`${OUT}/city.json`, JSON.stringify({ checks }, null, 2));
  } finally {
    await browser.close();
    vite.kill("SIGTERM");
    host.kill("SIGTERM");
  }
  const failed = checks.filter((c) => !c.pass).length;
  console.log(`\n${checks.length - failed}/${checks.length} checks passed.`);
  process.exit(failed ? 1 : 0);
}

void main();
