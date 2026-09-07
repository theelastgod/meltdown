/**
 * Stage 10 probe — the campaign.
 *  Solo: a fresh file opens the contracts desk in the Deadletter Office,
 *  picks a house at the CRT terminal, launches WAKE UNLISTED and plays it
 *  through — dialogue with testimony, reach, a hold with a VANTAGE wave,
 *  the file at E, out through the plaza — and the ledger host settles it.
 *  Kernel Protocols: a protocol earned on the file is worn, the filament
 *  corrupts the weapon and the sheet really changes (+35 health); in an
 *  explorable district the Threat rating adds patrols and the PA calls the
 *  file by name. The PvP wall: a loadout carrying protocols joins a PvP
 *  room stripped and re-validated, at base health. Weapons 7–8: the
 *  Directive spawns only for a file that unlocked it. Co-op: two files run
 *  a contract on the campaign room, the host resolves the terminal, both
 *  files settle. The white office: the arc ends on a choice, the ending is
 *  written to the file.
 *
 *   npm run probe:campaign
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { shot } from "./shot";
import type { BotStep } from "../client/bot";
import { levelById } from "../shared/sim/level";
import { buildNav, findPath } from "../shared/sim/nav";
import { HUB_LEVEL_ID } from "../shared/sim/hub";

const VITE_PORT = 5203;
const HOST_PORT = 8806;
const OUT = "probe/out";
const HOST = `http://127.0.0.1:${HOST_PORT}`;

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

interface FileRec {
  depth: number;
  wallet: { scrip: number };
  owned: string[];
  campaign?: { faction: string | null; testimony: Record<string, string>; missionsDone: string[]; gigsDone: string[]; protocols: string[]; worn: string[]; weapons: string[]; ending: string | null };
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
  const host = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "server/node-host.ts", String(HOST_PORT)], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(host, /listening/, "node host");
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(VITE_PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(vite, /127\.0\.0\.1/, "vite");
  const browser = await chromium.launch({ args: ARGS });
  const errors: string[] = [];
  const results: Record<string, unknown> = {};
  const file = async (id: string): Promise<FileRec> => (await (await fetch(`${HOST}/file/${id}`)).json()) as FileRec;
  /**
   * A file's secret (Stage 26): the id names a file, this proves the caller owns it, and every
   * mutating route wants it. The probe fixes one and hands the same value to the pages via
   * `?secret=`, which is exactly what a real client does with the one it generated.
   */
  const SECRET = "probestage10secretaaaaaa";
  const post = async (id: string, body: unknown) => (await (await fetch(`${HOST}/file/${id}/campaign`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...(body as object), secret: SECRET }) })).json()) as { ok: boolean; reason?: string };
  const stats = async () => (await (await fetch(`${HOST}/stats`)).json()) as { rooms: Record<string, { clients: { name: string; kills: number; identity: { display: string } }[]; campaignStripped?: number; campaign?: { hostId: number; view: { status: string; objective: string; kind: string } | null; settled: { id: string; ok: boolean }[]; choices: number } }> };
  const nav = new Map<string, ReturnType<typeof buildNav>>();
  const navOf = (level: string) => {
    if (!nav.has(level)) nav.set(level, buildNav(levelById(level)));
    return nav.get(level)!;
  };
  const route = (level: string, from: { x: number; z: number }, to: { x: number; z: number }, radius = 1.2, sprint = true): BotStep[] => {
    const path = findPath(navOf(level), { x: from.x, y: 0, z: from.z }, { x: to.x, y: 0, z: to.z }) ?? [{ x: from.x, y: 0, z: from.z }, { x: to.x, y: 0, z: to.z }];
    return path.slice(1).map((p, i, arr) => ({ kind: "goto" as const, x: p.x, z: p.z, sprint, radius: i === arr.length - 1 ? radius : 1.4, timeoutTicks: 700, stop: i === arr.length - 1 }));
  };
  const nodePos = (level: string, label: string) => {
    const n = levelById(level).nodes.find((x) => x.label === label)!.pos;
    return { x: n.x, z: n.z };
  };
  const newPage = async (viewport: { width: number; height: number }, tag: string): Promise<Page> => {
    const pg = await browser.newPage({ viewport });
    pg.on("pageerror", (e) => errors.push(`${tag}: ${String(e)}`));
    pg.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
    return pg;
  };
  /** play through an open terminal: skip typing, continue, pick `pick` when choices come (default the first) */
  const playTerminal = async (pg: Page, picks: number[] = []): Promise<string[]> => {
    const seen: string[] = [];
    let n = 0;
    for (let i = 0; i < 40; i++) {
      const d = await pg.evaluate(() => window.__game.campaign().dialogue);
      if (!d) break;
      seen.push(`${d.script}:${d.node}`);
      if (!d.ready) {
        await pg.evaluate(() => window.__game.dialogueAdvance());
        await pg.waitForTimeout(60);
        continue;
      }
      if (d.choices.length) {
        const pick = picks[n++] ?? 0;
        await pg.evaluate((k) => window.__game.dialogueAdvance(k), pick);
      } else await pg.evaluate(() => window.__game.dialogueAdvance());
      await pg.waitForTimeout(60);
    }
    return seen;
  };
  const advance = async (pg: Page, ticks: number) => pg.evaluate((n) => window.__game.advance(n), ticks);
  const runBot = async (pg: Page, plan: BotStep[], maxRounds = 60) => {
    await pg.evaluate((p) => window.__game.setBot(p), plan);
    for (let i = 0; i < maxRounds; i++) {
      await advance(pg, 20);
      if ((await pg.evaluate(() => window.__game.botStatus()))?.done) break;
    }
  };
  /** walk to a spot along the nav grid, re-routing from wherever a re-lease put the Blank, until within radius */
  const goTo = async (pg: Page, level: string, to: { x: number; z: number }, radius: number, tries = 4): Promise<number> => {
    let d = Infinity;
    for (let i = 0; i < tries; i++) {
      const from = await pg.evaluate(() => window.__game.state().pos);
      d = Math.hypot(from.x - to.x, from.z - to.z);
      if (d <= radius) break;
      await runBot(pg, route(level, from, to, Math.max(0.8, radius - 0.5)), 45);
      const now = await pg.evaluate(() => window.__game.state().pos);
      d = Math.hypot(now.x - to.x, now.z - to.z);
      if (d <= radius) break;
    }
    return d;
  };
  try {
    // ---------------- solo: the desk, the house, WAKE UNLISTED ----------------
    const acct = "fresh-cam";
    const hub = await newPage({ width: 960, height: 540 }, "hub");
    await hub.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&level=${HUB_LEVEL_ID}&account=${acct}&secret=${SECRET}&shop=${HOST}`, { waitUntil: "load" });
    await hub.waitForFunction(() => window.__game?.ready === true && window.__game.state().hub?.fileLoaded === true, null, { timeout: 40000, polling: 100 });
    await hub.evaluate(() => window.__game.resumeAudio());
    await hub.evaluate(() => window.__game.contracts(true));
    await hub.waitForTimeout(200);
    const c0 = await hub.evaluate(() => window.__game.campaign());
    check("the contracts desk opens on a fresh file with the creation script: no house yet, three to choose from", c0.contractsOpen && c0.faction === null && c0.dialogue?.script === "creation" && c0.next === "m1_wake_unlisted", `dialogue ${c0.dialogue?.script}:${c0.dialogue?.node} · faction ${c0.faction} · next ${c0.next}`);
    const seen = await playTerminal(hub, [2]); // the wake cells
    await hub.waitForTimeout(400);
    const c1 = await hub.evaluate(() => window.__game.campaign());
    const f1 = await file(acct);
    check("picking a house at the terminal writes it to the file on the ledger host and the desk lists the arc, the fixers and the gigs", c1.faction === "cells" && f1.campaign?.faction === "cells" && c1.offers.includes("g_escrow_row") && c1.next === "m1_wake_unlisted" && c1.threat === 0, `script ${seen.join(" → ")} · faction ${c1.faction} · offers [${c1.offers.join(", ")}] · threat ${c1.threat}`);
    await shotCheck(hub, `stage10-contracts.png`);
    const launch = await hub.evaluate(() => window.__game.launch("m1_wake_unlisted"));
    await hub.waitForFunction(() => new URLSearchParams(location.search).get("mission") === "m1_wake_unlisted" && window.__game?.ready === true && window.__game.campaign().mode === "mission", null, { timeout: 40000, polling: 100 });
    await hub.evaluate(() => window.__game.resumeAudio());
    await advance(hub, 1); // the first objective (a terminal) opens on the first sim tick
    const m0 = await hub.evaluate(() => ({ c: window.__game.campaign(), level: window.__game.state().level, wake: window.__game.state().wake, wasps: window.__game.game.world.wasps.length }));
    check("launching a contract travels to its district with the wake off and its VANTAGE presence placed; the first objective is the street", launch.ok && m0.level === "lease_row" && m0.wake === null && m0.c.mission?.title === "WAKE UNLISTED" && m0.c.mission.objective === "READ THE STREET" && m0.wasps >= 2 && m0.c.dialogue?.script === "m1_intro", `level ${m0.level} · wake ${m0.wake ? "on" : "off"} · ${m0.wasps} wasps · objective "${m0.c.mission?.objective}" · dialogue ${m0.c.dialogue?.script}`);
    await hub.waitForTimeout(600);
    await shotCheck(hub, `stage10-terminal.png`);
    await playTerminal(hub);
    await advance(hub, 2);
    const m1 = await hub.evaluate(() => window.__game.campaign().mission);
    check("the terminal resolves and the runtime moves to the escrow terminal at B (marker up)", m1?.kind === "reach" && /ESCROW TERMINAL AT B/.test(m1.objective), `objective "${m1?.objective}" (${m1?.kind})`);
    const B = nodePos("lease_row", "B");
    await goTo(hub, "lease_row", B, 2.5);
    await advance(hub, 3);
    const m2 = await hub.evaluate(() => window.__game.campaign().mission);
    check("reaching B starts the hold: 20 s while the file decrypts", m2?.kind === "survive" && m2.need === 20, `objective "${m2?.objective}" (${m2?.kind}) ${m2?.progress}/${m2?.need}`);
    await shotCheck(hub, `stage10-mission.png`);
    // hold at B: 21 s of sim; a wave lands halfway
    const waspsBefore = await hub.evaluate(() => window.__game.game.world.wasps.length);
    await hub.evaluate((b) => window.__game.setBot([{ kind: "goto", x: b.x, z: b.z, sprint: false, radius: 0.8, timeoutTicks: 60, stop: true }, { kind: "hold", ticks: 60 * 22 }]), B);
    for (let i = 0; i < 70; i++) {
      await advance(hub, 20);
      const st = await hub.evaluate(() => ({ kind: window.__game.campaign().mission?.kind, alive: window.__game.state().health > 0, pos: window.__game.state().pos }));
      if (st.kind !== "survive") break;
      if (Math.hypot(st.pos.x - B.x, st.pos.z - B.z) > 5 && st.alive) await hub.evaluate((b) => window.__game.setBot([{ kind: "goto", x: b.x, z: b.z, sprint: true, radius: 0.8, timeoutTicks: 400, stop: true }, { kind: "hold", ticks: 60 * 22 }]), B);
    }
    const m3 = await hub.evaluate(() => ({ m: window.__game.campaign().mission, wasps: window.__game.game.world.wasps.length, log: window.__game.campaign().log }));
    check("the hold completes and VANTAGE responded with a wave during it; next: the file at E", m3.m?.kind === "reach" && /CABINET AT E/.test(m3.m.objective) && m3.wasps > waspsBefore && m3.m.spawned.wasps >= 4, `objective "${m3.m?.objective}" · wasps ${waspsBefore} → ${m3.wasps} · ${m3.log.filter((l) => /WAVE|OBJECTIVE/.test(l)).slice(-2).join(" | ")}`);
    await goTo(hub, "lease_row", nodePos("lease_row", "E"), 2.5);
    await advance(hub, 3);
    const m4 = await hub.evaluate(() => window.__game.campaign());
    check("the file at E opens a terminal with a real choice: burn it or keep it", m4.dialogue?.script === "m1_file" && (m4.dialogue.choices.length === 0 || m4.dialogue.choices.length === 2), `dialogue ${m4.dialogue?.script}:${m4.dialogue?.node} · choices ${m4.dialogue?.choices.length}`);
    await playTerminal(hub, [0]); // burn it
    await advance(hub, 2);
    const dA = await goTo(hub, "lease_row", nodePos("lease_row", "A"), 2.8);
    await advance(hub, 5);
    console.log(`plaza: ${dA.toFixed(1)} m from A`);
    await hub.waitForTimeout(900);
    const done = await hub.evaluate(() => ({ c: window.__game.campaign(), card: !(document.querySelector("#hud .card") as HTMLElement).hidden, cardTitle: document.querySelector("#hud .card .ct")?.textContent ?? "", audio: window.__game.state().audio }));
    const f2 = await file(acct);
    check("out through the plaza: the contract closes, the card prints, and the ledger host settles it — testimony, Scrip, XP, Threat", done.c.mission?.status === "complete" && done.c.completion?.ok === true && done.card && /CONTRACT CLOSED/.test(done.cardTitle) && f2.campaign?.missionsDone.includes("m1_wake_unlisted") === true && f2.campaign.testimony["m1:lease"] === "burn" && f2.wallet.scrip === 300 && done.c.missionsDone.includes("m1_wake_unlisted"), `status ${done.c.mission?.status} · settled ${done.c.completion?.ok} · card "${done.cardTitle}" · file: missions [${f2.campaign?.missionsDone.join(",")}] testimony ${JSON.stringify(f2.campaign?.testimony)} scrip ${f2.wallet.scrip}`);
    await shotCheck(hub, `stage10-closed.png`);
    await hub.close();

    // ---------------- Kernel Protocols + Threat in an explorable district ----------------
    // the run and the depot settle through the endpoint (their kill objectives need a player; the settlement is the same code path)
    const r2 = await post(acct, { op: "complete", id: "m2_deadletter_run", testimony: { "m2:informant": "spare" } });
    const r3 = await post(acct, { op: "complete", id: "m3_repo_volatility", testimony: { "m3:volatility": "publish" } });
    const rw = await post(acct, { op: "wear", protocols: ["red_lease", "filament_core"] });
    const f3 = await file(acct);
    check("the endpoint settles contracts in arc order only, hands out Kernel Protocols, and wears at most what the file owns", r2.ok && r3.ok && rw.ok && f3.campaign?.protocols.join() === "red_lease,filament_core" && f3.campaign.worn.join() === "red_lease,filament_core" && (await post(acct, { op: "complete", id: "m5_blind_the_model" })).ok === false, `protocols [${f3.campaign?.protocols.join(", ")}] worn [${f3.campaign?.worn.join(", ")}] · out-of-order m5 refused`);
    const ex = await newPage({ width: 640, height: 360 }, "explore");
    await ex.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&level=lease_row&explore=1&account=${acct}&secret=${SECRET}&shop=${HOST}`, { waitUntil: "load" });
    await ex.waitForFunction(() => window.__game?.ready === true && window.__game.campaign().mode === "explore", null, { timeout: 40000, polling: 100 });
    await ex.evaluate(() => window.__game.resumeAudio());
    const e0 = await ex.evaluate(() => ({ c: window.__game.campaign(), maxHealth: window.__game.state().maxHealth, mods: window.__game.state().mods, wasps: window.__game.game.world.wasps.length, levelWasps: window.__game.game.world.level.wasps.length, wake: window.__game.state().wake }));
    check("Kernel Protocols worn in a campaign district are real: +35 health (70 → 105), +15% damage on the sheet, and the blood-red filament over the weapon", e0.maxHealth === 105 && Math.abs((e0.mods.damage ?? 0) - 1.15) < 1e-6 && e0.c.filament === true && e0.c.worn.join() === "red_lease,filament_core", `maxHealth ${e0.maxHealth} · damage ×${(e0.mods.damage ?? 0).toFixed(2)} · filament ${e0.c.filament}`);
    check("an explorable district carries the file's Threat: extra patrols on top of the district's own, no wake", e0.c.mode === "explore" && e0.c.threat >= 1 && e0.wasps > e0.levelWasps && e0.wake === null, `threat ${e0.c.threat} "${e0.c.threatLine}" · wasps ${e0.levelWasps} → ${e0.wasps}`);
    await ex.evaluate(() => {
      window.__game.setBot([{ kind: "look", yaw: 0, pitch: -0.1, ticks: 5 }, { kind: "hold", ticks: 10 }]);
      window.__game.advance(15);
    });
    await ex.waitForTimeout(500);
    await shotCheck(ex, `stage10-filament.png`);
    await ex.close();
    // a NAMED file at high Threat: the PA calls it by name
    const named = "sandbox-cam";
    await post(named, { op: "faction", faction: "estate" });
    for (const id of ["m1_wake_unlisted", "m2_deadletter_run", "m3_repo_volatility"]) await post(named, { op: "complete", id, testimony: {} });
    const pa = await newPage({ width: 320, height: 180 }, "pa");
    await pa.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&norender=1&level=lease_row&explore=1&account=${named}&secret=${SECRET}&shop=${HOST}`, { waitUntil: "load" });
    await pa.waitForFunction(() => window.__game?.ready === true && window.__game.campaign().mode === "explore", null, { timeout: 40000, polling: 100 });
    await pa.evaluate(() => window.__game.advance(60 * 70));
    const p0 = await pa.evaluate(() => ({ c: window.__game.campaign(), pa: window.__game.state().life.pa, display: window.__game.state().identity.display }));
    check("at Threat ≥ 3 the PA calls the file by name and prices it", p0.c.threat >= 3 && p0.pa.some((l) => l.includes(`${p0.display} IS UNLISTED`) && /THREAT RATING/.test(l)), `threat ${p0.c.threat} · display ${p0.display} · PA: ${p0.pa.find((l) => /UNLISTED\. REPORT/.test(l)) ?? p0.pa.slice(-1)[0]}`);
    await pa.close();

    // ---------------- the PvP wall in the browser ----------------
    const roomQ = "wall?ai=0&warmup=30&round=60";
    const wall = await newPage({ width: 320, height: 180 }, "wall");
    const legal = { primary: "lease_breaker", secondary: "shock_baton", attested: [], protocols: ["red_lease", "filament_core"] };
    await wall.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&norender=1&level=drainage_yard&account=${acct}&secret=${SECRET}&loadout=${encodeURIComponent(JSON.stringify(legal))}&net=ws://127.0.0.1:${HOST_PORT}/room/${encodeURIComponent(roomQ)}%26level=drainage_yard&name=WALL`, { waitUntil: "load" });
    await wall.waitForFunction(() => window.__game?.ready === true && window.__game.net()?.status === "joined" && window.__game.net()?.synced === true, null, { timeout: 40000, polling: 100 });
    await wall.waitForTimeout(300);
    const w0 = await wall.evaluate(() => ({ maxHealth: window.__game.state().maxHealth, mods: window.__game.state().mods, admitted: window.__game.game.file.admitted as unknown as Record<string, unknown> | null, filament: window.__game.campaign().filament, mode: window.__game.campaign().mode }));
    const ws = (await stats()).rooms["wall"]!;
    const admitted = w0.admitted ?? {};
    check("a loadout carrying Kernel Protocols joins a PvP room stripped and re-validated: admitted at base health, no damage mod, no filament", ws.campaignStripped === 1 && w0.maxHealth === 70 && w0.mods.damage === 1 && !w0.filament && w0.mode === "none" && admitted["protocols"] === undefined, `stripped ${ws.campaignStripped} · maxHealth ${w0.maxHealth} · damage ×${w0.mods.damage} · filament ${w0.filament}`);
    await wall.close();
    // weapons 7–8: the Directive spawns only for a file that unlocked it
    const dir = { primary: "directive", secondary: "clockeater", attested: [] };
    const locked = await newPage({ width: 320, height: 180 }, "locked");
    await locked.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&norender=1&level=drainage_yard&account=${acct}&secret=${SECRET}&loadout=${encodeURIComponent(JSON.stringify(dir))}&net=ws://127.0.0.1:${HOST_PORT}/room/${encodeURIComponent(roomQ)}%26level=drainage_yard&name=LOCKED`, { waitUntil: "load" });
    await locked.waitForFunction(() => window.__game?.ready === true && (window.__game.net()?.status === "kicked" || window.__game.net()?.status === "closed"), null, { timeout: 40000, polling: 100 });
    const k0 = await locked.evaluate(() => window.__game.net()!.kickReason);
    await locked.close();
    const armed = await newPage({ width: 320, height: 180 }, "armed");
    await armed.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&norender=1&level=drainage_yard&account=sandbox-arms&secret=${SECRET}&loadout=${encodeURIComponent(JSON.stringify(dir))}&net=ws://127.0.0.1:${HOST_PORT}/room/${encodeURIComponent(roomQ)}%26level=drainage_yard&name=ARMED`, { waitUntil: "load" });
    await armed.waitForFunction(() => window.__game?.ready === true && window.__game.net()?.status === "joined" && window.__game.net()?.synced === true, null, { timeout: 40000, polling: 100 });
    await armed.evaluate(() => window.__game.resumeAudio());
    await armed.evaluate(() => {
      window.__game.setBot([{ kind: "look", yaw: 0, pitch: 0, ticks: 3 }, { kind: "fire", ticks: 30 }]);
      window.__game.setRealtime(true);
    });
    await armed.waitForTimeout(1500);
    const a0 = await armed.evaluate(() => ({ def: window.__game.state().weaponDef, slot: window.__game.state().slot, file: window.__game.file(), audio: window.__game.state().audio, ammo: window.__game.state().ammo }));
    check("weapons 7–8: the Directive is refused for a file without the unlock and spawns (slot 7, burst-free marksman) for one that owns it; it fires", /weapon-locked/.test(k0) && a0.def.id === "directive" && a0.slot === 7 && (a0.file.loadout as { primary: string }).primary === "directive" && (a0.audio["shot_directive"] ?? 0) >= 1, `locked: "${k0}" · armed: ${a0.def.id} slot ${a0.slot} rpm ${a0.def.rpm} · shots ${a0.audio["shot_directive"] ?? 0} · ammo ${a0.ammo}`);
    await armed.close();

    // ---------------- co-op: two files, the campaign room, the host at the terminal ----------------
    for (const id of ["coop-a", "coop-b"]) await post(id, { op: "faction", faction: "clockeaters" });
    const coopUrl = (name: string, account: string) => `http://127.0.0.1:${VITE_PORT}/?headless=1&norender=1&level=lease_row&mode=campaign&account=${account}&secret=${SECRET}&net=ws://127.0.0.1:${HOST_PORT}/campaign/${encodeURIComponent("duo?mission=m1_wake_unlisted")}%26level=lease_row&name=${name}`;
    const ca = await newPage({ width: 320, height: 180 }, "coop-a");
    await ca.goto(coopUrl("HOSTA", "coop-a"), { waitUntil: "load" });
    await ca.waitForFunction(() => window.__game?.ready === true && window.__game.net()?.status === "joined" && window.__game.net()?.synced === true && window.__game.campaign().mission !== null, null, { timeout: 40000, polling: 100 });
    const cb = await newPage({ width: 320, height: 180 }, "coop-b");
    await cb.goto(coopUrl("GUESTB", "coop-b"), { waitUntil: "load" });
    await cb.waitForFunction(() => window.__game?.ready === true && window.__game.net()?.status === "joined" && window.__game.net()?.synced === true && window.__game.campaign().mission !== null, null, { timeout: 40000, polling: 100 });
    for (const pg of [ca, cb]) await pg.evaluate(() => window.__game.setRealtime(true));
    await ca.waitForTimeout(800);
    const co0 = await ca.evaluate(() => window.__game.campaign());
    const co0b = await cb.evaluate(() => window.__game.campaign());
    check("co-op: both files see the room's contract; the first to join is the host and holds the terminal", co0.mode === "coop" && co0b.mode === "coop" && co0.mission?.title === "WAKE UNLISTED" && co0.host === true && co0b.host === false && co0.dialogue?.script === "m1_intro" && co0b.dialogue === null, `A host ${co0.host} dialogue ${co0.dialogue?.script} · B host ${co0b.host} dialogue ${co0b.dialogue?.script} · objective "${co0.mission?.objective}"`);
    await playTerminal(ca);
    await ca.waitForTimeout(600);
    const co1 = (await stats()).rooms["campaign:duo"]!.campaign!;
    check("the host's choice reaches the room's runtime and the contract moves on", co1.choices === 1 && co1.view?.kind === "reach", `room: choices ${co1.choices} · objective "${co1.view?.objective}" (${co1.view?.kind})`);
    // both walk to B, hold, to E (the host chooses again), out through A — sim runs on the room; bots run realtime
    const coopWalk = async (to: { x: number; z: number }, radius: number) => {
      for (const pg of [ca, cb]) {
        const from = await pg.evaluate(() => window.__game.state().pos);
        await pg.evaluate((p) => window.__game.setBot(p), [...route("lease_row", from, to, radius), { kind: "hold", ticks: 9000 }] as BotStep[]);
      }
    };
    const waitKind = async (want: (k: string) => boolean, ms: number) => {
      const t = Date.now();
      let v = (await stats()).rooms["campaign:duo"]!.campaign!.view;
      while (Date.now() - t < ms && !(v && want(v.kind))) {
        await ca.waitForTimeout(500);
        v = (await stats()).rooms["campaign:duo"]!.campaign!.view;
        // a re-leased Blank walks back
        for (const pg of [ca, cb]) {
          const s = await pg.evaluate(() => ({ alive: window.__game.state().health > 0, done: window.__game.botStatus()?.done ?? true }));
          if (s.alive && s.done) await coopWalk(B2, 1.5);
        }
      }
      return v;
    };
    const B2 = nodePos("lease_row", "B");
    await coopWalk(B2, 1.5);
    const vB = await waitKind((k) => k === "survive", 30000);
    void vB;
    await waitKind((k) => k === "reach", 30000);
    await coopWalk(nodePos("lease_row", "E"), 1.5);
    const t2 = Date.now();
    let dl: string | null = null;
    while (Date.now() - t2 < 30000 && !dl) {
      await ca.waitForTimeout(500);
      dl = (await ca.evaluate(() => window.__game.campaign().dialogue?.script ?? null)) as string | null;
      for (const pg of [ca, cb]) {
        const s = await pg.evaluate(() => ({ alive: window.__game.state().health > 0, done: window.__game.botStatus()?.done ?? true }));
        if (s.alive && s.done) await coopWalk(nodePos("lease_row", "E"), 1.5);
      }
    }
    if (dl) await playTerminal(ca, [1]); // keep it
    await coopWalk(nodePos("lease_row", "A"), 2.5);
    const t3 = Date.now();
    let cs = (await stats()).rooms["campaign:duo"]!.campaign!;
    while (Date.now() - t3 < 30000 && cs.view?.status !== "complete") {
      await ca.waitForTimeout(500);
      cs = (await stats()).rooms["campaign:duo"]!.campaign!;
      for (const pg of [ca, cb]) {
        const s = await pg.evaluate(() => ({ alive: window.__game.state().health > 0, done: window.__game.botStatus()?.done ?? true }));
        if (s.alive && s.done) await coopWalk(nodePos("lease_row", "A"), 2.5);
      }
    }
    await ca.waitForTimeout(800);
    const fa = await file("coop-a");
    const fb = await file("coop-b");
    const coA = await ca.evaluate(() => window.__game.campaign());
    const coB = await cb.evaluate(() => window.__game.campaign());
    check("co-op: the contract completes on the room and settles on both files with the host's testimony", cs.view?.status === "complete" && cs.settled.length === 2 && cs.settled.every((s) => s.ok) && fa.campaign?.missionsDone.includes("m1_wake_unlisted") === true && fb.campaign?.missionsDone.includes("m1_wake_unlisted") === true && fa.campaign.testimony["m1:lease"] === "keep" && coA.completion?.ok === true && coB.completion?.ok === true, `room ${cs.view?.status} · settled ${cs.settled.map((s) => `${s.ok}`).join(",")} · files [${fa.campaign?.missionsDone.join()}] [${fb.campaign?.missionsDone.join()}] · testimony ${fa.campaign?.testimony["m1:lease"]}`);
    await ca.close();
    await cb.close();

    // ---------------- the white office: the arc ends on a choice ----------------
    const arc = "arc-cam";
    await post(arc, { op: "faction", faction: "cells" });
    for (const [id, t] of [["m1_wake_unlisted", {}], ["m2_deadletter_run", {}], ["m3_repo_volatility", { "m3:volatility": "hold" }], ["m4_the_leak", { "m4:directive": "kept", "m4:vessel": "shield" }], ["m5_blind_the_model", {}], ["m6_trial_by_data", {}]] as const) await post(arc, { op: "complete", id, testimony: t });
    const wo = await newPage({ width: 960, height: 540 }, "white");
    await wo.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&level=white_office&mission=m7_white_office&account=${arc}&secret=${SECRET}&shop=${HOST}`, { waitUntil: "load" });
    await wo.waitForFunction(() => window.__game?.ready === true && window.__game.campaign().mode === "mission", null, { timeout: 40000, polling: 100 });
    await wo.evaluate(() => window.__game.resumeAudio());
    await wo.evaluate(() => {
      window.__game.setBot([{ kind: "look", yaw: 0, pitch: 0.02, ticks: 5 }, { kind: "hold", ticks: 10 }]);
      window.__game.advance(15);
    });
    await wo.waitForTimeout(500);
    await shotCheck(wo, `stage10-white.png`);
    const w1 = await wo.evaluate(() => ({ c: window.__game.campaign(), wasps: window.__game.game.world.wasps.length, level: window.__game.state().level }));
    check("the white office: no guards, the desk is the objective, and the endings open follow the testimony", w1.level === "white_office" && w1.wasps === 0 && w1.c.mission?.kind === "reach" && w1.c.endingsOpen.join() === "wipe,chair", `wasps ${w1.wasps} · objective "${w1.c.mission?.objective}" · endings [${w1.c.endingsOpen.join(", ")}]`);
    const sp = await wo.evaluate(() => window.__game.state().pos);
    await runBot(wo, [{ kind: "goto", x: 0, z: -4, sprint: false, radius: 1.5, timeoutTicks: 600, stop: true }]);
    void sp;
    await advance(wo, 3);
    const w2 = await wo.evaluate(() => window.__game.campaign().dialogue);
    const seenW = await playTerminal(wo, [1]); // take the chair
    await advance(wo, 3);
    await wo.waitForTimeout(800);
    const w3 = await wo.evaluate(() => ({ c: window.__game.campaign(), card: document.querySelector("#hud .card .ct")?.textContent ?? "", cardOpen: !(document.querySelector("#hud .card") as HTMLElement).hidden }));
    const fArc = await file(arc);
    await shotCheck(wo, `stage10-ending.png`, "#hud .card");
    check("Wern's offer plays at the desk; the final input is a choice, the chair is taken, and the ending is written to the file", w2?.script === "m7_office" && seenW.length >= 3 && w3.c.ending === "chair" && w3.cardOpen && /TAKE THE CHAIR/.test(w3.card) && fArc.campaign?.ending === "chair" && fArc.campaign.missionsDone.length === 7, `dialogue ${seenW.join(" → ")} · ending ${w3.c.ending} · card "${w3.card}" · file ending ${fArc.campaign?.ending}, ${fArc.campaign?.missionsDone.length}/7`);
    await wo.close();

    check("no page errors across the desk, two districts, the PvP room, the co-op room and the white office", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean console");
    results["files"] = { fresh: f2.campaign, arc: fArc.campaign };
    writeFileSync(`${OUT}/stage10.json`, JSON.stringify({ results, checks }, null, 2));
    const failed = checks.filter((c) => !c.pass);
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
    if (failed.length) {
      const logs = ((await (await fetch(`${HOST}/stats`)).json()) as { logs: string[] }).logs;
      console.log("host log tail:\n  " + logs.slice(-25).join("\n  "));
      process.exitCode = 1;
    }
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
