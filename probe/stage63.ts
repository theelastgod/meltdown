/**
 * Stage 63 probe — the silhouette walks.
 *
 * The body behind the camera is a hooded cloak on ten bones. These checks are what decide whether
 * it is a person moving or a capsule with bones: the legs alternate at the stride when it walks and
 * hang when it stands; it leans into a run, not away from it; the weapon socket takes the aim's
 * pitch exactly and both hands reach the weapon by IK; crouching lowers the hood under the low
 * capsule, a slide lays the lead boot flat, a jump splits the legs and lifts the hem; the cloak
 * sways in the shader (no draw calls, no CPU per vertex); the recoil shoves the socket; a death
 * lays the file down and dims its strip-light; a remote gets the same body from the fields the wire
 * already carries; and none of it costs a draw call or a shader program mid-match.
 *
 *   npm run probe:body
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { shot } from "./shot";
import { Btn } from "../shared/sim/input";
import { MOVE } from "../shared/sim/constants";
import { CORPSE_SECONDS } from "../client/render/pose";
import { WEAPON_LIST } from "../shared/weapons/manifest";

const VITE_PORT = 5222;
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
type Rig = ReturnType<typeof window.__game.rig>;
interface RemoteBodyViewLike { id: number; name: string; tag: string; x: number; y: number; z: number; yaw: number; pitch: number; height: number; stance: string; vx: number; vy: number; vz: number; grounded: boolean; slot: number }

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const checks: Check[] = [];
  const check = (name: string, pass: boolean, detail: string) => {
    checks.push({ name, pass, detail });
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}  — ${detail}`);
  };
  const nextFrame = async (pg: Page, n = 2): Promise<void> => {
    const f = await pg.evaluate(() => window.__game.game.renderer.frames);
    await pg.waitForFunction(([k, m]) => window.__game.game.renderer.frames >= (k as number) + (m as number), [f, n] as const, { timeout: 30000, polling: 30 });
  };
  const shotCheck = async (pg: Page, file: string): Promise<void> => {
    const s = await shot(pg, `${OUT}/${file}`);
    check(`artifact: ${file}`, s.ok, s.detail);
  };
  /** run frames until the eased pose stops moving, then read it: the pose clock is the renderer's,
   *  which under SwiftShader runs far slower than the wall clock, so waiting in milliseconds is not
   *  waiting for the pose */
  const settled = (pg: Page, id?: number) =>
    pg.evaluate(async ([who]) => {
      let prev = window.__game.rig(who as number | undefined);
      for (let i = 0; i < 200; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const now = window.__game.rig(who as number | undefined);
        const still = Math.abs((now.out?.hips.y ?? 0) - (prev.out?.hips.y ?? 0)) < 3e-4 && Math.abs(now.hoodApex - prev.hoodApex) < 3e-4;
        prev = now;
        if (still && i > 4) return now;
      }
      return prev;
    }, [id] as const);
  /** sample the rig on consecutive rendered frames while the sim runs in real time */
  const sample = (pg: Page, frames: number, id?: number) =>
    pg.evaluate(
      async ([n, who]) => {
        const out: Rig[] = [];
        for (let i = 0; i < (n as number); i++) {
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          out.push(window.__game.rig(who as number | undefined));
        }
        return out;
      },
      [frames, id] as const,
    );
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
    await pg.evaluate(() => window.__game.setBot([{ kind: "look", yaw: 0, pitch: 0, ticks: 10 }, { kind: "hold", ticks: 6000 }]));
    await pg.evaluate(() => window.__game.advance(30));
    await nextFrame(pg, 3);

    // ---------------- 1. cost and shape ----------------
    const withBody = await pg.evaluate(() => window.__game.view().calls);
    await pg.evaluate(() => window.__game.hideBody(true));
    await nextFrame(pg);
    const withoutBody = await pg.evaluate(() => window.__game.view().calls);
    await pg.evaluate(() => window.__game.hideBody(false));
    await nextFrame(pg);
    const r0 = await pg.evaluate(() => window.__game.rig());
    check("the body is a skinned cloak on ten bones and costs no more than the capsule did: five calls, one per material, drawn once", withBody - withoutBody >= 1 && withBody - withoutBody <= 5 && r0.skinned === true && r0.bones10 === 10 && withBody <= 180, `${withBody} calls with the body, ${withoutBody} without (body ${withBody - withoutBody}) · skinned ${r0.skinned} · ${r0.bones10} bones`);
    results["cost"] = { withBody, withoutBody };

    // ---------------- 2. no shader program compiles mid-match ----------------
    const programs0 = await pg.evaluate(() => window.__game.state().render.programs);
    await pg.evaluate(() => window.__game.injectRemote([{ id: 99, name: "REMOTE", tag: "", x: 3, y: 0, z: -4, yaw: 0, pitch: 0.4, height: 1.8, alive: true, stance: "stand", vx: 0, vy: 0, vz: 0, grounded: true, slot: 3 }]));
    await nextFrame(pg, 3);
    const programs1 = await pg.evaluate(() => window.__game.state().render.programs);
    const newKeys = await pg.evaluate(([n]) => {
      const info = (window.__game.game.renderer as unknown as { renderer: { info: { programs: { cacheKey: string }[] } } }).renderer.info;
      return info.programs.slice(-(n as number)).map((x) => x.cacheKey.slice(0, 120));
    }, [Math.max(0, programs1 - programs0) + 1] as const);
    check("a remote joining compiles nothing: the rig's programs were compiled at construction, the tag sprite's warmed up", programs1 === programs0, `programs ${programs0} → ${programs1} after the first remote's first frame${programs1 === programs0 ? "" : ` · newest keys: ${newKeys.join(" | ")}`}`);

    // ---------------- 3. a remote from the wire's fields ----------------
    const remoteRun = await pg.evaluate(async () => {
      const samples: Rig[] = [];
      // walk it until its legs have alternated, not for a fixed count: how much stride a frame
      // carries depends on the frame rate (Stage 67)
      for (let i = 0; i < 300; i++) {
        window.__game.injectRemote([{ id: 99, name: "REMOTE", tag: "", x: 3 + (i * 5.2) / 60, y: 0, z: -4, yaw: 0, pitch: 0.4, height: 1.8, alive: true, stance: "stand", vx: 5.2, vy: 0, vz: 0, grounded: true, slot: 3 }]);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        samples.push(window.__game.rig(99));
        let flips = 0, last = 0;
        for (const r of samples.slice(6)) {
          const sgn = Math.sign((r.out?.legL.rx ?? 0) - (r.out?.legR.rx ?? 0));
          if (last !== 0 && sgn !== 0 && sgn !== last) flips++;
          last = sgn || last;
        }
        if (flips >= 3 && samples.length > 12) break;
      }
      const hold = samples.length - 1;
      for (let i = 0; i < 20; i++) {
        window.__game.injectRemote([{ id: 99, name: "REMOTE", tag: "", x: 3 + (hold * 5.2) / 60, y: 0, z: -4, yaw: 0, pitch: 0.4, height: 1.8, alive: true, stance: "stand", vx: 5.2, vy: 0, vz: 0, grounded: true, slot: 3 }]);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }
      const held = window.__game.rig(99);
      return { samples, held };
    });
    const flipsOf = (rs: Rig[]) => {
      let flips = 0, last = 0;
      for (const r of rs) {
        const s = Math.sign((r.out?.legL.rx ?? 0) - (r.out?.legR.rx ?? 0));
        if (last !== 0 && s !== 0 && s !== last) flips++;
        last = s || last;
      }
      return flips;
    };
    const rs = remoteRun.samples.slice(6);
    const last = rs[rs.length - 1]!;
    check("a remote walks from what the wire carries — position, velocity, footing, pitch, slot: its legs alternate, its socket takes its pitch, it holds the weapon of its slot, at four draw calls", flipsOf(rs) >= 2 && Math.abs(last.socketPitch - 0.4) < 0.02 && last.stripColor === WEAPON_LIST[2]!.tracer && (last.calls ?? 0) <= 4 && (last.calls ?? 0) >= 3, `flips ${flipsOf(rs)} · socket pitch ${last.socketPitch.toFixed(3)} · strip ${last.stripColor?.toString(16)} (slot 3 = ${WEAPON_LIST[2]!.id} ${WEAPON_LIST[2]!.tracer.toString(16)}) · ${last.calls} drawables`);
    check("and a held sample with a stale velocity stops its feet: speed is the lesser of the wire's and what the position actually did", (remoteRun.held.out?.speed ?? 9) <= 0.3, `speed ${remoteRun.held.out?.speed.toFixed(2)} after 20 frames at the same position with vx 5.2 on the wire`);
    const geoBefore = await pg.evaluate(() => ({ g: window.__game.state().render.geometries, t: window.__game.state().render.textures }));
    await pg.evaluate(() => window.__game.injectRemote(null));
    await nextFrame(pg, 2);
    const geoAfter = await pg.evaluate(() => ({ g: window.__game.state().render.geometries, t: window.__game.state().render.textures }));
    // the cloak, the trim and the weapon strips are shared caches, and a Sprite's geometry belongs to
    // three itself and is the same object for every name tag: a body's own texture is the only thing
    // a leaver should take, and a geometry count that FALLS is the bug rather than the proof
    check("a remote leaving takes its own texture and nothing that is shared", geoAfter.t <= geoBefore.t - 1 && geoAfter.g === geoBefore.g, `textures ${geoBefore.t} → ${geoAfter.t} · geometries ${geoBefore.g} → ${geoAfter.g} (shared: must not fall)`);

    // a body past the pose-hold range still has to die: the hold is the stride, not its existence
    const FAR_VIEW = { id: 42, name: "FAR", tag: "", x: 60, y: 0, z: -60, yaw: 0, pitch: 0, height: 1.8, stance: "stand", vx: 0, vy: 0, vz: 0, grounded: true, slot: 1 };
    const farDeath = await pg.evaluate(async (base) => {
      const v = base as unknown as RemoteBodyViewLike;
      for (let i = 0; i < 6; i++) {
        window.__game.injectRemote([{ ...v, alive: true }] as never);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }
      const alive = window.__game.rig(42).out?.visible === true;
      for (let i = 0; i < 120; i++) {
        window.__game.injectRemote([{ ...v, alive: false }] as never);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        if (window.__game.rig(42).out?.visible === false) break;
      }
      const gone = window.__game.rig(42).out?.visible === false;
      for (let i = 0; i < 20; i++) {
        window.__game.injectRemote([{ ...v, alive: true }] as never);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }
      const back = window.__game.rig(42).out?.visible === true;
      window.__game.injectRemote(null);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { alive, gone, back };
    }, FAR_VIEW as unknown as never);
    check("a body past the 40 m pose hold still dies and still comes back: the hold is the stride, not its existence", farDeath.alive && farDeath.gone && farDeath.back, `standing ${farDeath.alive} · taken after death ${farDeath.gone} · standing again on respawn ${farDeath.back}`);

    // ---------------- 4. the aim and the hands ----------------
    const aim = async (pitch: number) => {
      await pg.evaluate((p) => window.__game.setBot([{ kind: "look", yaw: 0, pitch: p as number, ticks: 12 }, { kind: "hold", ticks: 6000 }]), pitch);
      await pg.evaluate(() => window.__game.advance(60));
      await nextFrame(pg, 6);
      return pg.evaluate(() => window.__game.rig());
    };
    const up = await aim(0.5);
    const down = await aim(-0.6);
    check("the weapon socket takes the aim's pitch exactly and both hands reach the weapon, looking up and looking down", Math.abs(up.socketPitch - 0.5) < 0.02 && Math.abs(down.socketPitch + 0.6) < 0.02 && (up.wristErr.r ?? 1) <= 0.03 && (up.wristErr.l ?? 1) <= 0.03 && (down.wristErr.r ?? 1) <= 0.03 && (down.wristErr.l ?? 1) <= 0.03 && Math.abs(up.headPitch - 0.85 * 0.5) < 0.06, `socket ${up.socketPitch.toFixed(3)} / ${down.socketPitch.toFixed(3)} for 0.5 / −0.6 · wrist error r ${up.wristErr.r?.toFixed(3)} l ${up.wristErr.l?.toFixed(3)} · hood ${up.headPitch.toFixed(2)}`);
    await aim(0);

    // ---------------- 5. walk, lean, stand ----------------
    await pg.evaluate(() => window.__game.setRealtime(true));
    const s0 = await pg.evaluate(() => window.__game.state());
    await pg.evaluate((z) => window.__game.setBot([
      { kind: "goto", x: 0, z: (z as number) - 12, sprint: false, radius: 1, timeoutTicks: 900, stop: false },
      { kind: "goto", x: 0, z: z as number, sprint: false, radius: 1, timeoutTicks: 900, stop: false },
      { kind: "goto", x: 0, z: (z as number) - 12, sprint: false, radius: 1, timeoutTicks: 900, stop: false },
      { kind: "goto", x: 0, z: z as number, sprint: false, radius: 1, timeoutTicks: 900, stop: true },
      { kind: "hold", ticks: 6000 },
    ]), s0.pos.z);
    // walk until the stride has actually cycled twice rather than for a fixed number of frames: how
    // much of a stride a frame covers is the frame rate's business, and CI draws several times
    // faster than SwiftShader does here (Stage 67)
    const walk = await pg.evaluate(async () => {
      const out: { speed: number; legL: number; legR: number; bootL: number; bootR: number; chestAhead: number }[] = [];
      let flips = 0, last = 0;
      for (let i = 0; i < 900; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const r0 = window.__game.rig();
        const speed = r0.out?.speed ?? 0;
        out.push({ speed, legL: r0.out?.legL.rx ?? 0, legR: r0.out?.legR.rx ?? 0, bootL: r0.bootBottom.l, bootR: r0.bootBottom.r, chestAhead: r0.chestAhead });
        if (speed > 3) {
          const sgn = Math.sign((r0.out?.legL.rx ?? 0) - (r0.out?.legR.rx ?? 0));
          if (last !== 0 && sgn !== 0 && sgn !== last) flips++;
          last = sgn || last;
        }
        if (flips >= 3) break;
      }
      return out;
    });
    const moving = walk.filter((r) => r.speed > 3);
    const peak = Math.max(0, ...moving.map((r) => Math.abs(r.legL)));
    const boots = moving.every((r) => r.bootL > -0.05 && r.bootL < 0.16 && r.bootR > -0.05 && r.bootR < 0.16);
    // leaning into the walk puts the chest ahead of the hips along the facing
    const leanMin = Math.min(1, ...moving.map((r) => r.chestAhead));
    let walkFlips = 0, lastSign = 0;
    for (const r of moving) {
      const sgn = Math.sign(r.legL - r.legR);
      if (lastSign !== 0 && sgn !== 0 && sgn !== lastSign) walkFlips++;
      lastSign = sgn || lastSign;
    }
    check("walking: the legs alternate at the stride's amplitude, the boots stay on the ground, and the body leans into the walk", moving.length >= 8 && walkFlips >= 2 && peak >= 0.3 && boots && leanMin >= 0.008, `${moving.length} of ${walk.length} frames moving · flips ${walkFlips} · peak ${peak.toFixed(2)} rad · boots on the ground ${boots} · chest ahead of the hips by at least ${leanMin.toFixed(3)} m`);
    // a frame labelled "walk" has to show the body walking: send it off again and freeze the sim on a
    // stride (the renderer keeps drawing, so the pose in the picture is the pose the checks measured)
    await pg.evaluate((z) => window.__game.setBot([{ kind: "goto", x: 0, z: (z as number) - 12, sprint: false, radius: 1, timeoutTicks: 900, stop: false }, { kind: "hold", ticks: 6000 }]), s0.pos.z);
    const walking = await pg.evaluate(async () => {
      for (let i = 0; i < 300; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const st = window.__game.state();
        if (Math.hypot(st.vel.x, st.vel.z) > 3.5 && st.grounded) {
          window.__game.setRealtime(false);
          return Math.hypot(st.vel.x, st.vel.z);
        }
      }
      return 0;
    });
    await nextFrame(pg, 3);
    check("the walk frame is taken while it is walking, not after it stopped", walking > 3.5, `frozen at ${walking.toFixed(1)} m/s`);
    await shotCheck(pg, "stage63-walk.png");
    await pg.evaluate(() => window.__game.setRealtime(true));
    await pg.evaluate(() => window.__game.setBot([{ kind: "hold", ticks: 6000 }]));
    await pg.waitForFunction(() => (window.__game.botStatus()?.current as { kind?: string } | null)?.kind === "hold", null, { timeout: 30000, polling: 100 });
    await pg.waitForTimeout(600);
    const stood = await sample(pg, 4);
    const still = stood[stood.length - 1]!;
    check("standing again the legs hang and the hips settle", Math.abs(still.out?.legL.rx ?? 1) < 0.06 && Math.abs(still.out?.legR.rx ?? 1) < 0.06 && Math.abs((still.out?.hips.y ?? 0) - 0.95) < 0.03, `legs ${still.out?.legL.rx.toFixed(3)} / ${still.out?.legR.rx.toFixed(3)} · hips ${still.out?.hips.y.toFixed(3)}`);

    // ---------------- 6. sway in the shader ----------------
    await pg.evaluate((z) => window.__game.setBot([
      { kind: "goto", x: 0, z: (z as number) - 14, sprint: true, radius: 1, timeoutTicks: 900, stop: false },
      { kind: "goto", x: 0, z: z as number, sprint: true, radius: 1, timeoutTicks: 900, stop: false },
      { kind: "hold", ticks: 6000 },
    ]), s0.pos.z);
    // sprint until it is actually sprinting and the hem has had time to drag: a fixed window of
    // frames catches the acceleration on a fast machine and the whole run on a slow one (Stage 68)
    const sprint = await pg.evaluate(async () => {
      const out: { speed: number; swayX: number; swayZ: number; flap: number }[] = [];
      for (let i = 0; i < 600; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const r0 = window.__game.rig();
        out.push({ speed: r0.out?.speed ?? 0, swayX: r0.uniforms?.swayX ?? 0, swayZ: r0.uniforms?.swayZ ?? 0, flap: r0.uniforms?.flap ?? 0 });
        // the hem's drag is eased at 10/s, so eight frames is a tenth of a second on a machine that
        // draws quickly and more than a second here: wait for the sway to stop rising, not for a
        // count of frames (CI read 0.053 of the 0.06 it wants — the ease, caught mid-way, Stage 72)
        const fast = out.filter((x) => x.speed > 6);
        if (fast.length >= 8) {
          const peak = Math.max(...fast.map((x) => Math.hypot(x.swayX, x.swayZ)));
          const recent = Math.max(...fast.slice(-4).map((x) => Math.hypot(x.swayX, x.swayZ)));
          if (recent <= peak + 1e-4 && fast.length >= 12) break;
        }
      }
      return out;
    });
    const fast = sprint.filter((r) => r.speed > 6);
    const swayPeak = Math.max(0, ...fast.map((r) => Math.hypot(r.swayX, r.swayZ)));
    const flapPeak = Math.max(0, ...fast.map((r) => r.flap));
    check("the cloak sways in the vertex shader: sprinting drags the hem and flaps it; the cloak and the trim share one set of uniforms", fast.length >= 4 && swayPeak >= 0.06 && flapPeak >= 0.04 && !!still.uniforms && still.sameUniforms && Math.hypot(still.uniforms.swayX, still.uniforms.swayZ) < 0.02, `${fast.length} of ${sprint.length} frames sprinting · sway ${swayPeak.toFixed(3)} · flap ${flapPeak.toFixed(3)} · standing sway ${still.uniforms ? Math.hypot(still.uniforms.swayX, still.uniforms.swayZ).toFixed(3) : "null"} · shared ${still.sameUniforms}`);
    await pg.waitForFunction(() => (window.__game.botStatus()?.current as { kind?: string } | null)?.kind === "hold", null, { timeout: 30000, polling: 100 });

    // ---------------- 7. crouch, slide, jump ----------------
    await pg.evaluate(() => window.__game.setRealtime(false));
    await pg.evaluate((b) => window.__game.setBot([{ kind: "hold", ticks: 6000, buttons: b as number }]), Btn.Crouch);
    await pg.evaluate(() => window.__game.advance(60));
    const crouched = await settled(pg);
    await pg.evaluate(() => window.__game.setBot([{ kind: "hold", ticks: 6000 }]));
    await pg.evaluate(() => window.__game.advance(60));
    const risen = await settled(pg);
    check("crouching drops the hood under the low capsule and pools the cloak; standing raises it again", crouched.hoodApex <= MOVE.lowHeight && (crouched.out?.hips.y ?? 1) <= 0.5 && crouched.bootBottom.l >= -0.03 && risen.hoodApex >= 1.76, `crouched: hood ${crouched.hoodApex.toFixed(2)} under the ${MOVE.lowHeight} m capsule · hips ${crouched.out?.hips.y.toFixed(2)} · boot ${crouched.bootBottom.l.toFixed(2)} · risen: hood ${risen.hoodApex.toFixed(2)}`);
    await pg.evaluate(() => window.__game.setRealtime(true));
    await pg.evaluate((z) => window.__game.setBot([{ kind: "goto", x: 0, z: (z as number) - 10, sprint: true, radius: 1.5, timeoutTicks: 600, stop: false }, { kind: "slide", ticks: 60 }, { kind: "hold", ticks: 6000 }]), s0.pos.z);
    const slideRun = await pg.evaluate(async () => {
      const out: { rig: Rig; stance: string; speed: number }[] = [];
      for (let i = 0; i < 240; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const st = window.__game.state();
        out.push({ rig: window.__game.rig(), stance: st.stance, speed: Math.hypot(st.vel.x, st.vel.z) });
        if (out.filter((s) => s.stance === "slide").length >= 2) {
          window.__game.setRealtime(false); // freeze the sim mid-slide: the pose settles while the stance holds
          break;
        }
        if (out.length > 8 && out.some((s) => s.stance === "slide") && st.stance !== "slide") break;
      }
      return out;
    });
    // how many frames a slide spans depends on the frame rate, and the eased pose is still moving
    // through all of them: the sim is frozen in the slide above, so read the pose once it settles
    const sliding = slideRun.filter((r) => r.rig.out?.state === "slide").map((r) => r.rig);
    const slid = sliding.length ? await settled(pg) : undefined;
    const slideTrace = `stances seen: ${[...new Set(slideRun.map((r) => r.stance))].join(",")} · top speed ${Math.max(0, ...slideRun.map((r) => r.speed)).toFixed(1)} · ${slideRun.length} frames`;
    check("a slide leans back, lays the lead boot flat ahead and flares the hem", !!slid && (slid.out?.hips.rx ?? 0) >= 0.25 && (slid.out?.legR.rx ?? 0) + (slid.out?.hips.rx ?? 0) >= 1.2 && slid.bootBottom.r >= -0.05 && slid.bootBottom.r <= 0.15 && (slid.uniforms?.flare ?? 0) >= 0.1, slid ? `${sliding.length} slide frames · hips lean ${slid.out?.hips.rx.toFixed(2)} · lead boot ${(slid.out!.legR.rx + slid.out!.hips.rx).toFixed(2)} rad, bottom ${slid.bootBottom.r.toFixed(2)} · flare ${slid.uniforms?.flare.toFixed(2)}` : `no slide frame sampled — ${slideTrace}`);
    await nextFrame(pg, 3);
    const stillSliding = await pg.evaluate(() => window.__game.state().stance);
    check("the slide frame is taken while it is sliding", stillSliding === "slide", `stance at the shutter: ${stillSliding}`);
    await shotCheck(pg, "stage63-slide.png");
    await pg.evaluate(() => window.__game.setRealtime(true));
    await pg.waitForFunction(() => (window.__game.botStatus()?.current as { kind?: string } | null)?.kind === "hold" && window.__game.state().stance === "stand", null, { timeout: 30000, polling: 100 });
    await pg.evaluate((b) => window.__game.setBot([{ kind: "hold", ticks: 2, buttons: b as number }, { kind: "hold", ticks: 6000 }]), Btn.Jump);
    // the same rule as the slide: freeze the sim off the ground rather than hope a frame lands there
    const airFrames = await pg.evaluate(async () => {
      let n = 0;
      for (let i = 0; i < 240; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        if (!window.__game.state().grounded) n++;
        if (n >= 2) {
          window.__game.setRealtime(false);
          return n;
        }
      }
      return n;
    });
    const air = airFrames >= 2 ? await settled(pg) : null;
    const airborne = air && air.out?.state === "air" ? [air] : [];
    const airPeakFlare = Math.max(0, ...airborne.map((r) => r.uniforms?.flare ?? 0));
    // the split is measured at its widest, not on every frame: the first frame off the ground is a
    // third of the way through the ease and asserting the settled pose there is asserting the ease
    const split = Math.max(0, ...airborne.map((r) => (r.out?.legL.rx ?? 0) - (r.out?.legR.rx ?? 0)));
    check("a jump splits the legs and flares the hem", airborne.length >= 1 && split >= 0.55 && airPeakFlare >= 0.12, `${airFrames} air frames · widest split ${split.toFixed(2)} rad (last ${airborne[airborne.length - 1]?.out?.legL.rx.toFixed(2)} / ${airborne[airborne.length - 1]?.out?.legR.rx.toFixed(2)}) · flare ${airPeakFlare.toFixed(2)}`);

    // ---------------- 8. recoil ----------------
    await pg.evaluate(() => window.__game.setRealtime(true));
    await pg.waitForFunction(() => window.__game.state().grounded === true, null, { timeout: 30000, polling: 50 });
    await pg.waitForTimeout(600);
    await pg.evaluate(() => window.__game.setBot([{ kind: "fire", ticks: 120 }, { kind: "hold", ticks: 6000 }]));
    // watch until a shot's shove actually lands rather than for a fixed count of frames: the recoil
    // decays in a fifth of a second and which frames fall inside that is the frame rate's (Stage 68)
    const kickPeak = await pg.evaluate(async () => {
      let peak = -1;
      for (let i = 0; i < 300; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        peak = Math.max(peak, window.__game.rig().out?.socket.z ?? -1);
        if (peak >= -0.135) break;
      }
      return peak;
    });
    check("recoil shoves the socket back on the frame the shot lands", kickPeak >= -0.16 + 0.025, `socket z peak ${kickPeak.toFixed(3)} (rest −0.16)`);

    // ---------------- 9. death and respawn ----------------
    await pg.evaluate(() => window.__game.setRealtime(false));
    await pg.evaluate(() => window.__game.setBot([{ kind: "hold", ticks: 6000 }]));
    await pg.evaluate(() => {
      const w = window.__game.game.world;
      w.applyDamage("player", 1, 1000, 0, "lease_breaker", "shot");
      window.__game.advance(1);
    });
    await nextFrame(pg, 3);
    const dying = await pg.evaluate(() => ({ alive: window.__game.game.player.alive, view: window.__game.view(), rig: window.__game.rig() }));
    await pg.evaluate(() => window.__game.advance(1));
    const fallen = await pg.evaluate(async () => {
      for (let i = 0; i < 400; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        if ((window.__game.rig().out?.corpseT ?? 0) >= 0.6) break;
      }
      return { view: window.__game.view(), rig: window.__game.rig() };
    });
    const gone = await pg.evaluate(async (secs) => {
      for (let i = 0; i < 400; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        if ((window.__game.rig().out?.corpseT ?? 0) >= (secs as number) + 0.05) break;
      }
      return window.__game.view();
    }, CORPSE_SECONDS);
    await pg.evaluate(() => window.__game.advance(60 * 6));
    await nextFrame(pg, 4);
    const back = await pg.evaluate(() => ({ alive: window.__game.game.player.alive, view: window.__game.view(), rig: window.__game.rig() }));
    check("a death lays the file down with its strip-light dying, takes the body after a moment, and a respawn stands it up with the light back", !dying.alive && dying.view.bodyVisible && (fallen.rig.out?.hips.rx ?? 0) >= 1.0 && (fallen.rig.out?.trimScale ?? 1) <= 0.3 && !gone.bodyVisible && back.alive && back.view.bodyVisible && (back.rig.out?.trimScale ?? 0) === 1 && (back.rig.out?.hips.y ?? 0) >= 0.9, `dead ${!dying.alive} · body shown on the death frame ${dying.view.bodyVisible} · at 0.6 s dead: lean ${fallen.rig.out?.hips.rx.toFixed(2)} trim ${fallen.rig.out?.trimScale.toFixed(2)} · past the corpse second shown ${gone.bodyVisible} · respawned ${back.alive} shown ${back.view.bodyVisible} trim ${back.rig.out?.trimScale} hips ${back.rig.out?.hips.y.toFixed(2)}`);

    check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean console");
    writeFileSync(`${OUT}/stage63.json`, JSON.stringify({ results, checks }, null, 2));
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
