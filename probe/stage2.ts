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
import { encodeInputs, encodeJoin, MAX_REWIND_TICKS, Msg } from "../shared/net/protocol";
import { levelById } from "../shared/sim/level";
import { FLASH_MIN, HIT_GLOW } from "../client/hit";
import { RIG_EMISSIVE } from "../client/render/rig";
import { wrapAngle } from "../shared/math/vec3";
import { buildNav, findPath } from "../shared/sim/nav";
import { Btn } from "../shared/sim/input";

const VITE_PORT = 5183;
const HOST_PORT = 8790;
/** Stage 134: how long the BRAVO frame waits for its re-lease, in 50 ms polls (10 s; a re-lease is 3 s) */
const BACK_POLLS = 200;
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

/** what the Stage 89 sampler reads off ALPHA's own view of BRAVO, inside the page */
interface Impact {
  /** the brightest the cloak got */
  peak: number;
  /** samples back at its resting glow after it had been lit */
  after: number;
  samples: number;
  peakHurt: number;
  /** where the body was bending from at the hardest flinch, and where the two of them were */
  best: { hurtFrom: number; bx: number; bz: number; ax: number; az: number } | null;
}

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

/**
 * Run the engagement until it has a SAMPLE, not until a stopwatch runs out.
 *
 * A fixed twelve seconds used to be enough, and then Stage 34 stopped the driver firing into cover
 * — correctly, since a shot the level eats measures geometry rather than hit registration — and the
 * shot count came down with it. Four consecutive local runs then produced 26, 13, 20 and 26 shots
 * against a floor of 20, and the 13 failed: 92% hit registration, nothing clamped, healthy netcode,
 * red anyway. CI failed the same way on the same commit.
 *
 * A percentage is only worth reading over a sample big enough to mean something, so the harness now
 * waits for that sample and reports how long it took. The cap is what keeps a genuine collapse from
 * hanging: if the shots never arrive, the check fails on the count, which is a true statement about
 * the run rather than a threshold that happened to fall the wrong side of a stopwatch.
 */
/** the room the main engagement runs in */
const ROOM = "probe";
const LANE = { x: 0, z: 8 };
const NAV = buildNav(levelById("drainage_yard"));

/**
 * Walk BRAVO back to the lane along the nav mesh and strafe there. `goto` is a straight line, not a
 * path: from the north spawn at (0, -24) the line to the lane runs into the upper deck, so BRAVO
 * wedged against it at about (0, -14.5) and stayed there — behind the deck, out of ALPHA's sight,
 * for the rest of the run. This is the only place in the level the two of them can see each other,
 * so anything that needs a round to land has to put BRAVO back here first.
 */
const laneRoute = (from: { x: number; z: number }, seconds: number): BotStep[] => [
  ...(findPath(NAV, { x: from.x, y: 0, z: from.z }, { x: LANE.x, y: 0, z: LANE.z }) ?? [{ x: from.x, y: 0, z: from.z }, { x: LANE.x, y: 0, z: LANE.z }])
    .slice(1)
    .map((p, i, arr) => ({ kind: "goto" as const, x: p.x, z: p.z, sprint: true, radius: i === arr.length - 1 ? 1.2 : 1.6, timeoutTicks: 400 })),
  { kind: "look", yaw: 0, ticks: 6 },
  { kind: "strafe", ticks: 60 * seconds, period: 50 },
];

