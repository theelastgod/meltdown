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

    // ---------------- speed reads as speed ----------------
    // Sprinting looked exactly like walking: the same lens, the same framing, and nothing but the
    // hem moving. The lens widens with the speed and the camera drifts back with it (Stage 77).
    await pg.evaluate(() => {
      const p = window.__game.game.player;
      p.pos.x = 0;
      p.pos.z = 12;
      p.vel.x = p.vel.z = 0;
      window.__game.setBot([{ kind: "look", yaw: 0, pitch: 0, ticks: 5 }, { kind: "hold", ticks: 6000 }]);
      window.__game.advance(40);
    });
    await nextFrame(pg);
    // the section before this one left the lens easing back out of the sights: let it settle, or
    // "still" is a number on its way somewhere and every comparison against it is noise
    const still = await pg.evaluate(async () => {
      let v = window.__game.view();
      for (let i = 0; i < 400; i++) {
        window.__game.advance(1);
        await new Promise((r) => requestAnimationFrame(r));
        v = window.__game.view();
        if (Math.abs(v.fov - window.__game.game.renderer.fov) < 0.15) break;
      }
      return { fov: v.fov, distance: v.distance, base: window.__game.game.renderer.fov };
    });
    const ran = await pg.evaluate(async (from) => {
      const rest = from as { fov: number };
      window.__game.setBot([{ kind: "goto", x: 0, z: -20, sprint: true, radius: 1, timeoutTicks: 1200, stop: false }, { kind: "hold", ticks: 6000 }]);
      let out = { fov: 0, distance: 0, speed: 0, blocked: false, frames: 0 };
      let prev = -1;
      // wait for the lens, not for a count of frames: it eases in at 5/s, which is a fifth of a
      // second on a machine that draws quickly and a second or two on one that does not
      for (let i = 0; i < 900; i++) {
        window.__game.advance(1);
        await new Promise((r) => requestAnimationFrame(r));
        const v = window.__game.view();
        const st = window.__game.state();
        const sp = Math.hypot(st.vel.x, st.vel.z);
        if (v.fov > out.fov) out = { fov: v.fov, distance: v.distance, speed: sp, blocked: v.blocked, frames: i };
        if (sp > 6.8 && v.fov > rest.fov + 1 && prev >= 0 && v.fov - prev <= 0.02) break;
        prev = v.fov;
      }
      return out;
    }, still);
    // the picture is taken while it is still running: the probe drives the sim by hand, so between
    // two advances the file is frozen mid-sprint and the lens is the one the check just measured
    await shotCheck(pg, "stage60-sprint.png");
    const stopped = await pg.evaluate(async () => {
      window.__game.setBot([{ kind: "hold", ticks: 6000 }]);
      let v = window.__game.view();
      let sp = 9;
      for (let i = 0; i < 900; i++) {
        window.__game.advance(1);
        await new Promise((r) => requestAnimationFrame(r));
        v = window.__game.view();
        const st = window.__game.state();
        sp = Math.hypot(st.vel.x, st.vel.z);
        if (sp < 0.4 && v.fov < window.__game.game.renderer.fov + 0.2) break;
      }
      return { fov: v.fov, distance: v.distance, speed: sp };
    });
    check("sprinting widens the lens and drifts the camera back, and stopping closes it again", ran.speed > 6.8 && ran.fov - still.fov > 5 && ran.distance - still.distance > 0.15 && Math.abs(stopped.fov - still.fov) < 0.4, `still ${still.fov.toFixed(1)}° (base ${still.base.toFixed(0)}) at ${still.distance.toFixed(2)} m · sprinting ${ran.fov.toFixed(1)}° at ${ran.distance.toFixed(2)} m (${ran.speed.toFixed(1)} m/s, blocked ${ran.blocked}) · stopped ${stopped.fov.toFixed(1)}° at ${stopped.distance.toFixed(2)} m`);
    results["speed"] = { still, ran, stopped };

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
      // the direction the reticle is cast along: the aim plus the recoil the camera carries, which
      // is the view's share of it and not the pattern the shot also takes (Stage 76)
      const w = window.__game.game.player.weapon;
      const ay = s.yaw + w.kickYaw, ap = s.pitch + w.kickPitch;
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
    // and with the recoil still on the weapon the reticle is where the camera is aiming, not where
    // the bare aim points — and not, either, where the shot actually goes. Recoil is split sixty
    // forty: the view carries sixty per cent and the other forty is the pattern, which the sim adds
    // to the shot and no view shows, because learning it is the skill. Marking the true shot in
    // third person and nowhere else made one weapon two weapons (Stage 76).
    // Fire and stop mid-burst, while the recoil is still on the weapon: 60 ticks after a burst it
    // has recovered to a fifth of a degree, which is a pixel or two and proves nothing.
    const kickUp = await pg.evaluate((id) => {
      window.__game.setBot([{ kind: "fire", ticks: 300, dummyId: id }, { kind: "hold", ticks: 6000 }]);
      let pat = 0;
      // the view's kick recovers every tick and settles near a hundredth of a radian; the pattern
      // only recovers between bursts, so it is the one that climbs while the trigger is down
      for (let i = 0; i < 40 && pat < 0.035; i++) {
        window.__game.advance(4);
        const w = window.__game.game.player.weapon;
        pat = Math.hypot(w.patX, w.patY);
      }
      return pat;
    }, dummy.id);
    await nextFrame(pg);
    const kicked = await pg.evaluate(() => {
      const s = window.__game.state();
      const w = window.__game.game.player.weapon;
      const v = window.__game.view();
      const r = window.__game.game.renderer;
      const eye = { x: s.pos.x, y: s.pos.y + 1.62, z: s.pos.z };
      const d = v.aim.distance;
      const ky = s.yaw + w.kickYaw, kp = s.pitch + w.kickPitch; // the camera's aim
      const sy = ky + w.patX, sp = kp + w.patY; // the sim's shot, pattern and all
      const kc = Math.cos(kp), sc = Math.cos(sp), bc = Math.cos(s.pitch);
      const withKick = r.project({ x: eye.x - Math.sin(ky) * kc * d, y: eye.y + Math.sin(kp) * d, z: eye.z - Math.cos(ky) * kc * d });
      const shot = r.project({ x: eye.x - Math.sin(sy) * sc * d, y: eye.y + Math.sin(sp) * d, z: eye.z - Math.cos(sy) * sc * d });
      const bare = r.project({ x: eye.x - Math.sin(s.yaw) * bc * d, y: eye.y + Math.sin(s.pitch) * d, z: eye.z - Math.cos(s.yaw) * bc * d });
      return { kick: Math.hypot(w.kickPitch, w.kickYaw), pat: Math.hypot(w.patX, w.patY), reticle: v.reticle, withKick, shot, bare };
    });
    const toKicked = Math.hypot(kicked.reticle.x - kicked.withKick.x, kicked.reticle.y - kicked.withKick.y);
    const toShot = Math.hypot(kicked.reticle.x - kicked.shot.x, kicked.reticle.y - kicked.shot.y);
    const toBare = Math.hypot(kicked.reticle.x - kicked.bare.x, kicked.reticle.y - kicked.bare.y);
    check("mid-burst the reticle stays on the camera's aim and off the shot the pattern bends: the forty per cent of recoil no view shows is not shown here either", kicked.pat > 0.03 && toKicked < 3 && toShot > 8, `pattern ${kicked.pat.toFixed(4)} rad (view recoil ${kicked.kick.toFixed(4)}) · reticle is ${toKicked.toFixed(1)} px from the camera's ray and ${toShot.toFixed(1)} px from the shot`);
    // and the sixty per cent it does show, it shows: the equilibrium kick of a sustained burst is a
    // couple of pixels, which proves nothing either way, so put a burst's worth of kick on the
    // weapon by hand and watch the reticle carry it off the bare aim
    const byHand = await pg.evaluate(() => {
      const w = window.__game.game.player.weapon;
      w.kickYaw = 0.06;
      w.kickPitch = -0.04;
      w.patX = 0;
      w.patY = 0;
      return { kickYaw: w.kickYaw, kickPitch: w.kickPitch };
    });
    await nextFrame(pg);
    const held = await pg.evaluate(() => {
      const s = window.__game.state();
      const w = window.__game.game.player.weapon;
      const v = window.__game.view();
      const r = window.__game.game.renderer;
      const eye = { x: s.pos.x, y: s.pos.y + 1.62, z: s.pos.z };
      const d = v.aim.distance;
      const ky = s.yaw + w.kickYaw, kp = s.pitch + w.kickPitch;
      const kc = Math.cos(kp), bc = Math.cos(s.pitch);
      const withKick = r.project({ x: eye.x - Math.sin(ky) * kc * d, y: eye.y + Math.sin(kp) * d, z: eye.z - Math.cos(ky) * kc * d });
      const bare = r.project({ x: eye.x - Math.sin(s.yaw) * bc * d, y: eye.y + Math.sin(s.pitch) * d, z: eye.z - Math.cos(s.yaw) * bc * d });
      return { reticle: v.reticle, withKick, bare };
    });
    const heldToKick = Math.hypot(held.reticle.x - held.withKick.x, held.reticle.y - held.withKick.y);
    const heldToBare = Math.hypot(held.reticle.x - held.bare.x, held.reticle.y - held.bare.y);
    check("and it does carry the recoil the camera carries: put a burst's kick on the weapon and the reticle goes with it, off the bare aim", heldToKick < 3 && heldToBare > 8, `kick ${byHand.kickYaw.toFixed(3)} / ${byHand.kickPitch.toFixed(3)} rad · reticle is ${heldToKick.toFixed(1)} px from the kicked ray and ${heldToBare.toFixed(1)} px from the bare aim`);
    results["aim"] = { ...aim, dummy, off, shot: shotRes };
    await shotCheck(pg, "stage60-reticle.png");

    // ---------------- the camera takes the landing ----------------
    // The legs have compressed on landing since Stage 63 and the camera took none of it: a drop off
    // the gantry ended with the view perfectly level, which reads as the ground arriving rather
    // than the file arriving (Stage 79).
    const fall = await pg.evaluate(async () => {
      const p = window.__game.game.player;
      window.__game.setBot([{ kind: "slot", slot: 1 }, { kind: "look", yaw: 0, pitch: 0, ticks: 5 }, { kind: "hold", ticks: 6000 }]);
      p.pos.x = 0;
      p.pos.z = 6;
      p.pos.y = 9;
      p.vel.x = p.vel.y = p.vel.z = 0;
      let peak = 0;
      let peakDrop = 0;
      let landedAt = -1;
      let after = 0;
      for (let i = 0; i < 400; i++) {
        window.__game.advance(1);
        await new Promise((r) => requestAnimationFrame(r));
        const v = window.__game.view();
        const s = window.__game.state();
        if (s.grounded && landedAt < 0) landedAt = i;
        if (v.dip > peak) {
          peak = v.dip;
          // and the dip is applied, not merely reported: the camera is that much lower than the
          // anchor the shoulder cast put it on
          peakDrop = v.anchor.y - v.camera.y;
        }
        if (landedAt >= 0 && peak > 0 && v.dip === 0) {
          after = i - landedAt;
          break;
        }
      }
      return { peak, peakDrop, landedAt, after, y: window.__game.state().pos.y };
    });
    check("a drop puts the landing in the camera, and the camera stands back up", fall.landedAt > 0 && fall.peak > 0.1 && fall.peakDrop > 0.05 && fall.after > 0 && fall.after < 120, `landed on frame ${fall.landedAt} at y ${fall.y.toFixed(2)} · the camera went ${fall.peak.toFixed(3)} m down (${fall.peakDrop.toFixed(3)} m below its anchor) and was level again ${fall.after} frames later`);
    // and a step down is not a landing: the camera does not lurch every time the file leaves a kerb
    const kerb = await pg.evaluate(async () => {
      const p = window.__game.game.player;
      p.pos.y = 0.35;
      p.vel.y = 0;
      let peak = 0;
      for (let i = 0; i < 90; i++) {
        window.__game.advance(1);
        await new Promise((r) => requestAnimationFrame(r));
        peak = Math.max(peak, window.__game.view().dip);
      }
      return peak;
    });
    check("and a step off a kerb is not a landing", kerb < 0.02, `a 0.35 m step put ${kerb.toFixed(3)} m in the camera`);
    // the slide leans the view — in this one it never did at all
    const slid = await pg.evaluate(async () => {
      const p = window.__game.game.player;
      // back to the open stretch the sprint check uses: a slide needs a run-up, and the run-up
      // needs somewhere to run
      p.pos.x = 0;
      p.pos.y = 0;
      p.pos.z = 26;
      p.vel.x = p.vel.y = p.vel.z = 0;
      // the long clear stretch from the south wall: the barricade across the yard sits near z = -1,
      // and a slide needs a run-up rather than a wall to hit halfway through it
      window.__game.setBot([{ kind: "goto", x: 0, z: 8, sprint: true, radius: 1.5, timeoutTicks: 600, stop: false }, { kind: "slide", ticks: 90 }, { kind: "hold", ticks: 6000 }]);
      let peak = 0;
      let sliding = 0;
      let settled = -1;
      for (let i = 0; i < 700; i++) {
        window.__game.advance(1);
        await new Promise((r) => requestAnimationFrame(r));
        const v = window.__game.view();
        const st = window.__game.state();
        if (st.stance === "slide") sliding++;
        peak = Math.max(peak, Math.abs(v.roll));
        if (sliding > 0 && st.stance !== "slide" && peak > 0.02 && Math.abs(v.roll) < 0.005) {
          settled = i;
          break;
        }
      }
      const st2 = window.__game.state();
      return { peak, sliding, settled, roll: window.__game.view().roll, stance: st2.stance, z: st2.pos.z };
    });
    check("a slide leans the camera behind the body, and it comes back level", slid.sliding > 5 && slid.peak > 0.03 && slid.settled > 0 && Math.abs(slid.roll) < 0.005, `${slid.sliding} frames sliding · the view leaned ${slid.peak.toFixed(3)} rad and was level again by frame ${slid.settled} · ${slid.stance} at z ${slid.z.toFixed(1)}`);

    // ---------------- a round that falls ----------------
    // The reticle marked the end of a straight ray for every weapon, which is the truth for a bullet
    // and a lie for a launcher: the phage's round leaves at forty metres a second under twelve of
    // gravity and is half a metre under that line by the time it arrives (Stage 78).
    const lob = await pg.evaluate(async () => {
      const p = window.__game.game.player;
      p.pos.x = 0;
      p.pos.z = 14;
      p.vel.x = p.vel.y = p.vel.z = 0;
      window.__game.setBot([{ kind: "slot", slot: 5 }, { kind: "look", yaw: 0, pitch: 0, ticks: 10 }, { kind: "hold", ticks: 6000 }]);
      window.__game.advance(60);
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
      const s = window.__game.state();
      const v = window.__game.view();
      const r = window.__game.game.renderer;
      const eye = { x: s.pos.x, y: s.pos.y + 1.62, z: s.pos.z };
      const w = window.__game.game.player.weapon;
      // where a straight ray at the same aim, at the same distance, would have been drawn
      const ay = s.yaw + w.kickYaw, ap = s.pitch + w.kickPitch;
      const c = Math.cos(ap);
      const straight = r.project({ x: eye.x - Math.sin(ay) * c * v.aim.distance, y: eye.y + Math.sin(ap) * v.aim.distance, z: eye.z - Math.cos(ay) * c * v.aim.distance });
      const marked = r.project(v.aim.point);
      const xh = document.querySelector("#hud .xh");
      return { slot: s.slot, arc: v.aim.arc, point: v.aim.point, distance: v.aim.distance, reticle: v.reticle, straight, marked, ring: !!xh && xh.classList.contains("arc"), eye };
    });
    const markGap = Math.hypot(lob.reticle.x - lob.marked.x, lob.reticle.y - lob.marked.y);
    const dropPx = lob.reticle.y - lob.straight.y;
    check("a launcher's reticle is the end of its arc, drawn below the straight ray the aim points along, and the HUD says so", lob.arc && lob.slot === 5 && markGap < 1.5 && dropPx > 6 && lob.ring, `slot ${lob.slot} · arc ${lob.arc} · mark ${markGap.toFixed(1)} px from the arc's end, ${dropPx.toFixed(1)} px below the straight ray at ${lob.distance.toFixed(1)} m · ring ${lob.ring}`);
    // and the claim it makes is the one the sim keeps: fire, and the round goes off where the mark is
    const landed = await pg.evaluate(async () => {
      const before = window.__game.view().aim.point;
      window.__game.setBot([{ kind: "fire", ticks: 16 }, { kind: "hold", ticks: 6000 }]);
      let last: { x: number; y: number; z: number } | null = null;
      let seen = false;
      for (let i = 0; i < 300; i++) {
        window.__game.advance(1);
        const list = window.__game.game.world.projectiles;
        if (list.length) {
          seen = true;
          last = { x: list[0]!.pos.x, y: list[0]!.pos.y, z: list[0]!.pos.z };
        } else if (seen) break;
        if (i % 6 === 0) await new Promise((r) => requestAnimationFrame(r));
      }
      return { before, last, seen };
    });
    const miss = landed.last ? Math.hypot(landed.last.x - lob.point.x, landed.last.y - lob.point.y, landed.last.z - lob.point.z) : 99;
    check("and the round goes off where the mark is: the arc the reticle walks is the arc the sim integrates", landed.seen && miss < 0.6, `the round burst at (${landed.last?.x.toFixed(2)}, ${landed.last?.y.toFixed(2)}, ${landed.last?.z.toFixed(2)}), ${miss.toFixed(2)} m from the mark at (${lob.point.x.toFixed(2)}, ${lob.point.y.toFixed(2)}, ${lob.point.z.toFixed(2)})`);
    await shotCheck(pg, "stage60-arc.png");
    // back on a rifle the mark is a ray again, and the ring comes off
    const backToRay = await pg.evaluate(async () => {
      window.__game.setBot([{ kind: "slot", slot: 1 }, { kind: "hold", ticks: 6000 }]);
      window.__game.advance(60);
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
      const xh = document.querySelector("#hud .xh");
      return { arc: window.__game.view().aim.arc, ring: !!xh && xh.classList.contains("arc"), slot: window.__game.state().slot };
    });
    check("and a weapon that fires a ray gets the ray's mark back", !backToRay.arc && !backToRay.ring && backToRay.slot === 1, `slot ${backToRay.slot} · arc ${backToRay.arc} · ring ${backToRay.ring}`);

    // ---------------- what is lit, and where the filament hangs ----------------
    await pg.evaluate(() => {
      const p = window.__game.game.player;
      p.pos.x = 0;
      p.pos.z = 0;
      // the burst above emptied most of a magazine and left a kick on the weapon by hand: this
      // section needs a weapon that fires, and an aim that is the bot's rather than the probe's
      p.weapon.kickYaw = 0;
      p.weapon.kickPitch = 0;
      p.weapon.ammo[p.weapon.slot] = 90;
      p.weapon.reloadTimer = 0;
      window.__game.game.renderer.campaignFx.setFilament(true);
      window.__game.setBot([{ kind: "look", yaw: 0, pitch: 0, ticks: 5 }, { kind: "fire", ticks: 120 }, { kind: "hold", ticks: 6000 }]);
      window.__game.advance(20);
    });
    await nextFrame(pg);
    const lit = await pg.evaluate(async () => {
      let best = { onBody: false, muzzle: 0, handMuzzle: 0, filament: { x: 0, y: 0, z: 0 }, filamentDepth: false, hand: { x: 0, y: 0, z: 0 }, camera: { x: 0, y: 0, z: 0 } };
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
    // and on the hand the strands are world geometry: they must be depth-tested, or they paint
    // through the wall between the body and the camera (Stage 76)
    check("the muzzle flash is on the weapon the body is holding, and the Kernel's filament hangs on it, depth-tested, rather than painting over the street in front of the camera", lit.onBody && lit.handMuzzle > 1 && lit.muzzle === 0 && toHand < 0.5 && toCam > 1.5 && lit.filamentDepth, `body lit ${lit.onBody} · hand light ${lit.handMuzzle.toFixed(1)}, camera light ${lit.muzzle.toFixed(1)} · filament ${toHand.toFixed(2)} m from the hand and ${toCam.toFixed(2)} m from the camera · depth-tested ${lit.filamentDepth}`);
    // and with the body hidden — the camera pulled in against it — the flash falls back to the camera
    await pg.evaluate(() => window.__game.hideBody(true));
    await nextFrame(pg);
    const hidden = await pg.evaluate(async () => {
      let best = { onBody: true, muzzle: 0, handMuzzle: 0, toCam: 99, toHand: 0, depth: true };
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
          depth: p.filamentDepth,
        };
        if (best.muzzle > 1) break;
      }
      return best;
    });
    check("with the body hidden the flash and the filament both fall back to the camera, where the strands are an overlay again", !hidden.onBody && hidden.muzzle > 1 && hidden.toCam < 0.5 && hidden.toHand > 1.5 && !hidden.depth, `body lit ${hidden.onBody} · camera light ${hidden.muzzle.toFixed(1)} · hand light ${hidden.handMuzzle.toFixed(1)} · filament ${hidden.toCam.toFixed(2)} m from the camera and ${hidden.toHand.toFixed(2)} m from the hand · depth-tested ${hidden.depth}`);
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
      const ly = g.input.yaw + w.kickYaw, lp = g.input.pitch + w.kickPitch;
      const sy = s.yaw + w.kickYaw, sp = s.pitch + w.kickPitch;
      const lc = Math.cos(lp), sc2 = Math.cos(sp);
      const live = g.renderer.project({ x: eye.x - Math.sin(ly) * lc * d, y: eye.y + Math.sin(lp) * d, z: eye.z - Math.cos(ly) * lc * d });
      const stale = g.renderer.project({ x: eye.x - Math.sin(sy) * sc2 * d, y: eye.y + Math.sin(sp) * d, z: eye.z - Math.cos(sy) * sc2 * d });
      (g.input as unknown as { locked: boolean }).locked = false;
      return { reticle: v.reticle, live, stale, drift: Math.hypot(s.yaw - g.input.yaw, s.pitch - g.input.pitch) };
    });
    const toLive = Math.hypot(flick.reticle.x - flick.live.x, flick.reticle.y - flick.live.y);
    const toStale = Math.hypot(flick.reticle.x - flick.stale.x, flick.reticle.y - flick.stale.y);
    check("with the pointer locked the reticle follows the live look, not the tick the sim last ran", flick.drift > 0.1 && toLive < 3 && toStale > 20, `the sim is ${flick.drift.toFixed(2)} rad behind the mouse · reticle ${toLive.toFixed(1)} px from the live ray, ${toStale.toFixed(1)} px from the sim's`);

    // ---------------- a hit has a direction ----------------
    // Third person widened what is visible and did nothing for what is not: half the street is still
    // behind the camera. A shot from it used to be a sound and a number on a bar (Stage 74).
    const shots = await pg.evaluate(async () => {
      const g = window.__game.game;
      const p = g.player;
      window.__game.setRealtime(false);
      window.__game.setBot([{ kind: "look", yaw: 0, pitch: 0, ticks: 5 }, { kind: "hold", ticks: 6000 }]);
      window.__game.advance(20);
      const d = g.world.dummies.find((x) => x.id !== p.id)!;
      const out: { op: number; rot: number }[][] = [];
      const wants: number[] = [];
      // the dummies patrol, so the player moves rather than the attacker: stand so that the dummy is
      // squarely behind, then squarely to the right, and let it shoot from where it actually is
      for (const spot of [{ x: d.pos.x, z: d.pos.z - 9 }, { x: d.pos.x - 9, z: d.pos.z }]) {
        p.pos.x = spot.x;
        p.pos.z = spot.z;
        p.vel.x = p.vel.y = p.vel.z = 0;
        window.__game.advance(2);
        g.world.applyDamage("player", p.id, 20, d.id, "lease_breaker", "shot");
        window.__game.advance(1);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const marks: { op: number; rot: number }[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("#hud .dmg i"))) {
          const op = Number(el.style.opacity || "0");
          const m = /rotate\(([-0-9.]+)rad\)/.exec(el.style.transform);
          if (op > 0.05 && m) marks.push({ op, rot: Number(m[1]) });
        }
        // the bearing the wedge should carry: from where the attacker is now, at the yaw held now
        const yaw = window.__game.state().yaw;
        let want = yaw - Math.atan2(-(d.pos.x - p.pos.x), -(d.pos.z - p.pos.z));
        while (want > Math.PI) want -= Math.PI * 2;
        while (want < -Math.PI) want += Math.PI * 2;
        out.push(marks);
        wants.push(want);
      }
      return { behind: out[0]!, right: out[1]!, wantBehind: wants[0]!, wantRight: wants[1]!, yaw: window.__game.state().yaw };
    });
    const behindA = shots.behind[0]?.rot ?? 0;
    const rightA = shots.right[0]?.rot ?? 0;
    const angleGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    check("a wedge points at whatever hit the player, from behind and from the right, whichever way the file is facing", shots.behind.length >= 1 && angleGap(behindA, shots.wantBehind) < 0.15 && shots.right.length >= 2 && angleGap(rightA, shots.wantRight) < 0.15, `facing ${shots.yaw.toFixed(2)} rad · from behind: ${shots.behind.length} wedge(s), newest at ${behindA.toFixed(2)} for a bearing of ${shots.wantBehind.toFixed(2)} · from the right: ${shots.right.length} wedge(s), newest at ${rightA.toFixed(2)} for ${shots.wantRight.toFixed(2)}`);
    await shotCheck(pg, "stage60-hit.png");

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
