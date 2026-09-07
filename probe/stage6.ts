/**
 * Stage 6 Ghostfile probe.
 *  1. Fairness Lint: the shipped catalogue passes; an injected trade-less
 *     node and an injected net-power node each fail the lint (exit 1).
 *  2. Online: illegal loadouts (8 attested, disconnected subgraph, unowned
 *     node, a smuggled `protocols` field) are refused at spawn with a
 *     LOADOUT REJECTED kick; a legal attestation is admitted and its sheet
 *     runs on both sides; a short round settles XP/Scrip into the file and
 *     the client's ledger. Screenshot of the FILE panel after settlement.
 *
 *   npm run probe:file
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { shot } from "./shot";
import type { BotStep } from "../client/bot";

const VITE_PORT = 5189;
const HOST_PORT = 8794;
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

function lint(args: string[]): { code: number; out: string } {
  const r = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "shared/fairness/cli.ts", "--quick", ...args], { encoding: "utf8", timeout: 240000 });
  return { code: r.status ?? -1, out: (r.stdout ?? "") + (r.stderr ?? "") };
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

  // ---------------- fairness lint ----------------
  const clean = lint([]);
  const head = clean.out.split("\n")[0] ?? "";
  check("lint: the shipped catalogue passes the Fairness Lint", clean.code === 0 && /FAIRNESS LINT PASS/.test(clean.out), head);
  const tradeless = lint(["--inject=tradeless"]);
  check("lint: an injected trade-less node fails (schema + TTK + beats-every-bracket)", tradeless.code === 1 && /non-empty-costs/.test(tradeless.out) && /BEATS EVERY BRACKET/.test(tradeless.out), tradeless.out.split("\n").filter((l) => /VIOLATION|BEATS/.test(l)).slice(0, 2).join(" | "));
  const netpower = lint(["--inject=netpower"]);
  check("lint: an injected reconciled-but-net-power node fails on simulation, not arithmetic", netpower.code === 1 && /ttk-deviation/.test(netpower.out) && !/non-empty-costs/.test(netpower.out), netpower.out.split("\n").filter((l) => /VIOLATION/.test(l)).slice(0, 2).join(" | "));

  const host = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "server/node-host.ts", String(HOST_PORT)], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(host, /listening/, "node host");
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(VITE_PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(vite, /127\.0\.0\.1/, "vite");
  const browser = await chromium.launch({ args: ARGS });
  const room = `ghost?ai=0&warmup=2&round=24&level=drainage_yard`;
  const stats = async () => (await (await fetch(`http://127.0.0.1:${HOST_PORT}/stats`)).json()) as { rooms: Record<string, { settlements: number; loadoutRejections: string[]; match: { phase: string; winner: number; score: number[] }; clients: { name: string; flips: number; nodeSeconds: number; file: { depth: number; xp: number; scrip: number } | null; loadout: { attested: string[]; keystone: string | null } }[] }>; files: Record<string, { depth: number; xp: number; scrip: number; matches: number; ledger: string[] }>; saves: number };
  try {
    const open = async (name: string, account: string, loadout: unknown, render = false): Promise<Page> => {
      const pg = await browser.newPage({ viewport: render ? { width: 1280, height: 720 } : { width: 480, height: 270 } });
      const lo = loadout === undefined ? "" : `&loadout=${encodeURIComponent(JSON.stringify(loadout))}`;
      await pg.goto(`http://127.0.0.1:${VITE_PORT}/?crawl=0&${render ? "" : "norender=1&"}net=ws://127.0.0.1:${HOST_PORT}/room/${encodeURIComponent(room)}&level=drainage_yard&name=${name}&account=${account}${lo}`, { waitUntil: "load" });
      await pg.waitForFunction(() => window.__game?.ready === true, null, { timeout: 30000, polling: 100 });
      await pg.waitForFunction(() => { const n = window.__game.net(); return !!n && (n.status === "kicked" || n.status === "closed" || (n.status === "joined" && n.synced)); }, null, { timeout: 15000, polling: 100 });
      return pg;
    };
    const net = (pg: Page) => pg.evaluate(() => { const n = window.__game.net()!; return { status: n.status, reason: n.kickReason }; });

    // ---------------- illegal loadouts are refused at spawn ----------------
    const base = { primary: "lease_breaker", secondary: "shock_baton" };
    const illegal: { name: string; account: string; loadout: unknown; rule: RegExp }[] = [
      { name: "EIGHT", account: "sandbox-eight", loadout: { ...base, attested: ["slipfile", "static_skin", "contagion_rider", "long_lease", "quiet_ledger", "spite_clause", "collateral", "hair_trigger"] }, rule: /attest-limit/ },
      { name: "SPLIT", account: "sandbox-split", loadout: { ...base, attested: ["slipfile", "black_swan"] }, rule: /connected/ },
      { name: "POOR", account: "fresh-poor", loadout: { ...base, attested: ["slipfile"] }, rule: /not-owned/ },
      // a campaign-only field (protocols) is stripped at PvP join by design (Stage 10); a field the manifest has never heard of is refused
      { name: "SMUGGLE", account: "sandbox-smuggle", loadout: { ...base, attested: ["slipfile"], damage: 2 }, rule: /unknown-field/ },
    ];
    const rejections: string[] = [];
    for (const c of illegal) {
      const pg = await open(c.name, c.account, c.loadout);
      const n = await net(pg);
      rejections.push(n.reason);
      check(`spawn: ${c.name} refused (${c.rule.source})`, n.status === "kicked" && /^LOADOUT REJECTED/.test(n.reason) && c.rule.test(n.reason), `${n.status}: ${n.reason.slice(0, 110)}`);
      await pg.close();
    }
    let st = await stats();
    check("spawn: refused players never entered the world", (st.rooms["ghost"]?.clients.length ?? 0) === 0 && st.rooms["ghost"]!.loadoutRejections.length === 4, `${st.rooms["ghost"]!.clients.length} in room, ${st.rooms["ghost"]!.loadoutRejections.length} rejections logged`);

    // ---------------- legal attestation ----------------
    const legal = { ...base, attested: ["slipfile", "static_skin", "curb_weight"], keystone: "debtless" };
    const a = await open("ALPHA", "sandbox-alpha", legal, true);
    const na = await net(a);
    const fa = await a.evaluate(() => ({ file: window.__game.file(), state: window.__game.state() }));
    check("spawn: a legal attestation with a linked keystone is admitted", na.status === "joined", `status ${na.status} · depth ${fa.file.depth} · owned ${fa.file.owned.length} items`);
    check("spawn: the admitted sheet runs client-side (DEBTLESS +12% move, +25% slide × CURB WEIGHT −8% slide, no shield)", fa.state.mods.moveSpeed! > 1.08 && fa.state.maxShield === 0 && fa.state.mods.slideBoost! > 1.1, `moveSpeed ×${fa.state.mods.moveSpeed!.toFixed(3)} slideBoost ×${fa.state.mods.slideBoost!.toFixed(3)} maxShield ${fa.state.maxShield}`);
    check("file: NET DELTA never overdraws the Auditor's ledger (keystones may over-pay)", fa.file.netDelta <= 1.5 && fa.file.legal, `net delta ${fa.file.netDelta.toFixed(3)} · ${fa.file.legal ? "legal" : fa.file.errors.join("; ")}`);
    st = await stats();
    const srvA = st.rooms["ghost"]!.clients.find((c) => c.name === "ALPHA")!;
    check("spawn: server and client agree on the admitted loadout", srvA.loadout.attested.join(",") === legal.attested.join(",") && srvA.loadout.keystone === "debtless", `server attested [${srvA.loadout.attested.join(", ")}] keystone ${srvA.loadout.keystone}`);

    // ---------------- a round settles into the file ----------------
    const b = await open("BRAVO", "fresh-bravo", { ...base, attested: [] });
    const toD: BotStep[] = [{ kind: "goto", x: 0, z: 17, sprint: true, radius: 1.2, timeoutTicks: 1500, stop: true }, { kind: "hold", ticks: 60 * 90 }];
    await a.evaluate((p) => window.__game.setBot(p), toD);
    await b.evaluate(() => window.__game.setBot([{ kind: "goto", x: 14, z: 20, sprint: true, radius: 1.2, timeoutTicks: 900, stop: true }, { kind: "hold", ticks: 6000 }]));
    const t0 = Date.now();
    st = await stats();
    while (st.rooms["ghost"]!.match.phase !== "results" && Date.now() - t0 < 60000) {
      await a.waitForTimeout(1000);
      st = await stats();
    }
    const r = st.rooms["ghost"]!;
    check("settle: the round reaches results with cell one ahead", r.match.phase === "results" && r.match.winner === 1, `phase ${r.match.phase} winner ${r.match.winner} score ${r.match.score[1]!.toFixed(0)} : ${r.match.score[2]!.toFixed(0)}`);
    const sa = r.clients.find((c) => c.name === "ALPHA")!;
    check("settle: node credit accrues to the Blank on the node", sa.flips >= 1 && sa.nodeSeconds > 3, `ALPHA flips ${sa.flips}, ${sa.nodeSeconds.toFixed(1)} s on nodes`);
    const fileA = st.files["sandbox-alpha"]!;
    const fileB = st.files["fresh-bravo"]!;
    check("settle: XP and Scrip land in both files, objective play paying more", r.settlements === 2 && fileA.matches === 1 && fileB.matches === 1 && fileA.xp - 2_000_000 > fileB.xp && fileB.xp > 0, `ALPHA +${fileA.xp - 2_000_000} xp / ${fileA.scrip - 20000} scrip · BRAVO +${fileB.xp} xp / ${fileB.scrip} scrip · saves ${st.saves}`);
    check("settle: a fresh Blank's first match is booked (participation XP, no win bonus)", fileB.depth === 1 && fileB.xp === 250, `BRAVO depth ${fileB.depth} (${fileB.xp} xp, ${fileB.ledger.length} ledger lines)`);
    await a.waitForTimeout(500);
    const fv = await a.evaluate(() => window.__game.file());
    check("settle: the client's ledger carries the settlement lines", fv.ledger.some((l) => /^MATCH 0001 · WOKE/.test(l)) && fv.ledger.some((l) => /^XP \+/.test(l)), fv.ledger.slice(-3).join(" | "));
    // FILE panel screenshot
    await a.evaluate(() => window.__game.toggleFile(true));
    await a.waitForTimeout(400);
    await shotCheck(a, "stage6-file.png", "#hud .file");
    const panel = await a.evaluate(() => (document.querySelector("#hud .file .ft")?.textContent ?? "").trim());
    check("file: the FILE panel shows the NET DELTA stamp", /NET DELTA: [+−]\d+\.\d{3} — RECONCILED/.test(panel), panel.slice(0, 90));
    await a.close();
    await b.close();

    writeFileSync(`${OUT}/stage6.json`, JSON.stringify({ lint: { clean: head, tradeless: tradeless.code, netpower: netpower.code }, rejections, files: st.files, room: { settlements: r.settlements, match: r.match, clients: r.clients }, checks }, null, 2));
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
