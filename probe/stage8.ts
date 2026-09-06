/**
 * Stage 8 probe — identity & rituals.
 *  Online, three files in one room: a NAMED sandbox file (ALPHA), a fresh
 *  Blank (BRAVO) and a file one settlement short of Depth 10 (CHARLIE).
 *  The pre-match dossier flashes both cells' files for 1.2 s and carries
 *  nothing mechanical; remote tags show the glyph and what the city calls
 *  each file (ALPHA by name, BRAVO as BLANK); kill-confirm audio gains
 *  layers with the shooter's own mastery tier; BRAVO closes ALPHA's file
 *  twice, so at settlement ALPHA owes a Debt and the receipt prints line by
 *  line until ALPHA signs it; CHARLIE crosses Depth 10 and performs
 *  Chapter I; next round ALPHA settles the Debt (DEBT CLEARED, +5
 *  Wakelight). Every social payload is run through the leak scanner.
 *  Offline, the Deadletter Office loads ALPHA's real file: the office is
 *  renovated to Chapter III, the trophy wall is cut from the ledger, and a
 *  range run leaves a ghost that replays on the next run.
 *
 *   npm run probe:identity
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import type { BotStep } from "../client/bot";
import { mechanicalLeaks, IDENTITY_KEYS } from "../shared/identity/identity";
import { levelById } from "../shared/sim/level";
import { HUB_LEVEL_ID } from "../shared/sim/hub";
import { buildNav, findPath } from "../shared/sim/nav";

const VITE_PORT = 5199;
const HOST_PORT = 8800;
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

interface ClientStat {
  id: number;
  name: string;
  kills: number;
  deaths: number;
  file: { depth: number; stamps: number } | null;
  identity: { display: string; chapter: number; moniker: string | null; debt: string | null; debtTarget: number; wakelight: number; chapters: number[] };
}
interface Stats {
  rooms: Record<string, { clients: ClientStat[]; match: { phase: string; round?: number } | null; social: Record<string, number>; settlements: number }>;
}

const ARGS = ["--no-proxy-server", "--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"];

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
  const stats = async (): Promise<Stats> => (await (await fetch(`http://127.0.0.1:${HOST_PORT}/stats`)).json()) as Stats;
  const results: Record<string, unknown> = {};
  const errors: string[] = [];
  const room = "identity";
  const roomQ = `${room}?ai=0&warmup=34&round=60`;
  try {
    const open = async (name: string, account: string, extra: string, render: { width: number; height: number } | null): Promise<Page> => {
      const pg = await browser.newPage({ viewport: render ?? { width: 320, height: 180 } });
      pg.on("pageerror", (e) => errors.push(`${name}: ${String(e)}`));
      pg.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
      await pg.goto(`http://127.0.0.1:${VITE_PORT}/?${render ? "" : "norender=1&"}level=drainage_yard&account=${account}${extra}&net=ws://127.0.0.1:${HOST_PORT}/room/${encodeURIComponent(roomQ)}%26level=drainage_yard&name=${name}`, { waitUntil: "load" });
      await pg.waitForFunction(() => window.__game?.ready === true && window.__game.net()?.status === "joined" && window.__game.net()?.synced === true, null, { timeout: 40000, polling: 100 });
      await pg.evaluate(() => window.__game.resumeAudio());
      return pg;
    };
    // the room is created at the first join and its warm-up counts from there: load all three at once
    const tRoom = Date.now();
    const [a, b, c] = await Promise.all([open("ALPHA", "sandbox-alpha", "&moniker=named", { width: 800, height: 450 }), open("BRAVO", "fresh-bravo", "&moniker=named", null), open("CHARLIE", "rite-charlie", "", { width: 320, height: 180 })]);
    console.log(`three files linked in ${((Date.now() - tRoom) / 1000).toFixed(1)}s`);
    const phaseNow = async () => (await stats()).rooms[room]!.match?.phase ?? "";
    const waitPhase = async (want: string, ms: number) => {
      const t = Date.now();
      let p = await phaseNow();
      while (Date.now() - t < ms && p !== want) {
        await a.waitForTimeout(400);
        p = await phaseNow();
      }
      return p;
    };
    const ids = { a: await a.evaluate(() => window.__game.net()!.playerId), b: await b.evaluate(() => window.__game.net()!.playerId), c: await c.evaluate(() => window.__game.net()!.playerId) };
    const LANE = { x: 0, z: 9 };
    const POST = { x: -6, z: 14 };
    // routes follow the yard's nav grid from wherever a file was re-leased (the decks block a straight line)
    const yardNav = buildNav(levelById("drainage_yard"));
    const routeTo = (from: { x: number; z: number }, to: { x: number; z: number }, radius: number): BotStep[] => {
      const path = findPath(yardNav, { x: from.x, y: 0, z: from.z }, { x: to.x, y: 0, z: to.z }) ?? [{ x: from.x, y: 0, z: from.z }, { x: to.x, y: 0, z: to.z }];
      return path.slice(1).map((pt, i, arr) => ({ kind: "goto" as const, x: pt.x, z: pt.z, sprint: true, radius: i === arr.length - 1 ? radius : 1.4, timeoutTicks: 600, stop: i === arr.length - 1 }));
    };
    const posOf = async (pg: Page) => pg.evaluate(() => window.__game.state().pos);
    const toLane: BotStep[] = [...routeTo(await posOf(b), LANE, 1), { kind: "hold", ticks: 9000 }];
    const toPost: BotStep[] = [...routeTo(await posOf(a), POST, 1.2), { kind: "hold", ticks: 9000 }];
    const killsOf = async (name: string) => (await stats()).rooms[room]!.clients.find((x) => x.name === name)?.kills ?? 0;
    /**
     * The kill step aims and fires at a live target in view — it never navigates — so a duel keeps the
     * hunter at the post and the victim in the lane, re-issuing plans as either is re-leased elsewhere.
     */
    const duel = async (hunter: Page, hunterName: string, victim: Page, victimId: number, want: number, ms: number): Promise<number> => {
      const t = Date.now();
      let lastPlanH = 0;
      let lastPlanV = 0;
      let issued = false;
      let lastTrace = 0;
      let k = await killsOf(hunterName);
      while (Date.now() - t < ms && k < want) {
        const [sh, sv] = await Promise.all([hunter.evaluate(() => ({ pos: window.__game.state().pos, alive: window.__game.state().health > 0, done: window.__game.botStatus()?.done ?? true })), victim.evaluate(() => ({ pos: window.__game.state().pos, alive: window.__game.state().health > 0, done: window.__game.botStatus()?.done ?? true }))]);
        const now = Date.now();
        if (sv.alive && Math.hypot(sv.pos.x - LANE.x, sv.pos.z - LANE.z) > 3 && now - lastPlanV > 5000) {
          await victim.evaluate((plan) => window.__game.setBot(plan), [...routeTo(sv.pos, LANE, 1), { kind: "hold", ticks: 9000 }] as BotStep[]);
          lastPlanV = now;
        }
        const atPost = Math.hypot(sh.pos.x - POST.x, sh.pos.z - POST.z) < 3;
        if (sh.alive && now - lastPlanH > 5000 && (!issued || !atPost || sh.done)) {
          await hunter.evaluate(({ plan, id }) => window.__game.setBot([...plan, { kind: "killPlayer", targetId: id, ticks: 3600 }]), { plan: atPost ? ([] as BotStep[]) : routeTo(sh.pos, POST, 1.2), id: victimId });
          lastPlanH = now;
          issued = true;
        }
        if (now - lastTrace > 6000) {
          console.log(`  duel ${hunterName}: hunter (${sh.pos.x.toFixed(0)},${sh.pos.z.toFixed(0)}) ${sh.alive ? "alive" : "dead"}${sh.done ? " idle" : ""} · victim (${sv.pos.x.toFixed(0)},${sv.pos.z.toFixed(0)}) ${sv.alive ? "alive" : "dead"}${sv.done ? " idle" : ""} · kills ${k}/${want}`);
          lastTrace = now;
        }
        await hunter.waitForTimeout(400);
        k = await killsOf(hunterName);
      }
      return k;
    };

    // ---- identity at join ----
    const ia = await a.evaluate(() => ({ id: window.__game.state().identity, handle: document.querySelector("#hud .status .handle")?.textContent ?? "", glyph: !!document.querySelector("#hud .status .glyph svg"), moniker: document.querySelector("#hud .status .moniker")?.textContent ?? "" }));
    const ib = await b.evaluate(() => ({ id: window.__game.state().identity }));
    check("a NAMED file (Depth 50) is called by its name; the glyph and the equipped, earned moniker sit in the status line", ia.id.display === "ALPHA" && ia.id.chapter === 3 && ia.id.moniker === "named" && ia.handle === "ALPHA" && ia.glyph && /NAMED/.test(ia.moniker), `display ${ia.id.display} · chapter ${ia.id.chapter} · moniker ${ia.id.moniker} · status "${ia.handle}${ia.moniker}"`);
    check("a fresh file that claims an unearned moniker wears none: the city calls it BLANK; it has earned only UNLISTED", ib.id.display === "BLANK" && ib.id.moniker === null && ib.id.chapter === 0 && ib.id.unlocked.join() === "unlisted", `display ${ib.id.display} · moniker ${ib.id.moniker} · unlocked [${ib.id.unlocked.join(", ")}]`);

    // take positions during the warm-up: CHARLIE on node D for cell one, ALPHA at the post, BRAVO in the lane
    await c.evaluate(() => window.__game.setBot([{ kind: "goto", x: -10, z: 10, sprint: true, radius: 1.5, timeoutTicks: 600 }, { kind: "goto", x: 0, z: 17, sprint: true, radius: 1, timeoutTicks: 900, stop: true }, { kind: "hold", ticks: 9000 }]));
    await a.evaluate((plan) => window.__game.setBot(plan), toPost);
    await b.evaluate((plan) => window.__game.setBot(plan), toLane);
    for (const pg of [a, b, c]) await pg.evaluate(() => window.__game.setRealtime(true));

    // ---- the dossier: 1.2 s, both cells, identity only ----
    let flash: { open: boolean; entries: number; t: number } | null = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 50000) {
      const r = await a.evaluate(() => window.__game.state().rituals);
      if (r.dossierOpen) {
        flash = { open: true, entries: r.dossierEntries, t: Date.now() - t0 };
        await a.waitForTimeout(450); // let the reveal animation paint; the flash holds for 1.2 s
        await a.screenshot({ path: `${OUT}/stage8-dossier.png` });
        break;
      }
      await a.waitForTimeout(60);
    }
    await a.waitForFunction(() => !window.__game.state().rituals.dossierOpen, null, { timeout: 8000, polling: 50 }).catch(() => null);
    const after = await a.evaluate(() => ({ r: window.__game.state().rituals, social: window.__game.state().social, audio: window.__game.state().audio }));
    const dossier = after.social.find((m) => m.kind === "dossier");
    const dKeys = dossier?.kind === "dossier" ? [...new Set(dossier.entries.flatMap((e) => Object.keys(e)))].sort() : [];
    check("the pre-match dossier flashes both cells' files for 1.2 s at round start", !!flash && flash.entries === 3 && !after.r.dossierOpen && (after.audio["dossier"] ?? 0) >= 1, flash ? `open at +${(flash.t / 1000).toFixed(1)}s with ${flash.entries} files · closed after` : "never opened");
    check("the dossier carries identity only: glyph, chapter, moniker, display, stamp count, Debt flag — and the leak scanner passes it", !!dossier && dKeys.every((k) => IDENTITY_KEYS.includes(k)) && mechanicalLeaks(dossier).length === 0 && dossier.kind === "dossier" && dossier.entries.some((e) => e.display === "ALPHA") && dossier.entries.filter((e) => e.display === "BLANK").length === 2, `keys [${dKeys.join(", ")}] · leaks ${mechanicalLeaks(dossier ?? {}).length} · ${dossier?.kind === "dossier" ? dossier.entries.map((e) => `${e.display}/ch${e.chapter}`).join(" ") : ""}`);
    const rb = await b.evaluate(() => window.__game.net()!.remotes.map((r) => ({ id: r.id, name: r.name, tag: r.tag })));
    const ra = await a.evaluate(() => window.__game.net()!.remotes.map((r) => ({ id: r.id, name: r.name, tag: r.tag })));
    const alphaSeen = rb.find((r) => r.id === ids.a);
    const bravoSeen = ra.find((r) => r.id === ids.b);
    check("over-the-head tags: others see ALPHA by name at Chapter III and BRAVO as BLANK; the tag carries glyph seed, chapter and moniker only", alphaSeen?.name === "ALPHA" && /\.3\.\d+\.\d$/.test(alphaSeen?.tag ?? "") && bravoSeen?.name === "BLANK" && /\.0\.-1\.\d$/.test(bravoSeen?.tag ?? ""), `BRAVO sees ${alphaSeen?.name} [${alphaSeen?.tag}] · ALPHA sees ${bravoSeen?.name} [${bravoSeen?.tag}]`);

    // ---- kills: tiers, Debts (all inside round one) ----
    const ph0 = await waitPhase("wake", 40000);
    console.log(`phase ${ph0} at +${((Date.now() - tRoom) / 1000).toFixed(1)}s`);
    const bk = await duel(b, "BRAVO", a, ids.a, 2, 40000);
    await b.evaluate(() => window.__game.setBot([{ kind: "hold", ticks: 12000 }]));
    const audB = await b.evaluate(() => window.__game.state().audio);
    check("kill-confirm audio: a fresh file (rank 1) hears the tier-0 stamp", bk >= 2 && (audB["kill_t0"] ?? 0) >= 2 && !audB["kill_t3"], `BRAVO kills ${bk} · kill_t0 ${audB["kill_t0"] ?? 0} · kill_t3 ${audB["kill_t3"] ?? 0}`);
    // ALPHA answers once: the tier-3 stamp (mastery 30), then stands down until round two
    const ak = await duel(a, "ALPHA", b, ids.b, 1, 30000);
    await a.evaluate(() => window.__game.setBot([{ kind: "hold", ticks: 12000 }]));
    const audA = await a.evaluate(() => window.__game.state().audio);
    check("kill-confirm audio: a mastered file (rank 30) hears the tier-3 stamp — shooter-side only", ak >= 1 && (audA["kill_t3"] ?? 0) >= 1 && !audA["kill_t0"], `ALPHA kills ${ak} · kill_t3 ${audA["kill_t3"] ?? 0} · kill_t0 ${audA["kill_t0"] ?? 0}`);

    // ---- settlement: the receipt, the Debt, the rite ----
    const phaseAtKills = await phaseNow();
    const phase = await waitPhase("results", 60000);
    console.log(`kills done in phase ${phaseAtKills}; ${phase} at +${((Date.now() - tRoom) / 1000).toFixed(1)}s`);
    // the receipt prints line by line on ALPHA's screen
    let printed: number[] = [];
    let stamped = false;
    const t4 = Date.now();
    while (Date.now() - t4 < 15000 && !stamped) {
      const r = await a.evaluate(() => window.__game.state().rituals.receipt);
      if (r.open) printed.push(r.printed);
      stamped = r.stamped;
      if (!stamped) await a.waitForTimeout(150);
    }
    await a.screenshot({ path: `${OUT}/stage8-receipt.png` });
    const rec = await a.evaluate(() => ({ r: window.__game.state().rituals.receipt, audio: window.__game.state().audio }));
    const grew = printed.some((p, i) => i > 0 && p > printed[i - 1]!);
    const signed = await a.evaluate(() => window.__game.sign());
    const rec2 = await a.evaluate(() => ({ r: window.__game.state().rituals.receipt, audio: window.__game.state().audio, log: [...document.querySelectorAll("#hud .log div")].map((d) => d.textContent ?? "") }));
    check("the Ledger Entry prints line by line (print chatter), stamps (thunk), and closes when the player signs (Enter)", phase === "results" && grew && rec.r.stamped && rec.r.printed === rec.r.lines.length && (rec.audio["print"] ?? 0) >= 3 && signed && !rec2.r.open && rec2.r.signed === 1 && (rec2.audio["sign"] ?? 0) >= 1, `printed ${printed.slice(0, 6).join("→")}… of ${rec.r.lines.length} · print cues ${rec.audio["print"]} · signed ${rec2.r.signed} · "${rec.r.lines[0]}"`);
    const st1 = (await stats()).rooms[room]!;
    const sa = st1.clients.find((x) => x.name === "ALPHA")!;
    const sc = st1.clients.find((x) => x.name === "CHARLIE")!;
    const socA = await a.evaluate(() => ({ social: window.__game.state().social, debt: window.__game.state().debtTargetId, id: window.__game.state().identity }));
    const owed = socA.social.find((m) => m.kind === "debt" && m.event === "owed");
    check("a Debt: the enemy who closed your file most is written to your file at settlement and flagged to you", sa.identity.debt === "BLANK" && sa.identity.debtTarget === ids.b && !!owed && owed.kind === "debt" && owed.id === ids.b && owed.kills >= 2 && socA.debt === ids.b && socA.id.debt?.display === "BLANK", `ALPHA owes ${sa.identity.debt} (${owed?.kind === "debt" ? owed.kills : "?"} files) · target #${sa.identity.debtTarget} · client target #${socA.debt}`);
    const rite = await c.evaluate(() => ({ social: window.__game.state().social, r: window.__game.state().rituals, audio: window.__game.state().audio, id: window.__game.state().identity }));
    await c.screenshot({ path: `${OUT}/stage8-rite.png` });
    const riteMsg = rite.social.find((m) => m.kind === "rite");
    check("Chapter I: a file crossing Depth 10 at settlement performs the LISTED rite (card, chord, glyph layer)", sc.file!.depth >= 10 && sc.identity.chapter === 1 && sc.identity.chapters.join() === "1" && riteMsg?.kind === "rite" && riteMsg.title === "LISTED" && (rite.audio["rite_1"] ?? 0) >= 1 && rite.id.chapter === 1 && rite.id.chapters.join() === "1", `CHARLIE depth ${sc.file!.depth} · chapter ${sc.identity.chapter} · rite "${riteMsg?.kind === "rite" ? riteMsg.title : ""}" · card ${rite.r.riteOpen ? "open" : "closed"} "${rite.r.riteTitle}" · rite cues ${rite.audio["rite"] ?? 0}`);

    // ---- next round: the Debt is flagged in the dossier, then cleared ----
    const t5 = Date.now();
    let dossier2: { entries: { id: number; debt: boolean }[] } | null = null;
    while (Date.now() - t5 < 60000 && !dossier2) {
      await a.waitForTimeout(500);
      const soc = await a.evaluate(() => window.__game.state().social);
      const ds = soc.filter((m) => m.kind === "dossier");
      if (ds.length >= 2) dossier2 = ds[ds.length - 1] as unknown as { entries: { id: number; debt: boolean }[] };
    }
    check("round two's dossier flags the Debt for the file that owes it", !!dossier2 && dossier2.entries.find((e) => e.id === ids.b)?.debt === true && dossier2.entries.filter((e) => e.debt).length === 1, dossier2 ? dossier2.entries.map((e) => `#${e.id}${e.debt ? " DEBT" : ""}`).join(" ") : "no second dossier");
    // ALPHA settles it: the same duel, one kill of the file he owes
    const before = await killsOf("ALPHA");
    const ak2 = await duel(a, "ALPHA", b, ids.b, before + 1, 45000);
    console.log(`round two: ALPHA kills ${before} → ${ak2}`);
    const t6 = Date.now();
    let cleared: { credit: number; capped: boolean } | null = null;
    while (Date.now() - t6 < 45000 && !cleared) {
      await a.waitForTimeout(500);
      const soc = await a.evaluate(() => window.__game.state().social);
      const m = soc.find((x) => x.kind === "debt" && x.event === "cleared");
      if (m && m.kind === "debt") cleared = { credit: m.credit, capped: m.capped };
    }
    await a.waitForTimeout(200);
    await a.screenshot({ path: `${OUT}/stage8-debt.png` });
    const dc = await a.evaluate(() => ({ r: window.__game.state().rituals, audio: window.__game.state().audio, debt: window.__game.state().debtTargetId }));
    const sa2 = (await stats()).rooms[room]!.clients.find((x) => x.name === "ALPHA")!;
    check("DEBT CLEARED: killing the file you owe fires the banner and sting, credits +5 Wakelight once, and clears the Debt on the file", !!cleared && cleared.credit === 5 && !cleared.capped && /DEBT CLEARED/.test(dc.r.debtText) && (dc.audio["debtCleared"] ?? 0) >= 1 && dc.debt === -1 && sa2.identity.debt === null && sa2.identity.wakelight === 5, `${cleared ? `credit ${cleared.credit} capped ${cleared.capped}` : "not cleared"} · banner "${dc.r.debtText}" · file debt ${sa2.identity.debt} · wakelight ${sa2.identity.wakelight}`);

    // ---- the leak scan over everything social that reached any client ----
    const allSocial = [...(await a.evaluate(() => window.__game.state().social)), ...(await b.evaluate(() => window.__game.state().social)), ...(await c.evaluate(() => window.__game.state().social))];
    const leaks = allSocial.flatMap((m) => mechanicalLeaks(m));
    const tags = [...rb, ...ra].map((r) => r.tag);
    check("identity leaks nothing mechanical: every social payload and every tag passes the scanner (which does catch a loadout)", allSocial.length >= 8 && leaks.length === 0 && tags.every((t) => /^[0-9a-z]+\.\d\.-?\d+\.\d$/.test(t)) && mechanicalLeaks({ display: "X", attested: ["slipfile"] }).length >= 2, `${allSocial.length} social messages · ${leaks.length} leaks · tags [${tags.join(" ")}] · control: ${mechanicalLeaks({ display: "X", attested: ["slipfile"] }).length} flagged`);
    const stSoc = (await stats()).rooms[room]!.social;
    results["online"] = { ids, flash, social: stSoc, alpha: sa2, charlie: sc, tags };
    if (checks.some((x) => !x.pass)) {
      const logs = ((await (await fetch(`http://127.0.0.1:${HOST_PORT}/stats`)).json()) as { logs: string[] }).logs;
      console.log("host log tail:\n  " + logs.slice(-30).join("\n  "));
    }
    await a.close();
    await b.close();
    await c.close();

    // ---------------- the Deadletter Office ----------------
    const L = levelById(HUB_LEVEL_ID);
    const nav = buildNav(L);
    const hubDef = L.hub!;
    const startPos = { x: (hubDef.start.min.x + hubDef.start.max.x) / 2, y: 0, z: 0 };
    const endPos = { x: (hubDef.end.min.x + hubDef.end.max.x) / 2, y: 0, z: 0 };
    const course = findPath(nav, startPos, endPos)!;
    const openHub = async (): Promise<Page> => {
      const pg = await browser.newPage({ viewport: { width: 960, height: 540 } });
      pg.on("pageerror", (e) => errors.push(`hub: ${String(e)}`));
      pg.on("console", (m) => m.type() === "error" && errors.push(`hub: ${m.text()}`));
      await pg.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&ai=0&level=${HUB_LEVEL_ID}&account=sandbox-alpha&shop=http://127.0.0.1:${HOST_PORT}`, { waitUntil: "load" });
      await pg.waitForFunction(() => window.__game?.ready === true && window.__game.state().hub?.fileLoaded === true, null, { timeout: 40000, polling: 100 });
      await pg.evaluate(() => window.__game.resumeAudio());
      return pg;
    };
    const h = await openHub();
    await h.evaluate(() => {
      window.__game.setBot([{ kind: "look", yaw: 0, pitch: 0.02, ticks: 5 }, { kind: "hold", ticks: 20 }]);
      window.__game.advance(20);
    });
    await h.waitForTimeout(400);
    await h.screenshot({ path: `${OUT}/stage8-office.png` });
    const hub0 = await h.evaluate(() => ({ hub: window.__game.state().hub!, id: window.__game.state().identity, level: window.__game.state().level, zone: document.querySelector("#hud .status .dim")?.textContent ?? "", ledger: window.__game.file().ledger.length }));
    check("the Deadletter Office loads ALPHA's real file from the ledger host: renovated to Chapter III, the trophy wall cut from the ledger (matches, Debts, stamps)", hub0.level === HUB_LEVEL_ID && /DEADLETTER OFFICE/.test(hub0.zone) && hub0.hub.renovations === 6 && hub0.hub.trophies >= 3 && hub0.id.display === "ALPHA" && hub0.id.chapter === 3, `${hub0.hub.renovations} renovation pieces · ${hub0.hub.trophies} trophies · file ${hub0.id.display} ch${hub0.id.chapter} · ${hub0.ledger} ledger lines`);
    // the range: sprint the course once (a first run, no ghost yet)
    const run = (sprint: boolean): BotStep[] => [{ kind: "goto", x: startPos.x, z: startPos.z, sprint: true, radius: 0.6, timeoutTicks: 1200, stop: true }, { kind: "hold", ticks: 20 }, ...course.slice(1).map((p, i, arr) => ({ kind: "goto" as const, x: p.x, z: p.z, sprint, radius: i === arr.length - 1 ? 0.8 : 1.4, timeoutTicks: 900, stop: i === arr.length - 1 })), { kind: "hold", ticks: 30 }];
    await h.evaluate((plan) => window.__game.setBot(plan), run(true));
    let sawGhost1 = false;
    for (let i = 0; i < 160; i++) {
      await h.evaluate(() => window.__game.advance(20));
      const s = await h.evaluate(() => ({ done: window.__game.botStatus()?.done, g: window.__game.state().hub!.ghost }));
      if (s.g.playing) sawGhost1 = true;
      if (s.done) break;
    }
    const g1 = await h.evaluate(() => ({ g: window.__game.state().hub!.ghost, audio: window.__game.state().audio, log: [...document.querySelectorAll("#hud .log div")].map((d) => d.textContent ?? "").filter((t) => /RANGE/.test(t)) }));
    await h.waitForTimeout(600);
    const fileA = (await (await fetch(`http://127.0.0.1:${HOST_PORT}/file/sandbox-alpha`)).json()) as { ghosts: Record<string, { seconds: number; samples: number[] }> };
    const srvGhost = fileA.ghosts[HUB_LEVEL_ID];
    check("a range run is recorded from the start pad to the end pad (no ghost on a first run), posted to the file, and kept as the best", g1.g.runs === 1 && g1.g.best !== null && !g1.g.recording && !sawGhost1 && !!srvGhost && Math.abs(srvGhost.seconds - (g1.g.best ?? 0)) < 0.01 && srvGhost.samples.length >= 40 && (g1.audio["sign"] ?? 0) >= 1, `run ${g1.g.last.toFixed(2)}s · best ${g1.g.best?.toFixed(2)}s · file ghost ${srvGhost?.seconds.toFixed(2)}s (${srvGhost ? srvGhost.samples.length / 4 : 0} samples) · ${g1.log[0] ?? ""}`);
    await h.close();
    // reload: the ghost is back; walk the course so the sprinting ghost pulls ahead and reads in frame
    const h2 = await openHub();
    const g2 = await h2.evaluate(() => window.__game.state().hub!.ghost);
    await h2.evaluate((plan) => window.__game.setBot(plan), run(false));
    let ghostShot = false;
    const poses: { x: number; z: number }[] = [];
    let lead = 0;
    for (let i = 0; i < 220; i++) {
      await h2.evaluate(() => window.__game.advance(20));
      const s = await h2.evaluate(() => ({ done: window.__game.botStatus()?.done, g: window.__game.state().hub!.ghost, pos: window.__game.state().pos }));
      if (s.g.playing && s.g.pose) {
        poses.push(s.g.pose);
        lead = Math.max(lead, s.g.pose.x - s.pos.x);
        if (!ghostShot && s.g.pose.x - s.pos.x > 6) {
          await h2.evaluate(() => {
            window.__game.setBot([{ kind: "look", yaw: -Math.PI / 2, pitch: 0.0, ticks: 3 }]);
            window.__game.advance(3);
          });
          await h2.waitForTimeout(1200);
          await h2.screenshot({ path: `${OUT}/stage8-ghost.png` });
          ghostShot = true;
          await h2.evaluate((plan) => window.__game.setBot(plan.slice(2)), run(false));
        }
      }
      if (s.done) break;
    }
    const g3 = await h2.evaluate(() => window.__game.state().hub!.ghost);
    const moved = poses.length > 5 && poses[poses.length - 1]!.x - poses[0]!.x > 20;
    check("the ghost of the best run replays on the next run (persisted across a reload), pulls ahead of a walking Blank, and the slower run does not replace the best", g2.best !== null && Math.abs((g2.best ?? 0) - (g1.g.best ?? 0)) < 0.01 && moved && lead > 6 && ghostShot && g3.runs === 1 && g3.last > (g3.best ?? 0), `best on reload ${g2.best?.toFixed(2)}s · ghost moved ${poses.length ? (poses[poses.length - 1]!.x - poses[0]!.x).toFixed(1) : 0} m · lead ${lead.toFixed(1)} m · second run ${g3.last.toFixed(2)}s vs best ${g3.best?.toFixed(2)}s`);
    await h2.close();
    check("no page errors across the room and the hub", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean console");
    results["hub"] = { first: g1.g, second: g3, lead, trophies: hub0.hub.trophies, renovations: hub0.hub.renovations };

    writeFileSync(`${OUT}/stage8.json`, JSON.stringify({ results, checks }, null, 2));
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
