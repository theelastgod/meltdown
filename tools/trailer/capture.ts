/**
 * Record real gameplay out of the running game (Stage 639).
 *
 *   npx tsx tools/trailer/capture.ts        # writes JPEG frame sequences under probe/out/capture
 *
 * A trailer cut only from generated footage would be a picture of a game that does not exist. This
 * records the one that does: it boots the real client on the real levels, drives it with the same
 * bot plans the probes use, and writes what the renderer actually drew.
 *
 * CDP screencast rather than repeated `page.screenshot()`. A screenshot forces a fresh raster per
 * call and cannot keep up with a moving camera; the screencast stream hands over the frames the
 * compositor already produced. The sim is advanced in lockstep between frames, so the motion is the
 * game's own rather than an artefact of how fast the harness happened to be running — the same
 * reason the probes drive `advance()` instead of sleeping.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";

const VITE_PORT = 5253;
const OUT = process.env["CAPTURE_OUT"] ?? "probe/out/capture";
const ARGS = ["--no-proxy-server", "--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--hide-scrollbars"];

interface Shot {
  name: string;
  level: string;
  /** query extras */
  q?: string;
  bot: unknown[];
  /** sim ticks to burn before recording starts */
  warm: number;
  /** how many recorded frames */
  frames: number;
  /** sim ticks advanced per recorded frame */
  step: number;
  hud: boolean;
}

const SHOTS: Shot[] = [
  { name: "run_street", level: "lease_row", bot: [{ kind: "look", yaw: 1.1, pitch: -0.02, ticks: 8 }, { kind: "goto", x: 28, z: 10, sprint: true, radius: 1.2, timeoutTicks: 900 }], warm: 40, frames: 150, step: 2, hud: true },
  { name: "fight", level: "drainage_yard", q: "&ai=1", bot: [{ kind: "look", yaw: 0.2, pitch: 0, ticks: 8 }, { kind: "strafe", ticks: 200, period: 40, sprint: false }], warm: 30, frames: 150, step: 2, hud: true },
  { name: "slide", level: "lease_row", bot: [{ kind: "look", yaw: 0.9, pitch: 0, ticks: 6 }, { kind: "goto", x: 16, z: 16, sprint: true, radius: 1.5, timeoutTicks: 400 }, { kind: "slide", ticks: 70, jumpAt: 40 }], warm: 30, frames: 130, step: 2, hud: true },
  { name: "wake", level: "drainage_yard", q: "&wake=1&ai=1", bot: [{ kind: "look", yaw: -0.6, pitch: -0.08, ticks: 8 }, { kind: "goto", x: 0, z: -14, sprint: true, radius: 2, timeoutTicks: 700 }], warm: 40, frames: 140, step: 2, hud: true },
  { name: "city_vista", level: "lease_row", bot: [{ kind: "look", yaw: 0.35, pitch: -0.22, ticks: 10 }, { kind: "hold", ticks: 600 }], warm: 60, frames: 120, step: 1, hud: false },
  { name: "docks", level: "deadletter_docks", bot: [{ kind: "look", yaw: 1.6, pitch: -0.06, ticks: 8 }, { kind: "goto", x: 10, z: -18, sprint: true, radius: 1.5, timeoutTicks: 800 }], warm: 40, frames: 140, step: 2, hud: true },
];

function waitFor(c: ChildProcess, re: RegExp): Promise<void> {
  return new Promise((res, rej) => {
    let ok = false;
    const on = (d: Buffer) => { if (!ok && re.test(d.toString())) { ok = true; res(); } };
    c.stdout?.on("data", on);
    c.stderr?.on("data", on);
    setTimeout(() => !ok && rej(new Error("vite did not start")), 60000);
  });
}

async function capture(browser: import("playwright").Browser, s: Shot): Promise<number> {
  const dir = `${OUT}/${s.name}`;
  mkdirSync(dir, { recursive: true });
  const pg: Page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await pg.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&crawl=0&level=${s.level}${s.q ?? ""}`, { waitUntil: "load" });
  await pg.waitForFunction(() => window.__game?.ready === true, null, { timeout: 120000, polling: 100 });
  if (!s.hud) await pg.evaluate(() => { const h = document.getElementById("hud"); if (h) h.style.display = "none"; });
  await pg.evaluate(() => window.__game.setRealtime(false));
  await pg.evaluate((b) => window.__game.setBot(b as never), s.bot);
  await pg.evaluate((n) => window.__game.advance(n as number), s.warm);

  const cdp = await pg.context().newCDPSession(pg);
  let n = 0;
  cdp.on("Page.screencastFrame", (ev: { data: string; sessionId: number }) => {
    writeFileSync(`${dir}/f${String(n).padStart(4, "0")}.jpg`, Buffer.from(ev.data, "base64"));
    n++;
    void cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => undefined);
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
  for (let i = 0; i < s.frames; i++) {
    await pg.evaluate((k) => window.__game.advance(k as number), s.step);
    await pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
  await cdp.send("Page.stopScreencast");
  await pg.waitForTimeout(400);
  await pg.close();
  return n;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(VITE_PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(vite, /127\.0\.0\.1/);
  const browser = await chromium.launch({ args: ARGS });
  try {
    for (const s of SHOTS) {
      const n = await capture(browser, s);
      console.log(`${s.name}: ${n} frames`);
    }
  } finally {
    await browser.close();
    vite.kill("SIGTERM");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
