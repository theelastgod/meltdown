/**
 * Stage 5 wake probe.
 *  1. Offline: a Blank walks node A → D → B; each flips violet → green, the
 *     spread bonus makes the second flip faster, score accrues, a phage burst
 *     boosts a node, and the KERNEL pulse drains a hold. Screenshots.
 *  2. Online: two clients in opposite cells stand on the same node — it is
 *     contested and does not flip; when one leaves, the other takes it, the
 *     server's match header carries the score, and the round has a timer.
 *
 *   npm run probe:wake
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { shot } from "./shot";
import type { BotStep } from "../client/bot";

const VITE_PORT = 5187;
const HOST_PORT = 8792;
const OUT = "probe/out";

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
    setTimeout(() => !ok && reject(new Error(`${what} did not start`)), 30000);
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
  try {
    // ---------------- offline ----------------
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&ai=0&seed=5&level=drainage_yard`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 30000, polling: 100 });
    const plan: BotStep[] = [
      { kind: "hold", ticks: 20 },
      { kind: "goto", x: 0, z: 17, sprint: true, radius: 1, stop: true }, // node D
      { kind: "hold", ticks: 60 * 5 },
      { kind: "goto", x: 0, z: 1.5, sprint: true, radius: 0.8 },
      { kind: "mantle", x: 0, z: -3 },
      { kind: "goto", x: 0, z: -5, sprint: false, radius: 0.6, stop: true }, // node A on the deck (adjacent to D: spread)
      { kind: "hold", ticks: 60 * 5 },
      { kind: "look", yaw: -1.55, pitch: -0.1, ticks: 20 },
    ];
    await page.evaluate((p) => window.__game.setBot(p), plan);
    const flips: { node: number; tick: number }[] = [];
    let shotA = false;
    for (let i = 0; i < 160; i++) {
      await page.evaluate(() => window.__game.advance(10));
      const ev = await page.evaluate(() => { const e = window.__game.events(); window.__game.clearEvents(); return e; });
      for (const e of ev) if (e.type === "nodeFlip") flips.push({ node: e.node, tick: e.tick });
      const wake = (await page.evaluate(() => window.__game.state())).wake!;
      const a = wake.nodes.find((n) => n.id === 1)!;
      if (!shotA && a.puller === 1 && a.hold < 0.6 && a.owner === 0) {
        shotA = true;
        await page.waitForTimeout(150);
        await shotCheck(page, "stage5-pull.png");
      }
      const st = await page.evaluate(() => window.__game.botStatus());
      if (st?.done) break;
    }
    await page.waitForTimeout(150);
    await shotCheck(page, "stage5-held.png");
    let state = await page.evaluate(() => window.__game.state());
    const D = state.wake!.nodes.find((n) => n.id === 4)!;
    const A = state.wake!.nodes.find((n) => n.id === 1)!;
    check("offline: node D flips violet → green under one Blank", D.owner === 1 && flips.some((f) => f.node === 4), `owner ${D.owner}, hold ${D.hold.toFixed(2)}`);
    check("offline: node A (adjacent to held D) flips too", A.owner === 1 && flips.some((f) => f.node === 1), `owner ${A.owner}, hold ${A.hold.toFixed(2)}`);
    check("offline: score accrues for held nodes", state.wake!.score[1]! > 3, `cell one ${state.wake!.score[1]!.toFixed(1)} pts, timer ${state.wake!.timeLeft.toFixed(0)} s`);
    // spread: measure A's flip time precisely in a fresh simulation via the hook: put the player on A with D held vs not
    const measureFlip = (pre: boolean) =>
      page.evaluate((withNeighbour) => {
        const w = window.__game.game.world.wake!;
        const p = window.__game.game.player;
        window.__game.setBot([{ kind: "hold", ticks: 6000 }]);
        for (const n of w.nodes) { n.owner = 0; n.hold = 1; n.puller = 0; n.contested = false; n.boost = 0; }
        if (withNeighbour) w.nodes[3]!.owner = 1;
        p.pos.x = 0; p.pos.y = 1.2; p.pos.z = -5;
        let t = 0;
        while (t < 60 * 20 && w.nodes[0]!.owner !== 1) { window.__game.advance(1); t++; }
        return t / 60;
      }, pre);
    const spread = { plain: await measureFlip(false), spread: await measureFlip(true) };
    check("offline: the wake spreads — flipping next to a held node is faster", spread.spread < spread.plain, `${spread.plain.toFixed(2)} s alone vs ${spread.spread.toFixed(2)} s with D held`);
    // phage burst boost + kernel pulse
    const boosted = await page.evaluate(() => {
      const w = window.__game.game.world;
      const p = window.__game.game.player;
      p.pos.x = 18; p.pos.y = 0; p.pos.z = 8;
      window.__game.setBot([{ kind: "slot", slot: 5 }, { kind: "hold", ticks: 25 }, { kind: "fire", ticks: 20, aimAt: { x: 18, y: 0.3, z: 0 } }, { kind: "hold", ticks: 60 }]);
      window.__game.advance(140);
      return w.wake!.nodes.find((n) => n.id === 2)!.boost;
    });
    check("offline: a phage burst boosts the node it lands on", boosted > 0, `node B boost ${boosted.toFixed(2)} s remaining`);
    const pulse = await page.evaluate(() => {
      const w = window.__game.game.world.wake!;
      window.__game.setBot([{ kind: "hold", ticks: 60 * 80 }]);
      const before = w.pulses;
      window.__game.clearEvents();
      window.__game.advance(60 * 76);
      const ev = window.__game.events().filter((e) => e.type === "kernelPulse");
      return { pulses: w.pulses - before, ev: ev.length, holds: w.nodes.map((n) => `${n.label}:${n.owner}/${n.hold.toFixed(2)}`) };
    });
    check("offline: the KERNEL pulses on schedule and drains the weakest hold", pulse.pulses >= 1 && pulse.ev >= 1, `${pulse.pulses} pulse(s); ${pulse.holds.join(" ")}`);
    check("offline: no page errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean console");
    await page.close();

    // ---------------- online: contest ----------------
    const open = async (name: string, seed: number): Promise<Page> => {
      const pg = await browser.newPage({ viewport: { width: 480, height: 270 } });
      await pg.goto(`http://127.0.0.1:${VITE_PORT}/?crawl=0&norender=1&net=ws://127.0.0.1:${HOST_PORT}/room/wake?ai=0%26level=drainage_yard&level=drainage_yard&name=${name}&seed=${seed}`, { waitUntil: "load" });
      await pg.waitForFunction(() => window.__game?.ready === true, null, { timeout: 30000, polling: 100 });
      await pg.waitForFunction(() => window.__game.net()?.status === "joined" && window.__game.net()?.synced === true, null, { timeout: 15000, polling: 100 });
      return pg;
    };
    const a = await open("ALPHA", 1);
    const b = await open("BRAVO", 2);
    const teams = await Promise.all([a, b].map((pg) => pg.evaluate(() => window.__game.state().team)));
    check("online: the room balances the two Blanks into opposite cells", teams[0] === 1 && teams[1] === 2, `ALPHA cell ${teams[0]}, BRAVO cell ${teams[1]}`);
    // warm-up ends 20 s after both joined; walk both to node D meanwhile
    const toD: BotStep[] = [{ kind: "goto", x: 0, z: 17, sprint: true, radius: 1.2, timeoutTicks: 1500, stop: true }, { kind: "hold", ticks: 60 * 60 }];
    await a.evaluate((p) => window.__game.setBot(p), toD);
    await b.evaluate((p) => window.__game.setBot(p), toD);
    const stats = async () => (await (await fetch(`http://127.0.0.1:${HOST_PORT}/stats`)).json()).rooms["wake"];
    let st = await stats();
    const t0 = Date.now();
    while (st.match.phase !== "wake" && Date.now() - t0 < 40000) {
      await a.waitForTimeout(1000);
      st = await stats();
    }
    check("online: the round starts once both cells have a Blank", st.match.phase === "wake", `phase ${st.match.phase}, ${st.match.timeLeft.toFixed(0)} s on the clock`);
    await a.waitForTimeout(9000);
    st = await stats();
    let d = st.match.nodes.find((n: { id: number }) => n.id === 4);
    check("online: a node with both cells on it is contested and stays leased", d.contested === true && d.owner === 0 && d.hold > 0.99, `contested=${d.contested} owner=${d.owner} hold=${d.hold.toFixed(2)}`);
    // BRAVO leaves
    await b.evaluate(() => window.__game.setBot([{ kind: "goto", x: 14, z: 20, sprint: true, radius: 1.2, timeoutTicks: 900, stop: true }, { kind: "hold", ticks: 6000 }]));
    await a.waitForTimeout(9000);
    st = await stats();
    d = st.match.nodes.find((n: { id: number }) => n.id === 4);
    check("online: when BRAVO leaves, ALPHA's cell takes the node and scores", d.owner === 1 && st.match.score[1] > 0, `owner=${d.owner} hold=${d.hold.toFixed(2)} score ${st.match.score[1].toFixed(1)} : ${st.match.score[2].toFixed(1)}`);
    const hudA = await a.evaluate(() => ({ wake: window.__game.state().wake, netMatch: window.__game.net()?.stats.snapshots }));
    const nodeAView = await a.evaluate(() => { const g = window.__game.game as unknown as { netEntities: { kind: number; id: number; a: number }[] }; return g.netEntities.filter((e) => e.kind === 5).map((e) => `${e.id}:${e.a}`).join(","); });
    check("online: clients receive node entities and the match header", nodeAView.includes("4:1"), `entities ${nodeAView}; snapshots ${hudA.netMatch}`);
    await a.close();
    await b.close();

    writeFileSync(`${OUT}/stage5.json`, JSON.stringify({ flips, spread, boosted, pulse, online: st.match, checks }, null, 2));
    const failed = checks.filter((c) => !c.pass);
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
    if (failed.length) process.exitCode = 1;
  } finally {
    await browser.close();
    vite.kill("SIGTERM");
    host.kill("SIGTERM");
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