async function engagement(browser: Awaited<ReturnType<typeof chromium.launch>>, room: string, seconds: number, wantShots = 24, capSeconds = 40) {
  const a = await openClient(browser, room, "ALPHA", 11);
  const b = await openClient(browser, room, "BRAVO", 23);
  const joinA = await waitJoined(a);
  const joinB = await waitJoined(b);
  const idA = await a.evaluate(() => window.__game.net()!.playerId);
  const idB = await b.evaluate(() => window.__game.net()!.playerId);
  // BRAVO: walk into the lane and strafe; ALPHA: turn to face and shoot BRAVO's interpolated silhouette.
  //
  // BRAVO is walked back to the lane along the NAV MESH whenever it strays, because ALPHA kills it
  // and the respawn is wherever the level puts it. `goto` is a straight line, not a path: from the
  // north spawn at (0, -24) the line to the lane runs into the upper deck, so BRAVO wedged against
  // it at about (0, -14.5) and stayed there — behind the deck, out of ALPHA's sight, for the rest of
  // the run. The diagnostic below caught it holding exactly that position in both slow runs while
  // ALPHA still had seventeen rounds in the magazine.
  //
  // The old harness had the same fault and could not see it. Before Stage 34 the driver fired at
  // BRAVO's silhouette through whatever was in the way, so shots kept coming and every one came back
  // a blocked miss — the "every miss was blocked" signature that stage kept running into. Holding
  // fire made the stall visible; pathing around the deck is what fixes it.
  const planB: BotStep[] = laneRoute({ x: 0, z: 24 }, capSeconds);
  const planA: BotStep[] = [{ kind: "goto", x: 0, z: 20, sprint: true, radius: 1 }, { kind: "killPlayer", targetId: idB, ticks: 60 * capSeconds }];
  await b.evaluate((p) => window.__game.setBot(p), planB);
  await a.evaluate((p) => window.__game.setBot(p), planA);
  const t0 = Date.now();
  await a.waitForTimeout(seconds * 1000 + 1500);
  let shots = 0;
  while (Date.now() - t0 < capSeconds * 1000) {
    shots = (await stats()).rooms[room]?.clients.find((c: any) => c.id === idA)?.shots ?? 0;
    if (shots >= wantShots) break;
    await a.waitForTimeout(500);
    // re-path BRAVO from wherever it actually is: a respawn puts it anywhere, and the lane is the
    // only place the two of them can see each other
    const at = await b.evaluate(() => ({ x: window.__game.state().pos.x, z: window.__game.state().pos.z }));
    if (Math.hypot(at.x - LANE.x, at.z - LANE.z) > 4) await b.evaluate((p) => window.__game.setBot(p), laneRoute(at, capSeconds));
  }
  const engagedMs = Date.now() - t0;
  const netA = await a.evaluate(() => window.__game.net()!);
  const netB = await b.evaluate(() => window.__game.net()!);
  // why the driver stopped, in the driver's own terms: it fires only at a target that is alive, in
  // front and visible, so a short sample is one of those three going away and staying away
  const why = {
    alpha: await a.evaluate((id) => { const s = window.__game.state(); const r = window.__game.net()?.remotes.find((x) => x.id === id); return { alive: s.health > 0, health: s.health, ammo: s.ammo, mag: s.weaponDef.magSize, pos: { x: +s.pos.x.toFixed(1), z: +s.pos.z.toFixed(1) }, sees: r ? { alive: r.alive, health: r.health, x: +r.x.toFixed(1), z: +r.z.toFixed(1) } : null }; }, idB),
    bravo: await b.evaluate(() => { const s = window.__game.state(); return { alive: s.health > 0, health: s.health, pos: { x: +s.pos.x.toFixed(1), z: +s.pos.z.toFixed(1) } }; }),
  };
  const st = (await stats()).rooms[room];
  return { a, b, idA, idB, joinA, joinB, netA, netB, st, engagedMs, wantShots, why };
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
    const E = await engagement(browser, ROOM, 12);
    const cA = E.st.clients.find((c: any) => c.id === E.idA);
    const cB = E.st.clients.find((c: any) => c.id === E.idB);
    check("matchmaking: both clients joined in < 5 s", E.joinA < 5000 && E.joinB < 5000, `ALPHA ${E.joinA.toFixed(0)} ms, BRAVO ${E.joinB.toFixed(0)} ms (through ${RTT} ms RTT)`);
    check("server tick ≥ 30 Hz", E.st.tickHz >= 30, `${E.st.tickHz.toFixed(1)} Hz, avg ${E.st.avgTickMs.toFixed(2)} ms, max ${E.st.maxTickMs.toFixed(1)} ms per tick`);
    check("measured RTT reflects the simulated link", E.netA.rttMs >= RTT * 0.8 && E.netA.rttMs <= RTT * 1.6, `ALPHA rtt ${E.netA.rttMs} ms`);
    const hitRate = cA.shots ? cA.hits / cA.shots : 0;
    const dg = E.st.shotDiag;
    // two checks, because they fail for unrelated reasons and used to be one: whether the harness
    // got a sample, and what that sample says about hit registration
    check("the engagement produced a sample worth a percentage", cA.shots >= 20, `${cA.shots} aimed shots in ${(E.engagedMs / 1000).toFixed(1)} s (wanted ${E.wantShots}, floor 20) · ALPHA ${JSON.stringify(E.why.alpha)} · BRAVO ${JSON.stringify(E.why.bravo)}`);
    check("hit-reg at 150 ms RTT + 5% loss on a strafing target (lag comp)", hitRate >= 0.6, `${cA.hits}/${cA.shots} server-confirmed hits (${(hitRate * 100).toFixed(0)}%), ${cA.kills} kills; rewind avg ${dg.avgRewind.toFixed(1)} max ${dg.rewindMax} ticks, clamped ${dg.clamped}; misses avg ${dg.avgNearMiss.toFixed(2)} m max ${dg.nearMissMax.toFixed(2)} m from the axis (${dg.missInsideHitbox} of ${dg.nearMissN} inside the 0.4 m capsule · ${dg.missBlocked} blocked, ${dg.missClean} clean)`);
    if (E.st.traceLog.length) console.log("server trace log:", JSON.stringify(E.st.traceLog));
    console.log("server log:", JSON.stringify((await (await fetch(`http://127.0.0.1:${HOST_PORT}/stats`)).json()).logs.filter((l: string) => /death|respawn/.test(l))));
    if (E.netB.game.log.length) console.log("BRAVO correction log:", JSON.stringify(E.netB.game.log));
    if (E.netA.game.log.length) console.log("ALPHA correction log:", JSON.stringify(E.netA.game.log));
    // Lag compensation has a ceiling (MAX_REWIND_TICKS), and a shot that asks to reach past it is
    // not compensated at all — it resolves against a world newer than the one the shooter saw. That
    // is silent: the shot simply misses. It is also the whole of this probe's slow-machine failure,
    // and it went unexplained for four stages because nothing named it. Under load the collapse
    // tracks the clamp count exactly: 0-2 clamped of 25 shots is 88% hit-reg, 7 of 34 is 50%, and
    // 70 of 70 is 9% with misses averaging 0.93 m (Stage 34).
    const clampRate = dg.shots ? dg.clamped / dg.shots : 0;
    check("lag compensation is not being clamped away: the rewind a supported link asks for fits the budget", clampRate < 0.1, `${dg.clamped}/${dg.shots} shots asked to rewind past the ${MAX_REWIND_TICKS}-tick cap (${(clampRate * 100).toFixed(0)}%) · avg demand ${dg.avgRewind.toFixed(1)} ticks, and ${RTT} ms RTT alone costs ${((RTT / 2 / 1000) * 60 + 6).toFixed(1)}`);
    check("client-predicted movement identical to server (input-trace comparison)", cA.traceMaxErr < 1e-4 && cB.traceMaxErr < 1e-4 && cA.traceSamples > 200, `max error ALPHA ${cA.traceMaxErr.toExponential(2)} m / BRAVO ${cB.traceMaxErr.toExponential(2)} m over ${cA.traceSamples + cB.traceSamples} samples · gaps filled ${cA.gapFilled + cB.gapFilled}`);
    check("reconciliation corrections stay sub-centimetre", E.netA.game.maxCorrectionM < 0.02 && E.netB.game.maxCorrectionM < 0.02, `max ALPHA ${(E.netA.game.maxCorrectionM * 1000).toFixed(2)} mm, BRAVO ${(E.netB.game.maxCorrectionM * 1000).toFixed(2)} mm; replayed ${E.netA.game.replayedInputs + E.netB.game.replayedInputs} inputs`);
    check("delta snapshots decode under loss (no undecodable frames after warm-up)", E.netA.stats.undecodable <= 3 && E.netB.stats.undecodable <= 3, `undecodable ALPHA ${E.netA.stats.undecodable}, BRAVO ${E.netB.stats.undecodable}; ${E.netA.stats.snapshots} snapshots in`);
    const secs = 14;
    // A room of eight, on real sockets, because that is the size the product sells.
    //
    // The check below this one measures two clients and has always measured two, while matchmaking
    // fills a public room to eight before opening the next shard. tests/bandwidth.test.ts drives the
    // Room class directly and finds the per-client cost linear in the others being described — about
    // +0.21 KB/s each, so a full lobby is ~1.46x a duo — which put the extrapolated figure at or over
    // this budget. That was an estimate. This measures it (Stage 34).
    //
    // Raw WebSockets, not pages: downstream volume is a function of who is moving, not of anything a
    // renderer does, and eight browsers under SwiftShader is how probe:mastery came to time out.
    const bw = await (async () => {
      const N = 8;
      const SECONDS = 5;
      const socks = Array.from({ length: N }, () => new WebSocket(`ws://127.0.0.1:${HOST_PORT}/room/bandwidth?ai=0%26level=drainage_yard`));
      const got = new Array<number>(N).fill(0);
      const seqs = new Array<number>(N).fill(0);
      // Ack the newest snapshot each client has seen. `rec.ackTick` is what picks the delta baseline
      // server-side, so a client that never acks is sent a FULL snapshot every time — measuring that
      // would overstate the budget by about double and say nothing about the shipped protocol. The
      // snapshot header is [u8 Msg.Snapshot][u32 tick], which is all this needs to read.
      const acks = new Array<number>(N).fill(0);
      await Promise.all(socks.map((w, i) => new Promise<void>((resolve) => {
        w.binaryType = "arraybuffer";
        w.on("message", (d: Buffer | ArrayBuffer) => {
          const buf = d instanceof Buffer ? d : Buffer.from(new Uint8Array(d));
          got[i]! += buf.byteLength;
          if (buf.byteLength >= 5 && buf.readUInt8(0) === Msg.Snapshot) acks[i] = Math.max(acks[i]!, buf.readUInt32LE(1));
        });
        w.on("open", () => { w.send(encodeJoin(`BW${i}`, "")); resolve(); });
        w.on("error", () => resolve());
      })));
      // let everyone join and take a first full snapshot before the meter starts
      await new Promise((r) => setTimeout(r, 1500));
      got.fill(0);
      const t0 = Date.now();
      const drive = setInterval(() => {
        for (let i = 0; i < N; i++) {
          const w = socks[i]!;
          if (w.readyState !== 1) continue;
          const seq = ++seqs[i]!;
          // everyone moving and turning: the case a delta snapshot cannot shrink away
          const buttons = Btn.Forward | Btn.Sprint | (Math.floor(seq / 20) % 2 ? Btn.Left : Btn.Right);
          w.send(encodeInputs([{ seq, tick: seq, buttons, yaw: Math.sin(seq * 0.05 + i) * 2, pitch: 0, viewTick: acks[i]!, viewFrac: 0, px: 0, py: 0, pz: 0 }], acks[i]!));
        }
      }, 1000 / 60);
      await new Promise((r) => setTimeout(r, SECONDS * 1000));
      clearInterval(drive);
      const secs = (Date.now() - t0) / 1000;
      const joined = (await stats()).rooms["bandwidth"]?.players ?? 0;
      for (const w of socks) w.close();
      const perClient = got.reduce((a, b) => a + b, 0) / N / secs / 1000;
      return { perClient, joined, room: (perClient * joined) };
    })();
    check("bandwidth at the room cap: eight clients, the size matchmaking actually fills", bw.joined >= 6 && bw.perClient < 12, `${bw.perClient.toFixed(2)} KB/s per client with ${bw.joined} in the room · ${bw.room.toFixed(1)} KB/s off the shard`);
    check("bandwidth: < 12 KB/s per client downstream", E.netA.stats.bytesIn / secs < 12000, `${(E.netA.stats.bytesIn / secs / 1000).toFixed(2)} KB/s in, ${(E.netA.stats.bytesOut / secs / 1000).toFixed(2)} KB/s out`);

    // ---------------- rejoin ----------------
    // Stop the bot BEFORE reading the counters, and let whatever is already in flight land. The
    // engagement is still running when this section starts, so reading the kill count and then
    // stopping the bot leaves a round trip in which ALPHA can land one more — CI #108 read 6 → 7
    // and failed a check that is not about kills at all (Stage 82).
    await E.a.evaluate(() => window.__game.setBot(null));
    await E.a.waitForTimeout(700);
    const before = await E.a.evaluate(() => ({ id: window.__game.net()!.playerId, kills: window.__game.state().stats.kills, token: window.__game.net()!.token }));
    await E.a.evaluate(() => window.__game.reconnect());
    await waitJoined(E.a, 10000);
    const appliedAtRejoin = (await stats()).rooms["probe"].clients.find((c: any) => c.id === before.id).inputsApplied;
    await E.a.evaluate((p) => window.__game.setBot(p), [{ kind: "strafe", ticks: 90 }] as BotStep[]);
    await E.a.waitForTimeout(1800);
    const after = await E.a.evaluate(() => ({ id: window.__game.net()!.playerId, kills: window.__game.state().stats.kills, token: window.__game.net()!.token, status: window.__game.net()!.status }));
    const st2 = (await stats()).rooms["probe"];
    const cAr = st2.clients.find((c: any) => c.id === before.id);
    // the claim is that the file survives the link, not that the match paused while it did: the
    // counter may only ever go up, and it has to have something in it for that to mean anything
    check("rejoin restores the same file and state, and inputs flow again", after.id === before.id && before.kills > 0 && after.kills >= before.kills && after.token === before.token && st2.players === 2 && cAr.inputsApplied > appliedAtRejoin + 30, `id ${before.id}→${after.id}, kills ${before.kills}→${after.kills} (never reset), players in room ${st2.players}, inputs applied after rejoin ${cAr.inputsApplied - appliedAtRejoin}`);

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
    // ALPHA draws for the Stage 89 read below; BRAVO stays dark until its own screenshot. Both
    // pages rendering SwiftShader for half a minute on a throttled box is what dropped BRAVO's
    // socket out of the room in two of five runs at CPU=2 — ALPHA stayed online, synced and
    // drawing with `remotes: 0` and nothing to shoot at.
    await E.a.evaluate(() => window.__game.setDrawing(true));
    await E.a.evaluate((id) => window.__game.setBot([{ kind: "killPlayer", targetId: id, ticks: 60 * 32 }]), E.idB);

    // ---------------- Stage 89: a hit is visible on the body it landed on ----------------
    //
    // This is the one place in this harness where a client is actually drawing: the engagement runs
    // with `norender=1` so the netcode is measured and not the renderer, and a body that is never
    // drawn has no rig to light. So the read happens here, with ALPHA rendering and still firing.
    //
    // Sampled inside the page rather than from out here: a hit's flash lives about a fifth of a
    // second, and this process comes back every quarter of one.
    await E.a.evaluate((id) => {
      const w = window as unknown as { __impact: Impact; __impactTimer: number };
      w.__impact = { peak: 0, after: 0, samples: 0, peakHurt: 0, best: null };
      w.__impactTimer = window.setInterval(() => {
        try {
          const r = window.__game.rig(id);
          const i = w.__impact;
          i.samples++;
          if (r.emissive > i.peak) i.peak = r.emissive;
          // at rest again, having been lit: the proof that the light dies away rather than sticking
          if (i.peak > 0.1 && r.emissive <= 0.03) i.after++;
          if ((r.hurt ?? 0) > i.peakHurt) {
            const them = window.__game.net()?.remotes.find((x) => x.id === id);
            const me = window.__game.state().pos;
            i.peakHurt = r.hurt ?? 0;
            if (them) i.best = { hurtFrom: r.hurtFrom ?? 0, bx: them.x, bz: them.z, ax: me.x, az: me.z };
          }
        } catch {
          // BRAVO's body is not on this client yet: nothing to sample this tick
        }
      }, 8);
    }, E.idB);
    const lit = RIG_EMISSIVE + FLASH_MIN * HIT_GLOW * 0.95;
    const impactT0 = Date.now();
    let im: Impact = { peak: 0, after: 0, samples: 0, peakHurt: 0, best: null };
    // BRAVO has had no plan since the engagement ended, and by now it has died twice and respawned
    // wherever the level put it — in run #118 that was (15.0, 19.7), across the yard and out of the
    // lane, and ALPHA spent the whole window firing at nothing. So this section puts BRAVO back and
    // keeps it there, exactly as the engagement loop does.
    // and it waits for a round to land rather than for a stopwatch. The count is ALPHA's own tally
    // of the hits the server confirmed to it, not the room's per-client record: under a 3x CPU
    // throttle that record went missing from one `/stats` reply and the delta came back −29 while
    // the body was lighting perfectly. This counter only ever goes up, and it is checked separately
    // below, so a run where nothing was ever fired at BRAVO cannot read as the feature being broken.
    const hitsOf = async (): Promise<{ hits: number; shots: number }> => E.a.evaluate(() => ({ hits: window.__game.net()?.game.myHits ?? 0, shots: window.__game.net()?.game.myShotsConfirmed ?? 0 }));
    const hits0 = await hitsOf();
    let landed = 0;
    let fired = 0;
    while (Date.now() - impactT0 < 30000) {
      const at = await E.b.evaluate(() => ({ x: window.__game.state().pos.x, z: window.__game.state().pos.z }));
      if (Math.hypot(at.x - LANE.x, at.z - LANE.z) > 4) await E.b.evaluate((p) => window.__game.setBot(p), laneRoute(at, 30));
      await E.a.waitForTimeout(500);
      im = await E.a.evaluate(() => (window as unknown as { __impact: Impact }).__impact);
      const now = await hitsOf();
      landed = now.hits - hits0.hits;
      fired = now.shots - hits0.shots;
      if (landed >= 3 && im.peak >= lit && im.peakHurt > 0 && im.after > 0) break;
    }
    await E.a.evaluate(() => clearInterval((window as unknown as { __impactTimer: number }).__impactTimer));
    // what ALPHA could see when the window closed, in ALPHA's own terms: this check can only fail
    // two ways — the link, or the driver — and a bare count says which one it was not
    const sight = await E.a.evaluate((id) => {
      const n = window.__game.net();
      const r = n?.remotes.find((x) => x.id === id);
      return { online: !!n?.online, synced: !!n?.synced, remotes: n?.remotes.length ?? 0, calls: window.__game.view().calls, sees: r ? { alive: r.alive, x: +r.x.toFixed(1), z: +r.z.toFixed(1) } : null };
    }, E.idB);
    check("the drawing client got a sample: rounds landed on BRAVO while ALPHA was rendering", landed >= 3, `${landed} of ${fired} rounds landed, server-confirmed, in ${((Date.now() - impactT0) / 1000).toFixed(1)} s · the body sampled ${im.samples} times · ALPHA ${JSON.stringify(sight)}`);
    // Before this stage a round into a body ended in mid-air: the spark was drawn for world hits
    // only, the body never lit, and the flinch the pose rig has had since Stage 74 had never once
    // been handed to anybody but the local file.
    check("a round that lands lights the body it landed on, and the light dies away again", im.peak >= lit && im.after > 0 && im.samples > 50, `peak emissive ${im.peak.toFixed(3)} (at rest ${RIG_EMISSIVE}, a hit wants ≥ ${lit.toFixed(3)}) · back at rest in ${im.after} of ${im.samples} samples`);
    const bearErr = im.best ? Math.abs(wrapAngle(im.best.hurtFrom - Math.atan2(-(im.best.ax - im.best.bx), -(im.best.az - im.best.bz)))) : Math.PI;
    check("and the body bends away from the muzzle, not some other way", im.peakHurt > 0 && bearErr < 0.6, `flinch ${im.peakHurt.toFixed(2)} · it bends from ${(im.best?.hurtFrom ?? 0).toFixed(2)} rad, and ALPHA was ${bearErr.toFixed(2)} rad off that bearing, ${im.best ? Math.hypot(im.best.ax - im.best.bx, im.best.az - im.best.bz).toFixed(1) : "?"} m away`);

    await E.b.evaluate(() => window.__game.setDrawing(true));
    // Stage 134: ALPHA's 32 s kill plan outlives the window above, and BRAVO is closed for the
    // three seconds of its re-lease at the moment its frame is taken; since Stage 128 the gun's
    // chrome goes with a closed file, and the picture claims a living file's HUD. ALPHA is stood
    // down and the shutter waits for BRAVO to be back on the ledger with its ammo drawn
    await E.a.evaluate(() => window.__game.setBot(null));
    const bravoBack = await E.b.evaluate(async (polls) => {
      for (let i = 0; i < polls; i++) {
        const s = window.__game.state();
        const el = document.querySelector("#hud .ammo");
        const cs = el ? getComputedStyle(el) : null;
        const drawn = !!cs && cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) >= 0.02;
        if (s.health > 0 && drawn) return { back: true, waited: i * 50, health: s.health };
        await new Promise((r) => setTimeout(r, 50));
      }
      const s = window.__game.state();
      return { back: false, waited: polls * 50, health: s.health };
    }, BACK_POLLS);
    check("BRAVO is back on the ledger, ammo drawn, before its frame is taken: the picture claims a living file's HUD", bravoBack.back, `re-leased ${bravoBack.waited} ms after ALPHA stood down · health ${bravoBack.health}`);
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

    // ---------------- you can hear the other file (Stage 80) ----------------
    // The file has heard its own boots since the first stage and nobody else's: another player
    // could cross the street behind it at seven metres a second in silence. Two clients, one
    // standing still, the other walking a line down its right-hand side.
    const room3 = "probe-steps";
    const a3 = await openClient(browser, room3, "ALPHA", 11);
    const b3 = await openClient(browser, room3, "BRAVO", 23);
    await waitJoined(a3);
    await waitJoined(b3);
    // ALPHA stands at the yard's middle looking down -z, so its right hand is +x
    await a3.evaluate(() => window.__game.setBot([{ kind: "goto", x: 0, z: 10, sprint: true, radius: 1 }, { kind: "look", yaw: 0, ticks: 20 }, { kind: "hold", ticks: 3000 }]));
    await a3.waitForFunction(() => Math.hypot(window.__game.state().pos.x - 0, window.__game.state().pos.z - 10) < 2.5, null, { timeout: 30000, polling: 100 });
    const quiet = await a3.evaluate(() => window.__game.state().heard.n);
    // BRAVO walks the length of ALPHA's right-hand side, eight metres out
    await b3.evaluate(() => window.__game.setBot([
      { kind: "goto", x: 8, z: 18, sprint: true, radius: 1.2 },
      { kind: "goto", x: 8, z: 2, sprint: true, radius: 1.2, stop: false },
      { kind: "goto", x: 8, z: 18, sprint: true, radius: 1.2, stop: false },
      { kind: "hold", ticks: 3000 },
    ]));
    const pans: number[] = [];
    let heard = quiet;
    for (let i = 0; i < 200 && pans.length < 6; i++) {
      await a3.waitForTimeout(150);
      const h = await a3.evaluate(() => window.__game.state().heard);
      if (h.n > heard) {
        heard = h.n;
        pans.push(h.pan);
      }
    }
    const rightSide = pans.filter((p) => p > 0.3).length;
    check("a file walking past is heard, from the side it is walking on", heard > quiet + 4 && pans.length >= 6 && rightSide >= pans.length - 1, `${heard - quiet} steps heard from BRAVO · pans ${pans.map((p) => p.toFixed(2)).join(" ")} (${rightSide} of ${pans.length} to the right, where it is walking)`);
    // and its gun, which until now was silent: a file could empty a magazine at you from across the
    // street and the first you knew of it was the integrity bar (Stage 81). BRAVO stands off to
    // ALPHA's right and fires past it, so nothing about this is ALPHA taking damage.
    const alphaAt = await a3.evaluate(() => ({ x: window.__game.state().pos.x, z: window.__game.state().pos.z }));
    await b3.evaluate((at) => {
      const p = at as { x: number; z: number };
      window.__game.setBot([
        { kind: "goto", x: p.x + 11, z: p.z, sprint: true, radius: 1.2 },
        { kind: "fire", ticks: 240, aimAt: { x: p.x + 11, y: 1.3, z: p.z - 40 } },
        { kind: "hold", ticks: 2000 },
      ]);
    }, alphaAt);
    let shots = await a3.evaluate(() => window.__game.state().heardShot);
    const quietShots = shots.n;
    for (let i = 0; i < 160 && shots.n < quietShots + 4; i++) {
      await a3.waitForTimeout(150);
      shots = await a3.evaluate(() => window.__game.state().heardShot);
    }
    check("a file firing across the street is heard, from the side it is firing on, a beat after the flash", shots.n >= quietShots + 4 && shots.pan > 0.3 && shots.distance > 6 && Math.abs(shots.delay - shots.distance / 340) < 0.005, `${shots.n - quietShots} shots heard · pan ${shots.pan.toFixed(2)} · ${shots.distance.toFixed(1)} m away, arriving ${(shots.delay * 1000).toFixed(0)} ms behind the flash (sound covers that in ${((shots.distance / 340) * 1000).toFixed(0)} ms)`);

    // and out at the far end of the yard it is out of earshot — while it is still walking, which is
    // the whole point: a body that has stopped is silent at any distance, so a check that let it
    // arrive and stand still would pass with no earshot rule at all (it did, until this line)
    await b3.evaluate(() => window.__game.setBot([
      { kind: "goto", x: 0, z: -24, sprint: true, radius: 1.5, stop: false },
      { kind: "goto", x: 14, z: -24, sprint: true, radius: 1.5, stop: false },
      { kind: "goto", x: 0, z: -24, sprint: true, radius: 1.5, stop: false },
      { kind: "goto", x: 14, z: -24, sprint: true, radius: 1.5, stop: false },
      { kind: "hold", ticks: 3000 },
    ]));
    await a3.waitForFunction(() => {
      const r = window.__game.net()!.remotes[0];
      const me = window.__game.state().pos;
      return !!r && Math.hypot(r.x - me.x, r.z - me.z) > 30 && Math.hypot(r.vx, r.vz) > 3;
    }, null, { timeout: 40000, polling: 100 }).catch(() => null);
    const far = await a3.evaluate(() => {
      const r = window.__game.net()!.remotes[0];
      const me = window.__game.state().pos;
      return { n: window.__game.state().heard.n, d: r ? Math.hypot(r.x - me.x, r.z - me.z) : -1 };
    });
    // sample while it paces, and record the slowest it was seen going: if that is above a walk, the
    // silence is the range and not the legs
    let walking = 0;
    let nearest = 999;
    const samples = 18;
    for (let i = 0; i < samples; i++) {
      await a3.waitForTimeout(140);
      const r = await a3.evaluate(() => {
        const rv = window.__game.net()!.remotes[0];
        const me = window.__game.state().pos;
        return rv ? { sp: Math.hypot(rv.vx, rv.vz), d: Math.hypot(rv.x - me.x, rv.z - me.z) } : { sp: 0, d: 0 };
      });
      // count the samples where it was walking rather than demanding a floor on every one: it paces
      // between waypoints and slows for a tick at each turn, and a threshold on the minimum makes
      // this check a question about where the turn landed
      if (r.sp > 1.5) walking++;
      nearest = Math.min(nearest, r.d);
    }
    const stillFar = await a3.evaluate(() => window.__game.state().heard.n);
    check("and at the far end of the yard it is out of earshot, while it is still walking", far.d > 30 && nearest > 28 && walking >= samples - 4 && stillFar === far.n, `BRAVO pacing ${nearest.toFixed(1)}–${far.d.toFixed(1)} m away, walking in ${walking} of ${samples} samples · ${stillFar - far.n} steps heard in the two and a half seconds it took`);
    await a3.close();
    await b3.close();

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
