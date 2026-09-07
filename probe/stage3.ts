/**
 * Stage 3 look probe: renders the dressed city from three vantage points and
 * measures each frame against statistics extracted from the reference clip
 * (docs/proof/stage3/reference-stats.json): near-black base, neon share, and
 * cyan/magenta dominance. Also asserts the post chain is active and the sim
 * still holds 60 Hz under the heavier render.
 *
 *   npm run probe:look
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { shot } from "./shot";
import type { BotStep } from "../client/bot";
import { computeLookStatsSource, type LookStats } from "./look-metrics";

const PORT = 5181;
const URL = `http://127.0.0.1:${PORT}/?headless=1&ai=0&level=drainage_yard`;
const OUT = "probe/out";

function startVite(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
    let ready = false;
    const onData = (d: Buffer) => {
      if (!ready && /127\.0\.0\.1/.test(d.toString())) {
        ready = true;
        resolve(child);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code) => !ready && reject(new Error(`vite exited early (${code})`)));
    setTimeout(() => !ready && reject(new Error("vite did not start")), 30000);
  });
}

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

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
  const ref = JSON.parse(readFileSync("docs/proof/stage3/reference-stats.json", "utf8")) as LookStats & { frames: number };
  const vite = await startVite();
  const browser = await chromium.launch({
    args: ["--no-proxy-server", "--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
  });
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
  const fmt = (s: LookStats) =>
    `luma ${s.meanLuma.toFixed(3)} dark ${(s.darkFrac * 100).toFixed(0)}% neon ${(s.neonFrac * 100).toFixed(1)}% cy ${(s.hue.cyan * 100).toFixed(0)}% mg ${(s.hue.magenta * 100).toFixed(0)}% ye ${(s.hue.yellow * 100).toFixed(0)}% gr ${(s.hue.green * 100).toFixed(0)}%`;
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(URL, { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 30000, polling: 100 });
    const helper = await browser.newPage({ viewport: { width: 320, height: 180 } });

    const shots: Record<string, LookStats> = {};
    const capture = async (name: string) => {
      await page.waitForTimeout(250);
      const png = await shotCheck(page, `stage3-${name}.png`);
      const s = await statsOf(helper, png);
      shots[name] = s;
      console.log(`shot ${name}: ${fmt(s)}`);
      return s;
    };

    // Vantage 1: spawn, looking down the lane through the light gantry.
    await page.evaluate(() => window.__game.setBot([{ kind: "hold", ticks: 40 }]));
    await page.evaluate(() => window.__game.advance(40));
    await capture("lane");

    // Vantage 2: the deck after the Stage 1 run, facing the east arena.
    const plan: BotStep[] = [
      { kind: "goto", x: 0, z: 16, sprint: true },
      { kind: "slide", ticks: 30, jumpAt: 18 },
      { kind: "goto", x: 0, z: 1.5, sprint: true, radius: 0.8 },
      { kind: "mantle", x: 0, z: -3 },
      { kind: "goto", x: 0, z: -5, sprint: false, radius: 0.5 },
      { kind: "look", yaw: -1.8, pitch: -0.06, ticks: 24 },
    ];
    await page.evaluate((p) => window.__game.setBot(p), plan);
    for (let i = 0; i < 40; i++) {
      await page.evaluate(() => window.__game.advance(30));
      const st = await page.evaluate(() => window.__game.botStatus());
      if (st?.done) break;
    }
    await capture("arena");

    // Vantage 3: from the deck, turn to the west block and the skyline behind it.
    await page.evaluate(() => window.__game.setBot([{ kind: "look", yaw: 1.35, pitch: 0.12, ticks: 30 }]));
    await page.evaluate(() => window.__game.advance(30));
    await capture("skyline");

    const state = await page.evaluate(() => window.__game.state());
    check("post chain active at reduced internal resolution", state.render.post && state.render.internalScale <= 0.75, `post=${state.render.post} scale=${state.render.internalScale}`);
    for (const [name, s] of Object.entries(shots)) {
      check(`${name}: near-black base like the clip (dark ${(ref.darkFrac * 100).toFixed(0)}% ref)`, s.darkFrac >= 0.4 && s.darkFrac <= 0.88, `dark ${(s.darkFrac * 100).toFixed(0)}%`);
      check(`${name}: mean luma in the clip's band (ref ${ref.meanLuma.toFixed(3)})`, s.meanLuma >= 0.06 && s.meanLuma <= 0.24, `luma ${s.meanLuma.toFixed(3)}`);
      check(`${name}: neon coverage in the clip's band (ref ${(ref.neonFrac * 100).toFixed(1)}%)`, s.neonFrac >= 0.008 && s.neonFrac <= 0.16, `neon ${(s.neonFrac * 100).toFixed(1)}%`);
      check(`${name}: cyan + magenta dominate the neon (ref ${((ref.hue.cyan + ref.hue.magenta) * 100).toFixed(0)}%)`, s.hue.cyan + s.hue.magenta >= 0.4, `cy+mg ${((s.hue.cyan + s.hue.magenta) * 100).toFixed(0)}%`);
    }

    // Sim rate under the heavier render (small viewport: SwiftShader is render-bound)
    await page.setViewportSize({ width: 480, height: 270 });
    await page.evaluate(() => window.__game.setBot(null));
    await page.evaluate(() => window.__game.setRealtime(true));
    await page.waitForTimeout(800);
    const t0 = await page.evaluate(() => ({ tick: window.__game.state().tick, now: performance.now() }));
    await page.waitForTimeout(2000);
    const t1 = await page.evaluate(() => ({ tick: window.__game.state().tick, now: performance.now(), loop: window.__game.state().loop }));
    const hz = (t1.tick - t0.tick) / ((t1.now - t0.now) / 1000);
    check("sim holds 60 Hz under the full post chain", Math.abs(hz - 60) < 4, `${hz.toFixed(1)} ticks/s at ${t1.loop.fps.toFixed(1)} fps (SwiftShader, 480x270)`);
    check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean console");

    writeFileSync(`${OUT}/stage3.json`, JSON.stringify({ reference: { meanLuma: ref.meanLuma, darkFrac: ref.darkFrac, neonFrac: ref.neonFrac, hue: ref.hue }, shots, checks, simHz: hz, renderFps: t1.loop.fps }, null, 2));
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
