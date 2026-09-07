/**
 * Stage 2 netcode probe. Boots the Node host and the dev server, connects two
 * headless clients through a simulated 150 ms RTT / 5% loss link, has ALPHA
 * shoot a strafing BRAVO, then checks the quality bars:
 *   - both clients joined in < 5 s
 *   - server tick ≥ 30 Hz
 *   - hit registration on a moving target with lag compensation
 *   - client prediction trace identical to the server simulation
 *   - reconciliation corrections stay small
 *   - rejoin restores the same file
 *   - a cheating client is rejected
 * Then repeats the engagement with lag compensation off to show the difference.
 *
 *   npm run probe:net
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { shot } from "./shot";
import WebSocket from "ws";
import type { BotStep } from "../client/bot";
import { encodeInputs, encodeJoin, Msg } from "../shared/net/protocol";

const VITE_PORT = 5183;
const HOST_PORT = 8790;
const OUT = "probe/out";
const RTT = 150;
const LOSS = 0.05;

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

async function stats(): Promise<any> {
  const r = await fetch(`http://127.0.0.1:${HOST_PORT}/stats`);
  return r.json();
}

/**
 * Slow the client down on purpose (Stage 34).
 *
 * This probe has been green by hand and red on CI since Stage 2, and every time the difference has
 * been the same thing: a runner that draws frames slowly. Reasoning about that from a distance has
 * cost three stages. `CPU=<n>` throttles the browser's main thread by that factor through CDP, so
 * the slow client is a thing this probe can produce on demand rather than a condition it waits to
 * meet. `CPU=1` (the default) is the machine's own speed and changes nothing.
 */
const CPU = Number(process.env.CPU ?? 1);

async function openClient(browser: Awaited<ReturnType<typeof chromium.launch>>, room: string, name: string, seed: number): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  page.on("pageerror", (e) => console.log(`[${name}] pageerror`, String(e)));
  if (CPU > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  }
  const url = `http://127.0.0.1:${VITE_PORT}/?crawl=0&norender=1&net=ws://127.0.0.1:${HOST_PORT}/room/${room}?ai=0%26level=drainage_yard&level=drainage_yard&name=${name}&lat=${RTT / 2}&jitter=8&loss=${LOSS}&seed=${seed}`;
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 30000, polling: 100 });
  return page;
}

async function waitJoined(page: Page, timeoutMs = 10000): Promise<number> {
  await page.waitForFunction(() => window.__game.net()?.status === "joined" && window.__game.net()!.playerId > 0, null, { timeout: timeoutMs, polling: 100 });
  // first authoritative snapshot
  await page.waitForFunction(() => (window.__game.net()?.stats.snapshots ?? 0) > 0, null, { timeout: timeoutMs, polling: 100 });
  return page.evaluate(() => window.__game.net()!.joinMs);
}

