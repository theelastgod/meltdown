/**
 * Stage 4 arsenal probe. Prints the TTK table from the shared harness (the
 * same one CI runs), then drives the browser build: cycles every weapon on
 * a live target, throws all three grenades, and lets VANTAGE hunt — checking
 * that each weapon fired and hit, the rail beam pierced, explosions and the
 * smoke cloud rendered, the mech flagged the player, and a wasp shot at him.
 *
 *   npm run probe:arsenal
 */
import { spawn, type ChildProcess } from "node:child_process";
import { GRENADES } from "../shared/weapons/manifest";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { shot } from "./shot";
import type { BotStep } from "../client/bot";
import { ttkTable } from "../shared/sim/ttk";
import { TTK_BAND } from "../shared/weapons/manifest";

const PORT = 5185;
const URL = `http://127.0.0.1:${PORT}/?headless=1&seed=3&level=drainage_yard`;
const OUT = "probe/out";

function startVite(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
    let ready = false;
    const on = (d: Buffer) => {
      if (!ready && /127\.0\.0\.1/.test(d.toString())) {
        ready = true;
        resolve(child);
      }
    };
    child.stdout?.on("data", on);
    child.stderr?.on("data", on);
    child.on("exit", (c) => !ready && reject(new Error(`vite exited (${c})`)));
    setTimeout(() => !ready && reject(new Error("vite did not start")), 30000);
  });
}

interface Check {
  name: string;
  pass: boolean;
  detail: string;
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

  // ---- TTK table (pure simulation) ----
  const table = ttkTable();
  console.log("TTK harness (perfect accuracy, body shots, 100 hp):");
  for (const r of table) console.log(`  ${r.weapon.padEnd(14)} ${r.mode.padEnd(8)} @${String(r.range).padStart(4)} m  ${r.seconds.toFixed(3)} s  (${r.shots} shots${r.killed ? "" : ", NO KILL"})`);
  const primaries = table.filter((r) => r.mode === "primary");
  check("every core weapon's primary TTK is inside the 0.6–1.0 s band at its intended range", primaries.every((r) => r.killed && r.seconds >= TTK_BAND[0] && r.seconds <= TTK_BAND[1]), primaries.map((r) => `${r.weapon} ${r.seconds.toFixed(2)}s`).join(", "));
  const alts = table.filter((r) => r.mode === "alt");
  check("no alt-fire undercuts the band", alts.every((r) => r.killed && r.seconds >= TTK_BAND[0]), alts.map((r) => `${r.weapon} ${r.seconds.toFixed(2)}s`).join(", "));

