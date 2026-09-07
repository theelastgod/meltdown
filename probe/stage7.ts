/**
 * Stage 7 probe — the Ledger Graph and weapon mastery.
 *  1. The Fairness Lint passes over 48 nodes, 120 chips and 12 firmwares;
 *     every firmware is certified inside the TTK band.
 *  2. Server-side enforcement at spawn: a chip in the wrong socket, a chip
 *     above the file's mastery rank, and a firmware without its rank are
 *     refused; a mastered file's chips and firmware are admitted and the
 *     sim runs them (burst definition, per-weapon mods while held).
 *  3. The ledger shop: a fresh file cannot afford a node, a Depth-10 file
 *     with Scrip buys one (violet → green on the GRAPH panel), cannot buy a
 *     ring-3 node under its Depth, and gets half back on refund.
 *  4. A kill online feeds mastery XP and un-redacts FIRST FILE CLOSED on
 *     the killer's file mid-round, delivered to the client as a stamp.
 *
 *   npm run probe:mastery
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { shot } from "./shot";
import type { BotStep } from "../client/bot";
import { certifyFirmwares } from "../shared/sim/ttk";

const VITE_PORT = 5195;
const HOST_PORT = 8798;
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
  /** how long each page took to construct, kept in the proof so a slow box is visible, not a mystery */
  const openMs: string[] = [];
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

  // ---------------- lint + certification ----------------
  const lint = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "shared/fairness/cli.ts", "--quick"], { encoding: "utf8", timeout: 600000 });
  const head = (lint.stdout ?? "").split("\n")[0] ?? "";
  const m = head.match(/(\d+) builds/);
  check("lint: 48 nodes, 120 chips, 12 firmwares pass the Fairness Lint", lint.status === 0 && /PASS/.test(head) && Number(m?.[1] ?? 0) >= 300, head);
  const certs = certifyFirmwares();
  check("harness: every firmware is certified inside the TTK band at its ideal range", certs.every((c) => c.ok), certs.map((c) => `${c.firmware.split(":")[1]} ${c.seconds.toFixed(2)}s`).join(", "));

  const host = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "server/node-host.ts", String(HOST_PORT)], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(host, /listening/, "node host");
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(VITE_PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(vite, /127\.0\.0\.1/, "vite");
  const browser = await chromium.launch({ args: ARGS });
  const room = `ledger?ai=0&level=drainage_yard&warmup=2&round=90`;
  const stats = async () => (await (await fetch(`http://127.0.0.1:${HOST_PORT}/stats`)).json()) as { rooms: Record<string, { loadoutRejections: string[]; clients: { name: string; kills: number; file: { stamps: number; ranks: Record<string, number>; xp: number } | null; loadout: { chips?: Record<string, Record<string, string>>; firmware?: Record<string, string> } }[] }>; files: Record<string, { xp: number; scrip: number; ledger: string[] }> };
  try {
    const open = async (name: string, account: string, loadout: unknown, render = false): Promise<Page> => {
      const pg = await browser.newPage({ viewport: render ? { width: 1280, height: 720 } : { width: 480, height: 270 } });
      const errs: string[] = [];
      pg.on("pageerror", (e) => errs.push(String(e)));
      pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
      const lo = loadout === undefined ? "" : `&loadout=${encodeURIComponent(JSON.stringify(loadout))}`;
      const t0 = Date.now();
      await pg.goto(`http://127.0.0.1:${VITE_PORT}/?crawl=0&${render ? "" : "norender=1&"}level=drainage_yard&net=ws://127.0.0.1:${HOST_PORT}/room/${encodeURIComponent(room)}&name=${name}&account=${account}${lo}`, { waitUntil: "load" });
      try {
        // `__game.ready` is set the moment the hook is assigned, so this is not a wait on the game
        // reaching some state — it is module execution plus `new Game()`, a startup cost that scales
        // with how busy the box is and not with anything under test. It was capped at 30 s and a
        // second rendered page under SwiftShader was measured at 19 s on a four-core runner, which
        // is how this probe came to fail on CI while passing by hand. The cap is now generous on
        // purpose; a page that never comes up hits it and says why.
        await pg.waitForFunction(() => window.__game?.ready === true, null, { timeout: 120000, polling: 100 });
      } catch (e) {
        const diag = await pg.evaluate(() => ({ game: typeof window.__game, ready: window.__game?.ready })).catch((x) => String(x));
        throw new Error(`${name} never became ready (${Date.now() - t0}ms, render=${render}): ${JSON.stringify(diag)} · page errors ${JSON.stringify(errs.slice(0, 4))}`, { cause: e });
      }
      openMs.push(`${name} ${((Date.now() - t0) / 1000).toFixed(1)}s${render ? " (rendered)" : ""}`);
      await pg.waitForFunction(() => { const n = window.__game.net(); return !!n && (n.status === "kicked" || n.status === "closed" || (n.status === "joined" && n.synced)); }, null, { timeout: 15000, polling: 100 });
      return pg;
    };
    const net = (pg: Page) => pg.evaluate(() => { const n = window.__game.net()!; return { status: n.status, reason: n.kickReason }; });
    const base = { primary: "lease_breaker", secondary: "shock_baton", attested: [] };

    // ---------------- enforcement at spawn ----------------
    const illegal: { name: string; account: string; loadout: unknown; rule: RegExp }[] = [
      { name: "SOCKET", account: "sandbox-sock", loadout: { ...base, chips: { lease_breaker: { kinetic: "lease_breaker:long_barrel" } } }, rule: /chip-socket/ },
      { name: "RANK", account: "fresh-rank", loadout: { ...base, chips: { lease_breaker: { muzzle: "lease_breaker:long_barrel" } } }, rule: /chip-rank/ },
      { name: "FLASH", account: "fresh-flash", loadout: { ...base, firmware: { lease_breaker: "lease_breaker:three_count" } }, rule: /firmware-rank/ },
      { name: "CROSS", account: "sandbox-cross", loadout: { ...base, chips: { lease_breaker: { muzzle: "stack_smg:long_barrel" } } }, rule: /chip-weapon/ },
    ];
    for (const c of illegal) {
      const pg = await open(c.name, c.account, c.loadout);
      const n = await net(pg);
      check(`spawn: ${c.name} refused (${c.rule.source})`, n.status === "kicked" && /^LOADOUT REJECTED/.test(n.reason) && c.rule.test(n.reason), `${n.status}: ${n.reason.slice(0, 120)}`);
      await pg.close();
    }
    const kit = { ...base, chips: { lease_breaker: { muzzle: "lease_breaker:long_barrel", kinetic: "lease_breaker:sling", protocol: "lease_breaker:contagion_round" } }, firmware: { lease_breaker: "lease_breaker:three_count" } };
    const a = await open("ALPHA", "sandbox-alpha", kit, true);
    const na = await net(a);
    const st1 = await a.evaluate(() => { const s = window.__game.state(); return { def: s.weaponDef, range: s.mods.range ?? 1, move: s.mods.moveSpeed ?? 1 }; });
    await a.evaluate(() => window.__game.setBot([{ kind: "slot", slot: 3 }, { kind: "hold", ticks: 30 }]));
    await a.evaluate(() => window.__game.advance(40));
    const st3 = await a.evaluate(() => { const s = window.__game.state(); return { def: s.weaponDef, range: s.mods.range ?? 1, move: s.mods.moveSpeed ?? 1 }; });
    check("spawn: a mastered file's three chips and firmware are admitted", na.status === "joined", `status ${na.status}`);
    check("sim: the firmware patches the held weapon (THREE-COUNT bursts) and chip mods apply only while it is held", st1.def.burst?.count === 3 && st1.range > 1.02 && st1.move > 1.01 && st3.def.burst === null && st3.range === 1 && st3.move === 1, `LB burst ${JSON.stringify(st1.def.burst)} range ×${st1.range.toFixed(3)} move ×${st1.move.toFixed(3)} · SMG burst ${st3.def.burst} range ×${st3.range} move ×${st3.move}`);
    const srv = (await stats()).rooms["ledger"]!.clients.find((c) => c.name === "ALPHA")!;
    check("spawn: the server's admitted kit matches", srv.loadout.chips?.lease_breaker?.protocol === "lease_breaker:contagion_round" && srv.loadout.firmware?.lease_breaker === "lease_breaker:three_count", `server chips ${JSON.stringify(srv.loadout.chips?.lease_breaker)} firmware ${JSON.stringify(srv.loadout.firmware)}`);
    // FILE panel with the kit
    await a.evaluate(() => { window.__game.setBot([{ kind: "slot", slot: 1 }, { kind: "hold", ticks: 5 }]); window.__game.advance(10); window.__game.toggleFile(true); });
    await a.waitForTimeout(400);
    await shotCheck(a, "stage7-file.png", "#hud .file");
    const kitText = await a.evaluate(() => document.querySelector("#hud .file .kit")?.textContent ?? "");
    check("file: the FILE panel shows mastery ranks, sockets and firmware", /MASTERY 30\/30/.test(kitText) && /THREE-COUNT/.test(kitText), kitText.replace(/\s+/g, " ").slice(0, 100));
    await a.evaluate(() => window.__game.toggleFile(false));

    // ---------------- ledger shop ----------------
    const poor = await fetch(`http://127.0.0.1:${HOST_PORT}/file/fresh-poor/buy`, { method: "POST", body: JSON.stringify({ node: "slipfile" }) }).then((r) => r.json()) as { ok: boolean; reason?: string };
    check("shop: a fresh Blank cannot afford a node", !poor.ok && /Scrip/.test(poor.reason ?? ""), poor.reason ?? "bought?!");
    // ALPHA has taken its screenshot and is only holding a room slot from here on. Two 1280x720
    // SwiftShader contexts on the same box put RICH's readiness at 19 s against ALPHA's 0.9 s, and
    // on a CI runner that crossed the wait and failed the probe. Shrink ALPHA while RICH lives.
    await a.setViewportSize({ width: 480, height: 270 });
    const r = await open("RICH", "rich-r", base, true);
    await r.evaluate(() => window.__game.toggleGraph(true));
    await r.waitForTimeout(300);
    await shotCheck(r, "stage7-graph-before.png", "#hud .graph");
    const before = await r.evaluate(() => ({ owned: window.__game.file().owned.length, scrip: window.__game.file().scrip, leased: document.querySelectorAll("#hud .graph g.lease").length, own: document.querySelectorAll("#hud .graph g.own").length }));
    const bought = await r.evaluate(() => window.__game.buy("slipfile"));
    await r.waitForTimeout(300);
    const after = await r.evaluate(() => ({ owned: window.__game.file().owned, scrip: window.__game.file().scrip, own: document.querySelectorAll("#hud .graph g.own").length, green: document.querySelector("#hud .graph g.own[data-id=slipfile]") !== null }));
    await shotCheck(r, "stage7-graph-after.png", "#hud .graph");
    check("shop: a Depth-10 file with Scrip buys SLIPFILE and the hex turns green on the graph", bought.ok && after.owned.includes("slipfile") && after.scrip === before.scrip - 400 && after.green && after.own === before.own + 1, `owned ${before.owned}→${after.owned.length} · scrip ${before.scrip}→${after.scrip} · green hexes ${before.own}→${after.own}`);
    const deep = await r.evaluate(() => window.__game.buy("black_swan"));
    check("shop: ring III is gated on Depth (BLACK SWAN needs 30)", !deep.ok && /Depth/.test(deep.reason ?? ""), deep.reason ?? "bought?!");
    const twice = await r.evaluate(() => window.__game.buy("slipfile"));
    check("shop: ownership is permanent — buying a node twice is refused", !twice.ok && /already/.test(twice.reason ?? ""), twice.reason ?? "bought?!");
    await r.evaluate(() => window.__game.setLoadout({ primary: "lease_breaker", secondary: "shock_baton", attested: ["slipfile"] }));
    const refund = await r.evaluate(() => window.__game.buy("slipfile", true));
    const afterRefund = await r.evaluate(() => ({ owned: window.__game.file().owned, scrip: window.__game.file().scrip }));
    check("shop: a refund returns half the Scrip and drops the node from the attestation", refund.ok && !afterRefund.owned.includes("slipfile") && afterRefund.scrip === after.scrip + 200, `scrip ${after.scrip}→${afterRefund.scrip} · owned ${afterRefund.owned.length}`);
    const files = (await stats()).files;
    check("shop: the ledger records the purchase and the refund on the file", (files["rich-r"]?.ledger ?? []).some((l) => /BOUGHT SLIPFILE/.test(l)), (files["rich-r"]?.ledger ?? []).slice(-2).join(" | "));
    await r.evaluate(() => window.__game.toggleGraph(false));
    await r.close();

    // ---------------- mastery + stamps online ----------------
    // BRAVO joins on the other cell and stands in the lane; ALPHA (sandbox, three-count LB) kills him
    const b = await open("BRAVO", "fresh-bravo", base);
    const idB = await b.evaluate(() => window.__game.net()!.playerId);
    // spawns rotate per join: route both through the open west lane, clear of the decks and kerbs
    await b.evaluate(() => window.__game.setBot([{ kind: "goto", x: -10, z: 10, sprint: true, radius: 1.5, timeoutTicks: 600 }, { kind: "goto", x: 0, z: 9, sprint: true, radius: 1, timeoutTicks: 600, stop: true }, { kind: "hold", ticks: 6000 }]));
    const fresh = await open("CHARLIE", "fresh-charlie", base);
    // CHARLIE is a fresh file on ALPHA's cell? cells alternate: ALPHA=1, BRAVO=2, CHARLIE=1 — CHARLIE shoots BRAVO for the fresh-file stamp
    await fresh.evaluate((id) => window.__game.setBot([{ kind: "goto", x: 8, z: -18, sprint: true, radius: 1.5, timeoutTicks: 600 }, { kind: "goto", x: 8, z: 14, sprint: true, radius: 1.5, timeoutTicks: 900 }, { kind: "goto", x: 0, z: 20, sprint: true, radius: 1, timeoutTicks: 600, stop: true }, { kind: "killPlayer", targetId: id, ticks: 1800 }]), idB);
    await a.evaluate(() => window.__game.setBot([{ kind: "goto", x: -6, z: 14, sprint: true, radius: 1.5, timeoutTicks: 600, stop: true }, { kind: "hold", ticks: 6000 }]));
    await a.evaluate(() => window.__game.setRealtime(true));
    await b.evaluate(() => window.__game.setRealtime(true));
    await fresh.evaluate(() => window.__game.setRealtime(true));
    const t0 = Date.now();
    let killed = false;
    while (Date.now() - t0 < 60000 && !killed) {
      await fresh.waitForTimeout(1000);
      const s = await stats();
      killed = (s.rooms["ledger"]!.clients.find((c) => c.name === "CHARLIE")?.kills ?? 0) >= 1;
    }
    const s2 = await stats();
    const ch = s2.rooms["ledger"]!.clients.find((c) => c.name === "CHARLIE")!;
    check("mastery: a kill online feeds the killer's weapon XP and rank on the server", killed && ch.file!.xp >= 0 && (ch.file!.ranks["lease_breaker"] ?? 1) >= 1 && ch.kills >= 1, `CHARLIE kills ${ch.kills} · LB rank ${ch.file?.ranks["lease_breaker"]} · stamps ${ch.file?.stamps}`);
    await fresh.waitForTimeout(800);
    const fv = await fresh.evaluate(() => ({ stamps: window.__game.file().stamps, mastery: window.__game.file().mastery["lease_breaker"], log: [...document.querySelectorAll("#hud .log div")].map((d) => d.textContent ?? "").filter((t) => /STAMP|MASTERY/.test(t)) }));
    check("stamps: FIRST FILE CLOSED un-redacts on the killer's file mid-round and reaches the client", fv.stamps.includes("first_kill:lease_breaker") && fv.log.some((l) => /STAMP · FIRST FILE CLOSED/.test(l)), `stamps [${fv.stamps.join(", ")}] · LB xp ${fv.mastery?.xp} rank ${fv.mastery?.rank} · ${fv.log.slice(0, 2).join(" | ")}`);
    check("mastery: XP alone holds at the first gate — rank 1 file, no challenge done", (fv.mastery?.rank ?? 0) <= 5 && (fv.mastery?.done.length ?? 0) === 0, `rank ${fv.mastery?.rank}, done ${JSON.stringify(fv.mastery?.done)}`);
    await fresh.evaluate(() => { window.__game.setRealtime(false); window.__game.toggleFile(true); });
    await fresh.setViewportSize({ width: 1280, height: 720 });
    await fresh.waitForTimeout(400);
    const stampText = await fresh.evaluate(() => document.querySelector("#hud .file .stamps")?.textContent ?? "");
    check("file: the stamp reads in clear while the rest stay REDACTED", /▣ FIRST FILE CLOSED · LEASE-BREAKER/.test(stampText) && /█/.test(stampText), stampText.replace(/\s+/g, " ").slice(0, 90));
    await a.close();
    await b.close();
    await fresh.close();

    writeFileSync(`${OUT}/stage7.json`, JSON.stringify({ lint: head, certs, pageStartup: openMs, rejections: (await stats()).rooms["ledger"]!.loadoutRejections, checks }, null, 2));
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
