/**
 * Stage 12 probe — the opening, since Stage 691 a trailer shown once.
 *  A browser's first visit plays the trailer: the Higgsfield footage with the opening text's own
 *  lines typed over it, decoded at no more than thirty seconds, muted until a gesture (the first
 *  click brings its sound up and does not skip), ending on the MELTDOWN title, whose click hands
 *  the wake to the game. The second visit boots straight into the game. OPENING TRAILER EVERY
 *  VISIT brings it back, and SPACE skips it.
 *
 *   npm run probe:crawl
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { TRAILER_LINES } from "../client/crawl-text";
import { MAX_TRAILER_SECONDS, TRAILER } from "../shared/assets/video";
import { shot } from "./shot";

const VITE_PORT = 5207;
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
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(VITE_PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(vite, /127\.0\.0\.1/, "vite");
  const browser = await chromium.launch({ args: ARGS });
  const errors: string[] = [];
  const results: Record<string, unknown> = {};
  // one context: the second view must find the first view's "seen" flag in storage
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const newPage = async (tag: string): Promise<Page> => {
    const pg = await context.newPage();
    pg.on("pageerror", (e) => errors.push(`${tag}: ${String(e)}`));
    pg.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
    return pg;
  };
  try {
    const url = `http://127.0.0.1:${VITE_PORT}/?level=drainage_yard`;
    // ---------------- the first visit: the trailer plays ----------------
    const a = await newPage("first");
    await a.goto(url, { waitUntil: "load" });
    await a.waitForFunction(() => window.__game?.ready === true && window.__game.crawl()?.playing === true, null, { timeout: 40000, polling: 50 });
    const p0 = await a.evaluate(() => window.__game.crawl()!);
    await a.waitForTimeout(700);
    const p1 = await a.evaluate(() => window.__game.crawl()!);
    check(
      `a browser's first visit plays the trailer: /video/${TRAILER.file}, decoded by the browser at no more than ${MAX_TRAILER_SECONDS} s, advancing, muted until a gesture`,
      p0.active && p0.phase === "trailer" && p0.src.endsWith(`/video/${TRAILER.file}`) && p0.duration > 0 && p0.duration <= MAX_TRAILER_SECONDS && Math.abs(p0.duration - TRAILER.seconds) < 0.3 && p1.t > p0.t + 0.3 && p0.muted && !p0.seen,
      `src ${p0.src.split("/").pop()} · decoded ${p0.duration.toFixed(2)} s (declared ${TRAILER.seconds}) · t ${p0.t.toFixed(2)} → ${p1.t.toFixed(2)} · muted ${p0.muted} · seen before ${p0.seen}`,
    );
    // what is on screen while a line is up: footage, and the line typed over it in the terminal's cyan
    const line = TRAILER_LINES[2]!;
    await a.evaluate(() => window.__game.crawlPause(true));
    await a.evaluate((t) => window.__game.crawlSeek(t), (line.at + line.until) / 2);
    await a.waitForFunction(() => {
      const v = document.querySelector("#crawl video") as HTMLVideoElement | null;
      return !!v && !v.seeking && v.readyState >= 2;
    }, null, { timeout: 10000, polling: 50 });
    const frame = await a.evaluate(() => {
      const v = document.querySelector("#crawl video") as HTMLVideoElement;
      const c = document.createElement("canvas");
      c.width = 320;
      c.height = 180;
      const x = c.getContext("2d")!;
      x.drawImage(v, 0, 0, c.width, c.height);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let sum = 0, cyan = 0, lit = 0;
      for (let i = 0; i < d.length; i += 4) {
        const y = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
        sum += y;
        if (y > 40) lit++;
        if (d[i + 2]! > 170 && d[i + 1]! > 170 && d[i]! < 140) cyan++;
      }
      return { mean: sum / (d.length / 4), lit, cyan, t: v.currentTime };
    });
    const s1 = await shot(a, `${OUT}/stage12-trailer.png`, "#crawl");
    check(
      `the trailer is footage, not black, with the opening text's line typed over it in the terminal's cyan (at ${frame.t.toFixed(1)} s: "${line.text}")`,
      s1.ok && frame.mean > 10 && frame.lit > 2000 && frame.cyan > 150,
      `${s1.detail} · mean luminance ${frame.mean.toFixed(1)} · lit ${frame.lit} · cyan ${frame.cyan}`,
    );
    // the first click brings the sound up and does not skip
    await a.mouse.click(480, 270);
    await a.waitForTimeout(150);
    const clicked = await a.evaluate(() => ({ c: window.__game.crawl()!, live: window.__game.audioLive() }));
    check("the first click brings the trailer's sound up and wakes the game's audio, and does not skip it", !clicked.c.muted && clicked.c.phase === "trailer" && clicked.live.ready, `muted ${clicked.c.muted} · phase ${clicked.c.phase} · audio ready ${clicked.live.ready}`);
    // the end: MELTDOWN, and the visit is recorded
    await a.evaluate((d) => window.__game.crawlSeek(d - 0.6), p0.duration);
    await a.evaluate(() => window.__game.crawlPause(false));
    const ended = await a.waitForFunction(() => window.__game.crawl()?.phase === "title", null, { timeout: 15000, polling: 50 }).then(() => true, () => false);
    await a.waitForTimeout(1100);
    const title = await a.evaluate(() => {
      const t = document.querySelector("#crawl .title") as HTMLElement;
      return { word: (t.querySelector(".word") as HTMLElement).textContent, prompt: (t.querySelector(".prompt") as HTMLElement).textContent, visible: !t.hidden && getComputedStyle(t).display !== "none", seen: localStorage.getItem("meltdown.crawl.seen") };
    });
    await a.screenshot({ path: `${OUT}/stage12-title.png` });
    check("the trailer ends on the MELTDOWN title and its ▲ CLICK TO WAKE, and the visit is recorded", ended && title.word === "MELTDOWN" && /CLICK TO WAKE/.test(title.prompt ?? "") && title.visible && title.seen === "1", `ended ${ended} · "${title.word}" / "${title.prompt}" visible ${title.visible} · seen ${title.seen}`);
    await a.mouse.click(480, 270);
    await a.waitForTimeout(200);
    const gone = await a.evaluate(() => ({ overlay: !!document.getElementById("crawl"), active: window.__game.crawl()?.active ?? false, ready: window.__game.ready }));
    check("the title's click removes the overlay and the game underneath is ready to wake", !gone.overlay && !gone.active && gone.ready, `overlay ${gone.overlay} · active ${gone.active}`);
    await a.close();

    // ---------------- the second visit: once means once ----------------
    const b = await newPage("second");
    await b.goto(url, { waitUntil: "load" });
    await b.waitForFunction(() => window.__game?.ready === true, null, { timeout: 40000, polling: 50 });
    await b.waitForTimeout(500);
    const again = await b.evaluate(() => ({ crawl: window.__game.crawl(), overlay: !!document.getElementById("crawl") }));
    check("the second visit boots straight into the game: the opening shows once", again.crawl === null && !again.overlay, `crawl ${again.crawl ? again.crawl.phase : null} · overlay ${again.overlay}`);
    await b.close();

    // ---------------- every visit, when asked; SPACE skips ----------------
    const e = await newPage("every");
    await e.goto(url, { waitUntil: "domcontentloaded" });
    await e.evaluate(() => {
      const cur = JSON.parse(localStorage.getItem("meltdown.settings") ?? "{}") as Record<string, unknown>;
      localStorage.setItem("meltdown.settings", JSON.stringify({ ...cur, crawlEveryTime: true }));
    });
    await e.goto(url, { waitUntil: "load" });
    await e.waitForFunction(() => window.__game?.ready === true && window.__game.crawl()?.phase === "trailer", null, { timeout: 40000, polling: 50 });
    const e0 = await e.evaluate(() => window.__game.crawl()!);
    await e.keyboard.press("Space");
    await e.waitForTimeout(100);
    const e1 = await e.evaluate(() => window.__game.crawl()!);
    check("OPENING TRAILER EVERY VISIT brings it back, and SPACE skips straight to the title", e0.phase === "trailer" && e0.seen && e0.skippable && e1.phase === "title" && e1.done, `with the setting: ${e0.phase} (seen ${e0.seen}) · after SPACE: ${e1.phase}`);
    await e.close();

    // ---------------- headless default: no opening ----------------
    const c = await newPage("headless");
    await c.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&level=drainage_yard`, { waitUntil: "load" });
    await c.waitForFunction(() => window.__game?.ready === true, null, { timeout: 40000, polling: 50 });
    const none = await c.evaluate(() => ({ crawl: window.__game.crawl(), overlay: !!document.getElementById("crawl") }));
    check("headless probes and ?crawl=0 boot straight into the game", none.crawl === null && !none.overlay, `crawl ${none.crawl} · overlay ${none.overlay}`);
    await c.close();
    check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean console");
    results["trailer"] = { declared: TRAILER.seconds, decoded: p0.duration, frame };
    writeFileSync(`${OUT}/stage12.json`, JSON.stringify({ results, checks }, null, 2));
    const failed = checks.filter((x) => !x.pass);
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
    if (failed.length) process.exitCode = 1;
  } finally {
    await browser.close();
    vite.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