async function engagement(browser: Awaited<ReturnType<typeof chromium.launch>>, room: string, seconds: number) {
  const a = await openClient(browser, room, "ALPHA", 11);
  const b = await openClient(browser, room, "BRAVO", 23);
  const joinA = await waitJoined(a);
  const joinB = await waitJoined(b);
  const idA = await a.evaluate(() => window.__game.net()!.playerId);
  const idB = await b.evaluate(() => window.__game.net()!.playerId);
  // BRAVO: walk into the lane and strafe; ALPHA: turn to face and shoot BRAVO's interpolated silhouette
  const planB: BotStep[] = [{ kind: "goto", x: 0, z: 8, sprint: true, radius: 1 }, { kind: "look", yaw: 0, ticks: 10 }, { kind: "strafe", ticks: 60 * seconds, period: 50 }];
  const planA: BotStep[] = [{ kind: "goto", x: 0, z: 20, sprint: true, radius: 1 }, { kind: "killPlayer", targetId: idB, ticks: 60 * seconds }];
  await b.evaluate((p) => window.__game.setBot(p), planB);
  await a.evaluate((p) => window.__game.setBot(p), planA);
  await a.waitForTimeout(seconds * 1000 + 1500);
  const netA = await a.evaluate(() => window.__game.net()!);
  const netB = await b.evaluate(() => window.__game.net()!);
  const st = (await stats()).rooms[room];
  return { a, b, idA, idB, joinA, joinB, netA, netB, st };
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const host = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "server/node-host.ts", String(HOST_PORT)], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(host, /listening/, "node host");
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(VITE_PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(vite, /127\.0\.0\.1/, "vite");
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
  try {
    // ---------------- engagement with lag compensation ----------------
    const E = await engagement(browser, "probe", 12);
    const cA = E.st.clients.find((c: any) => c.id === E.idA);
    const cB = E.st.clients.find((c: any) => c.id === E.idB);
    check("matchmaking: both clients joined in < 5 s", E.joinA < 5000 && E.joinB < 5000, `ALPHA ${E.joinA.toFixed(0)} ms, BRAVO ${E.joinB.toFixed(0)} ms (through ${RTT} ms RTT)`);
    check("server tick ≥ 30 Hz", E.st.tickHz >= 30, `${E.st.tickHz.toFixed(1)} Hz, avg ${E.st.avgTickMs.toFixed(2)} ms, max ${E.st.maxTickMs.toFixed(1)} ms per tick`);
    check("measured RTT reflects the simulated link", E.netA.rttMs >= RTT * 0.8 && E.netA.rttMs <= RTT * 1.6, `ALPHA rtt ${E.netA.rttMs} ms`);
    const hitRate = cA.shots ? cA.hits / cA.shots : 0;
    const dg = E.st.shotDiag;
    const offs = (E.st.rewindOffsets ?? {}) as Record<string, number>;
    const offStr = Object.entries(offs).map(([k, n]) => `${k}:${n}`).join(" ") || "none";
    check("hit-reg at 150 ms RTT + 5% loss on a strafing target (lag comp)", cA.shots >= 20 && hitRate >= 0.6, `${cA.hits}/${cA.shots} server-confirmed hits (${(hitRate * 100).toFixed(0)}%), ${cA.kills} kills; rewind avg ${dg.avgRewind.toFixed(1)} max ${dg.rewindMax} ticks, clamped ${dg.clamped}; misses avg ${dg.avgNearMiss.toFixed(2)} m max ${dg.nearMissMax.toFixed(2)} m from the axis`);
    // which whole-tick offset would have fitted each missed shot best: 0 means the rewind is aimed
    // at the right instant and the misses are the shooter's own (Stage 34)
    console.log(`rewind offset that best fits each miss: ${offStr}`);
    if (E.st.traceLog.length) console.log("server trace log:", JSON.stringify(E.st.traceLog));
    console.log("server log:", JSON.stringify((await (await fetch(`http://127.0.0.1:${HOST_PORT}/stats`)).json()).logs.filter((l: string) => /death|respawn/.test(l))));
    if (E.netB.game.log.length) console.log("BRAVO correction log:", JSON.stringify(E.netB.game.log));
    if (E.netA.game.log.length) console.log("ALPHA correction log:", JSON.stringify(E.netA.game.log));
    check("client-predicted movement identical to server (input-trace comparison)", cA.traceMaxErr < 1e-4 && cB.traceMaxErr < 1e-4 && cA.traceSamples > 200, `max error ALPHA ${cA.traceMaxErr.toExponential(2)} m / BRAVO ${cB.traceMaxErr.toExponential(2)} m over ${cA.traceSamples + cB.traceSamples} samples · gaps filled ${cA.gapFilled + cB.gapFilled}`);
    check("reconciliation corrections stay sub-centimetre", E.netA.game.maxCorrectionM < 0.02 && E.netB.game.maxCorrectionM < 0.02, `max ALPHA ${(E.netA.game.maxCorrectionM * 1000).toFixed(2)} mm, BRAVO ${(E.netB.game.maxCorrectionM * 1000).toFixed(2)} mm; replayed ${E.netA.game.replayedInputs + E.netB.game.replayedInputs} inputs`);
    check("delta snapshots decode under loss (no undecodable frames after warm-up)", E.netA.stats.undecodable <= 3 && E.netB.stats.undecodable <= 3, `undecodable ALPHA ${E.netA.stats.undecodable}, BRAVO ${E.netB.stats.undecodable}; ${E.netA.stats.snapshots} snapshots in`);
    const secs = 14;
    check("bandwidth: < 12 KB/s per client downstream", E.netA.stats.bytesIn / secs < 12000, `${(E.netA.stats.bytesIn / secs / 1000).toFixed(2)} KB/s in, ${(E.netA.stats.bytesOut / secs / 1000).toFixed(2)} KB/s out`);

    // ---------------- rejoin ----------------
    const before = await E.a.evaluate(() => ({ id: window.__game.net()!.playerId, kills: window.__game.state().stats.kills, token: window.__game.net()!.token }));
    await E.a.evaluate(() => window.__game.setBot(null));
    await E.a.evaluate(() => window.__game.reconnect());
    await waitJoined(E.a, 10000);
    const appliedAtRejoin = (await stats()).rooms["probe"].clients.find((c: any) => c.id === before.id).inputsApplied;
    await E.a.evaluate((p) => window.__game.setBot(p), [{ kind: "strafe", ticks: 90 }] as BotStep[]);
    await E.a.waitForTimeout(1800);
    const after = await E.a.evaluate(() => ({ id: window.__game.net()!.playerId, kills: window.__game.state().stats.kills, token: window.__game.net()!.token, status: window.__game.net()!.status }));
    const st2 = (await stats()).rooms["probe"];
    const cAr = st2.clients.find((c: any) => c.id === before.id);
    check("rejoin restores the same file and state, and inputs flow again", after.id === before.id && after.kills === before.kills && after.token === before.token && st2.players === 2 && cAr.inputsApplied > appliedAtRejoin + 30, `id ${before.id}→${after.id}, kills ${before.kills}→${after.kills}, players in room ${st2.players}, inputs applied after rejoin ${cAr.inputsApplied - appliedAtRejoin}`);

    // ---------------- cheater ----------------
    const kicksBefore = st2.kicks;
    const cheat = new WebSocket(`ws://127.0.0.1:${HOST_PORT}/room/probe`);
    cheat.binaryType = "arraybuffer";
    let kicked = "";
    await new Promise<void>((resolve) => {
      cheat.on("open", () => {
        cheat.send(encodeJoin("CHEAT", ""));
        let seq = 0;
        const blast = setInterval(() => {
          // 400 inputs/s with fire every tick and an impossible pitch
          for (let i = 0; i < 8; i++) {
            seq++;
            cheat.send(encodeInputs([{ seq, tick: seq, buttons: 0x80, yaw: 0, pitch: 3.0, viewTick: 0, viewFrac: 0, px: 0, py: 0, pz: 0 }], 0));
          }
        }, 20);
        cheat.on("message", (d: Buffer | ArrayBuffer) => {
          const buf = d instanceof ArrayBuffer ? new Uint8Array(d) : new Uint8Array(d);
          if (buf[0] === Msg.Kick) {
            kicked = new TextDecoder().decode(buf.subarray(3));
            clearInterval(blast);
            resolve();
          }
        });
        cheat.on("close", () => {
          clearInterval(blast);
          resolve();
        });
        setTimeout(() => {
          clearInterval(blast);
          resolve();
        }, 4000);
      });
      cheat.on("error", () => resolve());
    });
    const st3 = (await stats()).rooms["probe"];
    check("cheater rejected (invalid inputs + input rate)", kicked.length > 0 && st3.kicks > kicksBefore, kicked ? `kicked: "${kicked}" (rejected ${st3.inputsRejected} inputs)` : "no kick received");
    try {
      cheat.close();
    } catch {
      /* closed */
    }
    await E.a.evaluate(() => window.__game.setDrawing(true));
    await E.b.evaluate(() => window.__game.setDrawing(true));
    await E.a.evaluate((id) => window.__game.setBot([{ kind: "killPlayer", targetId: id, ticks: 600 }]), E.idB);
    await E.a.waitForTimeout(1200);
    await shotCheck(E.a, `stage2-alpha.png`, "#hud .ammo");
    await shotCheck(E.b, `stage2-bravo.png`, "#hud .ammo");
    await E.a.close();
    await E.b.close();

    // ---------------- control: same engagement without lag compensation ----------------
    const room2 = "probe-nolagcomp";
    // the host reads ?lagcomp=0 on the room's first connection
    const a2 = await browser.newPage({ viewport: { width: 480, height: 270 } });
    await a2.goto(`http://127.0.0.1:${VITE_PORT}/?crawl=0&norender=1&net=ws://127.0.0.1:${HOST_PORT}/room/${room2}?lagcomp=0%26ai=0%26level=drainage_yard&level=drainage_yard&name=ALPHA&lat=${RTT / 2}&jitter=8&loss=${LOSS}&seed=11`, { waitUntil: "load" });
    await a2.waitForFunction(() => window.__game?.ready === true, null, { timeout: 30000, polling: 100 });
    const b2 = await openClient(browser, room2, "BRAVO", 23);
    await waitJoined(a2);
    await waitJoined(b2);
    const idB2 = await b2.evaluate(() => window.__game.net()!.playerId);
    const idA2 = await a2.evaluate(() => window.__game.net()!.playerId);
    await b2.evaluate((p) => window.__game.setBot(p), [{ kind: "goto", x: 0, z: 8, sprint: true, radius: 1 }, { kind: "look", yaw: 0, ticks: 10 }, { kind: "strafe", ticks: 720, period: 50 }] as BotStep[]);
    await a2.evaluate((p) => window.__game.setBot(p), [{ kind: "goto", x: 0, z: 20, sprint: true, radius: 1 }, { kind: "killPlayer", targetId: idB2, ticks: 720 }] as BotStep[]);
    await a2.waitForTimeout(13500);
    const stN = (await stats()).rooms[room2];
    const cA2 = stN.clients.find((c: any) => c.id === idA2);
    const hitRate2 = cA2.shots ? cA2.hits / cA2.shots : 0;
    check("control: lag compensation raises hit-reg on the moving target", hitRate > hitRate2 + 0.1, `lag comp ${(hitRate * 100).toFixed(0)}% vs none ${(hitRate2 * 100).toFixed(0)}% (${cA2.hits}/${cA2.shots})`);
    await a2.close();
    await b2.close();

    const report = { rtt: RTT, loss: LOSS, engagement: { joinA: E.joinA, joinB: E.joinB, server: E.st, netA: E.netA, netB: E.netB }, control: stN, cheaterKick: kicked, checks };
    writeFileSync(`${OUT}/stage2.json`, JSON.stringify(report, null, 2));
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