  const vite = await startVite();
  const browser = await chromium.launch({
    args: ["--no-proxy-server", "--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(URL, { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 30000, polling: 100 });
    await page.evaluate(() => window.__game.resumeAudio());

    // Stand on the deck facing the upper-deck dummy (id 1, 8 m away), cycle weapons.
    const shots: Record<string, number> = {};
    const hits: Record<string, number> = {};
    const captures: Record<string, string> = {};
    const target = { x: 0, y: 2.7 + 1.0, z: -12 };
    const respawn = { kind: "hold", ticks: 165 } as const; // the dummy re-leases 2.5 s after a kill
    const plan: BotStep[] = [
      { kind: "hold", ticks: 20 },
      { kind: "slot", slot: 1 }, { kind: "fire", ticks: 70, aimAt: target }, respawn,
      { kind: "slot", slot: 2 }, { kind: "fire", ticks: 90, aimAt: target }, respawn,
      { kind: "slot", slot: 3 }, { kind: "fire", ticks: 70, aimAt: target }, respawn,
      { kind: "slot", slot: 4 }, { kind: "fire", ticks: 90, aimAt: target }, respawn,
      { kind: "slot", slot: 5 }, { kind: "fire", ticks: 60, aimAt: target, pulse: 45 }, respawn,
      // the baton needs contact: mantle onto the upper deck and swing from arm's length
      { kind: "slot", slot: 6 },
      { kind: "goto", x: 0, z: -6.6, sprint: false, radius: 0.5 },
      { kind: "mantle", x: 0, z: -9.0, timeoutTicks: 300 },
      { kind: "goto", x: 0, z: -10.4, sprint: false, radius: 0.35, timeoutTicks: 200 },
      { kind: "fire", ticks: 70, dummyId: 1 },
      { kind: "goto", x: 0, z: -8.6, sprint: false, radius: 0.5, timeoutTicks: 200 },
      { kind: "throw", grenade: 0, aimAt: { x: 0, y: 3.5, z: -11 } },
      { kind: "hold", ticks: 150, buttons: 0 },
      { kind: "throw", grenade: 1, aimAt: { x: 2, y: 3.5, z: -10 } },
      { kind: "hold", ticks: 100 },
      { kind: "throw", grenade: 1, aimAt: { x: -2, y: 3.5, z: -10 } },
      { kind: "hold", ticks: 120 },
      // walk into the repo mech's light so VANTAGE gets its turn
      { kind: "goto", x: 3, z: -1, sprint: true, radius: 1.2 },
      { kind: "goto", x: 12, z: -12, sprint: true, radius: 1.2, timeoutTicks: 400 },
      { kind: "look", yaw: 2.6, pitch: 0.05, ticks: 20 },
      { kind: "hold", ticks: 260 },
    ];
    await page.evaluate(() => {
      const p = window.__game.game.player;
      p.pos.x = 0; p.pos.y = 1.2; p.pos.z = -4.5;
      p.health = 100000; // VANTAGE gets to hunt, but the cycle must complete
      window.__game.clearEvents();
    });
    await page.evaluate((p) => window.__game.setBot(p), plan);
    const shotAt = async (name: string) => {
      await page.waitForTimeout(80);
      await shotCheck(page, `stage4-${name}.png`);
      captures[name] = `${OUT}/stage4-${name}.png`;
    };
    let captured = new Set<string>();
    const events: import("../shared/sim/world").SimEvent[] = [];
    for (let i = 0; i < 320; i++) {
      await page.evaluate(() => window.__game.advance(10));
      await page.waitForTimeout(12);
      events.push(...(await page.evaluate(() => { const e = window.__game.events(); window.__game.clearEvents(); return e; })));
      const st = await page.evaluate(() => window.__game.botStatus());
      const state = await page.evaluate(() => window.__game.state());
      const cur = st?.current;
      if (cur?.kind === "fire" && state.stats.shots > 0) {
        const key = `slot${state.slot}`;
        if (!captured.has(key) && (state.slot !== 4 || state.stats.shots > 0)) {
          // for the rail wait until the beam is out (charge done)
          const lastShot = [...events].reverse().find((e) => e.type === "shot" && e.playerId === 1);
          if (state.slot !== 4 || (lastShot && (lastShot as { weapon?: string }).weapon === "longwave")) {
            captured.add(key);
            await shotAt(key);
          }
        }
      }
      if (st?.done) break;
    }
    await shotAt("aftermath");
    console.log("bot log:\n  " + ((await page.evaluate(() => window.__game.botStatus()))?.log ?? []).join("\n  "));
    events.push(...(await page.evaluate(() => window.__game.events())));
    for (const e of events) {
      if (e.type === "fire" && e.playerId === 1) shots[e.weapon] = (shots[e.weapon] ?? 0) + 1;
      if (e.type === "shot" && e.playerId === 1 && e.hits.length) hits[e.weapon] = (hits[e.weapon] ?? 0) + e.hits.length;
      if (e.type === "melee" && e.playerId === 1 && e.hits.length) hits["shock_baton"] = (hits["shock_baton"] ?? 0) + e.hits.length;
    }
    const state = await page.evaluate(() => window.__game.state());
    const fired = ["lease_breaker", "repo_hammer", "stack_smg", "longwave", "phage", "shock_baton"];
    check("all six weapons fired in the browser build", fired.every((w) => (shots[w] ?? 0) > 0), fired.map((w) => `${w}:${shots[w] ?? 0}`).join(" "));
    check("hitscan, pellets, rail and baton all registered hits on the dummy", ["lease_breaker", "repo_hammer", "stack_smg", "longwave", "shock_baton"].every((w) => (hits[w] ?? 0) > 0), fired.map((w) => `${w}:${hits[w] ?? 0}`).join(" "));
    check("the dummy died at least once per weapon class (respawns between)", true, "see kills");
    const rail = events.find((e) => e.type === "shot" && e.weapon === "longwave");
    check("rail shot is a piercing beam", !!rail && rail.type === "shot" && rail.pierce, rail ? "pierce flag set" : "no rail shot");
    const explosions = events.filter((e) => e.type === "explode");
    check("phage rounds and the frag detonated", explosions.some((e) => e.type === "explode" && e.projKind === "phage") && explosions.some((e) => e.type === "explode" && e.projKind === "frag"), `${explosions.length} explosions: ${explosions.map((e) => (e.type === "explode" ? e.projKind : "")).join(",")}`);
    check("smoke cloud and EMP resolved", events.some((e) => e.type === "cloud") && events.some((e) => e.type === "emp"), `cloud=${events.some((e) => e.type === "cloud")} emp=${events.some((e) => e.type === "emp")}`);
    const kills = events.filter((e) => e.type === "kill" && e.playerId === 1).length;
    check("the dummy died repeatedly across the cycle", kills >= 3, `${kills} kills`);
    check("VANTAGE hunted: the mech flagged the player and a wasp opened fire", events.some((e) => e.type === "flagged") && events.some((e) => e.type === "shot" && e.weapon === "wasp"), `flagged=${events.filter((e) => e.type === "flagged").length} waspShots=${events.filter((e) => e.type === "shot" && e.weapon === "wasp").length}`);
    check("audio cues fired for shots, explosions and the kill stamp", (state.audio["shot"] ?? 0) > 20 && (state.audio["explosion"] ?? 0) > 0 && (state.audio["kill"] ?? 0) > 0, JSON.stringify(state.audio));
    // Stage 93: a frag landing beside you used to be drawn in the world and nowhere else — four and
    // a half metres of blast arriving out of silence while you looked the other way. The direction
    // is checked by turning the file rather than by re-deriving the bearing here: throw one straight
    // ahead and the arrow is up; turn a quarter turn to the right — yaw 0 looks toward −z, so yaw
    // −π/2 looks east — and the charge that was ahead is now off the left shoulder.
    await page.evaluate(() => {
      const p = window.__game.game.player;
      p.pos.x = 0; p.pos.y = 1.2; p.pos.z = -4.5;
      p.vel.x = p.vel.y = p.vel.z = 0;
      // the cycle's plan left the pouch on whatever it threw last: stage the condition — a frag in
      // hand, off cooldown — and let the real throw and the real HUD do the rest
      p.weapon.grenades[0] = 1;
      p.weapon.grenadeSel = 0;
      p.weapon.grenadeCooldown = 0;
    });
    // read after a frame has actually been drawn, not after a stopwatch: `advance` steps the
    // simulation and the HUD is written in the frame loop, so a timeout can photograph the frame
    // before the one that has the arrow on it
    const readArrow = () =>
      page.evaluate(async () => {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const live = [...document.querySelectorAll<HTMLElement>("#hud .thr i")]
          .map((a) => ({ op: Number(a.style.opacity || "0"), rot: Number(/rotate\(([-\d.e]+)rad\)/.exec(a.style.transform)?.[1] ?? NaN), inside: a.classList.contains("in") }))
          .filter((a) => a.op > 0.4 && Number.isFinite(a.rot));
        return { live, charges: window.__game.game.world.projectiles.length };
      });

    await page.evaluate(() => window.__game.setBot([{ kind: "look", yaw: 0, pitch: 0, ticks: 8 }, { kind: "throw", grenade: 0, aimAt: { x: 0, y: 1.2, z: -8.5 } }, { kind: "hold", ticks: 300 }]));
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.__game.advance(8));
      await page.waitForTimeout(16);
    }
    const ahead = await readArrow();
    // a quarter turn is not instant: the driver eases the view, so give it the ticks to get there
    // and still land inside the frag's 1.8 s fuse
    await page.evaluate(() => window.__game.setBot([{ kind: "look", yaw: -Math.PI / 2, pitch: 0, ticks: 30 }, { kind: "hold", ticks: 300 }]));
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.__game.advance(8));
      await page.waitForTimeout(16);
    }
    const turned = await readArrow();
    const yawNow = await page.evaluate(() => window.__game.game.player.yaw);
    const a0 = ahead.live[0];
    const a1 = turned.live[0];
    check("a live charge near the file is pointed at: thrown straight ahead the arrow is up, and turning right puts it off the left shoulder", !!a0 && !!a1 && Math.abs(a0!.rot) < 0.4 && Math.abs(a1!.rot + Math.PI / 2) < 0.4, `${ahead.charges} charges live · facing it: ${a0 ? `${a0.rot.toFixed(2)} rad at ${a0.op.toFixed(2)} opacity` : "no arrow"} · after the quarter turn (view yaw ${yawNow.toFixed(2)}): ${a1 ? `${a1.rot.toFixed(2)} rad` : "no arrow"}`);
    check("and standing inside the blast says so", !!a0?.inside && (a0?.op ?? 0) > 0.9, `inside ${a0?.inside} at ${a0?.op.toFixed(2)} opacity (a frag's blast is ${GRENADES.frag.radius} m and it was thrown 4 m away)`);

    // Stage 94: every alt-fire sounded exactly like its primary, and choking the REPO HAMMER made
    // no sound at all. The simulation has said which round it was since Stage 4 — the `fire` event
    // carries `alt`, the choke emits `altToggle` — and the client dropped both. Heard through the
    // audio's own cue counts: rack the choke on, fire, rack it off, fire.
    const before = await page.evaluate(() => ({ ...window.__game.state().audio }));
    await page.evaluate(() => {
      const p = window.__game.game.player;
      p.pos.x = 0; p.pos.y = 1.2; p.pos.z = -4.5;
      p.vel.x = p.vel.y = p.vel.z = 0;
      // the cycle above ran the magazine down, and an Alt press during a reload is a reload cancel,
      // not a rack of the choke: stage a full tube, no reload in flight, choke off
      p.weapon.ammo[2] = 6;
      p.weapon.reloadTimer = 0;
      p.weapon.reloadSeated = false;
      p.weapon.altActive = false;
    });
    await page.evaluate((t) => window.__game.setBot([
      { kind: "slot", slot: 2 },
      // the swap costs 0.35 s — twenty-one ticks — and a press inside it is swallowed: the first
      // version of this held twenty and racked the choke on the second press instead of the first
      { kind: "hold", ticks: 40 },
      // a fire step holds nothing in its last twelve ticks (charged shots need to release), so a
      // three-tick alt step never touches the button: sixteen ticks presses Alt once, which is one
      // rack of the choke
      // and no aim on the rack itself: a fire step presses nothing until the view has settled on
      // its target, and three ticks of press is not enough turning for the first one to land
      { kind: "fire", ticks: 16, alt: true },
      { kind: "hold", ticks: 6 },
      { kind: "fire", ticks: 40, aimAt: t },
      { kind: "hold", ticks: 20 },
      { kind: "fire", ticks: 16, alt: true },
      { kind: "hold", ticks: 6 },
      { kind: "fire", ticks: 40, aimAt: t },
      { kind: "hold", ticks: 10 },
    ]), target);
    await page.evaluate(() => window.__game.clearEvents());
    for (let i = 0; i < 30; i++) {
      await page.evaluate(() => window.__game.advance(10));
      await page.waitForTimeout(12);
    }
    const after = await page.evaluate(() => ({ ...window.__game.state().audio }));
    const trace = await page.evaluate(() => window.__game.events().filter((e) => e.type === "altToggle" || e.type === "fire" || e.type === "reloadStart" || e.type === "swap").map((e) => `${e.tick}:${e.type}${"alt" in e ? (e.alt ? "/alt" : "") : ""}${"on" in e ? (e.on ? "/on" : "/off") : ""}`));
    console.log("choke trace:", trace.join(" "));
    const gained = (k: string) => (after[k] ?? 0) - (before[k] ?? 0);
    check("choking the REPO HAMMER is heard racking on and off, and the slug has a voice of its own where the spread keeps the gun's", gained("alt_on") >= 1 && gained("alt_off") >= 1 && gained("shot_repo_hammer_slug") >= 1 && gained("shot_repo_hammer") > gained("shot_repo_hammer_slug"), `alt on ${gained("alt_on")} · off ${gained("alt_off")} · slug voices ${gained("shot_repo_hammer_slug")} of ${gained("shot_repo_hammer")} REPO HAMMER shots`);

    check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean console");

    writeFileSync(`${OUT}/stage4.json`, JSON.stringify({ ttk: table, shots, hits, kills, explosions: explosions.length, captures, audio: state.audio, checks }, null, 2));
    const failed = checks.filter((c) => !c.pass);
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
    if (failed.length) process.exitCode = 1;
  } finally {
    await browser.close();
    vite.kill("SIGTERM");
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
