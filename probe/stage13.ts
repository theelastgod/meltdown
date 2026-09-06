/**
 * Stage 13 probe — polish & ship.
 *  The CRT menu flow: the two title cards in order ("Every mind in Lethe is leased." / "You woke
 *  free."), then the menu with WAKE / CAMPAIGN / THE OFFICE / THE RANGE / FILE / SETTINGS; keys
 *  move the cursor and a choice is a URL that names the mode (WAKE picks a district and the
 *  public room); SETTINGS adjust live (sensitivity, FOV, volumes, CRT) and persist; ESC in play
 *  is the pause menu; the audio pass: buses, UI cues, the card sting, the low-health pulse.
 *
 *   npm run probe:ship
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { TITLE_CARDS } from "../client/menu";
import { DEFAULT_SETTINGS } from "../client/settings";

const VITE_PORT = 5209;
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
    setTimeout(() => !ok && reject(new Error(`${what} did not start`)), 60000);
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
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(VITE_PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(vite, /127\.0\.0\.1/, "vite");
  const browser = await chromium.launch({ args: ARGS });
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const errors: string[] = [];
  const results: Record<string, unknown> = {};
  const newPage = async (tag: string): Promise<Page> => {
    const pg = await context.newPage();
    pg.on("pageerror", (e) => errors.push(`${tag}: ${String(e)}`));
    pg.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
    return pg;
  };
  try {
    // ---------------- the title cards ----------------
    const a = await newPage("menu");
    await a.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&menu=1&crawl=0&nonav=1&menuspeed=2&level=drainage_yard&account=sandbox-ship`, { waitUntil: "load" });
    await a.waitForFunction(() => window.__game?.ready === true && window.__game.menu()?.screen === "cards", null, { timeout: 40000, polling: 30 });
    const cards: string[] = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      const v = await a.evaluate(() => window.__game.menu()!);
      if (v.screen !== "cards") break;
      if (v.cardText && cards[cards.length - 1] !== v.cardText) {
        cards.push(v.cardText);
        await a.waitForTimeout(260); // past the card's snap-in (its first step is dark)
        await a.screenshot({ path: `${OUT}/stage13-card${cards.length}.png` });
      }
      await a.waitForTimeout(20);
    }
    const look = await a.evaluate(() => {
      const root = document.getElementById("menu")!;
      const rs = getComputedStyle(root);
      return { bg: rs.backgroundColor, font: rs.fontFamily, scan: getComputedStyle(root.querySelector(".scan")!).animationName, z: rs.zIndex };
    });
    check("the two title cards, in order, CRT chrome (black, terminal type, a scanline pass), then the menu", cards.length === 2 && cards[0] === TITLE_CARDS[0] && cards[1] === TITLE_CARDS[1] && /rgb\(0,\s*0,\s*0\)/.test(look.bg) && look.scan === "crawl-flicker" && Number(look.z) >= 900, `cards [${cards.map((c) => `"${c}"`).join(", ")}] · bg ${look.bg} · scan ${look.scan}`);

    // ---------------- the main menu and the keys ----------------
    await a.waitForFunction(() => window.__game.menu()?.screen === "main", null, { timeout: 20000, polling: 30 });
    const m0 = await a.evaluate(() => window.__game.menu()!);
    await a.screenshot({ path: `${OUT}/stage13-menu.png` });
    await a.evaluate(() => window.__game.menuKey("ArrowDown"));
    await a.evaluate(() => window.__game.menuKey("ArrowDown"));
    const m1 = await a.evaluate(() => window.__game.menu()!);
    await a.evaluate(() => window.__game.menuKey("ArrowUp"));
    const m2 = await a.evaluate(() => window.__game.menu()!);
    const who = await a.evaluate(() => (document.querySelector("#menu .who") as HTMLElement).textContent ?? "");
    check("the menu lists WAKE / THE RUN / CAMPAIGN / THE OFFICE / THE RANGE / FILE / SETTINGS with the file's identity line; ↓↑ move the cursor", m0.entries.join("|") === "WAKE|THE RUN|CAMPAIGN|THE OFFICE|THE RANGE|FILE|SETTINGS" && m0.cursor === 0 && m1.cursor === 2 && m2.cursor === 1 && /DEPTH 50/.test(who) && /sandbox-ship/.test(who), `[${m0.entries.join(", ")}] · cursor 0→2→1 · "${who}"`);
    // choices are URLs that name the mode
    const campaign = await a.evaluate(() => window.__game.menuChoose("campaign"));
    const office = await a.evaluate(() => window.__game.menuChoose("office"));
    const range = await a.evaluate(() => window.__game.menuChoose("range"));
    await a.evaluate(() => window.__game.menuChoose("wake"));
    const wake = await a.evaluate(() => window.__game.menu()!);
    await a.screenshot({ path: `${OUT}/stage13-wake.png` });
    await a.evaluate(() => window.__game.menuKey("Enter"));
    const district = await a.evaluate(() => window.__game.menu()!.target);
    const u = (s: string | null) => new URL(s ?? "http://x/");
    check("a choice is a URL that names the mode: CAMPAIGN opens the desk at the hub, THE OFFICE the hub, THE RANGE the yard; WAKE lists the districts and picks the public room for one", u(campaign).searchParams.get("mode") === "campaign" && u(campaign).searchParams.get("level") === "deadletter_office" && u(office).searchParams.get("level") === "deadletter_office" && u(range).searchParams.get("level") === "drainage_yard" && wake.screen === "wake" && wake.entries.length >= 4 && /\/room\/lethe-lease_row/.test(u(district).searchParams.get("net") ?? "") && u(district).searchParams.get("level") === "lease_row", `campaign ${u(campaign).search} · wake [${wake.entries.slice(0, 3).join(", ")}…] · district → ${u(district).searchParams.get("net")}`);

    // ---------------- settings, live and persisted ----------------
    await a.evaluate(() => window.__game.menuKey("Escape"));
    await a.evaluate(() => window.__game.menuChoose("settings"));
    const s0 = await a.evaluate(() => window.__game.menu()!);
    await a.evaluate(() => window.__game.menuKey("ArrowRight")); // sensitivity +0.05
    await a.evaluate(() => window.__game.menuKey("ArrowDown"));
    for (let i = 0; i < 5; i++) await a.evaluate(() => window.__game.menuKey("ArrowRight")); // fov +5
    const s1 = await a.evaluate(() => window.__game.settings());
    const s2 = await a.evaluate(() => window.__game.setSetting("crt", 0));
    const applied0 = await a.evaluate(() => window.__game.settings().applied);
    await a.evaluate(() => window.__game.setSetting("crt", 1.5));
    const applied1 = await a.evaluate(() => window.__game.settings().applied);
    await a.evaluate(() => window.__game.setSetting("master", 0.3));
    const vol = await a.evaluate(() => window.__game.settings().applied.volumes);
    await a.screenshot({ path: `${OUT}/stage13-settings.png` });
    const stored = await a.evaluate(() => JSON.parse(localStorage.getItem("meltdown.settings") ?? "{}") as Record<string, number>);
    check("SETTINGS adjust live: ← → step sensitivity and FOV, the CRT setting scales grain/scanline/vignette (0 is clean), volumes reach the buses; every change is kept in the browser", s0.screen === "settings" && s0.entries.length === 8 && Math.abs(s1.sensitivity - 1.05) < 1e-6 && Math.abs(s1.applied.sensitivity - 0.0022 * 1.05) < 1e-9 && s1.fov === DEFAULT_SETTINGS.fov + 5 && s1.applied.fov === DEFAULT_SETTINGS.fov + 5 && s2.crt === 0 && applied0.crt.scanline === 0 && applied0.crt.grain === 0 && applied1.crt.scanline > 0.2 && vol.master === 0.3 && stored.fov === DEFAULT_SETTINGS.fov + 5 && stored.crt === 1.5 && stored.master === 0.3, `sens ${s1.sensitivity} (${s1.applied.sensitivity.toFixed(5)}) · fov ${s1.fov} · crt 0 → scan ${applied0.crt.scanline}, 1.5 → scan ${applied1.crt.scanline.toFixed(3)} · master ${vol.master} · stored ${JSON.stringify(stored)}`);
    // a reload finds them applied
    await a.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&level=drainage_yard&account=sandbox-ship`, { waitUntil: "load" });
    await a.waitForFunction(() => window.__game?.ready === true, null, { timeout: 40000, polling: 50 });
    const again = await a.evaluate(() => window.__game.settings());
    check("a reload applies the saved settings before the first frame", again.fov === DEFAULT_SETTINGS.fov + 5 && again.applied.fov === DEFAULT_SETTINGS.fov + 5 && again.crt === 1.5 && again.applied.volumes.master === 0.3, `fov ${again.fov} applied ${again.applied.fov} · crt ${again.crt} · master ${again.applied.volumes.master}`);
    await a.evaluate(() => window.__game.setSetting("crt", 1));
    await a.evaluate(() => window.__game.setSetting("fov", 80));
    await a.evaluate(() => window.__game.setSetting("master", 0.7));

    // ---------------- the pause menu ----------------
    await a.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&menu=1&crawl=0&nonav=1&menuspeed=8&level=drainage_yard&account=sandbox-ship`, { waitUntil: "load" });
    await a.waitForFunction(() => window.__game?.ready === true && window.__game.menu()?.screen === "main", null, { timeout: 40000, polling: 30 });
    await a.evaluate(() => window.__game.menuChoose("resume"));
    const hidden = await a.evaluate(() => window.__game.menu()!.screen);
    await a.evaluate(() => window.__game.pause());
    const p0 = await a.evaluate(() => window.__game.menu()!);
    await a.screenshot({ path: `${OUT}/stage13-pause.png` });
    await a.evaluate(() => window.__game.menuKey("ArrowDown"));
    await a.evaluate(() => window.__game.menuKey("ArrowDown"));
    await a.evaluate(() => window.__game.menuKey("ArrowDown"));
    const quit = await a.evaluate(() => {
      window.__game.menuKey("Enter");
      return window.__game.menu()!.target;
    });
    await a.evaluate(() => window.__game.pause());
    await a.evaluate(() => window.__game.menuKey("Escape"));
    const resumed = await a.evaluate(() => window.__game.menu()!.screen);
    check("ESC in play is the pause menu: RESUME / SETTINGS / FILE / QUIT TO MENU; ESC resumes; QUIT TO MENU is the menu's URL", hidden === "hidden" && p0.screen === "pause" && p0.entries.join("|") === "RESUME|SETTINGS|FILE|QUIT TO MENU" && u(quit).searchParams.get("menu") === "1" && !u(quit).searchParams.has("level") && resumed === "hidden", `pause [${p0.entries.join(", ")}] · quit → ${u(quit).search} · after ESC ${resumed}`);

    // ---------------- the audio pass ----------------
    await a.evaluate(() => window.__game.resumeAudio());
    await a.evaluate(() => window.__game.pause());
    await a.evaluate(() => window.__game.menuKey("ArrowDown"));
    await a.evaluate(() => window.__game.menuKey("ArrowUp"));
    await a.evaluate(() => window.__game.menuKey("Escape"));
    const cues0 = await a.evaluate(() => window.__game.audioCues());
    // low health: the pulse follows the heartbeat under 30 while alive
    await a.evaluate(() => window.__game.setRealtime(true));
    await a.evaluate(() => window.__game.hurt(85));
    await a.waitForTimeout(1500);
    const cues1 = await a.evaluate(() => window.__game.audioCues());
    const health = await a.evaluate(() => window.__game.state().health);
    check("the audio pass: master/sfx/bed buses under the settings, UI cues (move / select / back), the title-card sting, and a low-health pulse that beats while the file is under 30", (cues0.card ?? 0) >= 2 && (cues0.uiMove ?? 0) >= 2 && (cues0.uiSelect ?? 0) >= 1 && (cues0.uiBack ?? 0) >= 1 && (cues1.lowHealthOn ?? 0) >= 1 && (cues1.pulse ?? 0) >= 2, `card ${cues0.card} · move ${cues0.uiMove} · select ${cues0.uiSelect} · back ${cues0.uiBack} · health ${health} · pulses ${cues1.pulse}`);
    await a.close();

    // ---------------- deep links skip the menu ----------------
    const b = await newPage("deep");
    await b.goto(`http://127.0.0.1:${VITE_PORT}/?level=lease_row&crawl=0&headless=1`, { waitUntil: "load" });
    await b.waitForFunction(() => window.__game?.ready === true, null, { timeout: 40000, polling: 50 });
    const deep = await b.evaluate(() => ({ menu: window.__game.menu(), overlay: !!document.getElementById("menu") }));
    await b.close();
    check("a deep link (a level, a room, a mission) and headless boots skip the menu flow", deep.menu === null && !deep.overlay, `menu ${deep.menu} · overlay ${deep.overlay}`);
    check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean console");
    results["ship"] = { cards, entries: m0.entries, district: district, settings: stored, cues: cues1 };
    writeFileSync(`${OUT}/stage13.json`, JSON.stringify({ results, checks }, null, 2));
    const failed = checks.filter((x) => !x.pass);
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
    if (failed.length) process.exitCode = 1;
  } finally {
    await browser.close();
    vite.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
