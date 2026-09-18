/**
 * Stage 5 wake probe.
 *  1. Offline: a Blank walks node A → D → B; each flips violet → green, the
 *     spread bonus makes the second flip faster, score accrues, a phage burst
 *     boosts a node, and the KERNEL pulse drains a hold. Screenshots.
 *  2. Online: two clients in opposite cells stand on the same node — it is
 *     contested and does not flip; when one leaves, the other takes it, the
 *     server's match header carries the score, and the round has a timer.
 *
 *   npm run probe:wake
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { shot } from "./shot";
import type { BotStep } from "../client/bot";

const VITE_PORT = 5187;
const HOST_PORT = 8792;
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
  /** Take a proof screenshot and count "it shows what it is named for" as a check (Stage 33). */
  const shotCheck = async (pg: Page, file: string, sel?: string): Promise<Buffer> => {
    const s = await shot(pg, `${OUT}/${file}`, sel);
    check(`artifact: ${file}`, s.ok, s.detail);
    return s.png;
  };
  const host = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "server/node-host.ts", String(HOST_PORT)], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(host, /listening/, "node host");
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(VITE_PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(vite, /127\.0\.0\.1/, "vite");
  const browser = await chromium.launch({ args: ARGS });
  try {
    // ---------------- offline ----------------
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&ai=0&seed=5&level=drainage_yard`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 30000, polling: 100 });
    const plan: BotStep[] = [
      { kind: "hold", ticks: 20 },
      { kind: "goto", x: 0, z: 17, sprint: true, radius: 1, stop: true }, // node D
      { kind: "hold", ticks: 60 * 5 },
      { kind: "goto", x: 0, z: 1.5, sprint: true, radius: 0.8 },
      { kind: "mantle", x: 0, z: -3 },
      { kind: "goto", x: 0, z: -5, sprint: false, radius: 0.6, stop: true }, // node A on the deck (adjacent to D: spread)
      { kind: "hold", ticks: 60 * 5 },
      { kind: "look", yaw: -1.55, pitch: -0.1, ticks: 20 },
    ];
    await page.evaluate((p) => window.__game.setBot(p), plan);
    const flips: { node: number; tick: number }[] = [];
    let shotA = false;
    for (let i = 0; i < 160; i++) {
      await page.evaluate(() => window.__game.advance(10));
      const ev = await page.evaluate(() => { const e = window.__game.events(); window.__game.clearEvents(); return e; });
      for (const e of ev) if (e.type === "nodeFlip") flips.push({ node: e.node, tick: e.tick });
      const wake = (await page.evaluate(() => window.__game.state())).wake!;
      const a = wake.nodes.find((n) => n.id === 1)!;
      if (!shotA && a.puller === 1 && a.hold < 0.6 && a.owner === 0) {
        shotA = true;
        await page.waitForTimeout(150);
        await shotCheck(page, "stage5-pull.png");
      }
      const st = await page.evaluate(() => window.__game.botStatus());
      if (st?.done) break;
    }
    await page.waitForTimeout(150);
    await shotCheck(page, "stage5-held.png");
    let state = await page.evaluate(() => window.__game.state());
    const D = state.wake!.nodes.find((n) => n.id === 4)!;
    const A = state.wake!.nodes.find((n) => n.id === 1)!;
    check("offline: node D flips violet → green under one Blank", D.owner === 1 && flips.some((f) => f.node === 4), `owner ${D.owner}, hold ${D.hold.toFixed(2)}`);
    check("offline: node A (adjacent to held D) flips too", A.owner === 1 && flips.some((f) => f.node === 1), `owner ${A.owner}, hold ${A.hold.toFixed(2)}`);
    check("offline: score accrues for held nodes", state.wake!.score[1]! > 3, `cell one ${state.wake!.score[1]!.toFixed(1)} pts, timer ${state.wake!.timeLeft.toFixed(0)} s`);
    // ---------------- the node under your feet (Stage 85) ----------------
    // The readout's clock is measured from the hold the server is publishing, so its seconds have to
    // be the simulation's seconds: read the countdown, then let the round run and time the flip.
    const foot = await page.evaluate(async () => {
      const g = window.__game.game;
      const w = g.world.wake!;
      const p = g.player;
      // a fresh node, leased to VANTAGE, with the file standing on it and nothing else in the round
      const n = w.nodes.find((x) => x.id === 2)!;
      n.owner = 0;
      n.hold = 1;
      n.puller = 0;
      n.contested = false;
      n.boost = 0;
      p.pos.x = n.pos.x;
      p.pos.z = n.pos.z;
      p.vel.x = p.vel.y = p.vel.z = 0;
      p.team = 1;
      window.__game.setBot([{ kind: "hold", ticks: 60 * 60 }]);
      // let the pull start and the measured rate settle, then read what the HUD is saying
      for (let i = 0; i < 300 && n.hold > 0.72; i++) {
        window.__game.advance(1);
        await new Promise((r) => requestAnimationFrame(r));
      }
      const panel = document.querySelector("#hud .nodefoot") as HTMLElement | null;
      const said = panel && !panel.hidden ? (panel.textContent ?? "") : "";
      const m = /FLIP IN ([0-9.]+)s/.exec(said);
      const predicted = m ? Number(m[1]) : -1;
      return { said, predicted, holdAt: n.hold, label: n.label };
    });
    // the picture is of the countdown, not of what came after it: the probe drives the simulation by
    // hand, so between two evaluates the node is frozen mid-pull with the readout up
    await shotCheck(page, "stage5-nodefoot.png");
    const flipTook = await page.evaluate(async () => {
      const n = window.__game.game.world.wake!.nodes.find((x) => x.id === 2)!;
      let ticks = 0;
      while (ticks < 60 * 40 && n.owner !== 1) {
        window.__game.advance(1);
        ticks++;
        if (ticks % 12 === 0) await new Promise((r) => requestAnimationFrame(r));
      }
      return { actual: ticks / 60, owner: n.owner };
    });
    const err = foot.predicted > 0 ? Math.abs(foot.predicted - flipTook.actual) : 99;
    check("the node readout's countdown is the simulation's own: it says how long the flip takes and the flip takes that long", flipTook.owner === 1 && foot.predicted > 0.5 && err < 0.4 && /NODE B/.test(foot.said) && /PULLING/.test(foot.said), `at ${foot.holdAt.toFixed(2)} hold it said ${foot.predicted.toFixed(1)}s, the flip took ${flipTook.actual.toFixed(1)}s (${err.toFixed(2)}s out) · "${foot.said.trim()}"`);

    // ---------------- the map draws the nodes (Stage 88) ----------------
    // The map in the corner has drawn the dummies and the file at its middle since the first stage,
    // and never the nodes — in the mode the game is named for. And it was turning the wrong way.
    const map = await page.evaluate(async () => {
      const g = window.__game.game;
      const w = g.world.wake!;
      const p = g.player;
      const n = w.nodes.find((x) => x.id === 4)!;
      // ten metres due WEST of node D, so the node is to the east. The headings matter: due north
      // and due south are the two the old transform got right by accident, so this looks north and
      // then east, where turning the map the wrong way mirrors it.
      p.pos.x = n.pos.x - 10;
      p.pos.z = n.pos.z;
      p.vel.x = p.vel.y = p.vel.z = 0;
      n.owner = 1;
      n.contested = false;
      n.hold = 1;
      const canvas = document.querySelector("#hud .map canvas") as HTMLCanvasElement;
      const ctx = canvas.getContext("2d")!;
      const cx = Math.round(canvas.width / 2);
      const cy = Math.round(canvas.height / 2);
      const out: { yaw: number; right: number; up: number }[] = [];
      for (const yaw of [0, -Math.PI / 2]) {
        window.__game.setBot([{ kind: "look", yaw, pitch: 0, ticks: 10 }, { kind: "hold", ticks: 600 }]);
        window.__game.advance(30);
        await new Promise((r) => requestAnimationFrame(r));
        await new Promise((r) => requestAnimationFrame(r));
        // find the cell's green — not the dummies' amber, which is what an earlier version of this
        // check kept finding. No named helpers in here: the probe's build injects a __name the page
        // does not have.
        // a band either side of the centre line rather than one pixel of it: the mark is a disc
        // with a dark label box in its middle, and a single row can thread the gap
        let right = -1;
        for (let x = cx + 2; x < canvas.width - 1 && right < 0; x++) {
          for (const y of [cy - 1, cy, cy + 1]) {
            const d = ctx.getImageData(x, y, 1, 1).data;
            if (d[3]! > 200 && d[1]! > 200 && d[0]! < 120) {
              right = x - cx;
              break;
            }
          }
        }
        let up = -1;
        for (let y = cy - 2; y > 1 && up < 0; y--) {
          for (const x of [cx - 1, cx, cx + 1]) {
            const d = ctx.getImageData(x, y, 1, 1).data;
            if (d[3]! > 200 && d[1]! > 200 && d[0]! < 120) {
              up = cy - y;
              break;
            }
          }
        }
        out.push({ yaw, right, up });
      }
      return { north: out[0]!, east: out[1]!, size: `${canvas.width}x${canvas.height}` };
    });
    // looking north, a node to the east is to the right of the middle and not above it; looking
    // east, the same node is straight ahead — above the middle, not to the right. The map that
    // turned the wrong way puts it below instead, which is why the headings are these two.
    check("the map draws the nodes in the file's own frame: a node to the east is to the right looking north, and straight ahead looking east", map.north.right > 2 && map.north.up < 0 && map.east.up > 2 && map.east.right < 0, `looking north: ${map.north.right} px right, ${map.north.up} up · looking east: ${map.east.right} px right, ${map.east.up} up · map ${map.size}`);
    await shotCheck(page, "stage5-map.png");

    // spread: measure A's flip time precisely in a fresh simulation via the hook: put the player on A with D held vs not
    const measureFlip = (pre: boolean) =>
      page.evaluate((withNeighbour) => {
        const w = window.__game.game.world.wake!;
        const p = window.__game.game.player;
        window.__game.setBot([{ kind: "hold", ticks: 6000 }]);
        for (const n of w.nodes) { n.owner = 0; n.hold = 1; n.puller = 0; n.contested = false; n.boost = 0; }
        if (withNeighbour) w.nodes[3]!.owner = 1;
        p.pos.x = 0; p.pos.y = 1.2; p.pos.z = -5;
        let t = 0;
        while (t < 60 * 20 && w.nodes[0]!.owner !== 1) { window.__game.advance(1); t++; }
        return t / 60;
      }, pre);
    const spread = { plain: await measureFlip(false), spread: await measureFlip(true) };
    check("offline: the wake spreads — flipping next to a held node is faster", spread.spread < spread.plain, `${spread.plain.toFixed(2)} s alone vs ${spread.spread.toFixed(2)} s with D held`);
    // phage burst boost + kernel pulse
    const boosted = await page.evaluate(() => {
      const w = window.__game.game.world;
      const p = window.__game.game.player;
      p.pos.x = 18; p.pos.y = 0; p.pos.z = 8;
      window.__game.setBot([{ kind: "slot", slot: 5 }, { kind: "hold", ticks: 25 }, { kind: "fire", ticks: 20, aimAt: { x: 18, y: 0.3, z: 0 } }, { kind: "hold", ticks: 60 }]);
      window.__game.advance(140);
      return w.wake!.nodes.find((n) => n.id === 2)!.boost;
    });
    check("offline: a phage burst boosts the node it lands on", boosted > 0, `node B boost ${boosted.toFixed(2)} s remaining`);
    const pulse = await page.evaluate(() => {
      const w = window.__game.game.world.wake!;
      window.__game.setBot([{ kind: "hold", ticks: 60 * 80 }]);
      const before = w.pulses;
      window.__game.clearEvents();
      window.__game.advance(60 * 76);
      const ev = window.__game.events().filter((e) => e.type === "kernelPulse");
      return { pulses: w.pulses - before, ev: ev.length, holds: w.nodes.map((n) => `${n.label}:${n.owner}/${n.hold.toFixed(2)}`) };
    });
    check("offline: the KERNEL pulses on schedule and drains the weakest hold", pulse.pulses >= 1 && pulse.ev >= 1, `${pulse.pulses} pulse(s); ${pulse.holds.join(" ")}`);
    // and the strip says when the next one is coming (Stage 87). The cadence is fixed and the round
    // clock is on the wire, so one mark — the pulse that just went by — places the next exactly.
    const kernel = await page.evaluate(async () => {
      await new Promise((r) => requestAnimationFrame(r));
      const strip = (document.querySelector("#hud .mscore") as HTMLElement | null)?.textContent ?? "";
      const m = /KERNEL (\d+):(\d\d)/.exec(strip);
      const said = m ? Number(m[1]) * 60 + Number(m[2]) : -1;
      const w = window.__game.game.world.wake!;
      const before = w.pulses;
      let ticks = 0;
      while (ticks < 60 * 95 && w.pulses === before) {
        window.__game.advance(1);
        ticks++;
        if (ticks % 30 === 0) await new Promise((r) => requestAnimationFrame(r));
      }
      return { said, strip, actual: ticks / 60, fired: w.pulses - before };
    });
    const kErr = kernel.said >= 0 ? Math.abs(kernel.said - kernel.actual) : 99;
    check("the strip counts down to the next KERNEL pulse, and the pulse lands when it says", kernel.fired === 1 && kernel.said > 5 && kErr < 1.5, `it said ${kernel.said}s, the pulse came ${kernel.actual.toFixed(1)}s later (${kErr.toFixed(2)}s out) · "${kernel.strip.trim()}"`);
    // Stage 124: the round ended with the KERNEL's pulse. Let the clock run out for real, and the
    // warm-up after it, and count what was heard: the round's own end, the wake's own start, and
    // no pulse for either
    const phaseCues = await page.evaluate(async () => {
      const w = window.__game.game.world.wake!;
      const before = { ...window.__game.state().audio };
      w.phase = "wake"; w.timeLeft = 0.01; w.score[1] = 40; w.score[2] = 12;
      window.__game.advance(2);
      const afterEnd = { ...window.__game.state().audio };
      const endedIn = (w as { phase: string }).phase; // the sim moved it; TS still holds the literal just assigned
      w.phase = "warmup"; w.timeLeft = 0.01;
      window.__game.advance(2);
      const afterBegin = { ...window.__game.state().audio };
      const beganIn = (w as { phase: string }).phase;
      // no named helpers in here: the probe's build injects a __name the page does not have
      return { endedIn, beganIn, roundOver: (afterEnd["roundOver"] ?? 0) - (before["roundOver"] ?? 0), pulseAtEnd: (afterEnd["kernelPulse"] ?? 0) - (before["kernelPulse"] ?? 0), wakeBegins: (afterBegin["wakeBegins"] ?? 0) - (afterEnd["wakeBegins"] ?? 0), pulseAtBegin: (afterBegin["kernelPulse"] ?? 0) - (afterEnd["kernelPulse"] ?? 0) };
    });
    check("the round's end and the wake's start are heard in their own voices, not as the KERNEL's pulse", phaseCues.endedIn === "results" && phaseCues.roundOver === 1 && phaseCues.pulseAtEnd === 0 && phaseCues.beganIn === "wake" && phaseCues.wakeBegins === 1 && phaseCues.pulseAtBegin === 0, `clock out → ${phaseCues.endedIn}: roundOver ${phaseCues.roundOver}, pulse ${phaseCues.pulseAtEnd} · warm-up out → ${phaseCues.beganIn}: wakeBegins ${phaseCues.wakeBegins}, pulse ${phaseCues.pulseAtBegin}`);
    // Stage 121: the round ended with a line. Put the wake into its results phase by hand and read
    // the drawn frame: the card, its lines, the chrome silenced; then the warm-up, and the card gone
    const roundOver = await page.evaluate(async () => {
      const w = window.__game.game.world.wake!;
      const p = window.__game.game.player;
      p.stats.kills = 3; p.stats.deaths = 1; p.stats.flips = 2; p.stats.nodeSeconds = 41.4;
      w.phase = "results"; w.timeLeft = 12.4; w.winner = 1; w.score[1] = 40; w.score[2] = 12;
      window.__game.advance(1);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const hud = document.getElementById("hud")!;
      const card = hud.querySelector(".card") as HTMLElement;
      const open = !card.hidden;
      const title = card.querySelector(".ct")!.textContent ?? "";
      const lines = [...card.querySelectorAll(".cl div")].map((d) => d.textContent ?? "");
      const color = card.className;
      const quiet = [...hud.classList].filter((c) => c.startsWith("q-"));
      // Stage 125: the round card covered the receipt. The Ledger Entry comes at the same moment
      // online; with it open the card stays down, and signing it brings the card back
      // Stage 126: the round was over and the guns were not. With the phase at results a round
      // into the file changes nothing; in the warm-up after it, the same round lands
      p.shield = 0; // the shield would take the first 30 either way; the rule is read on the health
      const hp0 = p.health;
      window.__game.game.world.applyDamage("player", p.id, 30, 0, "lease_breaker", "shot");
      const hpResults = p.health;
      const receipt = hud.querySelector(".receipt") as HTMLElement;
      window.__game.game.hud.receipt(["MATCH 0001 · LEASED", "XP +250 · SCRIP +30"]);
      window.__game.advance(1);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const withReceipt = { card: !card.hidden, receipt: !receipt.hidden };
      window.__game.game.hud.receiptState.stamped = true;
      const signed = window.__game.game.hud.sign();
      window.__game.advance(1);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const afterSign = { card: !card.hidden, receipt: !receipt.hidden, title: card.querySelector(".ct")!.textContent ?? "" };
      w.phase = "warmup"; w.timeLeft = 20; w.winner = 0;
      window.__game.advance(1);
      p.shield = 0;
      const hpBefore = p.health;
      window.__game.game.world.applyDamage("player", p.id, 30, 0, "lease_breaker", "shot");
      const hpWarmup = p.health;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const after = !card.hidden;
      const quietAfter = [...hud.classList].filter((c) => c.startsWith("q-"));
      return { open, title, lines, color, quiet, after, quietAfter, team: p.team, withReceipt, signed, afterSign, hp0, hpResults, hpBefore, hpWarmup };
    });
    check("no file takes damage in the results phase, and the warm-up's guns are live again", roundOver.hpResults === roundOver.hp0 && roundOver.hpWarmup === roundOver.hpBefore - 30, `results: ${roundOver.hp0} → ${roundOver.hpResults} after a 30 round · warm-up: ${roundOver.hpBefore} → ${roundOver.hpWarmup}`);
    check("the round card gives way to the Ledger Entry receipt and comes back once it is signed", roundOver.withReceipt.receipt && !roundOver.withReceipt.card && roundOver.signed && !roundOver.afterSign.receipt && roundOver.afterSign.card && roundOver.afterSign.title === "ROUND OVER", `receipt open: card ${roundOver.withReceipt.card}, receipt ${roundOver.withReceipt.receipt} · signed ${roundOver.signed} · after: card ${roundOver.afterSign.card} ("${roundOver.afterSign.title}"), receipt ${roundOver.afterSign.receipt}`);
    check("the round's end is a card: who woke the yard, the score, your own line and the next round's countdown, with the chrome silenced — and the warm-up takes it down", roundOver.open && roundOver.title === "ROUND OVER" && roundOver.lines[0] === "CELL ONE WOKE DRAINAGE YARD" && roundOver.lines[1] === "CELL ONE 40 · CELL TWO 12" && /^YOU · CELL (ONE|TWO) · 3 KILLS · 1 DEATHS · 2 PULLS · 41 s ON NODES$/.test(roundOver.lines[2] ?? "") && /^NEXT ROUND IN 1[23]s$/.test(roundOver.lines[3] ?? "") && roundOver.quiet.includes("q-ammo") && roundOver.quiet.includes("q-reticle") && !roundOver.after && roundOver.quietAfter.length === 0, `card open ${roundOver.open} · "${roundOver.title}" (${roundOver.color}) · ${roundOver.lines.join(" / ")} · silenced ${roundOver.quiet.length} groups · team ${roundOver.team} · after the warm-up: open ${roundOver.after}, silenced ${roundOver.quietAfter.length}`);
    check("offline: no page errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean console");
    await page.close();

    // ---------------- online: contest ----------------
    const open = async (name: string, seed: number): Promise<Page> => {
      const pg = await browser.newPage({ viewport: { width: 480, height: 270 } });
      await pg.goto(`http://127.0.0.1:${VITE_PORT}/?crawl=0&norender=1&net=ws://127.0.0.1:${HOST_PORT}/room/wake?ai=0%26level=drainage_yard&level=drainage_yard&name=${name}&seed=${seed}`, { waitUntil: "load" });
      await pg.waitForFunction(() => window.__game?.ready === true, null, { timeout: 30000, polling: 100 });
      await pg.waitForFunction(() => window.__game.net()?.status === "joined" && window.__game.net()?.synced === true, null, { timeout: 15000, polling: 100 });
      return pg;
    };
    const a = await open("ALPHA", 1);
    const b = await open("BRAVO", 2);
    const teams = await Promise.all([a, b].map((pg) => pg.evaluate(() => window.__game.state().team)));
    check("online: the room balances the two Blanks into opposite cells", teams[0] === 1 && teams[1] === 2, `ALPHA cell ${teams[0]}, BRAVO cell ${teams[1]}`);
    // warm-up ends 20 s after both joined; walk both to node D meanwhile
    const toD: BotStep[] = [{ kind: "goto", x: 0, z: 17, sprint: true, radius: 1.2, timeoutTicks: 1500, stop: true }, { kind: "hold", ticks: 60 * 60 }];
    await a.evaluate((p) => window.__game.setBot(p), toD);
    await b.evaluate((p) => window.__game.setBot(p), toD);
    const stats = async () => (await (await fetch(`http://127.0.0.1:${HOST_PORT}/stats`)).json()).rooms["wake"];
    let st = await stats();
    const t0 = Date.now();
    while (st.match.phase !== "wake" && Date.now() - t0 < 40000) {
      await a.waitForTimeout(1000);
      st = await stats();
    }
    check("online: the round starts once both cells have a Blank", st.match.phase === "wake", `phase ${st.match.phase}, ${st.match.timeLeft.toFixed(0)} s on the clock`);
    await a.waitForTimeout(9000);
    st = await stats();
    let d = st.match.nodes.find((n: { id: number }) => n.id === 4);
    check("online: a node with both cells on it is contested and stays leased", d.contested === true && d.owner === 0 && d.hold > 0.99, `contested=${d.contested} owner=${d.owner} hold=${d.hold.toFixed(2)}`);
    // BRAVO leaves
    await b.evaluate(() => window.__game.setBot([{ kind: "goto", x: 14, z: 20, sprint: true, radius: 1.2, timeoutTicks: 900, stop: true }, { kind: "hold", ticks: 6000 }]));
    await a.waitForTimeout(9000);
    st = await stats();
    d = st.match.nodes.find((n: { id: number }) => n.id === 4);
    check("online: when BRAVO leaves, ALPHA's cell takes the node and scores", d.owner === 1 && st.match.score[1] > 0, `owner=${d.owner} hold=${d.hold.toFixed(2)} score ${st.match.score[1].toFixed(1)} : ${st.match.score[2].toFixed(1)}`);
    const hudA = await a.evaluate(() => ({ wake: window.__game.state().wake, netMatch: window.__game.net()?.stats.snapshots }));
    const nodeAView = await a.evaluate(() => { const g = window.__game.game as unknown as { netEntities: { kind: number; id: number; a: number }[] }; return g.netEntities.filter((e) => e.kind === 5).map((e) => `${e.id}:${e.a}`).join(","); });
    check("online: clients receive node entities and the match header", nodeAView.includes("4:1"), `entities ${nodeAView}; snapshots ${hudA.netMatch}`);
    await a.close();
    await b.close();

    writeFileSync(`${OUT}/stage5.json`, JSON.stringify({ flips, spread, boosted, pulse, online: st.match, checks }, null, 2));
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
