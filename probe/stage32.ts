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
      const pads = [...document.querySelectorAll<HTMLElement>("#hud .thumbs .tc-b")].map((b) => ({ id: b.dataset.b ?? "", r: b.getBoundingClientRect() }));
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
      const pads = [...document.querySelectorAll<HTMLElement>("#hud .thumbs .tc-b")].map((b) => ({ id: b.dataset.b ?? "", r: b.getBoundingClientRect() }));
      const panels = [...document.querySelectorAll<HTMLElement>("#hud > *:not(.thumbs):not(.scan):not(.xh)")].flatMap((el) => {
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
      return { hits: [...new Set(hits)], saysKeyboard: /WASD|CLICK fire|R reload|SPACE jump|click to walk|\[ENTER\]|\[1–4\]/i.test(keyboardWords) };
    });
    check("no HUD panel sits underneath a thumb control", clash.hits.length === 0, clash.hits.length ? clash.hits.join(", ") : `${layout.vw}×${layout.vh}, nothing under the pads`);
    check("and the game does not tell a phone to press WASD", !clash.saysKeyboard, clash.saysKeyboard ? "keyboard legend still on screen" : "touch prompts only");
    // Stage 132: the phone paid for the desktop's fixes. The foot line's seat (Stage 118) and the
    // map's footer (Stage 129) were written for the desktop's boxes; on the phone the line had gone
    // over the file's header and the footer onto two lines. Read from the drawn frame
    const phoneFit = await pg.evaluate(async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const hud = document.getElementById("hud")!;
      const status = hud.querySelector(".status")!.getBoundingClientRect();
      // Stage 139: the phone draws no stance line; its row is the slots and the tabs on one line
      const center = hud.querySelector(".center") as HTMLElement;
      const stance = getComputedStyle(center).display;
      const rowBox = hud.querySelector(".bottom")!.getBoundingClientRect();
      const f = hud.querySelector(".map .f") as HTMLElement;
      const fr = f.getBoundingClientRect();
      const mapBox = hud.querySelector(".map")!.getBoundingClientRect();
      return { stance, rowTop: rowBox.top, rowBottom: rowBox.bottom, rowHeight: rowBox.height, statusBottom: status.bottom, footerText: f.textContent ?? "", footerLines: (() => { const tr = document.createRange(); tr.selectNodeContents(f); return tr.getClientRects().length; })(), footerOverflow: f.scrollWidth - f.clientWidth, footerInsideMap: fr.left >= mapBox.left - 0.5 && fr.right <= mapBox.right + 0.5 };
    });
    check("the phone draws no stance line, and its row is the slots and the tabs on one line under the file's header", phoneFit.stance === "none" && phoneFit.rowHeight <= 60 && phoneFit.rowTop >= phoneFit.statusBottom, `stance line display ${phoneFit.stance} · row ${phoneFit.rowTop.toFixed(0)}–${phoneFit.rowBottom.toFixed(0)} (${phoneFit.rowHeight.toFixed(0)} px tall) · header ends ${phoneFit.statusBottom.toFixed(0)}`);
    check("and the map's footer fits its box on one line", phoneFit.footerLines === 1 && phoneFit.footerOverflow <= 0 && phoneFit.footerInsideMap && /^▲ \d+ M WIDE$/.test(phoneFit.footerText), `"${phoneFit.footerText}" · ${phoneFit.footerLines} line(s) · overflow ${phoneFit.footerOverflow} px · inside the map ${phoneFit.footerInsideMap}`);

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

    // ---------------- the grenade pads (Stage 143) ----------------
    // The phone hid the desktop's `FRAG 2 · SMOKE 1 · EMP 1` list and had no cycle at all, so it
    // was stuck on whichever type it spawned with. The pads' labels and the HUD's own list (still
    // written, though the phone does not draw it) are read from the frame, then each pad is tapped
    const nadeRead = async () => pg.evaluate(async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const hud = document.getElementById("hud")!;
      const t = hud.querySelector(".tc-nade") as HTMLElement;
      const c = hud.querySelector(".tc-nadenext") as HTMLElement;
      const list = [...hud.querySelectorAll<HTMLElement>(".nades span")].map((x) => (x.textContent ?? "").trim().replace(/\s+/g, " "));
      const sel = [...hud.querySelectorAll<HTMLElement>(".nades span")].findIndex((x) => x.classList.contains("on"));
      const tr = t.getBoundingClientRect();
      const cr = c.getBoundingClientRect();
      return { throwLabel: (t.textContent ?? "").trim(), cycleLabel: (c.textContent ?? "").trim(), list, sel, throwAt: { x: (tr.left + tr.right) / 2, y: (tr.top + tr.bottom) / 2, w: tr.width, h: tr.height }, cycleAt: { x: (cr.left + cr.right) / 2, y: (cr.top + cr.bottom) / 2, w: cr.width, h: cr.height } };
    });
    const n0 = await nadeRead();
    await pg.touchscreen.tap(n0.cycleAt.x, n0.cycleAt.y);
    await pg.evaluate(() => window.__game.advance(6));
    const n1 = await nadeRead();
    await pg.touchscreen.tap(n1.cycleAt.x, n1.cycleAt.y);
    await pg.evaluate(() => window.__game.advance(6));
    const n2 = await nadeRead();
    check("the phone's grenade pads name what a tap throws and what the next tap selects, both a thumb's width", /^FRAG \d+$/.test(n0.throwLabel) && /^▸SMOKE \d+$/.test(n0.cycleLabel) && n0.sel === 0 && n0.throwAt.w >= 44 && n0.throwAt.h >= 44 && n0.cycleAt.w >= 44 && n0.cycleAt.h >= 44, `throw "${n0.throwLabel}" ${n0.throwAt.w.toFixed(0)}×${n0.throwAt.h.toFixed(0)} · cycle "${n0.cycleLabel}" ${n0.cycleAt.w.toFixed(0)}×${n0.cycleAt.h.toFixed(0)} · list [${n0.list.join(" / ")}] selected ${n0.sel}`);
    check("a thumb on the cycle pad changes the grenade, twice, and both labels follow the file's own list", n1.sel === 1 && n2.sel === 2 && /^SMOKE /.test(n1.throwLabel) && /^▸EMP /.test(n1.cycleLabel) && /^EMP /.test(n2.throwLabel) && /^▸FRAG /.test(n2.cycleLabel), `after one: selected ${n1.sel} "${n1.throwLabel}" then "${n1.cycleLabel}" · after two: selected ${n2.sel} "${n2.throwLabel}" then "${n2.cycleLabel}"`);
    const empBefore = Number((n2.list[2] ?? "").replace(/[^0-9]/g, "") || "0");
    await pg.touchscreen.tap(n2.throwAt.x, n2.throwAt.y);
    await pg.evaluate(() => window.__game.advance(30));
    const n3 = await nadeRead();
    const empAfter = Number((n3.list[2] ?? "").replace(/[^0-9]/g, "") || "0");
    check("and a thumb on the throw pad throws the selected type, not the first", empAfter === empBefore - 1 && n3.sel === 2, `EMP ${empBefore} → ${empAfter} · selected ${n3.sel} · list [${n3.list.join(" / ")}]`);
    // Stage 133: the PA (pushed at tick 300, passed during the walks above) reads in full on the phone
    // too, and the taller log stays clear of the thumb pads
    const paPhone = await pg.evaluate(async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const log = document.querySelector("#hud .log") as HTMLElement;
      const box = log.getBoundingClientRect();
      const d = [...log.querySelectorAll<HTMLElement>("div")].find((x) => /VANTAGE PA/.test(x.textContent ?? ""));
      if (!d) return null;
      const tr = document.createRange();
      tr.selectNodeContents(d);
      const rects = [...tr.getClientRects()].filter((r) => r.width > 0);
      const pads = [...document.querySelectorAll<HTMLElement>("#hud .thumbs .tc-b")].map((b) => ({ id: b.dataset.b ?? "", r: b.getBoundingClientRect() }));
      const under = pads.filter((p) => box.left < p.r.right && p.r.left < box.right && box.top < p.r.bottom && p.r.top < box.bottom).map((p) => p.id);
      return { text: d.textContent ?? "", rects: rects.length, inBox: rects.every((r) => r.left >= box.left - 0.5 && r.right <= box.right + 0.5), overflowX: d.scrollWidth - d.clientWidth, overflowY: d.scrollHeight - d.clientHeight, under, logTop: box.top, logBottom: box.bottom };
    });
    check("the VANTAGE PA reads in full on the phone, wrapped in the log's box and clear of the pads", !!paPhone && paPhone.rects >= 2 && paPhone.inBox && paPhone.overflowX <= 0 && paPhone.overflowY <= 0 && /COMPLIANCE\.$/.test(paPhone.text) && paPhone.under.length === 0, paPhone ? `${paPhone.rects} rows · overflow ${paPhone.overflowX}/${paPhone.overflowY} px · in the box ${paPhone.inBox} · log ${paPhone.logTop.toFixed(0)}–${paPhone.logBottom.toFixed(0)} px · under ${paPhone.under.join(",") || "no pad"} · ends "…${paPhone.text.slice(-22)}"` : "no PA line in the log");

    // ---------------- the reader frames on the phone (Stage 137) ----------------
    // The desk sat under all seven thumb pads and the phone's own row, and the FILE book, given the
    // phone's edge-to-edge rule, was shifted half a view off the screen by the desktop seat's inline
    // transform. Each frame is opened, read from the drawn frame, and closed
    const frames: Record<string, { hidden: boolean; inside: boolean; left: number; right: number; top: number; bottom: number; padsShown: number; rowUnder: boolean; scrolls: boolean }> = {};
    for (const which of ["contracts", "file"] as const) {
      await pg.evaluate((w) => (w === "contracts" ? window.__game.contracts(true) : window.__game.toggleFile(true)), which);
      frames[which] = await pg.evaluate(async (w) => {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const el = document.querySelector(`#hud .${w}`) as HTMLElement;
        const b = el.getBoundingClientRect();
        const pads = [...document.querySelectorAll<HTMLElement>("#hud .thumbs .tc-b")].filter((p) => { const r = p.getBoundingClientRect(); const cs = getComputedStyle(p); return r.width > 0 && cs.display !== "none" && cs.visibility !== "hidden" && p.offsetParent !== null; });
        // the phone's slot-and-tab row goes with the pads under a frame; were it drawn, what the eye
        // and the thumb meet at the row's own centre would have to be the frame, not the row
        const rowEl = document.querySelector("#hud .bottom") as HTMLElement;
        const tabs = rowEl.querySelector(".tabs")!.getBoundingClientRect();
        const atRow = tabs.width > 0 ? document.elementFromPoint((tabs.left + tabs.right) / 2, (tabs.top + tabs.bottom) / 2) : null;
        const rowUnder = getComputedStyle(rowEl).display === "none" || (!!atRow && atRow.closest(`#hud .${w}`) === el);
        return { hidden: el.hidden, inside: b.left >= -0.5 && b.right <= innerWidth + 0.5 && b.top >= -0.5 && b.bottom <= innerHeight + 0.5, left: b.left, right: b.right, top: b.top, bottom: b.bottom, padsShown: pads.length, rowUnder, scrolls: el.scrollHeight > el.clientHeight };
      }, which);
      if (which === "file") await shotCheck(pg, "stage32-book.png", "#hud .file");
      await pg.evaluate((w) => (w === "contracts" ? window.__game.contracts(false) : window.__game.toggleFile(false)), which);
      await pg.waitForTimeout(150);
    }
    // the pads come back on the frame after the close; the runner's phone frames come a second apart
    const padsBack = await pg.evaluate(async () => {
      for (let i = 0; i < 60; i++) {
        const n = [...document.querySelectorAll<HTMLElement>("#hud .thumbs .tc-b")].filter((p) => p.offsetParent !== null && p.getBoundingClientRect().width > 0).length;
        if (n > 0) return n;
        await new Promise((r) => setTimeout(r, 50));
      }
      return 0;
    });
    const fd = frames["contracts"]!;
    const fb = frames["file"]!;
    check("the contracts desk on the phone fills the view, with the thumb pads and the row off it, and scrolls inside", !fd.hidden && fd.inside && fd.right >= VIEWPORT.width - 0.5 && fd.padsShown === 0 && fd.rowUnder && fd.scrolls, `desk ${fd.left.toFixed(0)}–${fd.right.toFixed(0)} × ${fd.top.toFixed(0)}–${fd.bottom.toFixed(0)} in ${VIEWPORT.width}×${VIEWPORT.height} · pads shown ${fd.padsShown} · the row off it ${fd.rowUnder} · scrolls ${fd.scrolls}`);
    check("and the FILE book is on the screen, edge to edge, the pads off it, and the pads come back when it closes", !fb.hidden && fb.inside && fb.left >= -0.5 && fb.right >= VIEWPORT.width - 0.5 && fb.padsShown === 0 && padsBack >= 7, `book ${fb.left.toFixed(0)}–${fb.right.toFixed(0)} × ${fb.top.toFixed(0)}–${fb.bottom.toFixed(0)} · pads shown ${fb.padsShown}, back ${padsBack}`);

    // ---------------- the frame a phone has to hold ----------------
    await pg.evaluate(() => window.__game.setRealtime(true));
    await pg.waitForTimeout(2500);
    const r = await pg.evaluate(() => window.__game.state().render);
    check(
      "the frame is one a phone can hold: the mirror's second pass is gone from the draw calls",
      r.calls < 180 && r.post,
      `${r.calls} draw calls · ${(r.triangles / 1000).toFixed(0)}k triangles · internal scale ${r.internalScale}`,
    );
    await shotCheck(pg, "stage32-mobile.png", "#hud .thumbs");
    results.layout = layout;
    results.render = r;

    // ---------------- the fixer's terminal on the phone (Stage 138) ----------------
    // The creation terminal (WHO DO YOU ANSWER TO?) is up by now, and it was played from the
    // keyboard alone: Enter to read on, 1–4 to choose. Read its seat and its footer from the drawn
    // frame, take its picture, then take the third choice with a thumb
    const term = await pg.evaluate(async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const hud = document.getElementById("hud")!;
      const el = hud.querySelector(".terminal") as HTMLElement;
      const b = el.getBoundingClientRect();
      const row = hud.querySelector(".bottom")!.getBoundingClientRect();
      const pads = [...hud.querySelectorAll<HTMLElement>(".thumbs .tc-b")].map((p) => ({ id: p.dataset.b ?? "", r: p.getBoundingClientRect() })).filter((p) => p.r.width > 0);
      const under = pads.filter((p) => b.left < p.r.right && p.r.left < b.right && b.top < p.r.bottom && p.r.top < b.bottom).map((p) => p.id);
      // each choice row is what a thumb meets at its centre: nothing (the event log, a pad) drawn over it
      const rows = [...el.querySelectorAll<HTMLElement>(".tc .ch")].map((c) => { const r = c.getBoundingClientRect(); const at = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2); return { text: (c.textContent ?? "").trim(), x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, h: r.height, met: !!at && at.closest(".ch") === c, over: at && at.closest(".ch") !== c ? (at.closest("#hud > *")?.className ?? at.tagName) : "" }; });
      // the event log paints over whatever it overlaps and, like all the HUD's chrome, takes no
      // pointer, so hit-testing cannot see it: its box is read outright
      const logEl = hud.querySelector(".log") as HTMLElement;
      const log = logEl.getBoundingClientRect();
      const logDrawn = getComputedStyle(logEl).display !== "none" && log.width > 0 && (logEl.textContent ?? "").trim().length > 0;
      const logCrosses = logDrawn && b.left < log.right && log.left < b.right && b.top < log.bottom && log.top < b.bottom;
      const c = window.__game.campaign();
      return { hidden: el.hidden, ready: c?.dialogue?.ready ?? false, script: c?.dialogue?.script ?? null, faction: c?.faction ?? null, left: b.left, right: b.right, top: b.top, bottom: b.bottom, rowBottom: row.bottom, under, footer: (el.querySelector(".tf")?.textContent ?? "").trim(), rows, inside: b.left >= -0.5 && b.right <= innerWidth + 0.5 && b.top >= -0.5 && b.bottom <= innerHeight + 0.5, logDrawn, logCrosses, logBox: `${log.left.toFixed(0)}–${log.right.toFixed(0)} × ${log.top.toFixed(0)}–${log.bottom.toFixed(0)}` };
    });
    const rowH = term.rows.length ? Math.min(...term.rows.map((r) => r.h)) : 0;
    const covered = term.rows.filter((r) => !r.met);
    check("the creation terminal is up on the phone, seated under the row, short of every pad and the event log, inside the view, its rows under nothing, and offers a tap", !term.hidden && term.ready && term.inside && term.top >= term.rowBottom + 4 && term.under.length === 0 && !term.logCrosses && term.footer === "TAP A LINE TO CHOOSE" && term.rows.length === 3 && rowH >= 24 && covered.length === 0, `terminal ${term.left.toFixed(0)}–${term.right.toFixed(0)} × ${term.top.toFixed(0)}–${term.bottom.toFixed(0)} · row ends ${term.rowBottom.toFixed(0)} · under ${term.under.join(",") || "no pad"} · log ${term.logDrawn ? `drawn at ${term.logBox}, ${term.logCrosses ? "across it" : "clear of it"}` : "silenced"} · footer "${term.footer}" · ${term.rows.length} rows, ${rowH.toFixed(0)} px tall, ${covered.length ? `row(s) under ${covered.map((r) => r.over).join(",")}` : "each met by a thumb"} · script ${term.script} ready ${term.ready} · house ${term.faction}`);
    await shotCheck(pg, "stage32-terminal.png", "#hud .terminal");
    const cells = term.rows.find((r) => /WAKE CELLS/.test(r.text));
    if (cells) await pg.touchscreen.tap(cells.x, cells.y);
    const chosen = await pg.evaluate(async () => {
      for (let i = 0; i < 60; i++) {
        const c = window.__game.campaign();
        if (c?.dialogue?.node === "cells") return { node: c.dialogue.node, open: !(document.querySelector("#hud .terminal") as HTMLElement).hidden };
        await new Promise((r) => setTimeout(r, 50));
      }
      const c = window.__game.campaign();
      return { node: c?.dialogue?.node ?? null, open: !(document.querySelector("#hud .terminal") as HTMLElement).hidden };
    });
    check("a thumb on THE WAKE CELLS is the choice: the terminal reads on to the cells' node", !!cells && chosen.node === "cells" && chosen.open, `tapped ${cells ? `"${cells.text}" at ${cells.x.toFixed(0)},${cells.y.toFixed(0)}` : "nothing (no such row)"} · node ${chosen.node} · terminal open ${chosen.open}`);
    // and a thumb anywhere on the terminal reads on: tap through the rest of the script (the
    // first tap on a typing node shows it all, the next reads on) until the terminal closes and
    // the house is written to the file
    let taps = 0;
    let done = { faction: null as string | null, open: true, node: null as string | null };
    for (let i = 0; i < 12 && done.open; i++) {
      const at = await pg.evaluate(() => { const r = (document.querySelector("#hud .terminal .tl") as HTMLElement).getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; });
      await pg.touchscreen.tap(at.x, at.y);
      taps++;
      done = await pg.evaluate(async () => {
        await new Promise((r) => setTimeout(r, 250));
        const c = window.__game.campaign();
        return { faction: c?.faction ?? null, open: !(document.querySelector("#hud .terminal") as HTMLElement).hidden, node: c?.dialogue?.node ?? null };
      });
    }
    const house = await pg.evaluate(async () => { for (let i = 0; i < 40; i++) { const c = window.__game.campaign(); if (c?.faction) return c.faction; await new Promise((r) => setTimeout(r, 50)); } return window.__game.campaign()?.faction ?? null; });
    check("and thumbs on the terminal read the script to its end: it closes and the cells are the file's house", !done.open && house === "cells", `${taps} tap(s) · terminal open ${done.open} · last node ${done.node} · house ${house}`);

    // ---------------- the wake on the phone (Stage 139) ----------------
    // A second page with the wake on: the node line, the searchlight warning and the alert were
    // seated at the desktop's 92 px, inside the phone's row; the node line printed over the stance
    // line and the alert across the tab strip. Read the stack from the drawn frame, before the
    // first tap (the legend up) and after it
    const w = await ctx.newPage();
    w.on("pageerror", (e) => errors.push(String(e)));
    await w.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&touch=1&level=drainage_yard&ai=0`, { waitUntil: "load" });
    await w.waitForFunction(() => window.__game?.ready === true, null, { timeout: 60000, polling: 100 });
    await w.evaluate(() => window.__game.advance(120));
    const readStack = () => w.evaluate(async () => {
      window.__game.game.hud.alert("◆ THE WAKE BEGINS — PULL THE NODES OFF THE MODEL", false, 3);
      // the alert fades in over 0.2 s: read it lit
      await new Promise((r) => setTimeout(r, 350));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const hud = document.getElementById("hud")!;
      // no named helpers in here: the probe's build injects a __name the page does not have
      const boxes: Record<string, { left: number; right: number; top: number; bottom: number; text: string } | null> = {};
      for (const sel of [".bottom", ".bottom .tabs", ".prompt-touch", ".nodefoot", ".alert", ".log", ".mission"]) {
        const el = hud.querySelector(sel) as HTMLElement | null;
        let b: { left: number; right: number; top: number; bottom: number; text: string } | null = null;
        if (el) {
          const cs = getComputedStyle(el);
          if (!el.hidden && cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) >= 0.05) {
            const r = el.getBoundingClientRect();
            if (r.width > 0) b = { left: r.left, right: r.right, top: r.top, bottom: r.bottom, text: (el.textContent ?? "").trim().slice(0, 50) };
          }
        }
        boxes[sel] = b;
      }
      const row = boxes[".bottom"]!;
      const tabs = boxes[".bottom .tabs"]!;
      const legend = boxes[".prompt-touch"] ?? null;
      const foot = boxes[".nodefoot"] ?? null;
      const alert = boxes[".alert"] ?? null;
      const log = boxes[".log"] ?? null;
      const mission = boxes[".mission"] ?? null;
      const logEntries = hud.querySelectorAll(".log > div").length;
      const pads = [...hud.querySelectorAll<HTMLElement>(".thumbs .tc-b")].map((p) => { const r = p.getBoundingClientRect(); return { id: p.dataset.b ?? "", left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }).filter((p) => p.right > p.left);
      const targets: [string, { left: number; right: number; top: number; bottom: number } | null][] = [["row", row], ["tabs", tabs], ["log", log], ...pads.map((p) => [`pad:${p.id}`, p] as [string, { left: number; right: number; top: number; bottom: number }])];
      const footCrosses = foot ? targets.filter(([, t]) => !!t && foot.left < t.right && t.left < foot.right && foot.top < t.bottom && t.top < foot.bottom).map(([n]) => n) : [];
      const alertCrosses = alert ? targets.filter(([, t]) => !!t && alert.left < t.right && t.left < alert.right && alert.top < t.bottom && t.top < alert.bottom).map(([n]) => n) : [];
      const legendCrosses = legend ? targets.filter(([, t]) => !!t && legend.left < t.right && t.left < legend.right && legend.top < t.bottom && t.top < legend.bottom).map(([n]) => n) : [];
      const rowCrossesMission = !!mission && row.left < mission.right && mission.left < row.right && row.top < mission.bottom && mission.top < row.bottom;
      return { row, tabs, legend, foot, alert, log, mission, logEntries, rowCrossesMission, footCrosses, alertCrosses, legendCrosses, phase: window.__game.state().wake?.phase ?? null };
    });
    const wk0 = await readStack();
    const wkUnder0 = wk0.legend ? wk0.legend.bottom : wk0.row.bottom;
    check("before the first tap the phone's wake stacks the legend under the row, the node line under the legend and the alert under the node line, crossing neither the row, the tabs, the log nor a pad", wk0.phase === "wake" && !!wk0.legend && !!wk0.foot && !!wk0.alert && wk0.legend.top >= wk0.row.bottom + 4 && wk0.foot.top >= wkUnder0 + 4 && wk0.alert.top >= wk0.foot.bottom + 4 && wk0.legendCrosses.length === 0 && wk0.footCrosses.length === 0 && wk0.alertCrosses.length === 0, `phase ${wk0.phase} · row ends ${wk0.row.bottom.toFixed(0)} · legend ${wk0.legend ? `${wk0.legend.top.toFixed(0)}–${wk0.legend.bottom.toFixed(0)}` : "none"} · node line ${wk0.foot ? `${wk0.foot.top.toFixed(0)}–${wk0.foot.bottom.toFixed(0)} "${wk0.foot.text}"` : "none"} · alert ${wk0.alert ? `${wk0.alert.top.toFixed(0)}–${wk0.alert.bottom.toFixed(0)}` : "none"} · log ${wk0.log ? `${wk0.log.top.toFixed(0)}–${wk0.log.bottom.toFixed(0)}` : "none"} · crosses legend [${wk0.legendCrosses.join(",")}] node [${wk0.footCrosses.join(",")}] alert [${wk0.alertCrosses.join(",")}]`);
    await w.touchscreen.tap(430, 250);
    await w.evaluate(() => window.__game.advance(30));
    await w.evaluate(() => window.__game.setBot([{ kind: "goto", x: 0, z: 17, sprint: true, radius: 1, stop: true }, { kind: "hold", ticks: 120 }]));
    for (let i = 0; i < 20; i++) await w.evaluate(() => window.__game.advance(60));
    const wk1 = await readStack();
    const wkUnder1 = wk1.legend ? wk1.legend.bottom : wk1.row.bottom;
    check("on the node, the node line reads PULL IT under the row and the alert under it, still crossing nothing", !!wk1.foot && /PULL IT/.test(wk1.foot.text) && wk1.foot.top >= wkUnder1 + 4 && !!wk1.alert && wk1.alert.top >= wk1.foot.bottom + 4 && wk1.footCrosses.length === 0 && wk1.alertCrosses.length === 0 && (wk1.legend === null || wk1.legendCrosses.length === 0), `legend ${wk1.legend ? "still up" : "gone"} · node line ${wk1.foot ? `${wk1.foot.top.toFixed(0)}–${wk1.foot.bottom.toFixed(0)} "${wk1.foot.text}"` : "none"} · alert ${wk1.alert ? `${wk1.alert.top.toFixed(0)}–${wk1.alert.bottom.toFixed(0)}` : "none"} · crosses node [${wk1.footCrosses.join(",")}] alert [${wk1.alertCrosses.join(",")}]`);
    // Stage 140: the wake's mission panel, with its cell line and hex strip, ends at 92 px, and the
    // phone's row had begun at 72, under it; and a full log had climbed into the alert's seat
    check("the phone's row sits a gap under the wake's mission panel, which reaches lower than the row's own seat", !!wk1.mission && wk1.mission.bottom > 72 && wk1.row.top >= wk1.mission.bottom + 4 && !wk1.rowCrossesMission, `mission panel ${wk1.mission ? `${wk1.mission.top.toFixed(0)}–${wk1.mission.bottom.toFixed(0)}` : "none"} · row ${wk1.row.top.toFixed(0)}–${wk1.row.bottom.toFixed(0)} · crosses ${wk1.rowCrossesMission}`);
    await w.evaluate(() => { for (let i = 0; i < 6; i++) window.__game.game.hud.push(`VANTAGE PA · VANTAGE ADVISES DRAINAGE YARD: LEASE RENEWAL IS AUTOMATIC. THANK YOU FOR YOUR CONTINUED COMPLIANCE. (${i + 1})`, "am pa"); });
    const wk2 = await readStack();
    check("the phone's log keeps three entries and, full of wrapped PA lines, stays under the alert's seat", wk2.logEntries === 3 && !!wk2.log && !!wk2.alert && wk2.log.top >= wk2.alert.bottom + 4 && wk2.alertCrosses.length === 0, `${wk2.logEntries} entries · log ${wk2.log ? `${wk2.log.top.toFixed(0)}–${wk2.log.bottom.toFixed(0)}` : "none"} · alert ${wk2.alert ? `${wk2.alert.top.toFixed(0)}–${wk2.alert.bottom.toFixed(0)}` : "none"} · alert crosses [${wk2.alertCrosses.join(",")}]`);
    await shotCheck(w, "stage32-wake.png", "#hud .nodefoot");
    await w.close();

    // ---------------- pausing on the phone (Stage 141) ----------------
    // The pause menu opened on the loss of pointer lock, which a phone never holds: in play there
    // was no way to it, nor to SETTINGS or QUIT. A page with the menu on, put into play, then the
    // PAUSE pad tapped for real, and RESUME tapped on the menu
    const m = await ctx.newPage();
    m.on("pageerror", (e) => errors.push(String(e)));
    await m.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&touch=1&menu=1&level=drainage_yard&ai=0&wake=0`, { waitUntil: "load" });
    await m.waitForFunction(() => window.__game?.ready === true && !!window.__game.menu(), null, { timeout: 60000, polling: 100 });
    await m.evaluate(() => { window.__game.pause(); window.__game.menuChoose("resume"); });
    await m.evaluate(() => window.__game.advance(30));
    const padSeat = await m.evaluate(async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const hud = document.getElementById("hud")!;
      const el = hud.querySelector(".thumbs .tc-pause") as HTMLElement | null;
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const boxes: [string, DOMRect][] = [[".map", hud.querySelector(".map")!.getBoundingClientRect()], [".mission", hud.querySelector(".mission")!.getBoundingClientRect()], [".side", hud.querySelector(".side")!.getBoundingClientRect()], [".status", hud.querySelector(".status")!.getBoundingClientRect()]];
      const near = boxes.filter(([, r]) => r.width > 0 && b.left - 8 < r.right && r.left < b.right + 8 && b.top - 8 < r.bottom && r.top < b.bottom + 8).map(([n]) => n);
      return { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2, left: b.left, right: b.right, top: b.top, bottom: b.bottom, text: (el.textContent ?? "").trim(), inside: b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight, near, menu: window.__game.menu()?.screen ?? null };
    });
    check("the phone has a PAUSE pad, inside the view and a thumb's width clear of the map, the mission panel, the file's header and the ONLINE readout, with the menu hidden in play", !!padSeat && padSeat.text === "PAUSE" && padSeat.inside && padSeat.near.length === 0 && padSeat.menu === "hidden", padSeat ? `pad ${padSeat.left.toFixed(0)}–${padSeat.right.toFixed(0)} × ${padSeat.top.toFixed(0)}–${padSeat.bottom.toFixed(0)} "${padSeat.text}" · within 8 px of [${padSeat.near.join(",")}] · menu ${padSeat.menu}` : "no pause pad");
    if (padSeat) await m.touchscreen.tap(padSeat.x, padSeat.y);
    const paused = await m.evaluate(async () => { for (let i = 0; i < 40; i++) { if (window.__game.menu()?.screen === "pause") break; await new Promise((r) => setTimeout(r, 50)); } return window.__game.menu()?.screen ?? null; });
    // the shot helper counts the menu among the covers a game picture must not have; this picture is
    // of the menu, so it is taken plainly and its claim read either side of the shutter
    // the claim is the pixels, not the state (Stage 33): the menu's own box is read either side of
    // the shutter — drawn, over the view, with its four choices in it
    const shutter = async () => m.evaluate(async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const el = document.getElementById("menu");
      const panel = el?.querySelector(".panel") as HTMLElement | null;
      if (!el || !panel) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      const rows = [...panel.querySelectorAll("[data-i]")].map((x) => (x.textContent ?? "").trim());
      return { screen: window.__game.menu()?.screen ?? null, drawn: !el.hidden && cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.05, covers: r.width >= innerWidth - 0.5 && r.height >= innerHeight - 0.5, panel: p.width > 100 && p.height > 40, rows, box: `${p.left.toFixed(0)}–${p.right.toFixed(0)}×${p.top.toFixed(0)}–${p.bottom.toFixed(0)}` };
    });
    const shutterBefore = await shutter();
    await shotCheck(m, "stage32-pause.png", "#menu");
    const shutterAfter = await shutter();
    const menuUp = (v: typeof shutterBefore) => !!v && v.screen === "pause" && v.drawn && v.covers && v.panel && v.rows.length === 4 && /RESUME/.test(v.rows[0] ?? "");
    check("artifact: stage32-pause.png is a picture of the pause menu — drawn over the view, its four choices in it, either side of the shutter", menuUp(shutterBefore) && menuUp(shutterAfter), `before: ${shutterBefore ? `${shutterBefore.screen} drawn ${shutterBefore.drawn} covers ${shutterBefore.covers} panel ${shutterBefore.box} rows [${shutterBefore.rows.join(" / ")}]` : "no menu"} · after: ${shutterAfter ? `${shutterAfter.screen} drawn ${shutterAfter.drawn}` : "no menu"}`);
    const resumeAt = await m.evaluate(() => { const el = document.querySelector("#menu [data-i=\"0\"]") as HTMLElement | null; if (!el) return null; const r = el.getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, text: (el.textContent ?? "").trim() }; });
    if (resumeAt) await m.touchscreen.tap(resumeAt.x, resumeAt.y);
    const resumed = await m.evaluate(async () => { for (let i = 0; i < 40; i++) { if (window.__game.menu()?.screen === "hidden") break; await new Promise((r) => setTimeout(r, 50)); } return window.__game.menu()?.screen ?? null; });
    check("a thumb on PAUSE opens the pause menu, and a thumb on its RESUME returns to play", paused === "pause" && !!resumeAt && /RESUME/.test(resumeAt.text) && resumed === "hidden", `after PAUSE: ${paused} · tapped ${resumeAt ? `"${resumeAt.text}"` : "nothing"} · after RESUME: ${resumed}`);
    await m.close();

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
