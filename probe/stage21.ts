/**
 * Stage 21 probe — the frame budget.
 *
 * The draw-call and triangle budgets have been checked since Stage 9. Two things never were, and
 * they are the ones that make a browser game hitch rather than merely render:
 *
 *  1. **GPU resources over time.** `renderer.info.memory.geometries` counts what three.js is
 *     holding. It must be flat while the game runs — a number that climbs is a leak, and one that
 *     climbs *while firing* is a per-shot leak. It used to: every world hit made a `SphereGeometry`
 *     that was removed from the scene and never disposed.
 *  2. **Frame-time distribution.** A mean fps hides the thing players feel. The p99 and the worst
 *     frame in a window are what a hitch looks like from the inside.
 *
 * Software GL makes absolute GPU timings meaningless here, so the budget is on what is
 * platform-independent: resource counts, draw calls, triangles, and the *ratio* of the worst frame
 * to the median, which is a hitch whatever the renderer.
 *
 *   npm run probe:frame
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";

const PORT = 5191;
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
  pass: boolean;
  label: string;
  detail: string;
}
const checks: Check[] = [];
const check = (label: string, pass: boolean, detail: string) => {
  checks.push({ pass, label, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}  — ${detail}`);
};

type Render = { calls: number; triangles: number; geometries: number; textures: number; programs: number; tracers: number };
const render = (pg: Page): Promise<Render> => pg.evaluate(() => window.__game.state().render);

/**
 * Frame-to-frame deltas over a window, as percentiles. A hitch is the tail, not the mean.
 *
 * Written without a named inner function on purpose: tsx compiles this file with `--keep-names`,
 * which rewrites function declarations to call a `__name` helper that does not exist inside the
 * page.
 */
