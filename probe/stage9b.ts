/**
 * City-life probe — "the game needs to feel and be like it's in a city."
 *  Lease Row loads with a crowd on the sidewalks that walks, a monorail that
 *  crosses the walkway street (and whooshes overhead), gates that seal the
 *  street exits while the city continues beyond them as vistas, ad tickers
 *  that redraw, sign flicker driven by a time uniform, blinkers and an
 *  airship on the skyline, steam at the grates, and a soundscape: sirens
 *  across the district and VANTAGE PA lines that land in the HUD log. All of
 *  it render-only: the nav grid is unchanged and the sim keeps 60 Hz under
 *  the extra draw calls.
 *
 *   npm run probe:cityLife
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { levelById } from "../shared/sim/level";
import { CITY_HALF } from "../shared/sim/city";
import { buildNav, findPath, reachableFrom } from "../shared/sim/nav";
import { computeLookStatsSource, type LookStats } from "./look-metrics";

const VITE_PORT = 5197;
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
  const ref = JSON.parse(readFileSync("docs/proof/stage3/reference-stats.json", "utf8")) as LookStats;
  const fmt = (s: LookStats) => `luma ${s.meanLuma.toFixed(3)} dark ${(s.darkFrac * 100).toFixed(0)}% neon ${(s.neonFrac * 100).toFixed(1)}% cy ${(s.hue.cyan * 100).toFixed(0)}% mg ${(s.hue.magenta * 100).toFixed(0)}%`;

  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(VITE_PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(vite, /127\.0\.0\.1/, "vite");
  const browser = await chromium.launch({ args: ARGS });
  const results: Record<string, unknown> = {};
  try {
    const helper = await browser.newPage({ viewport: { width: 320, height: 180 } });
    const statsOf = async (png: Buffer): Promise<LookStats> =>
      helper.evaluate(
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    const id = "lease_row";
    const L = levelById(id);
    const H = CITY_HALF;
    await page.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&ai=0&level=${id}`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 60000, polling: 100 });
    await page.evaluate(() => window.__game.resumeAudio());
    const life0 = await page.evaluate(() => window.__game.state().life);
    check("Lease Row has a crowd on its sidewalks, a monorail, steam at the grates, ad panels, blinkers on the skyline, and sign flicker", life0.crowd >= 40 && life0.tram !== null && life0.steam && life0.ads >= 3 && life0.blinkers >= 8 && life0.flicker, `${life0.crowd} citizens · ${life0.ads} ad panels · ${life0.blinkers} blinkers · tram at ${life0.tram?.toFixed(1)} · flicker ${life0.flicker}`);

    // --- the city moves while the sim stands still: crowd, tram, ads, airship advance on render time ---
    const capture = async (name: string) => {
      await page.waitForTimeout(250);
      const png = await page.screenshot({ path: `${OUT}/stage9b-${name}.png` });
      const s = await statsOf(png);
      console.log(`shot ${name}: ${fmt(s)}`);
      return s;
    };
    await page.evaluate(() => {
      window.__game.setBot([{ kind: "look", yaw: 0, pitch: -0.02, ticks: 5 }, { kind: "hold", ticks: 30 }]);
      window.__game.advance(30);
    });
    const shotStreet = await capture("street");
    const a0 = await page.evaluate(() => ({ life: window.__game.state().life, tick: window.__game.state().tick, now: performance.now(), frames: window.__game.state().render.frames }));
    await page.waitForTimeout(2500);
    const a1 = await page.evaluate(() => ({ life: window.__game.state().life, tick: window.__game.state().tick, now: performance.now(), frames: window.__game.state().render.frames }));
    const moved = a0.life.sample.map((p, i) => Math.hypot(p.x - a1.life.sample[i]!.x, p.z - a1.life.sample[i]!.z));
    const meanMove = moved.reduce((a, b) => a + b, 0) / moved.length;
    const secs = (a1.now - a0.now) / 1000;
    check("citizens walk the sidewalks (render time; the sim tick did not advance)", meanMove > 0.8 * secs && meanMove < 3 * secs && a1.tick === a0.tick, `mean ${meanMove.toFixed(2)} m over ${secs.toFixed(1)} s (${(meanMove / secs).toFixed(2)} m/s) · tick ${a0.tick} → ${a1.tick}`);
    check("the monorail car advances along its beam", Math.abs((a1.life.tram ?? 0) - (a0.life.tram ?? 0)) > 10 * secs * 0.8, `car ${a0.life.tram?.toFixed(1)} → ${a1.life.tram?.toFixed(1)} m in ${secs.toFixed(1)} s`);
    const frames = a1.frames - a0.frames;
    const redraws = a1.life.adRedraws - a0.life.adRedraws;
    check("ad tickers redraw at 12 Hz (every drawn frame when frames are slower) and the airship drifts", redraws >= Math.min(8 * secs, frames - 1) && Math.hypot(a1.life.ship.x - a0.life.ship.x, a1.life.ship.z - a0.life.ship.z) > 0.3, `${redraws} redraws over ${frames} drawn frames in ${secs.toFixed(1)} s · airship moved ${Math.hypot(a1.life.ship.x - a0.life.ship.x, a1.life.ship.z - a0.life.ship.z).toFixed(1)} m`);
    // citizens stay on the sidewalks: every sampled position lies on a walk loop's edge band
    const onWalk = a1.life.sample.every((p) => (L.walks ?? []).some((w) => (Math.abs(p.x - w.x0) < 1.2 || Math.abs(p.x - w.x1) < 1.2) && p.z > w.z0 - 1.2 && p.z < w.z1 + 1.2) || (L.walks ?? []).some((w) => (Math.abs(p.z - w.z0) < 1.2 || Math.abs(p.z - w.z1) < 1.2) && p.x > w.x0 - 1.2 && p.x < w.x1 + 1.2));
    check("citizens keep to the sidewalk loops (never in the road, never in the sim)", onWalk, a1.life.sample.map((p) => `(${p.x.toFixed(0)},${p.z.toFixed(0)})`).join(" "));

    // --- gates: the exits are sealed for play, open for the eye ---
    const gates = L.boxes.filter((b) => b.tag === "gate");
    const nav = buildNav(L);
    const reach = reachableFrom(nav, L.spawns[0]!.pos);
    const beyond = { x: 16.5, y: 0, z: -H - 6 };
    const noPath = findPath(nav, L.spawns[0]!.pos, beyond) === null;
    check("8 gates seal the street exits: no nav path leads beyond the facade line", gates.length === 8 && noPath && (L.exits?.length ?? 0) === 8, `${gates.length} gates · ${L.exits?.length} exits · ${reach.size} reachable cells · path beyond: ${noPath ? "none" : "FOUND"}`);
    const vistas = (L.decor ?? []).filter((d) => (d.tag ?? "").startsWith("vista_"));
    check("the city continues beyond every exit as a vista (road, receding buildings, lamps, traffic lanes)", vistas.length >= 8 * 6 && (L.traffic?.length ?? 0) >= 16, `${vistas.length} vista pieces · ${L.traffic?.length} traffic lanes`);
    // a Blank sprints at the north gate on the walkway street and is stopped by it
    await page.evaluate((H) => window.__game.setBot([{ kind: "goto", x: 16.5, z: -H + 14, sprint: true, radius: 1.2, timeoutTicks: 900, stop: true }, { kind: "look", yaw: 0, pitch: 0.02, ticks: 6 }, { kind: "goto", x: 16.5, z: -H - 4, sprint: true, radius: 0.6, timeoutTicks: 240, stop: true }]), H);
    for (let i = 0; i < 60; i++) {
      await page.evaluate(() => window.__game.advance(20));
      if ((await page.evaluate(() => window.__game.botStatus()))?.done) break;
    }
    const atGate = await page.evaluate(() => window.__game.state().pos);
    check("a Blank sprinting for the exit is held at the gate (inside the facade line)", atGate.z > -H - 0.6 && atGate.z < -H + 4 && Math.abs(atGate.x - 16.5) < 3, `stopped at (${atGate.x.toFixed(1)}, ${atGate.z.toFixed(1)}) · facade at z=${-H}`);
    await page.evaluate((H) => {
      window.__game.setBot([{ kind: "goto", x: 16.5, z: -H + 10, sprint: false, radius: 1.0, timeoutTicks: 400, stop: true }, { kind: "look", yaw: 0, pitch: 0.06, ticks: 6 }, { kind: "hold", ticks: 20 }]);
      for (let i = 0; i < 25; i++) window.__game.advance(20);
    }, H);
    const shotVista = await capture("vista");
    check("the vista through the gate reads like the clip (dark, neon-fractioned, cyan/magenta)", shotVista.darkFrac >= 0.4 && shotVista.meanLuma >= 0.05 && shotVista.meanLuma <= 0.24 && shotVista.neonFrac >= 0.008 && shotVista.hue.cyan + shotVista.hue.magenta >= 0.35, fmt(shotVista));

    // --- the monorail overhead: fast-forward the line until a car is about to come into earshot, then let a frame fire the cue ---
    await page.evaluate(() => window.__game.setBot([{ kind: "goto", x: 10, z: 16.5 + 5, sprint: true, radius: 1.2, timeoutTicks: 900, stop: true }, { kind: "look", yaw: Math.PI / 2, pitch: 0.35, ticks: 6 }, { kind: "hold", ticks: 10 }]));
    for (let i = 0; i < 60; i++) {
      await page.evaluate(() => window.__game.advance(20));
      if ((await page.evaluate(() => window.__game.botStatus()))?.done) break;
    }
    const tramBefore = await page.evaluate(() => window.__game.state().audio["tram"] ?? 0);
    const primed = await page.evaluate(() => {
      const g = window.__game.game;
      const tram = g.renderer.life.tram!;
      const eye = { x: g.player.pos.x, y: g.player.pos.y + 1.6, z: g.player.pos.z };
      // step the line forward until a car is far, then until it is just outside earshot (a frame later it is inside: the rising edge)
      let steps = 0;
      while (tram.distanceTo(eye) < 60 && steps++ < 4000) tram.update(0.05, eye as never);
      while (tram.distanceTo(eye) > 41.5 && steps++ < 8000) tram.update(0.05, eye as never);
      return { steps, dist: tram.distanceTo(eye), near: tram.near };
    });
    await page.waitForTimeout(700);
    const tramShot = await capture("monorail");
    const tramAfter = await page.evaluate(() => ({ audio: window.__game.state().audio["tram"] ?? 0, life: window.__game.state().life }));
    check("the monorail passes overhead and the whoosh fires once on the rising edge of earshot", tramAfter.audio === tramBefore + 1 && tramAfter.life.tramNear, `primed at ${primed.dist.toFixed(1)} m (${primed.steps} steps) · tram cues ${tramBefore} → ${tramAfter.audio} · now ${tramAfter.life.tramDist.toFixed(1)} m`);
    void tramShot;

    // --- the soundscape: sirens and PA lines on the sim clock, the PA copy lands in the HUD log ---
    const cue0 = await page.evaluate(() => ({ audio: { ...window.__game.state().audio }, pa: window.__game.state().life.pa.length }));
    await page.evaluate(() => {
      window.__game.setBot(null);
      window.__game.advance(60 * 75);
    });
    const cue1 = await page.evaluate(() => ({ audio: { ...window.__game.state().audio }, pa: window.__game.state().life.pa, log: document.querySelector("#hud .log")?.textContent ?? "" }));
    const sirens = (cue1.audio["siren"] ?? 0) - (cue0.audio["siren"] ?? 0);
    const pas = (cue1.audio["pa"] ?? 0) - (cue0.audio["pa"] ?? 0);
    check("sirens cross the district and the PA speaks on a sim-tick schedule (≥1 siren, ≥2 PA lines in 75 s)", sirens >= 1 && pas >= 2 && cue1.pa.length - cue0.pa >= 2, `${sirens} sirens · ${pas} PA cues · ${cue1.pa.length} lines spoken`);
    check("PA lines name the district and land in the HUD log", cue1.pa.every((l) => !/\{D\}/.test(l)) && cue1.pa.some((l) => l.includes("LEASE ROW")) && /VANTAGE PA/.test(cue1.log), `"${cue1.pa[cue1.pa.length - 1] ?? ""}"`);
    const bed = await page.evaluate(() => window.__game.game.audio.ready);
    check("the audio bed is running (rain, hum, neon buzz, traffic swell, crowd murmur)", bed, `audio context ${bed ? "running" : "not running"}`);

    // --- budget: the life adds instanced crowds, a tram, points, and panels but stays under the frame budget ---
    await page.evaluate(() => {
      window.__game.setBot([{ kind: "look", yaw: Math.PI / 4, pitch: 0.0, ticks: 5 }, { kind: "hold", ticks: 10 }]);
      window.__game.advance(15);
    });
    await page.waitForTimeout(300);
    const perf = await page.evaluate(() => {
      const s = window.__game.state();
      return { calls: s.render.calls, tris: s.render.triangles, levelCalls: s.render.levelCalls };
    });
    check("render budget with city life — ≤ 230 draw calls/frame, ≤ 260k triangles", perf.calls <= 230 && perf.tris <= 260000, `${perf.calls} calls · ${perf.tris} triangles · ${perf.levelCalls} level batches`);

    await page.setViewportSize({ width: 480, height: 270 });
    await page.evaluate(() => window.__game.setRealtime(true));
    await page.waitForTimeout(800);
    const t0 = await page.evaluate(() => ({ tick: window.__game.state().tick, now: performance.now() }));
    await page.waitForTimeout(2000);
    const t1 = await page.evaluate(() => ({ tick: window.__game.state().tick, now: performance.now(), loop: window.__game.state().loop }));
    const hz = (t1.tick - t0.tick) / ((t1.now - t0.now) / 1000);
    check("sim holds 60 Hz with the city alive around it", Math.abs(hz - 60) < 4, `${hz.toFixed(1)} ticks/s at ${t1.loop.fps.toFixed(1)} fps (SwiftShader, 480x270)`);
    await page.evaluate(() => window.__game.setRealtime(false));
    check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean console");

    results["lease_row"] = { life: life0, crowdSpeed: meanMove / secs, perf, simHz: hz, street: shotStreet, vista: shotVista, pa: cue1.pa, ref: { darkFrac: ref.darkFrac, meanLuma: ref.meanLuma } };
    writeFileSync(`${OUT}/stage9b.json`, JSON.stringify({ results, checks }, null, 2));
    const failed = checks.filter((c) => !c.pass);
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
    if (failed.length) process.exitCode = 1;
  } finally {
    await browser.close();
    vite.kill("SIGTERM");
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
