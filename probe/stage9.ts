/**
 * Stage 9 city probe — Neo-China proper.
 *  For each district: the level loads, a Blank routes along real streets
 *  (nav waypoints) from spawn to an intersection node and flips it, climbs
 *  the walkway by its stairs, the frames read like the clip (near-black,
 *  neon-fractioned, cyan/magenta), THE KERNEL is on the horizon, the draw
 *  call and triangle budgets hold, and the sim keeps 60 Hz. Online: a room
 *  picks the district and a client that arrives for the wrong one travels.
 *
 *   npm run probe:city
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import type { BotStep } from "../client/bot";
import { levelById } from "../shared/sim/level";
import { DISTRICT_SPECS } from "../shared/sim/city";
import { buildNav, findPath } from "../shared/sim/nav";
import { computeLookStatsSource, type LookStats } from "./look-metrics";

const VITE_PORT = 5193;
const HOST_PORT = 8796;
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

async function statsOf(page: Page, png: Buffer): Promise<LookStats> {
  return page.evaluate(
    async ({ src, fn }) => {
      const compute = new Function("return " + fn)() as (i: ImageData) => LookStats;
      const img = new Image();
      img.src = "data:image/png;base64," + src;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      return compute(ctx.getImageData(0, 0, c.width, c.height));
    },
    { src: png.toString("base64"), fn: computeLookStatsSource },
  );
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const checks: Check[] = [];
  const check = (name: string, pass: boolean, detail: string) => {
    checks.push({ name, pass, detail });
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}  — ${detail}`);
  };
  const ref = JSON.parse(readFileSync("docs/proof/stage3/reference-stats.json", "utf8")) as LookStats;
  const fmt = (s: LookStats) => `luma ${s.meanLuma.toFixed(3)} dark ${(s.darkFrac * 100).toFixed(0)}% neon ${(s.neonFrac * 100).toFixed(1)}% cy ${(s.hue.cyan * 100).toFixed(0)}% mg ${(s.hue.magenta * 100).toFixed(0)}% ye ${(s.hue.yellow * 100).toFixed(0)}% red ${(s.hue.red * 100).toFixed(1)}%`;

  const host = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "server/node-host.ts", String(HOST_PORT)], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(host, /listening/, "node host");
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(VITE_PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(vite, /127\.0\.0\.1/, "vite");
  const browser = await chromium.launch({ args: ARGS });
  const results: Record<string, unknown> = {};
  try {
    const helper = await browser.newPage({ viewport: { width: 320, height: 180 } });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    for (const spec of DISTRICT_SPECS) {
      const id = spec.id;
      const L = levelById(id);
      const nav = buildNav(L);
      await page.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&ai=0&level=${id}`, { waitUntil: "load" });
      await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 60000, polling: 100 });
      const st0 = await page.evaluate(() => ({ level: window.__game.state().level, zone: document.querySelector("#hud .status .dim")?.textContent ?? "", boxes: window.__game.game.world.level.boxes.length, wasps: window.__game.game.world.wasps.length, mechs: window.__game.game.world.mechs.length, district: window.__game.state().render.district }));
      check(`${id}: loads as ${spec.displayName} with the ${spec.cast} cast`, st0.level === id && st0.zone.includes(spec.displayName) && st0.district === spec.cast, `${st0.boxes} boxes · ${st0.wasps} wasps · ${st0.mechs} mechs · HUD "${st0.zone}"`);

      // shot 1: spawn, looking up the street
      const shots: Record<string, LookStats> = {};
      const capture = async (name: string) => {
        await page.waitForTimeout(300);
        const png = await page.screenshot({ path: `${OUT}/stage9-${id}-${name}.png` });
        const s = await statsOf(helper, png);
        shots[name] = s;
        console.log(`shot ${id}/${name}: ${fmt(s)}`);
        return s;
      };
      await page.evaluate(() => {
        window.__game.setBot([{ kind: "look", yaw: 0, pitch: -0.02, ticks: 5 }, { kind: "hold", ticks: 30 }]);
        window.__game.advance(30);
      });
      await capture("street");

      // route along the streets: spawn → node B (an intersection), then hold to flip it
      const nodeB = L.nodes[1]!;
      const path = findPath(nav, L.spawns[0]!.pos, nodeB.pos)!;
      const plan: BotStep[] = path.slice(1).map((p, i, arr) => ({ kind: "goto", x: p.x, z: p.z, sprint: true, radius: i === arr.length - 1 ? 1.2 : 1.6, timeoutTicks: 900, stop: i === arr.length - 1 }));
      plan.push({ kind: "hold", ticks: 60 * 6 });
      await page.evaluate((p) => window.__game.setBot(p), plan);
      let done = false;
      for (let i = 0; i < 90 && !done; i++) {
        await page.evaluate(() => window.__game.advance(20));
        done = (await page.evaluate(() => window.__game.botStatus()))?.done ?? false;
      }
      const after = await page.evaluate(() => {
        const s = window.__game.state();
        return { pos: s.pos, node: s.wake!.nodes[1]!, bot: window.__game.botStatus(), stats: s.stats };
      });
      const dist = Math.hypot(after.pos.x - nodeB.pos.x, after.pos.z - nodeB.pos.z);
      check(`${id}: a Blank sprints the streets spawn → node B along nav waypoints (${path.length} legs) and flips it`, dist < 3 && after.node.owner === 1, `ended ${dist.toFixed(1)} m from B · owner ${after.node.owner} hold ${after.node.hold.toFixed(2)} · ${after.stats.topSpeed.toFixed(1)} m/s top`);
      // step back down the street (node B sits under the walkway) and look at the flipped node
      const back = spec.walkway === "x" ? { x: nodeB.pos.x, z: nodeB.pos.z + 8 } : { x: nodeB.pos.x + 8, z: nodeB.pos.z };
      await page.evaluate((b) => window.__game.setBot([{ kind: "goto", x: b.x, z: b.z, sprint: false, radius: 0.8, timeoutTicks: 400, stop: true }, { kind: "look", yaw: b.yaw, pitch: 0.04, ticks: 8 }, { kind: "hold", ticks: 10 }]), { ...back, yaw: spec.walkway === "x" ? 0 : Math.PI / 2 });
      for (let i = 0; i < 30; i++) {
        await page.evaluate(() => window.__game.advance(20));
        if ((await page.evaluate(() => window.__game.botStatus()))?.done) break;
      }
      await capture("node");

      // the walkway, by its stairs (steps only): routed on a nav that treats the walkway as ground
      const navHi = buildNav(L, 0.5, 0.05, 6);
      const walk = L.boxes.find((b) => b.tag === "walkway")!;
      const top = { x: (walk.min.x + walk.max.x) / 2, y: walk.max.y, z: (walk.min.z + walk.max.z) / 2 };
      const up = findPath(navHi, { x: back.x, y: 0, z: back.z }, top)!;
      const climb: BotStep[] = up.slice(1).map((p, i, arr) => ({ kind: "goto", x: p.x, z: p.z, sprint: p.y < 0.5, radius: i === arr.length - 1 ? 1.5 : 1.0, timeoutTicks: 700, stop: i === arr.length - 1 }));
      await page.evaluate((p) => window.__game.setBot(p), climb);
      done = false;
      for (let i = 0; i < 120 && !done; i++) {
        await page.evaluate(() => window.__game.advance(20));
        done = (await page.evaluate(() => window.__game.botStatus()))?.done ?? false;
      }
      const onWalk = await page.evaluate(() => ({ pos: window.__game.state().pos, bot: window.__game.botStatus() }));
      check(`${id}: the Blank climbs the switchback stairs onto the walkway (${up.length} legs)`, onWalk.pos.y > 4.0, `y ${onWalk.pos.y.toFixed(2)} at (${onWalk.pos.x.toFixed(1)}, ${onWalk.pos.z.toFixed(1)}) · ${onWalk.bot?.log?.slice(-1)[0] ?? ""}`);
      await page.evaluate((yaw) => {
        const p = window.__game.game.player;
        window.__game.setBot([{ kind: "look", yaw, pitch: 0.02, ticks: 5 }, { kind: "hold", ticks: 20 }]);
        window.__game.advance(20);
        void p;
      }, spec.walkway === "x" ? -Math.PI / 2 : 0);
      await capture("walkway");
      // THE KERNEL on the horizon: look north (-z), slightly up
      await page.evaluate(() => {
        window.__game.setBot([{ kind: "look", yaw: 0, pitch: 0.18, ticks: 5 }, { kind: "hold", ticks: 20 }]);
        window.__game.advance(20);
      });
      const kernelShot = await capture("kernel");
      check(`${id}: THE KERNEL reads on the horizon (blood-red, fog-immune)`, kernelShot.hue.red >= 0.006, `red ${(kernelShot.hue.red * 100).toFixed(2)}% of neon pixels`);

      for (const [name, s] of Object.entries(shots)) {
        // green is the wake's colour: a shot of a flipped node counts it with the neon that carries the city
        const carry = s.hue.cyan + s.hue.magenta + (name === "node" ? s.hue.green : 0);
        const ok = s.darkFrac >= 0.4 && s.darkFrac <= 0.9 && s.meanLuma >= 0.05 && s.meanLuma <= 0.24 && s.neonFrac >= 0.008 && s.neonFrac <= 0.18 && carry >= 0.35;
        check(`${id}/${name}: reads like the clip (dark ${(ref.darkFrac * 100).toFixed(0)}% · luma ${ref.meanLuma.toFixed(2)} · neon ${(ref.neonFrac * 100).toFixed(1)}% · cy+mg ${((ref.hue.cyan + ref.hue.magenta) * 100).toFixed(0)}% ref)`, ok, `${fmt(s)}${name === "node" ? ` gr ${(s.hue.green * 100).toFixed(0)}%` : ""}`);
      }
      const perf = await page.evaluate(() => {
        const s = window.__game.state();
        return { calls: s.render.calls, tris: s.render.triangles, levelCalls: s.render.levelCalls };
      });
      check(`${id}: render budget — ≤ 180 draw calls/frame (mirror + scene + post), ≤ 200k triangles`, perf.calls <= 180 && perf.tris <= 200000, `${perf.calls} calls · ${perf.tris} triangles · ${perf.levelCalls} level batches`);
      results[id] = { shots, perf, route: path.length, climb: up.length, wasps: st0.wasps, mechs: st0.mechs, boxes: st0.boxes };
    }

    // sim rate under the city render (small viewport: SwiftShader is render-bound)
    await page.setViewportSize({ width: 480, height: 270 });
    await page.evaluate(() => window.__game.setBot(null));
    await page.evaluate(() => window.__game.setRealtime(true));
    await page.waitForTimeout(800);
    const t0 = await page.evaluate(() => ({ tick: window.__game.state().tick, now: performance.now() }));
    await page.waitForTimeout(2000);
    const t1 = await page.evaluate(() => ({ tick: window.__game.state().tick, now: performance.now(), loop: window.__game.state().loop }));
    const hz = (t1.tick - t0.tick) / ((t1.now - t0.now) / 1000);
    check("sim holds 60 Hz in the city under the full post chain", Math.abs(hz - 60) < 4, `${hz.toFixed(1)} ticks/s at ${t1.loop.fps.toFixed(1)} fps (SwiftShader, 480x270)`);

    // district select panel
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => window.__game.setRealtime(false));
    await page.keyboard.press("KeyM");
    await page.waitForTimeout(300);
    const rows = await page.evaluate(() => [...document.querySelectorAll("#hud .travel .row")].map((r) => r.textContent?.trim() ?? ""));
    await page.screenshot({ path: `${OUT}/stage9-map.png` });
    check("MAP tab lists the range, the three districts of Neo-China and the Deadletter Office", rows.length === 5 && rows.some((r) => /LEASE ROW/.test(r)) && rows.some((r) => /DEADLETTER DOCKS/.test(r)) && rows.some((r) => /REPO DEPOT/.test(r)) && rows.some((r) => /DEADLETTER OFFICE/.test(r)), rows.join(" | "));
    check("no page errors across three districts", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean console");
    await page.close();

    // ---------------- online: the room decides the district ----------------
    const room = `city?ai=0&level=deadletter_docks`;
    const open = async (name: string, level: string): Promise<Page> => {
      const pg = await browser.newPage({ viewport: { width: 480, height: 270 } });
      await pg.goto(`http://127.0.0.1:${VITE_PORT}/?norender=1&level=${level}&net=ws://127.0.0.1:${HOST_PORT}/room/${encodeURIComponent(room)}&name=${name}`, { waitUntil: "load" });
      await pg.waitForFunction(() => window.__game?.ready === true && window.__game.net()?.status === "joined" && window.__game.net()?.synced === true && !new URLSearchParams(location.search).has("token"), null, { timeout: 40000, polling: 100 });
      return pg;
    };
    const a = await open("ALPHA", "deadletter_docks");
    const sa = await a.evaluate(() => ({ level: window.__game.state().level, net: window.__game.net()!.status }));
    const stats = (await (await fetch(`http://127.0.0.1:${HOST_PORT}/stats`)).json()) as { rooms: Record<string, { level: string; players: number }> };
    check("online: a room built with ?level= plays that district", stats.rooms["city"]?.level === "deadletter_docks" && sa.level === "deadletter_docks", `room level ${stats.rooms["city"]?.level} · ALPHA client level ${sa.level}`);
    // BRAVO arrives for Lease Row: the Welcome names the docks, so the client travels there and rejoins by token
    const b = await browser.newPage({ viewport: { width: 480, height: 270 } });
    await b.goto(`http://127.0.0.1:${VITE_PORT}/?norender=1&level=lease_row&net=ws://127.0.0.1:${HOST_PORT}/room/${encodeURIComponent(room)}&name=BRAVO`, { waitUntil: "load" });
    await b.waitForFunction(() => window.__game?.ready === true && new URLSearchParams(location.search).get("level") === "deadletter_docks" && window.__game.net()?.status === "joined" && window.__game.net()?.synced === true, null, { timeout: 40000, polling: 100 });
    const sb = await b.evaluate(() => ({ level: window.__game.state().level, url: location.search, id: window.__game.net()!.playerId }));
    const stats2 = (await (await fetch(`http://127.0.0.1:${HOST_PORT}/stats`)).json()) as { rooms: Record<string, { level: string; players: number; connected: number }> };
    check("online: a client that arrives for the wrong district travels to the room's and rejoins", sb.level === "deadletter_docks" && /token=/.test(sb.url) && stats2.rooms["city"]!.players === 2, `BRAVO now in ${sb.level} as file #${sb.id} · room players ${stats2.rooms["city"]!.players} (${stats2.rooms["city"]!.connected} connected)`);
    await a.close();
    await b.close();

    writeFileSync(`${OUT}/stage9.json`, JSON.stringify({ results, simHz: hz, checks }, null, 2));
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