async function frames(pg: Page, ms: number) {
  const d = await pg.evaluate(async (win) => {
    const out: number[] = [];
    let last = performance.now();
    const t0 = last;
    while (performance.now() - t0 < win) {
      await new Promise((r) => requestAnimationFrame(r));
      const n = performance.now();
      out.push(n - last);
      last = n;
    }
    return { deltas: out, seconds: (performance.now() - t0) / 1000 };
  }, ms);
  const sorted = [...d.deltas].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  return { n: d.deltas.length, seconds: d.seconds, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted[sorted.length - 1] ?? 0 };
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const vite = await startVite();
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader"] });
  const report: Record<string, unknown> = {};
  try {
    const errors: string[] = [];
    const pg = await browser.newPage({ viewport: { width: 640, height: 360 } });
    pg.on("pageerror", (e) => errors.push(String(e.message)));
    // no bots: a VANTAGE that walks into view registers a body and its own name-tag texture, which
    // would be counted as growth by a check that is about tracers and sparks
    await pg.goto(`http://127.0.0.1:${PORT}/?headless=1&nonav=1&crawl=0&ai=0&level=drainage_yard&account=sandbox-frame`, { waitUntil: "load" });
    await pg.waitForFunction(() => window.__game?.ready === true, null, { timeout: 40000, polling: 100 });
    await pg.evaluate(() => window.__game.setRealtime(true));
    await pg.waitForTimeout(2500); // the city spins up: crowds, tram, signage, rain

    // Point the camera where the test will happen and leave it there.
    await pg.evaluate(() => window.__game.setBot([{ kind: "look", yaw: 0.6, pitch: 0, ticks: 4 }, { kind: "hold", ticks: 60_000 }]));
    await pg.waitForTimeout(3000);

    // ---- 1. what the idle scene drifts by, which is the baseline the fire test is measured against ----
    //
    // `info.memory.geometries` counts what the renderer has *initialised*, not what exists, so it
    // rises whenever geometry first enters the frustum. In a living city — crowds walking, a tram
    // crossing, signs animating — that never fully stops, and on software GL at two frames a second
    // it is slow. Two earlier versions of this check asserted the count was flat and were simply
    // wrong about what the number means: turning the camera moves it, and so does a pedestrian.
    //
    // So the yard is used rather than a district, and idle drift is measured rather than assumed to
    // be zero. It is the control for check 2.
    const idle0 = await render(pg);
    await pg.waitForTimeout(6000);
    const idle1 = await render(pg);
    const drift = idle1.geometries - idle0.geometries;
    check("idle: the scene drifts by only a handful of registrations, not a stream of them", drift <= 6, `geometries ${idle0.geometries} → ${idle1.geometries} (+${drift} over 6s) · textures ${idle1.textures} · programs ${idle1.programs}`);

    // ---- 2. firing adds nothing per shot, which is exactly what the leak was ----
    //
    // The defect was per shot: every world hit made a `SphereGeometry` that was removed from the
    // scene and never disposed, so N shots left N geometries behind. The signal is therefore the
    // *rate*, not the absolute delta — the idle drift above happens either way. Pre-fix this would
    // have been about 1.0 per shot; the pools make it indistinguishable from doing nothing.
    const fire0 = await render(pg);
    await pg.evaluate(() => window.__game.setBot([{ kind: "fire", ticks: 60 * 12 }]));
    const during = await frames(pg, 6000);
    await pg.waitForTimeout(6000);
    const fire1 = await render(pg);
    const shots = (await pg.evaluate(() => window.__game.state().stats)) as { shots: number };
    const perShot = shots.shots > 0 ? (fire1.geometries - fire0.geometries) / shots.shots : 1;
    check("sustained fire creates nothing per shot: the tracers and sparks come from fixed pools", shots.shots >= 20 && perShot < 0.1 && fire1.textures === fire0.textures, `${shots.shots} shots · geometries ${fire0.geometries} → ${fire1.geometries} (${perShot.toFixed(3)} per shot, was ~1.0) · textures ${fire0.textures} → ${fire1.textures} · ${fire1.tracers} effects live`);

    // ---- 3. and the effects do not cost a draw call each ----
    // Pre-fix every live tracer and spark was its own `Line` or `Mesh`: one draw call apiece. Now
    // the whole pool is one call, hidden entirely when nothing is in flight.
    const callsAdded = fire1.calls - fire0.calls;
    check("the effects cost two draw calls in total, not one each", callsAdded <= 4, `${fire0.calls} → ${fire1.calls} calls (+${callsAdded}) with ${fire1.tracers} effects live · ${(fire1.triangles / 1000).toFixed(0)}k triangles`);

    // ---- 4. the frame-time tail, which is what a hitch actually is ----
    await pg.evaluate(() => window.__game.setBot([{ kind: "hold", ticks: 60_000 }]));
    const calm = await frames(pg, 5000);
    // software GL is slow in absolute terms, so the budget is on the shape: the worst frame in a
    // window must not be a multiple of the median, which is what a GC pause or a rebuild looks like
    const ratioCalm = calm.max / Math.max(0.001, calm.p50);
    const ratioFire = during.max / Math.max(0.001, during.p50);
    check("no hitch while idle: the worst frame in five seconds is within 4× the median", ratioCalm < 4, `p50 ${calm.p50.toFixed(1)} p95 ${calm.p95.toFixed(1)} p99 ${calm.p99.toFixed(1)} max ${calm.max.toFixed(0)} ms · ${ratioCalm.toFixed(1)}× · ${(calm.n / calm.seconds).toFixed(1)} fps on software GL`);
    check("nor under sustained fire, which is the frame that used to allocate", ratioFire < 4, `p50 ${during.p50.toFixed(1)} p95 ${during.p95.toFixed(1)} p99 ${during.p99.toFixed(1)} max ${during.max.toFixed(0)} ms · ${ratioFire.toFixed(1)}×`);

    check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean console");
    report.idle = { before: idle0, after: idle1 };
    report.fire = { before: fire0, after: fire1, shots: shots.shots };
    report.frames = { calm, during };
    await pg.screenshot({ path: `${OUT}/stage21-frame.png` });
    await pg.close();
  } finally {
    await browser.close();
    vite.kill();
  }
  writeFileSync(`${OUT}/stage21.json`, JSON.stringify({ report, checks }, null, 2));
  const failed = checks.filter((c) => !c.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
