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

    // ---------------- a wall beside the player ----------------
    await pg.evaluate(() => {
      // the same south wall at z = 32, now on the player's right: at yaw -pi/2 the right vector is +z,
      // and the shoulder wants 0.78 m of it from a capsule only 0.4 m wide
      const p = window.__game.game.player;
      p.pos.x = 0;
      p.pos.z = 31.3;
      p.vel.x = p.vel.z = 0;
      window.__game.setBot([{ kind: "look", yaw: -Math.PI / 2, pitch: 0, ticks: 5 }, { kind: "hold", ticks: 6000 }]);
      window.__game.advance(20);
    });
    await nextFrame(pg);
    const beside = await pg.evaluate(() => window.__game.view());
    // what is behind the camera at that spot is the yard's business; what matters is that neither the
    // shoulder nor the camera ends up on the far side of the wall face
    check("a wall beside the player moves the shoulder in rather than standing the camera inside it", beside.anchor.z < 32 - 0.03 && beside.camera.z < 32, `camera (${beside.camera.x.toFixed(2)}, ${beside.camera.z.toFixed(2)}) · shoulder at z ${beside.anchor.z.toFixed(2)} (wall at 32) · distance ${beside.distance.toFixed(2)} m back · blocked ${beside.blocked}`);
    results["beside"] = beside;

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
    // compared with the hip-fired framing from the same spot and the same aim, not against a number:
    // where the ground is behind the camera at that pitch is the yard's business, and a floor that
    // pulls it in further is the camera doing its job (CI read 0.75 where this machine read 0.92)
    await pg.evaluate(() => {
      window.__game.setBot([{ kind: "hold", ticks: 6000 }]);
      window.__game.advance(60);
    });
    await pg.evaluate(async () => {
      for (let i = 0; i < 120; i++) {
        window.__game.advance(1);
        await new Promise((r) => requestAnimationFrame(r));
        if (window.__game.view().distance > 2.4) return;
      }
    });
    const hip = await pg.evaluate(() => window.__game.view());
    check("aiming down sights brings the camera in over the shoulder", ads.third && ads.distance >= 0.45 && hip.distance - ads.distance > 0.8, `${ads.distance.toFixed(2)} m back while aiming, ${hip.distance.toFixed(2)} m from the hip at the same spot`);
    results["ads"] = { ads, hip };

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
      // the direction the sim fires along: the aim plus the recoil it is carrying (Stage 66)
      const w = window.__game.game.player.weapon;
      const ay = s.yaw + w.kickYaw + w.patX, ap = s.pitch + w.kickPitch + w.patY;
      const c = Math.cos(ap);
      const along = { x: -Math.sin(ay) * c, y: Math.sin(ap), z: -Math.cos(ay) * c };
      const eye = { x: s.pos.x, y: s.pos.y + 1.62, z: s.pos.z };
      const expected = window.__game.game.renderer.project({ x: eye.x + along.x * v.aim.distance, y: eye.y + along.y * v.aim.distance, z: eye.z + along.z * v.aim.distance });
      // and where the dummy's chest is on screen
      const proj = window.__game.game.renderer.project(t as { x: number; y: number; z: number });
      return { reticle: v.reticle, expected, proj, hit: v.aim.hit, onTarget: v.aim.onTarget, dist: v.aim.distance, centre: { x: window.innerWidth / 2, y: window.innerHeight / 2 } };
    }, dummy.target);
    const exact = Math.hypot(aim.reticle.x - aim.expected.x, aim.reticle.y - aim.expected.y);
    const fromCentre = Math.hypot(aim.reticle.x - aim.centre.x, aim.reticle.y - aim.centre.y);
    const off = Math.hypot(aim.reticle.x - aim.proj.x, aim.reticle.y - aim.proj.y);
    check("the reticle is the eye's ray on screen — exactly where it lands, and off the screen's centre, because the camera is over the shoulder", aim.reticle.visible && exact < 1.5 && fromCentre > 4, `reticle (${aim.reticle.x.toFixed(0)}, ${aim.reticle.y.toFixed(0)}) · the eye's ray lands at (${aim.expected.x.toFixed(1)}, ${aim.expected.y.toFixed(1)}), ${exact.toFixed(2)} px away · ${fromCentre.toFixed(1)} px from the centre · the ray reaches ${aim.dist.toFixed(1)} m`);
    check("and it sits on the dummy the bot aimed at, within the bot's own aim tolerance", off < 25, `dummy ${dummy.id} chest at (${aim.proj.x.toFixed(0)}, ${aim.proj.y.toFixed(0)}), ${dummy.range.toFixed(1)} m away · ${off.toFixed(1)} px from the reticle`);
    check("the ray stops on the body rather than carrying on to the wall behind it", aim.onTarget && Math.abs(aim.dist - dummy.range) < 1.2, `the ray stops at ${aim.dist.toFixed(1)} m on a body ${dummy.range.toFixed(1)} m away · on a target: ${aim.onTarget}`);
    const shotRes = await pg.evaluate(async (id) => {
      const before = window.__game.state().dummies.find((x) => x.id === id)!.health;
      // the bot lets the last 12 ticks of a fire step go for a charged shot to release, so a step shorter than that never fires
      window.__game.setBot([{ kind: "fire", ticks: 40, dummyId: id }, { kind: "hold", ticks: 6000 }]);
      window.__game.advance(60);
      const after = window.__game.state().dummies.find((x) => x.id === id)!;
      return { before, after: after.health, alive: after.alive };
    }, dummy.id);
    check("a shot through the reticle lands on that dummy", shotRes.after < shotRes.before, `dummy ${dummy.id} health ${shotRes.before} → ${shotRes.after}`);
    // and with the recoil still on the weapon the reticle is where the NEXT shot goes, not where the
    // aim points: a reticle cast from the bare aim would sit still through a burst (Stage 66)
    // fire again and stop mid-burst, while the recoil is still on the weapon: 60 ticks after a burst
    // it has recovered to a fifth of a degree, which is a pixel or two and proves nothing
    const kickUp = await pg.evaluate((id) => {
      window.__game.setBot([{ kind: "fire", ticks: 200, dummyId: id }, { kind: "hold", ticks: 6000 }]);
      let kick = 0;
      for (let i = 0; i < 24 && kick < 0.02; i++) {
        window.__game.advance(4);
        const w = window.__game.game.player.weapon;
        kick = Math.hypot(w.kickPitch + w.patY, w.kickYaw + w.patX);
      }
      return kick;
    }, dummy.id);
    await nextFrame(pg);
    const kicked = await pg.evaluate(() => {
      const s = window.__game.state();
      const w = window.__game.game.player.weapon;
      const v = window.__game.view();
      const r = window.__game.game.renderer;
      const eye = { x: s.pos.x, y: s.pos.y + 1.62, z: s.pos.z };
      const d = v.aim.distance;
      const ky = s.yaw + w.kickYaw + w.patX, kp = s.pitch + w.kickPitch + w.patY;
      const kc = Math.cos(kp), bc = Math.cos(s.pitch);
      const withKick = r.project({ x: eye.x - Math.sin(ky) * kc * d, y: eye.y + Math.sin(kp) * d, z: eye.z - Math.cos(ky) * kc * d });
      const bare = r.project({ x: eye.x - Math.sin(s.yaw) * bc * d, y: eye.y + Math.sin(s.pitch) * d, z: eye.z - Math.cos(s.yaw) * bc * d });
      return { kick: Math.hypot(w.kickPitch + w.patY, w.kickYaw + w.patX), reticle: v.reticle, withKick, bare };
    });
    const toKicked = Math.hypot(kicked.reticle.x - kicked.withKick.x, kicked.reticle.y - kicked.withKick.y);
    const toBare = Math.hypot(kicked.reticle.x - kicked.bare.x, kicked.reticle.y - kicked.bare.y);
    check("the reticle carries the recoil the sim fires with, so it marks the next shot and not the bare aim", kicked.kick > 0.015 && toKicked < 3 && toBare > 6, `recoil ${kicked.kick.toFixed(4)} rad (peak ${kickUp.toFixed(4)}) · reticle is ${toKicked.toFixed(1)} px from the recoiled ray and ${toBare.toFixed(1)} px from the bare aim`);
    results["aim"] = { ...aim, dummy, off, shot: shotRes };
    await shotCheck(pg, "stage60-reticle.png");

    // ---------------- what is lit, and where the filament hangs ----------------
    await pg.evaluate(() => {
      const p = window.__game.game.player;
      p.pos.x = 0;
      p.pos.z = 0;
      window.__game.game.renderer.campaignFx.setFilament(true);
      window.__game.setBot([{ kind: "look", yaw: 0, pitch: 0, ticks: 5 }, { kind: "fire", ticks: 120 }, { kind: "hold", ticks: 6000 }]);
      window.__game.advance(20);
    });
    await nextFrame(pg);
    const lit = await pg.evaluate(async () => {
      let best = { onBody: false, muzzle: 0, handMuzzle: 0, filament: { x: 0, y: 0, z: 0 }, hand: { x: 0, y: 0, z: 0 }, camera: { x: 0, y: 0, z: 0 } };
      for (let i = 0; i < 300; i++) {
        window.__game.advance(2); // this probe drives the sim by hand: no ticks, no shots, no flash
        await new Promise((r) => requestAnimationFrame(r));
        const p = window.__game.presentation();
        if (p.handMuzzle > best.handMuzzle) best = p;
        if (best.handMuzzle > 1) break;
      }
      return best;
    });
    const toHand = Math.hypot(lit.filament.x - lit.hand.x, lit.filament.y - lit.hand.y, lit.filament.z - lit.hand.z);
    const toCam = Math.hypot(lit.filament.x - lit.camera.x, lit.filament.y - lit.camera.y, lit.filament.z - lit.camera.z);
    check("the muzzle flash is on the weapon the body is holding, and the Kernel's filament hangs on it rather than in the air in front of the camera", lit.onBody && lit.handMuzzle > 1 && lit.muzzle === 0 && toHand < 0.5 && toCam > 1.5, `body lit ${lit.onBody} · hand light ${lit.handMuzzle.toFixed(1)}, camera light ${lit.muzzle.toFixed(1)} · filament ${toHand.toFixed(2)} m from the hand and ${toCam.toFixed(2)} m from the camera`);
    // and with the body hidden — the camera pulled in against it — the flash falls back to the camera
    await pg.evaluate(() => window.__game.hideBody(true));
    await nextFrame(pg);
    const hidden = await pg.evaluate(async () => {
      let best = { onBody: true, muzzle: 0, handMuzzle: 0, toCam: 99, toHand: 0 };
      for (let i = 0; i < 300; i++) {
        window.__game.advance(2);
        await new Promise((r) => requestAnimationFrame(r));
        const p = window.__game.presentation();
        best = {
          onBody: p.onBody,
          muzzle: Math.max(best.muzzle, p.muzzle),
          handMuzzle: p.handMuzzle,
          toCam: Math.hypot(p.filament.x - p.camera.x, p.filament.y - p.camera.y, p.filament.z - p.camera.z),
          toHand: Math.hypot(p.filament.x - p.hand.x, p.filament.y - p.hand.y, p.filament.z - p.hand.z),
        };
        if (best.muzzle > 1) break;
      }
      return best;
    });
    check("with the body hidden the flash and the filament both fall back to the camera rather than going out with the body", !hidden.onBody && hidden.muzzle > 1 && hidden.toCam < 0.5 && hidden.toHand > 1.5, `body lit ${hidden.onBody} · camera light ${hidden.muzzle.toFixed(1)} · hand light ${hidden.handMuzzle.toFixed(1)} · filament ${hidden.toCam.toFixed(2)} m from the camera and ${hidden.toHand.toFixed(2)} m from the hand`);
    await pg.evaluate(async () => {
      window.__game.hideBody(false);
      window.__game.game.renderer.campaignFx.setFilament(false);
      window.__game.setBot([{ kind: "hold", ticks: 6000 }]);
      // the burst above leaves tracers and sparks alive, and they expire between two frames: the
      // body's cost is measured as a difference of two counts, so let the effects go first
      for (let i = 0; i < 300; i++) {
        window.__game.advance(2);
        await new Promise((r) => requestAnimationFrame(r));
        const b = window.__game.view().breakdown;
        if (!b["tracers"] && !b["sparks"]) return;
      }
    });
    await nextFrame(pg);

    // ---------------- first person is a setting ----------------
    // the body's own cost: the same camera with the body hidden, so the difference is the body and
    // not what a camera three metres further back happens to see (a third-person frame takes in more
    // of the street than the eye did, and that is the view's cost, held by the city probe's budget)
    const withBody = await pg.evaluate(() => window.__game.view().calls);
    const bodyParts = await pg.evaluate(() => ({ breakdown: window.__game.view().breakdown, filament: window.__game.game.renderer.campaignFx.filamentVisible }));
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
    check("the body costs its five meshes and no more — one per material, drawn once — inside the frame budget", rigCalls <= 5 && rigCalls >= 1 && first.thirdCalls <= 180, `${withBody} calls with the body, ${withoutBody} without (the body: ${rigCalls}); first person ${first.v.calls} · filament ${bodyParts.filament} · ${Object.entries(bodyParts.breakdown).map(([k, n]) => `${k} ${n}`).join(", ")}`);
    results["first"] = first;

    // ---------------- the mouse path: the one a bot never drives ----------------
    // With the pointer locked the camera is drawn along the live input angles rather than the sim's
    // last tick, because mouse look has to feel immediate. The reticle was left on the sim's angles,
    // so it trailed the camera through every flick — and no check saw it, because a bot never locks
    // the pointer and this branch is the only place the two can disagree (Stage 73).
    const flick = await pg.evaluate(async () => {
      const g = window.__game.game;
      window.__game.setBot(null);
      (g.input as unknown as { locked: boolean }).locked = true;
      g.input.yaw = g.player.yaw + 0.4;
      g.input.pitch = g.player.pitch - 0.12;
      for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
      const v = window.__game.view();
      const s = window.__game.state();
      const w = g.player.weapon;
      const eye = { x: s.pos.x, y: s.pos.y + 1.62, z: s.pos.z };
      const d = v.aim.distance;
      const ly = g.input.yaw + w.kickYaw + w.patX, lp = g.input.pitch + w.kickPitch + w.patY;
      const sy = s.yaw + w.kickYaw + w.patX, sp = s.pitch + w.kickPitch + w.patY;
      const lc = Math.cos(lp), sc2 = Math.cos(sp);
      const live = g.renderer.project({ x: eye.x - Math.sin(ly) * lc * d, y: eye.y + Math.sin(lp) * d, z: eye.z - Math.cos(ly) * lc * d });
      const stale = g.renderer.project({ x: eye.x - Math.sin(sy) * sc2 * d, y: eye.y + Math.sin(sp) * d, z: eye.z - Math.cos(sy) * sc2 * d });
      (g.input as unknown as { locked: boolean }).locked = false;
      return { reticle: v.reticle, live, stale, drift: Math.hypot(s.yaw - g.input.yaw, s.pitch - g.input.pitch) };
    });
    const toLive = Math.hypot(flick.reticle.x - flick.live.x, flick.reticle.y - flick.live.y);
    const toStale = Math.hypot(flick.reticle.x - flick.stale.x, flick.reticle.y - flick.stale.y);
    check("with the pointer locked the reticle follows the live look, not the tick the sim last ran", flick.drift > 0.1 && toLive < 3 && toStale > 20, `the sim is ${flick.drift.toFixed(2)} rad behind the mouse · reticle ${toLive.toFixed(1)} px from the live ray, ${toStale.toFixed(1)} px from the sim's`);

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
