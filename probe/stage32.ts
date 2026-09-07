/**
 * Stage 32 probe — mobile.
 *
 * A phone viewport with a real touch context: no mouse, no keyboard, no pointer lock. It drives the
 * controls the way a thumb does — a drag on the left half to walk, a drag on the right to aim, a
 * press on the fire pad — and asserts the things that decide whether the game is playable at all:
 * the Blank moves, the view turns, the weapon fires, the controls are inside the safe area and
 * clear of each other, the HUD does not overflow the screen, and the frame is one a phone can hold.
 *
 *   npm run probe:mobile
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, devices, type Page } from "playwright";
import { shot } from "./shot";

const VITE_PORT = 5212;
const OUT = "probe/out";
/** iPhone 14-ish in landscape: the smallest screen this has to work on. */
const VIEWPORT = { width: 844, height: 390 };

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

/**
 * One finger: down, a few moves, up — the shape a real drag has.
 *
 * No named function inside `page.evaluate`: tsx keeps names with an `__name` helper that does not
 * exist in the page, so a `const f = () => {}` in here throws `__name is not defined` (Stage 21 hit
 * the same thing). Everything below is inline for that reason.
 */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 8): Promise<void> {
  await page.evaluate(
    async ([a, b, n]) => {
      const A = a as { x: number; y: number };
      const B = b as { x: number; y: number };
      const N = n as number;
      const opts = { pointerId: 7, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true };
      (document.elementFromPoint(A.x, A.y) ?? window).dispatchEvent(new PointerEvent("pointerdown", { ...opts, clientX: A.x, clientY: A.y, buttons: 1 }));
      for (let i = 1; i <= N; i++) {
        const t = i / N;
        const x = A.x + (B.x - A.x) * t;
        const y = A.y + (B.y - A.y) * t;
        window.dispatchEvent(new PointerEvent("pointermove", { ...opts, clientX: x, clientY: y, buttons: 1 }));
        await new Promise((r) => setTimeout(r, 12));
      }
      window.dispatchEvent(new PointerEvent("pointerup", { ...opts, clientX: B.x, clientY: B.y, buttons: 0 }));
    },
    [from, to, steps] as const,
  );
}

/** Hold a finger down somewhere and keep it there while the caller advances the sim. */
async function hold(page: Page, at: { x: number; y: number }, id = 11): Promise<void> {
  await page.evaluate(
    ([p, i]) => {
      const q = p as { x: number; y: number };
      const el = document.elementFromPoint(q.x, q.y) ?? window;
      el.dispatchEvent(new PointerEvent("pointerdown", { pointerId: i as number, pointerType: "touch", isPrimary: true, clientX: q.x, clientY: q.y, bubbles: true, cancelable: true, buttons: 1 }));
    },
    [at, id] as const,
  );
}

