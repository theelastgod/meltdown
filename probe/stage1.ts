/**
 * Stage 1 headless probe: boots the dev server, drives a bot through the
 * grey-box (sprint → slide → slide-jump → mantle), kills a dummy with the
 * Lease-Breaker, and asserts the acceptance criteria. Writes a screenshot
 * and a JSON report to probe/out/.
 *
 *   npm run probe
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import type { BotStep } from "../client/bot";

const PORT = 5179;
const URL = `http://127.0.0.1:${PORT}/`;
const OUT = "probe/out";

function startVite(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let ready = false;
    const onData = (d: Buffer) => {
      const s = d.toString();
      if (!ready && /localhost|127\.0\.0\.1/.test(s)) {
        ready = true;
        resolve(child);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code) => {
      if (!ready) reject(new Error(`vite exited early (${code})`));
    });
    setTimeout(() => !ready && reject(new Error("vite did not start in 30s")), 30000);
  });
}

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const vite = await startVite();
  const browser = await chromium.launch({
    args: ["--no-proxy-server", "--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
  });
  const checks: Check[] = [];
  const check = (name: string, pass: boolean, detail: string) => {
    checks.push({ name, pass, detail });
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}  — ${detail}`);
  };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(URL + "?headless=1&ai=0&level=drainage_yard", { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 30000, polling: 100 });
    await page.evaluate(() => window.__game.resumeAudio());

    // --- 1. Deterministic bot path: sprint → slide → slide-jump → mantle → kill ---
    const plan: BotStep[] = [
      { kind: "hold", ticks: 20 },
      { kind: "goto", x: 0, z: 16, sprint: true }, // sprint down the lane, over the curb at z=12
      { kind: "slide", ticks: 30, jumpAt: 18 }, // slide across the lane, slide-jump out of it
      { kind: "goto", x: 0, z: 1.5, sprint: true, radius: 0.8 }, // approach the 1.2 m deck at z=-2
      { kind: "mantle", x: 0, z: -3 }, // pull up onto the deck
      { kind: "goto", x: 0, z: -5, sprint: false, radius: 0.5 },
      { kind: "kill", dummyId: 1, zone: "body", timeoutTicks: 400 }, // dummy 1 on the upper deck
      { kind: "look", yaw: -1.8, pitch: -0.06, ticks: 24 }, // turn to face the east arena for the proof frame
    ];
    await page.evaluate(() => window.__game.clearEvents());
    await page.evaluate((p) => window.__game.setBot(p), plan);
    const CHUNK = 30;
    let ticksRun = 0;
    let actionShot = false;
    for (let i = 0; i < 80; i++) {
      await page.evaluate((n) => window.__game.advance(n), CHUNK);
      ticksRun += CHUNK;
      await page.waitForTimeout(16); // let a frame render between chunks
      const st = await page.evaluate(() => window.__game.botStatus());
      if (!actionShot && st?.current?.kind === "kill" && (await page.evaluate(() => window.__game.state().stats.shots)) > 0) {
        // mid-fight frame: tracer, dummy flash, HUD ammo ticking down
        await page.evaluate((n) => window.__game.advance(n), 2);
        ticksRun += 2;
        await page.waitForTimeout(60);
        await page.screenshot({ path: `${OUT}/stage1-action.png` });
        actionShot = true;
      }
      if (st?.done) break;
    }
    const status = await page.evaluate(() => window.__game.botStatus());
    const state = await page.evaluate(() => window.__game.state());
    const events = await page.evaluate(() => window.__game.events());
    console.log("bot log:\n  " + (status?.log ?? []).join("\n  "));

    check("bot completed the plan without timeouts", !!status?.done && !(status?.log ?? []).some((l: string) => l.includes("TIMEOUT")), `${status?.log.length} steps in ${ticksRun} ticks`);
    check("slide + slide-jump performed", state.stats.slides >= 1 && state.stats.slideJumps >= 1, `slides=${state.stats.slides} slideJumps=${state.stats.slideJumps} topSpeed=${state.stats.topSpeed.toFixed(2)} m/s`);
    check("momentum preserved: top speed above sprint speed, below the slide cap", state.stats.topSpeed > 7.2 + 1.0 && state.stats.topSpeed <= 10.5 + 0.01, `top ${state.stats.topSpeed.toFixed(2)} m/s vs sprint 7.20 / slide cap 10.50`);
    check("mantle performed onto the 1.2 m deck", state.stats.mantles >= 1 && state.pos.y > 1.1, `mantles=${state.stats.mantles} y=${state.pos.y.toFixed(2)}`);
    const kill = events.find((e) => e.type === "kill");
    check("bot killed dummy 1 with hitscan", !!kill && state.stats.kills >= 1, kill && kill.type === "kill" ? `victim ${kill.victimId} after ${kill.ttkTicks} ticks` : "no kill event");
    check("TTK inside the 0.6–1.0 s band", !!kill && kill.type === "kill" && kill.ttkSeconds >= 0.6 && kill.ttkSeconds <= 1.0, kill && kill.type === "kill" ? `${kill.ttkSeconds.toFixed(3)} s` : "n/a");
    const shots = events.filter((e) => e.type === "shot");
    const dummyHits = shots.filter((e) => e.type === "shot" && e.hit.kind === "dummy").length;
    check("tracers + zone-pitched hit audio fired for every hit", dummyHits > 0 && (state.audio["shot"] ?? 0) >= shots.length && (state.audio["hit_body"] ?? 0) + (state.audio["hit_head"] ?? 0) + (state.audio["hit_legs"] ?? 0) >= dummyHits, `shots=${shots.length} hits=${dummyHits} audio=${JSON.stringify(state.audio)}`);
    check("kill-confirm stamp audio fired", (state.audio["kill"] ?? 0) >= 1, `kill cues=${state.audio["kill"] ?? 0}`);

    // --- 2. Determinism: same plan on a fresh page, identical hash after the same tick count ---
    const page2 = await browser.newPage({ viewport: { width: 640, height: 360 } });
    await page2.goto(URL + "?headless=1&ai=0&norender=1&level=drainage_yard", { waitUntil: "load" });
    await page2.waitForFunction(() => window.__game?.ready === true, null, { timeout: 30000, polling: 100 });
    await page2.evaluate((p) => window.__game.setBot(p), plan);
    await page2.evaluate((n) => window.__game.advance(n), ticksRun);
    const h2 = await page2.evaluate(() => window.__game.state().hash);
    check("replaying the same input plan reproduces the same world hash", h2 === state.hash, `${state.hash} == ${h2}`);
    await page2.close();

    // --- Screenshot: bot on the deck, looking at the dummy ---
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${OUT}/stage1.png` });

    // --- 3. Real-time loop: fixed 60 Hz sim decoupled from render fps ---
    await page.setViewportSize({ width: 480, height: 270 });
    await page.evaluate(() => window.__game.setBot(null));
    await page.evaluate(() => window.__game.setRealtime(true));
    await page.waitForTimeout(600); // settle the fps window
    const t0 = await page.evaluate(() => ({ tick: window.__game.state().tick, now: performance.now() }));
    await page.waitForTimeout(2000);
    const t1 = await page.evaluate(() => ({ tick: window.__game.state().tick, now: performance.now(), loop: window.__game.state().loop }));
    const wall = (t1.now - t0.now) / 1000;
    const measuredHz = (t1.tick - t0.tick) / wall;
    check("fixed-timestep sim runs at 60 Hz independent of render fps", Math.abs(measuredHz - 60) < 3, `${measuredHz.toFixed(1)} ticks/s over ${wall.toFixed(2)}s while rendering at ${t1.loop.fps.toFixed(1)} fps`);
    check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean console");
    const report = { url: URL, ticksRun, measuredHz, renderFps: t1.loop.fps, state, botLog: status?.log, checks, kill };
    writeFileSync(`${OUT}/stage1.json`, JSON.stringify(report, null, 2));
    const failed = checks.filter((c) => !c.pass);
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed. Screenshot: ${OUT}/stage1.png`);
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
