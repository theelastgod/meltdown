/**
 * Stage 60 probe — third person, like the trailer.
 *
 * The camera stands behind the body, over its right shoulder. These checks are the things that
 * decide whether that is a view of the game or a picture of one: the body is drawn and the camera
 * is behind the eye along the aim; a wall behind the player pulls the camera in rather than
 * putting the wall between camera and player; aiming down sights pulls it in on purpose; the
 * reticle marks what the eye's ray reaches, so a shot through it hits the dummy under it; and
 * first person is still there as a setting, with the viewmodel back and the body gone.
 *
 *   npm run probe:tps
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { shot } from "./shot";
import { TPS_DEFAULT } from "../client/render/tps";

const VITE_PORT = 5216;
const OUT = "probe/out";
const ARGS = ["--no-proxy-server", "--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"];

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

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const checks: Check[] = [];
  const check = (name: string, pass: boolean, detail: string) => {
    checks.push({ name, pass, detail });
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}  — ${detail}`);
  };
  /** the view is what the last *rendered* frame did: after a change, wait for two more frames before reading it */
  const nextFrame = async (pg: Page): Promise<void> => {
    const f = await pg.evaluate(() => window.__game.game.renderer.frames);
    await pg.waitForFunction((n) => window.__game.game.renderer.frames > (n as number) + 1, f, { timeout: 20000, polling: 30 });
  };
  const shotCheck = async (pg: Page, file: string, sel?: string): Promise<void> => {
    const s = await shot(pg, `${OUT}/${file}`, sel);
    check(`artifact: ${file}`, s.ok, s.detail);
  };
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(VITE_PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(vite, /127\.0\.0\.1/, "vite");
  const browser = await chromium.launch({ args: ARGS });
  const errors: string[] = [];
  const results: Record<string, unknown> = {};
  try {
    const pg = await browser.newPage({ viewport: { width: 960, height: 540 } });
    pg.on("pageerror", (e) => errors.push(String(e)));
    pg.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
    await pg.goto(`http://127.0.0.1:${VITE_PORT}/?headless=1&level=drainage_yard&ai=0&wake=0`, { waitUntil: "load" });
    await pg.waitForFunction(() => window.__game?.ready === true, null, { timeout: 60000, polling: 100 });
    await pg.evaluate(() => window.__game.setRealtime(false));
    // a held look so the sim owns the aim (no pointer lock in a headless page)
    await pg.evaluate(() => window.__game.setBot([{ kind: "look", yaw: 0, pitch: 0, ticks: 10 }, { kind: "hold", ticks: 6000 }]));
    await pg.evaluate(() => window.__game.advance(30));
    await pg.waitForFunction(() => window.__game.view().third && window.__game.view().bodyVisible, null, { timeout: 20000, polling: 100 });

    // ---------------- the view is the trailer's ----------------
    const v0 = await pg.evaluate(() => {
      const v = window.__game.view();
      const s = window.__game.state();
      const fwd = { x: -Math.sin(s.yaw) * Math.cos(s.pitch), y: Math.sin(s.pitch), z: -Math.cos(s.yaw) * Math.cos(s.pitch) };
      const rel = { x: v.camera.x - v.eye.x, y: v.camera.y - v.eye.y, z: v.camera.z - v.eye.z };
      const along = rel.x * fwd.x + rel.y * fwd.y + rel.z * fwd.z;
      return { ...v, along, rig: v.breakdown["rig"] ?? 0 };
    });
    check("third person by default: the body is drawn behind the camera, and the camera sits behind the eye along the aim", v0.third && v0.bodyVisible && v0.rig >= 3 && v0.along < -1.5 && v0.distance > 1.5 && v0.distance <= TPS_DEFAULT.distance + 0.05, `third ${v0.third} · body ${v0.bodyVisible} (${v0.rig} drawables) · ${(-v0.along).toFixed(2)} m behind the eye · distance ${v0.distance.toFixed(2)}`);
    results["default"] = v0;
    await shotCheck(pg, "stage60-third-person.png");

    // ---------------- a wall behind pulls the camera in ----------------
    await pg.evaluate(() => {
      // the yard's south wall is at z = 32: stand 0.6 m from it, facing north (yaw π looks toward +z... the wall is behind at +z when facing -z)
      const p = window.__game.game.player;
      p.pos.x = 0;
      p.pos.z = 31.3;
      p.vel.x = p.vel.z = 0;
      window.__game.setBot([{ kind: "look", yaw: 0, pitch: 0, ticks: 5 }, { kind: "hold", ticks: 6000 }]);
      window.__game.advance(20);
    });
    await nextFrame(pg);
    const wall = await pg.evaluate(() => window.__game.view());
    check("backed against a wall the camera pulls in, keeping the wall behind the camera rather than between it and the player", wall.blocked && wall.distance < 1.2 && wall.camera.z < 32 - 0.15, `blocked ${wall.blocked} · distance ${wall.distance.toFixed(2)} · camera z ${wall.camera.z.toFixed(2)} (wall at 32)`);
    results["wall"] = wall;

    // ---------------- aiming down sights pulls it in on purpose ----------------
    await pg.evaluate(() => {
      const p = window.__game.game.player;
      p.pos.x = 0;
      p.pos.z = 0;
      window.__game.setBot([{ kind: "slot", slot: 1 }, { kind: "hold", ticks: 20 }, { kind: "fire", ticks: 400, alt: true, aimAt: { x: 0, y: 1.3, z: -20 } }, { kind: "hold", ticks: 6000 }]);
      window.__game.advance(80);
    });
    await nextFrame(pg);
    const ads = await pg.evaluate(() => window.__game.view());
    check("aiming down sights brings the camera in over the shoulder", ads.third && ads.distance < 1.6 && ads.distance > 0.9, `distance ${ads.distance.toFixed(2)} while aiming`);
    results["ads"] = ads;

    // ---------------- the reticle marks what the shot hits ----------------
    await pg.evaluate(() => window.__game.setBot([{ kind: "hold", ticks: 6000 }]));
    await pg.evaluate(() => window.__game.advance(30));
    await nextFrame(pg);
    const dummy = await pg.evaluate(() => {
      // a dummy on the street (not the deck), the nearest: the line to it is clear
      const s = window.__game.state();
      const eye = { x: s.pos.x, y: s.pos.y + 1.62, z: s.pos.z };
      const d = s.dummies
        .filter((x) => x.alive && x.pos.y < 1)
        .sort((a, b) => Math.hypot(a.pos.x - eye.x, a.pos.z - eye.z) - Math.hypot(b.pos.x - eye.x, b.pos.z - eye.z))[0]!;
      const target = { x: d.pos.x, y: d.pos.y + 1.0, z: d.pos.z };
      const dx = target.x - eye.x, dy = target.y - eye.y, dz = target.z - eye.z;
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.atan2(dy, Math.hypot(dx, dz));
      window.__game.setBot([{ kind: "look", yaw, pitch, ticks: 10 }, { kind: "hold", ticks: 6000 }]);
      window.__game.advance(20);
      return { id: d.id, target, health: d.health, range: Math.hypot(dx, dy, dz) };
    });
    await nextFrame(pg);
    const aim = await pg.evaluate((t) => {
      const v = window.__game.view();
      const s = window.__game.state();
      // where the eye's ray, at the distance the reticle was drawn for, lands by the same camera: the
      // reticle must be exactly that, whatever the bot's aim settled on
      const c = Math.cos(s.pitch);
      const along = { x: -Math.sin(s.yaw) * c, y: Math.sin(s.pitch), z: -Math.cos(s.yaw) * c };
      const eye = { x: s.pos.x, y: s.pos.y + 1.62, z: s.pos.z };
      const expected = window.__game.game.renderer.project({ x: eye.x + along.x * v.aim.distance, y: eye.y + along.y * v.aim.distance, z: eye.z + along.z * v.aim.distance });
      // and where the dummy's chest is on screen
      const proj = window.__game.game.renderer.project(t as { x: number; y: number; z: number });
      return { reticle: v.reticle, expected, proj, hit: v.aim.hit, dist: v.aim.distance, centre: { x: window.innerWidth / 2, y: window.innerHeight / 2 } };
    }, dummy.target);
    const exact = Math.hypot(aim.reticle.x - aim.expected.x, aim.reticle.y - aim.expected.y);
    const fromCentre = Math.hypot(aim.reticle.x - aim.centre.x, aim.reticle.y - aim.centre.y);
    const off = Math.hypot(aim.reticle.x - aim.proj.x, aim.reticle.y - aim.proj.y);
    check("the reticle is the eye's ray on screen — exactly where it lands, and off the screen's centre, because the camera is over the shoulder", aim.reticle.visible && exact < 1.5 && fromCentre > 4, `reticle (${aim.reticle.x.toFixed(0)}, ${aim.reticle.y.toFixed(0)}) · the eye's ray lands at (${aim.expected.x.toFixed(1)}, ${aim.expected.y.toFixed(1)}), ${exact.toFixed(2)} px away · ${fromCentre.toFixed(1)} px from the centre · the ray reaches ${aim.dist.toFixed(1)} m`);
    check("and it sits on the dummy the bot aimed at, within the bot's own aim tolerance", off < 25, `dummy ${dummy.id} chest at (${aim.proj.x.toFixed(0)}, ${aim.proj.y.toFixed(0)}), ${dummy.range.toFixed(1)} m away · ${off.toFixed(1)} px from the reticle`);
    const shotRes = await pg.evaluate(async (id) => {
      const before = window.__game.state().dummies.find((x) => x.id === id)!.health;
      // the bot lets the last 12 ticks of a fire step go for a charged shot to release, so a step shorter than that never fires
      window.__game.setBot([{ kind: "fire", ticks: 40, dummyId: id }, { kind: "hold", ticks: 6000 }]);
      window.__game.advance(60);
      const after = window.__game.state().dummies.find((x) => x.id === id)!;
      return { before, after: after.health, alive: after.alive };
    }, dummy.id);
    check("a shot through the reticle lands on that dummy", shotRes.after < shotRes.before, `dummy ${dummy.id} health ${shotRes.before} → ${shotRes.after}`);
    results["aim"] = { ...aim, dummy, off, shot: shotRes };
    await shotCheck(pg, "stage60-reticle.png");

    // ---------------- first person is a setting ----------------
    // the body's own cost: the same camera with the body hidden, so the difference is the body and
    // not what a camera three metres further back happens to see (a third-person frame takes in more
    // of the street than the eye did, and that is the view's cost, held by the city probe's budget)
    const withBody = await pg.evaluate(() => window.__game.view().calls);
    await pg.evaluate(() => window.__game.hideBody(true));
    await nextFrame(pg);
    const withoutBody = await pg.evaluate(() => window.__game.view().calls);
    await pg.evaluate(() => window.__game.hideBody(false));
    await nextFrame(pg);
    const rigCalls = withBody - withoutBody;
    await pg.evaluate(() => window.__game.setView(false));
    await nextFrame(pg);
    const fp = await pg.evaluate(() => ({ v: window.__game.view(), rigDrawn: window.__game.view().breakdown["rig"] ?? 0 }));
    await pg.evaluate(() => window.__game.setView(true));
    await nextFrame(pg);
    const back = await pg.evaluate(() => window.__game.view());
    const first = { thirdCalls: withBody, v: fp.v, rigDrawn: fp.rigDrawn, back };
    check("first person is a setting: the body goes, the viewmodel comes back, the reticle returns to the centre, and third person comes back the same way", !first.v.third && !first.v.bodyVisible && first.rigDrawn === 0 && Math.abs(first.v.reticle.x - 480) < 1 && Math.abs(first.v.reticle.y - 270) < 1 && first.back.third && first.back.bodyVisible, `first: third ${first.v.third} · body ${first.v.bodyVisible} · rig ${first.rigDrawn} drawables · reticle (${first.v.reticle.x.toFixed(0)}, ${first.v.reticle.y.toFixed(0)}) · back: third ${first.back.third} body ${first.back.bodyVisible}`);
    // the body and its weapon are one mesh per material, drawn once (the wet floor's mirror does not
    // see the rig): what third person costs over first is the difference between them
    check("the body costs its five meshes and no more — one per material, drawn once — inside the frame budget", rigCalls <= 5 && rigCalls >= 1 && first.thirdCalls <= 180, `${withBody} calls with the body, ${withoutBody} without (the body: ${rigCalls}); first person ${first.v.calls}`);
    results["first"] = first;

    check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean console");
    writeFileSync(`${OUT}/stage60.json`, JSON.stringify({ results, checks }, null, 2));
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