async function release(page: Page, at: { x: number; y: number }, id = 11): Promise<void> {
  await page.evaluate(
    ([p, i]) => {
      const q = p as { x: number; y: number };
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: i as number, pointerType: "touch", clientX: q.x, clientY: q.y, bubbles: true, cancelable: true }));
    },
    [at, id] as const,
  );
}

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
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(VITE_PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(vite, /127\.0\.0\.1/, "vite");
  const browser = await chromium.launch({ args: ARGS });
  const errors: string[] = [];
  const results: Record<string, unknown> = {};
  try {
    const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: VIEWPORT, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errors.push(String(e)));
    pg.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
    pg.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`));
    await pg.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&touch=1&level=drainage_yard&ai=0&wake=0`, { waitUntil: "load" });
    await pg.waitForFunction(() => window.__game?.ready === true, null, { timeout: 60000, polling: 100 });

    // ---------------- the build a phone gets ----------------
    const m0 = await pg.evaluate(() => window.__game.mobile());
    check(
      "a touch device gets the touch build: thumb controls on screen, and the mirror — the largest line in the draw-call budget — not drawn at all",
      m0.on && m0.buttons.length >= 7 && !m0.mirror && m0.scale <= 0.5,
      `touch ${m0.on} · ${m0.buttons.length} pads · mirror ${m0.mirror} · post scale ${m0.scale}`,
    );

    // ---------------- the controls fit the phone ----------------
    const layout = await pg.evaluate(() => {
      const vw = innerWidth;
      const vh = innerHeight;
      const pads = [...document.querySelectorAll<HTMLElement>("#hud .tc .tc-b")].map((b) => ({ id: b.dataset.b ?? "", r: b.getBoundingClientRect() }));
      const inside = pads.every((p) => p.r.left >= 0 && p.r.top >= 0 && p.r.right <= vw && p.r.bottom <= vh);
      const smallest = Math.min(...pads.map((p) => Math.min(p.r.width, p.r.height)));
      // name the pairs, not just the count: a layout failure should say which two controls a thumb
      // could hit at once rather than send the next reader back to the CSS to work it out
      const pairs: string[] = [];
      for (let i = 0; i < pads.length; i++)
        for (let j = i + 1; j < pads.length; j++) {
          const a = pads[i]!.r;
          const b = pads[j]!.r;
          if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) pairs.push(`${pads[i]!.id}/${pads[j]!.id}`);
        }
      const overlap = pairs.length;
      const doc = document.documentElement;
      return { inside, smallest, overlap, pairs, vw, vh, overflowX: doc.scrollWidth - vw, overflowY: doc.scrollHeight - vh };
    });
    check(
      "every control is on screen, none overlaps another, and none is smaller than a thumb (44 px)",
      layout.inside && layout.overlap === 0 && layout.smallest >= 44,
      `inside ${layout.inside} · overlaps ${layout.overlap}${layout.pairs.length ? " [" + layout.pairs.join(", ") + "]" : ""} · smallest ${layout.smallest.toFixed(0)} px on ${layout.vw}×${layout.vh}`,
    );
    check("the HUD does not overflow the screen it was drawn for", layout.overflowX <= 0 && layout.overflowY <= 0, `overflow ${layout.overflowX} × ${layout.overflowY} px`);

    /**
     * The first screenshot of this build passed every numeric check above and was unusable: the
     * weapon rack, the grenade row, the tab dock and two lines of keyboard legend were all sitting
     * underneath the thumb pads, and the prompt told a phone to press WASD. Pads not overlapping
     * *each other* was true and beside the point. This is the check that catches it.
     */
    const clash = await pg.evaluate(() => {
      const pads = [...document.querySelectorAll<HTMLElement>("#hud .tc .tc-b")].map((b) => ({ id: b.dataset.b ?? "", r: b.getBoundingClientRect() }));
      const panels = [...document.querySelectorAll<HTMLElement>("#hud > *:not(.touch):not(.scan):not(.xh)")].flatMap((el) => {
        const r0 = el.getBoundingClientRect();
        // full-screen effect layers (the glitch tear, the EMP flash, the scanlines) cover the whole
        // viewport by design and cannot be "under" anything in a way a thumb cares about
        const fullScreen = r0.width >= innerWidth * 0.9 && r0.height >= innerHeight * 0.9;
        const vis = getComputedStyle(el).display !== "none" && r0.width > 0 && !fullScreen;
        return vis ? [{ id: el.className.split(" ").filter((c) => c !== "p").join(".") || el.tagName.toLowerCase(), r: el.getBoundingClientRect() }] : [];
      });
      const hits: string[] = [];
      for (const pad of pads)
        for (const pan of panels) {
          const a = pad.r;
          const b = pan.r;
          if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) hits.push(`${pad.id}↔${pan.id}`);
        }
      const keyboardWords = [...document.querySelectorAll<HTMLElement>("#hud")].map((h) => h.innerText).join(" ");
      return { hits: [...new Set(hits)], saysKeyboard: /WASD|CLICK fire|R reload|SPACE jump|click to walk/i.test(keyboardWords) };
    });
    check("no HUD panel sits underneath a thumb control", clash.hits.length === 0, clash.hits.length ? clash.hits.join(", ") : `${layout.vw}×${layout.vh}, nothing under the pads`);
    check("and the game does not tell a phone to press WASD", !clash.saysKeyboard, clash.saysKeyboard ? "keyboard legend still on screen" : "touch prompts only");

    // ---------------- the left thumb walks ----------------
    const before = await pg.evaluate(() => ({ ...window.__game.state().pos }));
    await hold(pg, { x: 140, y: 250 });
    await pg.evaluate(() => window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 11, pointerType: "touch", clientX: 140, clientY: 170, bubbles: true, cancelable: true })));
    await pg.evaluate(() => window.__game.advance(90));
    const walked = await pg.evaluate(() => ({ ...window.__game.state().pos }));
    await release(pg, { x: 140, y: 170 });
    const moved = Math.hypot(walked.x - before.x, walked.z - before.z);
    check("the left thumb walks the Blank: a stick pushed forward moves it", moved > 2, `moved ${moved.toFixed(2)} m in 1.5 s`);

    // and a released stick stops it
    await pg.evaluate(() => window.__game.advance(60));
    const a1 = await pg.evaluate(() => ({ ...window.__game.state().pos }));
    await pg.evaluate(() => window.__game.advance(60));
    const a2 = await pg.evaluate(() => ({ ...window.__game.state().pos }));
    check("lifting the thumb stops it", Math.hypot(a2.x - a1.x, a2.z - a1.z) < 0.05, `drift ${Math.hypot(a2.x - a1.x, a2.z - a1.z).toFixed(3)} m after release`);

    // ---------------- the right thumb aims ----------------
    const y0 = await pg.evaluate(() => window.__game.state().yaw);
    await drag(pg, { x: 620, y: 150 }, { x: 480, y: 150 }, 10);
    await pg.evaluate(() => window.__game.advance(8));
    const y1 = await pg.evaluate(() => window.__game.state().yaw);
    check("the right thumb aims: a drag turns the view", Math.abs(y1 - y0) > 0.2, `yaw ${y0.toFixed(3)} → ${y1.toFixed(3)} rad over a 140 px drag`);

    // ---------------- the fire pad shoots ----------------
    await pg.evaluate(() => window.__game.resumeAudio());
    const fire = (await pg.evaluate(() => window.__game.mobile().buttons.find((b) => b.id === "fire")))!;
    const s0 = await pg.evaluate(() => window.__game.state().stats.shots);
    await hold(pg, { x: fire.x, y: fire.y }, 21);
    await pg.evaluate(() => window.__game.advance(40));
    await release(pg, { x: fire.x, y: fire.y }, 21);
    const s1 = await pg.evaluate(() => window.__game.state().stats.shots);
    check("the fire pad shoots, and holding it keeps shooting", s1 - s0 >= 2, `shots ${s0} → ${s1} while held`);

    // ---------------- a tapped pad is one action, not a held one ----------------
    const jump = (await pg.evaluate(() => window.__game.mobile().buttons.find((b) => b.id === "jump")))!;
    const j0 = await pg.evaluate(() => window.__game.state().stats.jumps);
    await hold(pg, { x: jump.x, y: jump.y }, 31);
    await pg.evaluate(() => window.__game.advance(90));
    await release(pg, { x: jump.x, y: jump.y }, 31);
    const j1 = await pg.evaluate(() => window.__game.state().stats.jumps);
    check("a held tap-pad is one action, not a stream of them", j1 - j0 === 1, `jumps ${j0} → ${j1} while the pad was held for 1.5 s`);

    // ---------------- the frame a phone has to hold ----------------
    await pg.evaluate(() => window.__game.setRealtime(true));
    await pg.waitForTimeout(2500);
    const r = await pg.evaluate(() => window.__game.state().render);
    check(
      "the frame is one a phone can hold: the mirror's second pass is gone from the draw calls",
      r.calls < 180 && r.post,
      `${r.calls} draw calls · ${(r.triangles / 1000).toFixed(0)}k triangles · internal scale ${r.internalScale}`,
    );
    await shotCheck(pg, "stage32-mobile.png", "#hud .touch");
    results.layout = layout;
    results.render = r;

    check("no page errors", errors.length === 0, errors.length ? errors.slice(0, 3).join(" | ") : "clean console");
    await pg.close();
    await ctx.close();

    // ---------------- and a desktop is untouched ----------------
    const d = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await d.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&level=drainage_yard&ai=0&wake=0`, { waitUntil: "load" });
    await d.waitForFunction(() => window.__game?.ready === true, null, { timeout: 60000, polling: 100 });
    const dm = await d.evaluate(() => window.__game.mobile());
    check("a desktop still gets the mirror and no thumb controls", !dm.on && dm.buttons.length === 0 && dm.mirror, `touch ${dm.on} · pads ${dm.buttons.length} · mirror ${dm.mirror}`);
    await d.close();
  } finally {
    writeFileSync(`${OUT}/stage32.json`, JSON.stringify({ checks, results }, null, 2));
    await browser.close();
    vite.kill();
  }
  const passed = checks.filter((c) => c.pass).length;
  console.log(`\n${passed}/${checks.length} checks passed.`);
  if (passed !== checks.length) process.exit(1);
}

void main();
