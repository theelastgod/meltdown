/**
 * Stage 11 probe — the endgame loops.
 *  The ledger host serves today's three contracts, the week's Audit
 *  playlist and the Deep Wake; the FILE panel shows them. Two files join
 *  this week's Audit room: the Welcome names the playlist, the client runs
 *  the same gravity and sheet the room runs, a loadout the playlist bans
 *  is refused at join, and the settled round lands on the leaderboard and
 *  on each file. The round's flips push the Deep Wake toward the flipping
 *  file's house and the MAP tab shows the graph. A Depth-50 file Rewrites:
 *  Depth 1, stamps and counters kept, Wakelight paid; Wakelight buys a CRT
 *  theme the HUD wears and a preset slot the file saves into.
 *
 *   npm run probe:endgame
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import type { BotStep } from "../client/bot";
import { levelById } from "../shared/sim/level";
import { buildNav, findPath } from "../shared/sim/nav";
import { LEDGER_ITEMS } from "../shared/manifest/items";
import type { AuditDef } from "../shared/endgame/audits";

const VITE_PORT = 5205;
const HOST_PORT = 8808;
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

interface Endgame {
  day: number;
  contracts: { id: string; text: string; counter: string; need: number }[];
  audit: AuditDef & { week: number };
  board: { account: string; display: string; score: number }[];
  season: { season: number; week: number; rounds: number; held: Record<string, number>; districts: Record<string, { label: string; house: string; leader: string; pressure: number }[]>; history: string[]; last: string | null };
}
interface FileRec {
  depth: number;
  xp: number;
  wallet: { scrip: number; wakelight: number };
  stamps: string[];
  counters: Record<string, number>;
  rewrites?: number;
  cosmetics?: string[];
  theme?: string | null;
  presets?: { name: string; loadout: unknown }[];
  audits?: { week: number; best: number; played: number };
  ledger: string[];
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const checks: Check[] = [];
  const check = (name: string, pass: boolean, detail: string) => {
    checks.push({ name, pass, detail });
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}  — ${detail}`);
  };
  const host = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "server/node-host.ts", String(HOST_PORT)], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(host, /listening/, "node host");
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(VITE_PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(vite, /127\.0\.0\.1/, "vite");
  const browser = await chromium.launch({ args: ARGS });
  const errors: string[] = [];
  const results: Record<string, unknown> = {};
  const endgame = async (): Promise<Endgame> => (await (await fetch(`${HOST}/endgame`)).json()) as Endgame;
  const file = async (id: string): Promise<FileRec> => (await (await fetch(`${HOST}/file/${id}`)).json()) as FileRec;
  /**
   * A file's secret (Stage 26): the id names a file, this proves the caller owns it, and every
   * mutating route wants it. The probe fixes one and hands the same value to the pages via
   * `?secret=`, which is exactly what a real client does with the one it generated.
   */
  const SECRET = "probestage11secretaaaaaa";
  const post = async (path: string, body: unknown) => (await (await fetch(`${HOST}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...(body as object), secret: SECRET }) })).json()) as { ok: boolean; reason?: string };
  const stats = async () => (await (await fetch(`${HOST}/stats`)).json()) as { rooms: Record<string, { audit: { id: string; week: number; scores: number[] } | null; seasonLast: string | null; loadoutRejections: string[]; clients: { name: string; kills: number; flips: number }[]; match: { phase: string } | null }> };
  const newPage = async (viewport: { width: number; height: number }, tag: string): Promise<Page> => {
    const pg = await browser.newPage({ viewport });
    pg.on("pageerror", (e) => errors.push(`${tag}: ${String(e)}`));
    pg.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
    return pg;
  };
  try {
    // ---------------- the board ----------------
    const eg0 = await endgame();
    const nodes = Object.values(eg0.season.districts).flat();
    check("the ledger host serves today's three contracts, the week's Audit playlist and an empty Deep Wake season", eg0.contracts.length === 3 && new Set(eg0.contracts.map((c) => c.id)).size === 3 && !!eg0.audit.id && eg0.board.length === 0 && nodes.length === 15 && nodes.every((n) => n.house === "unaligned"), `day ${eg0.day} · [${eg0.contracts.map((c) => c.id).join(", ")}] · audit ${eg0.audit.id} week ${eg0.audit.week} · season ${eg0.season.season} w${eg0.season.week}`);
    const au = eg0.audit;

    // ---------------- the FILE panel ----------------
    const acct = "sandbox-eg";
    await post(`/file/${acct}/campaign`, { op: "faction", faction: "cells" });
    await post(`/file/fresh-eg/campaign`, { op: "faction", faction: "estate" });
    const pg = await newPage({ width: 960, height: 540 }, "file");
    await pg.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&level=drainage_yard&account=${acct}&secret=${SECRET}&shop=${HOST}`, { waitUntil: "load" });
    await pg.waitForFunction(() => window.__game?.ready === true && window.__game.endgame().contracts.length === 3, null, { timeout: 40000, polling: 100 });
    await pg.evaluate(() => window.__game.toggleFile(true));
    await pg.waitForTimeout(300);
    const f0 = await pg.evaluate(() => ({ eg: window.__game.endgame(), text: (document.querySelector("#hud .file .eg") as HTMLElement)?.textContent ?? "" }));
    await pg.screenshot({ path: `${OUT}/stage11-file.png` });
    const fRec = await file(acct);
    const prog = f0.eg.contracts.map((c) => ({ id: c.id, progress: c.progress, expect: Math.min(c.need, Math.max(0, (fRec.counters[c.counter] ?? 0) - 0)) }));
    check("the FILE panel shows the day's contracts with progress as the counter delta since the day began, the Audit, Rewrite and the Wakelight shop", /DAILY CONTRACTS/.test(f0.text) && /AUDIT/.test(f0.text) && /REWRITE/.test(f0.text) && /WAKELIGHT SHOP/.test(f0.text) && f0.eg.audit?.id === au.id && prog.every((p) => p.progress === 0), `contracts ${prog.map((p) => `${p.id}:${p.progress}`).join(" ")} · audit ${f0.eg.audit?.name}`);
    const unfinished = f0.eg.contracts.find((c) => !c.done);
    const claim = unfinished ? await post(`/file/${acct}/claim`, { id: unfinished.id }) : { ok: false, reason: "" };
    check("a contract cannot be claimed before it is done (the answer is the progress)", !claim.ok && /^\d+\/\d+$/.test(claim.reason ?? ""), `claim ${unfinished?.id}: ${claim.reason}`);
    await pg.close();

    // ---------------- the Audit room ----------------
    const nav = buildNav(levelById("lease_row"));
    const B = levelById("lease_row").nodes.find((n) => n.label === "B")!.pos;
    const legal = (): Record<string, unknown> => {
      const primary = au.weapons.length ? au.weapons[0] : "lease_breaker";
      const secondary = au.weapons.length ? au.weapons[au.weapons.length - 1] : "shock_baton";
      return { primary, secondary, attested: [], keystone: null };
    };
    const banned = (): { loadout: Record<string, unknown>; rule: string } | null => {
      if (au.weapons.length) return { loadout: { ...legal(), primary: au.weapons.includes("lease_breaker") ? "phage" : "lease_breaker" }, rule: "audit-weapon" };
      if (au.noKeystone) return { loadout: { ...legal(), keystone: "debtless" }, rule: "audit-keystone" };
      if (au.ringOnly) {
        const other = LEDGER_ITEMS.find((i) => i.ring !== au.ringOnly)!;
        return { loadout: { ...legal(), attested: [other.id] }, rule: "audit-ring" };
      }
      return null;
    };
    const roomQ = `audit-${au.week}?audit=1&warmup=14&round=12&ai=0`;
    const open = async (name: string, account: string, loadout: Record<string, unknown>, render: { width: number; height: number } | null): Promise<Page> => {
      const p = await newPage(render ?? { width: 320, height: 180 }, name);
      await p.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&${render ? "" : "norender=1&"}level=lease_row&account=${account}&secret=${SECRET}&loadout=${encodeURIComponent(JSON.stringify(loadout))}&net=ws://127.0.0.1:${HOST_PORT}/room/${encodeURIComponent(roomQ)}%26level=lease_row&name=${name}`, { waitUntil: "load" });
      return p;
    };
    const bad = banned();
    if (bad) {
      const kicked = await open("BANNED", acct, bad.loadout, null);
      await kicked.waitForFunction(() => window.__game?.ready === true && (window.__game.net()?.status === "kicked" || window.__game.net()?.status === "closed"), null, { timeout: 40000, polling: 100 });
      const reason = await kicked.evaluate(() => window.__game.net()!.kickReason);
      await kicked.close();
      check(`the playlist's rules refuse a loadout it bans at join (${au.name})`, reason.includes(bad.rule), `kick: "${reason}"`);
    } else check(`the playlist has no loadout rule this week (${au.name}); its mutators are on the sheet and gravity`, true, `${au.line}`);
    const [a, b] = await Promise.all([open("ALPHA", acct, legal(), { width: 480, height: 270 }), open("BRAVO", "fresh-eg", legal(), null)]);
    for (const p of [a, b]) await p.waitForFunction(() => window.__game?.ready === true && window.__game.net()?.status === "joined" && window.__game.net()?.synced === true, null, { timeout: 40000, polling: 100 });
    await a.waitForTimeout(300);
    const w0 = await a.evaluate(() => ({ eg: window.__game.endgame(), maxShield: window.__game.game.player.maxShield, maxHealth: window.__game.state().maxHealth, mods: window.__game.state().mods, log: [...document.querySelectorAll("#hud .log div")].map((d) => d.textContent ?? "") }));
    const wantShield = au.sheet.maxShield !== undefined ? Math.max(0, 30 + au.sheet.maxShield) : null;
    const sheetOk = (au.sheet.moveSpeed === undefined || Math.abs(w0.mods.moveSpeed! - au.sheet.moveSpeed) < 1e-6) && (au.sheet.range === undefined || Math.abs(w0.mods.range! - au.sheet.range) < 1e-6) && (wantShield === null || w0.maxShield === wantShield);
    check("the Welcome names the playlist and the client runs the same gravity and sheet the room runs", w0.eg.mode === `audit:${au.id}:${au.week}` && Math.abs(w0.eg.gravity - au.gravityMult) < 1e-6 && sheetOk && w0.log.some((l) => l.includes(`AUDIT · ${au.name}`)), `mode ${w0.eg.mode} · gravity ${w0.eg.gravity} · shield ${w0.maxShield} · move ×${w0.mods.moveSpeed} range ×${w0.mods.range}`);
    // ALPHA (cells) flips B during the round; BRAVO stands off; the round settles
    const route = (from: { x: number; z: number }, to: { x: number; z: number }): BotStep[] => (findPath(nav, { x: from.x, y: 0, z: from.z }, { x: to.x, y: 0, z: to.z }) ?? [{ x: from.x, y: 0, z: from.z }, { x: to.x, y: 0, z: to.z }]).slice(1).map((p, i, arr) => ({ kind: "goto" as const, x: p.x, z: p.z, sprint: true, radius: i === arr.length - 1 ? 1.2 : 1.4, timeoutTicks: 700, stop: i === arr.length - 1 }));
    const pa = await a.evaluate(() => window.__game.state().pos);
    await a.evaluate((plan) => window.__game.setBot(plan), [...route(pa, { x: B.x, z: B.z }), { kind: "hold", ticks: 9000 }] as BotStep[]);
    await b.evaluate(() => window.__game.setBot([{ kind: "hold", ticks: 9000 }]));
    for (const p of [a, b]) await p.evaluate(() => window.__game.setRealtime(true));
    const t0 = Date.now();
    let phase = "";
    while (Date.now() - t0 < 60000 && phase !== "results") {
      await a.waitForTimeout(500);
      phase = (await stats()).rooms[`audit-${au.week}`]?.match?.phase ?? "";
    }
    await a.waitForTimeout(800);
    const st = (await stats()).rooms[`audit-${au.week}`]!;
    const eg1 = await endgame();
    const fa = await file(acct);
    const fb = await file("fresh-eg");
    // the flip count the room settled on (the client's own counter is reset by the results reset)
    const flipped = st.clients.find((c) => c.name === "ALPHA")?.flips ?? 0;
    check("the settled Audit round lands on the week's leaderboard (best per file) and on each file", phase === "results" && st.audit?.id === au.id && st.audit.scores.length === 2 && eg1.board.length === 2 && eg1.board.some((e) => e.account === acct) && fa.audits?.week === au.week && fa.audits.played === 1 && fb.audits?.played === 1 && eg1.board[0]!.score >= eg1.board[1]!.score, `scores [${st.audit?.scores.join(", ")}] · board ${eg1.board.map((e) => `${e.display}:${e.score}`).join(" ")} · ALPHA best ${fa.audits?.best}`);
    const lease = eg1.season.districts["lease_row"]!;
    const bNode = lease.find((n) => n.label === "B")!;
    check("the Deep Wake: the round's flips push pressure toward the flipping file's house (cells at B), written from the real round", flipped >= 1 && bNode.pressure > 0 && bNode.leader === "cells" && !!st.seasonLast && /LEASE ROW/.test(st.seasonLast) && eg1.season.rounds === 1, `ALPHA flips ${flipped} · B leader ${bNode.leader} +${bNode.pressure} · "${st.seasonLast}"`);
    await a.evaluate(() => window.__game.loadEndgame());
    await a.waitForTimeout(500);
    await a.keyboard.press("KeyM");
    await a.waitForTimeout(400);
    const mapText = await a.evaluate(() => (document.querySelector("#hud .travel .season") as HTMLElement)?.textContent ?? "");
    await a.screenshot({ path: `${OUT}/stage11-deepwake.png` });
    check("the MAP tab shows the Deep Wake: the season, who holds each node, the pressure leader and the last lines", /DEEP WAKE · SEASON/.test(mapText) && /LEASE ROW/.test(mapText) && /CEL/.test(mapText), mapText.slice(0, 160));
    await a.close();
    await b.close();

    // ---------------- Rewrite and the Wakelight shop ----------------
    const rw = await newPage({ width: 960, height: 540 }, "rewrite");
    await rw.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&level=drainage_yard&account=${acct}&secret=${SECRET}&shop=${HOST}`, { waitUntil: "load" });
    await rw.waitForFunction(() => window.__game?.ready === true && window.__game.endgame().contracts.length === 3, null, { timeout: 40000, polling: 100 });
    const before = await file(acct);
    const r1 = await rw.evaluate(() => window.__game.rewrite());
    await rw.waitForTimeout(300);
    const after = await file(acct);
    const afterView = await rw.evaluate(() => ({ eg: window.__game.endgame(), file: window.__game.file() }));
    check("REWRITE at Depth 50 burns the file — Depth 1, XP 0, Scrip 0, nodes gone — keeps the stamps and the counters (the glyph's age) and pays 500 Wakelight", before.depth === 50 && r1.ok && after.depth === 1 && after.xp === 0 && after.wallet.scrip === 0 && after.stamps.length === before.stamps.length && (after.counters["kills"] ?? 0) === (before.counters["kills"] ?? 0) && after.wallet.wakelight === before.wallet.wakelight + 500 && after.rewrites === 1 && afterView.file.depth === 1 && afterView.eg.rewrites === 1 && after.ledger.some((l) => l.startsWith("REWRITE 1")), `depth ${before.depth} → ${after.depth} · stamps ${before.stamps.length} → ${after.stamps.length} · wakelight ${before.wallet.wakelight} → ${after.wallet.wakelight}`);
    const r2 = await rw.evaluate(() => window.__game.rewrite());
    check("a second Rewrite waits for Depth 50 again", !r2.ok && /Depth 1/.test(r2.reason ?? ""), `${r2.reason}`);
    const buy = await rw.evaluate(() => window.__game.cosmetic({ op: "buy", id: "theme_amber" }));
    const wear = await rw.evaluate(() => window.__game.cosmetic({ op: "theme", id: "theme_amber" }));
    await rw.evaluate(() => window.__game.toggleFile(true));
    await rw.waitForTimeout(400);
    const themed = await rw.evaluate(() => ({ cy: getComputedStyle(document.getElementById("hud")!).getPropertyValue("--cy").trim(), eg: window.__game.endgame() }));
    await rw.screenshot({ path: `${OUT}/stage11-theme.png` });
    check("Wakelight buys a CRT theme and the HUD wears it (the palette variables change); never a stat", buy.ok && wear.ok && themed.eg.theme === "theme_amber" && themed.cy === "#ffd27a" && themed.eg.cosmetics.includes("theme_amber"), `--cy ${themed.cy} · theme ${themed.eg.theme} · wakelight ${themed.eg.wakelight}`);
    const slot3 = await rw.evaluate(() => window.__game.cosmetic({ op: "buy", id: "preset_3" }));
    const slot2 = await rw.evaluate(() => window.__game.cosmetic({ op: "buy", id: "preset_2" }));
    await rw.evaluate(() => window.__game.setLoadout({ primary: "stack_smg", secondary: "shock_baton", attested: [] }));
    const saved = await rw.evaluate(() => window.__game.cosmetic({ op: "preset", slot: 2, name: "smg kit", loadout: window.__game.file().loadout }));
    await rw.evaluate(() => window.__game.setLoadout({ primary: "lease_breaker", secondary: "shock_baton", attested: [] }));
    const loaded = await rw.evaluate(() => ({ ok: window.__game.loadPreset(2), primary: (window.__game.file().loadout as { primary: string }).primary, eg: window.__game.endgame() }));
    const alias = await rw.evaluate(() => window.__game.cosmetic({ op: "alias", slot: 1, alias: "the breaker" }));
    const fEnd = await file(acct);
    check("preset slots come in order, a preset saves the current loadout to the file and loads back; an alias slot takes a name", !slot3.ok && slot2.ok && saved.ok && loaded.ok && loaded.primary === "stack_smg" && loaded.eg.presets[1]?.name === "SMG KIT" && alias.ok && (fEnd.presets?.[1]?.loadout as { primary?: string })?.primary === "stack_smg", `slot3 first: ${slot3.reason} · presets [${loaded.eg.presets.map((p) => p.name).join(", ")}] · alias ${alias.ok}`);
    await rw.close();
    check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean console");
    results["endgame"] = { audit: au.id, board: eg1.board, season: eg1.season, rewrite: { before: before.depth, after: after.depth, wakelight: after.wallet.wakelight } };
    writeFileSync(`${OUT}/stage11.json`, JSON.stringify({ results, checks }, null, 2));
    const failed = checks.filter((c) => !c.pass);
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
    if (failed.length) {
      const logs = ((await (await fetch(`${HOST}/stats`)).json()) as { logs: string[] }).logs;
      console.log("host log tail:\n  " + logs.slice(-20).join("\n  "));
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
