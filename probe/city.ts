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
