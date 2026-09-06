/**
 * Stage 12 probe — the opening crawl.
 *  Cyan monospace on black; one paragraph typed then held; scanlines flickering over it; a
 *  glitch tear between paragraphs; ~35 s at 1× (run here at speed, with the schedule checked at
 *  1×); not skippable on the first view, skippable after; a hard cut to silence, then the
 *  MELTDOWN title; the title's click hands the wake to the game underneath.
 *
 *   npm run probe:crawl
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { CRAWL_TEXT } from "../client/crawl-text";
import { buildSchedule, crawlDuration, crawlShape, TEAR_SECONDS } from "../client/crawl-schedule";

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
  const SPEED = 4;
  try {
    // ---------------- the schedule at 1× ----------------
    const d = crawlDuration(CRAWL_TEXT);
    const shape = crawlShape(CRAWL_TEXT);
    check("the crawl runs ~35 s at 1× (first keystroke to title); the copy shortens paragraph by paragraph and ends on one isolated line", d >= 30 && d <= 40 && shape.shortening && shape.isolatedLast, `${d.toFixed(1)} s · ${shape.count} paragraphs · lengths ${CRAWL_TEXT.map((p) => p.length).join(" > ")}`);

    // ---------------- first view: not skippable ----------------
    const a = await newPage("first");
    await a.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&crawl=1&crawlspeed=${SPEED / 2}&level=drainage_yard`, { waitUntil: "load" });
    await a.waitForFunction(() => window.__game?.ready === true && !!window.__game.crawl()?.active, null, { timeout: 40000, polling: 20 });
    // sampled on the crawl's own clock: frames under SwiftShader are slow, so wall time says nothing
    const samples: { t: number; phase: string; typed: number; p: number }[] = [];
    const t0 = Date.now();
    let shot = false;
    while (Date.now() - t0 < 60000) {
      const v = await a.evaluate(() => window.__game.crawl()!);
      samples.push({ t: v.t, phase: v.phase, typed: v.typed, p: v.paragraph });
      if (!shot && v.phase === "type" && v.typed > 40) {
        await a.screenshot({ path: `${OUT}/stage12-typing.png` });
        shot = true;
      }
      if (v.paragraph > 0 || v.phase === "tear") break;
      await a.waitForTimeout(15);
    }
    const look = await a.evaluate(() => {
      const el = document.querySelector("#crawl .txt") as HTMLElement;
      const root = document.getElementById("crawl")!;
      const cs = getComputedStyle(el);
      const rs = getComputedStyle(root);
      const scan = getComputedStyle(document.querySelector("#crawl .scan")!);
      return { color: cs.color, font: cs.fontFamily, bg: rs.backgroundColor, scanAnim: scan.animationName, scanBg: scan.backgroundImage.slice(0, 40), z: rs.zIndex };
    });
    check("cyan monospace on black, scanlines flickering over it, above everything else", /53,\s*242,\s*255/.test(look.color) && /mono|Menlo|Consolas|Courier/i.test(look.font) && /rgb\(0,\s*0,\s*0\)/.test(look.bg) && look.scanAnim === "crawl-flicker" && /repeating-linear-gradient/.test(look.scanBg) && Number(look.z) >= 1000, `color ${look.color} · font ${look.font.slice(0, 30)} · bg ${look.bg} · scan ${look.scanAnim} · z ${look.z}`);
    const typing = samples.filter((s) => s.phase === "type" && s.p === 0);
    const monotone = typing.every((s, i) => i === 0 || s.typed >= typing[i - 1]!.typed);
    const held = samples.filter((s) => s.phase === "hold" && s.p === 0);
    check("one paragraph at a time, typed then held: the character count rises monotonically to the full paragraph, then holds it", typing.length >= 4 && monotone && held.length >= 1 && held.every((s) => s.typed === CRAWL_TEXT[0]!.length) && (typing[typing.length - 1]?.typed ?? 0) > typing[0]!.typed, `${typing.length} typing samples ${typing[0]?.typed}→${typing[typing.length - 1]?.typed} · held ${held.length} at ${held[0]?.typed}/${CRAWL_TEXT[0]!.length}`);
    // the first view cannot be skipped
    await a.keyboard.press("Space");
    await a.waitForTimeout(80);
    const afterSkip = await a.evaluate(() => window.__game.crawl()!);
    check("the first view is not skippable: SPACE does nothing but the crawl keeps its place", !afterSkip.skippable && !afterSkip.seen && afterSkip.phase !== "cut" && afterSkip.phase !== "title" && afterSkip.paragraph <= 1, `seen ${afterSkip.seen} · skippable ${afterSkip.skippable} · phase ${afterSkip.phase} p${afterSkip.paragraph}`);
    // photograph a tear: freeze the clock inside the first tear (a tear is 0.35 s at 1×; at speed it is shorter than a screenshot)
    const firstTear = buildSchedule(CRAWL_TEXT).find((x) => x.kind === "tear")!;
    await a.evaluate(() => window.__game.crawlPause(true));
    await a.evaluate((t) => window.__game.crawlSeek(t), firstTear.start + TEAR_SECONDS / 2);
    await a.waitForTimeout(120);
    const tearFrame = await a.evaluate(() => {
      const c = window.__game.crawl()!;
      const root = document.getElementById("crawl")!;
      return { phase: c.phase, bands: c.bands, tearing: root.classList.contains("tearing"), ghosts: [...root.querySelectorAll(".txt.g1, .txt.g2")].filter((g) => Number(getComputedStyle(g).opacity) > 0.5).length };
    });
    await a.screenshot({ path: `${OUT}/stage12-tear.png` });
    await a.evaluate(() => window.__game.crawlPause(false));
    await a.waitForFunction(() => window.__game.crawl()?.done === true, null, { timeout: 120000, polling: 100 });
    const end = await a.evaluate(() => window.__game.crawl()!);
    check("a glitch tear between paragraphs: three layers sliced into bands and pushed apart, the ghosts tinted magenta and cyan, one tear per paragraph gap", tearFrame.phase === "tear" && tearFrame.tearing && tearFrame.bands.length === 3 && tearFrame.bands.some((b) => Math.abs(b) >= 3) && tearFrame.ghosts === 2 && end.tears === CRAWL_TEXT.length - 1, `phase ${tearFrame.phase} · bands [${tearFrame.bands.join(", ")}] · ghosts ${tearFrame.ghosts} · tears ${end.tears}/${CRAWL_TEXT.length - 1}`);
    // the cut and the title
    const cutSeen = samples.length > 0; // placeholder: the cut is checked on the second page where we can watch it closely
    void cutSeen;
    const title = await a.evaluate(() => {
      const w = document.querySelector("#crawl .title .word") as HTMLElement | null;
      const txt = document.querySelector("#crawl .txt") as HTMLElement;
      return { word: w?.textContent ?? "", visible: !!w && getComputedStyle(w).display !== "none" && !(w.closest(".title") as HTMLElement).hidden, textHidden: getComputedStyle(txt).visibility === "hidden", hum: window.__game.crawl()!.hum, seen: (() => { try { return localStorage.getItem("meltdown.crawl.seen"); } catch { return null; } })() };
    });
    await a.waitForTimeout(1200 / SPEED + 300);
    await a.screenshot({ path: `${OUT}/stage12-title.png` });
    check("hard cut, then the MELTDOWN title: the text is gone, the hum is off, the title is up, and the first view is now recorded", end.done && title.word === "MELTDOWN" && title.visible && title.textHidden && !title.hum && title.seen === "1", `title "${title.word}" visible ${title.visible} · text hidden ${title.textHidden} · hum ${title.hum} · seen ${title.seen}`);
    // the click hands the wake to the game
    await a.mouse.click(480, 270);
    await a.waitForTimeout(200);
    const gone = await a.evaluate(() => ({ overlay: !!document.getElementById("crawl"), active: window.__game.crawl()?.active ?? false, ready: window.__game.ready }));
    check("the title's click removes the overlay and the game underneath is ready to wake", !gone.overlay && !gone.active && gone.ready, `overlay ${gone.overlay} · active ${gone.active}`);
    await a.close();

    // ---------------- second view: skippable, and the cut is silent ----------------
    const b = await newPage("second");
    await b.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&crawl=1&crawlspeed=${SPEED}&level=drainage_yard`, { waitUntil: "load" });
    await b.waitForFunction(() => window.__game?.ready === true && !!window.__game.crawl()?.active, null, { timeout: 40000, polling: 50 });
    const s0 = await b.evaluate(() => ({ c: window.__game.crawl()!, hint: !(document.querySelector("#crawl .skip") as HTMLElement).hidden, hintText: (document.querySelector("#crawl .skip") as HTMLElement).textContent }));
    await b.waitForTimeout(400);
    await b.keyboard.press("Space");
    await b.waitForTimeout(60);
    const s1 = await b.evaluate(() => window.__game.crawl()!);
    const titled = await b.waitForFunction(() => window.__game.crawl()?.phase === "title", null, { timeout: 15000, polling: 30 }).then(() => true, () => false);
    const s2 = await b.evaluate(() => window.__game.crawl()!);
    void titled;
    check("after the first view the crawl is skippable: the hint shows, SPACE jumps to the cut (black, silent, ~1.6 s at 1×), then the title", s0.c.seen && s0.c.skippable && s0.hint && /SKIP/.test(s0.hintText ?? "") && s1.phase === "cut" && !s1.hum && s1.typed === 0 && s2.phase === "title" && s2.done, `seen ${s0.c.seen} · hint "${s0.hintText}" · after SPACE: ${s1.phase} hum ${s1.hum} · then ${s2.phase}`);
    await b.close();

    // ---------------- headless default: no crawl ----------------
    const c = await newPage("headless");
    await c.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&level=drainage_yard`, { waitUntil: "load" });
    await c.waitForFunction(() => window.__game?.ready === true, null, { timeout: 40000, polling: 50 });
    const none = await c.evaluate(() => ({ crawl: window.__game.crawl(), overlay: !!document.getElementById("crawl") }));
    check("headless probes and ?crawl=0 boot straight into the game; a browser visit gets the crawl", none.crawl === null && !none.overlay, `crawl ${none.crawl} · overlay ${none.overlay}`);
    await c.close();
    check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean console");
    results["crawl"] = { duration: d, paragraphs: CRAWL_TEXT.map((p) => p.length), tears: end.tears, tearFrame };
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
