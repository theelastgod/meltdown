import { MOVE, LEASE_BREAKER, PLAYER_MAX_HEALTH, SIM_DT } from "./constants";
import { Btn, has, type InputFrame } from "./input";
import type { Box, SpawnPoint } from "./level";
import { capsuleFree, groundContact, resolveCapsule } from "./collision";
import { type Vec3, v3, clone, copy, set, lenXZ, yawDir, yawRight, clamp, dot, wrapAngle, hyp2 } from "../math/vec3";

export type Stance = "stand" | "crouch" | "slide" | "mantle";

export interface PlayerStats {
  jumps: number;
  slides: number;
  slideJumps: number;
  mantles: number;
  shots: number;
  hits: number;
  kills: number;
  deaths: number;
  /** Peak horizontal speed reached (m/s). */
  topSpeed: number;
}

export interface PlayerState {
  id: number;
  name: string;
  /** Feet position. */
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  pitch: number;
  stance: Stance;
  height: number;
  grounded: boolean;
  /** Seconds since last grounded (for coyote time). */
  airTime: number;
  jumpBuffer: number;
  slideTime: number;
  slideCooldown: number;
  slideDir: Vec3;
  mantleFrom: Vec3;
  mantleTo: Vec3;
  mantleT: number;
  health: number;
  alive: boolean;
  respawnTimer: number;
  ammo: number;
  reloadTimer: number;
  fireCooldown: number;
  /** Accumulated view-kick (radians) applied on top of the input view, recovers each tick. */
  kickPitch: number;
  kickYaw: number;
  prevButtons: number;
  /** Set when a shot was fired this tick (consumed by world for hitscan). */
  firedThisTick: boolean;
  stats: PlayerStats;
  /** Tick at which this player last took damage from full health (TTK bookkeeping). */
  firstDamageTick: number;
  lastAttacker: number;
}

export function createPlayer(id: number, name: string, spawn: SpawnPoint): PlayerState {
  return {
    id,
    name,
    pos: clone(spawn.pos),
    vel: v3(),
    yaw: spawn.yaw,
    pitch: 0,
    stance: "stand",
    height: MOVE.standHeight,
    grounded: false,
    airTime: 0,
    jumpBuffer: 0,
    slideTime: 0,
    slideCooldown: 0,
    slideDir: v3(0, 0, -1),
    mantleFrom: v3(),
    mantleTo: v3(),
    mantleT: 0,
    health: PLAYER_MAX_HEALTH,
    alive: true,
    respawnTimer: 0,
    ammo: LEASE_BREAKER.magSize,
    reloadTimer: 0,
    fireCooldown: 0,
    kickPitch: 0,
    kickYaw: 0,
    prevButtons: 0,
    firedThisTick: false,
    stats: { jumps: 0, slides: 0, slideJumps: 0, mantles: 0, shots: 0, hits: 0, kills: 0, deaths: 0, topSpeed: 0 },
    firstDamageTick: -1,
    lastAttacker: -1,
  };
}

export function respawnPlayer(p: PlayerState, spawn: SpawnPoint): void {
  copy(p.pos, spawn.pos);
  set(p.vel, 0, 0, 0);
  p.yaw = spawn.yaw;
  p.pitch = 0;
  p.stance = "stand";
  p.height = MOVE.standHeight;
  p.health = PLAYER_MAX_HEALTH;
  p.alive = true;
  p.ammo = LEASE_BREAKER.magSize;
  p.reloadTimer = 0;
  p.fireCooldown = 0;
  p.slideTime = 0;
  p.slideCooldown = 0;
  p.firstDamageTick = -1;
  p.lastAttacker = -1;
}

export const eyeHeight = (p: PlayerState): number => (p.height < MOVE.standHeight - 0.01 ? MOVE.eyeLow : MOVE.eyeStand);
export const eyePos = (p: PlayerState): Vec3 => v3(p.pos.x, p.pos.y + eyeHeight(p), p.pos.z);

export type PlayerEvent =
  | { type: "jump" }
  | { type: "slide" }
  | { type: "slideEnd" }
  | { type: "slideJump" }
  | { type: "mantle"; from: Vec3; to: Vec3 }
  | { type: "mantleEnd" }
  | { type: "land"; speed: number }
  | { type: "reloadStart" }
  | { type: "reloadEnd" }
  | { type: "dryFire" };

const MOVE_SUBSTEPS = 3;

function wishDirection(input: InputFrame): Vec3 {
  const f = yawDir(input.yaw);
  const r = yawRight(input.yaw);
  let x = 0;
  let z = 0;
  if (has(input.buttons, Btn.Forward)) {
    x += f.x;
    z += f.z;
  }
  if (has(input.buttons, Btn.Back)) {
    x -= f.x;
    z -= f.z;
  }
  if (has(input.buttons, Btn.Right)) {
    x += r.x;
    z += r.z;
  }
  if (has(input.buttons, Btn.Left)) {
    x -= r.x;
    z -= r.z;
  }
  const l = hyp2(x, z);
  return l > 1e-6 ? v3(x / l, 0, z / l) : v3();
}

/**
 * Try to grab a ledge in front of the player. Returns the landing feet
 * position when a mantle is possible.
 */
function findMantle(p: PlayerState, boxes: readonly Box[]): Vec3 | null {
  const r = MOVE.capsuleRadius;
  const f = yawDir(p.yaw);
  const probeDist = r + MOVE.mantleReach;
  const px = p.pos.x + f.x * probeDist;
  const pz = p.pos.z + f.z * probeDist;
  let best: Box | null = null;
  for (const b of boxes) {
    if (px < b.min.x || px > b.max.x || pz < b.min.z || pz > b.max.z) continue;
    const rise = b.max.y - p.pos.y;
    if (rise < MOVE.mantleMinHeight || rise > MOVE.mantleMaxHeight) continue;
    // the ledge must actually be a wall in front of the player's body: the probe
    // point at shin height must be inside the box
    if (p.pos.y + 0.3 < b.min.y) continue;
    if (!best || b.max.y > best.max.y) best = b;
  }
  if (!best) return null;
  const land = v3(p.pos.x + f.x * (probeDist + 0.35), best.max.y + 0.01, p.pos.z + f.z * (probeDist + 0.35));
  if (!capsuleFree(land, r, MOVE.standHeight, boxes, 0.02)) return null;
  return land;
}

/** Advance one player one fixed tick. Pure: only mutates `p`. Emits events into `events`. */
export function stepPlayer(p: PlayerState, input: InputFrame, boxes: readonly Box[], events: PlayerEvent[]): void {
  const dt = SIM_DT;
  const r = MOVE.capsuleRadius;
  p.firedThisTick = false;

  // View: absolute from input (client-owned), pitch clamped. Kick is a visual overlay.
  p.yaw = wrapAngle(input.yaw);
  p.pitch = clamp(input.pitch, -1.55, 1.55);
  p.kickPitch *= Math.max(0, 1 - LEASE_BREAKER.kickRecover * dt);
  p.kickYaw *= Math.max(0, 1 - LEASE_BREAKER.kickRecover * dt);

  // Timers
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  p.slideCooldown = Math.max(0, p.slideCooldown - dt);
  if (p.reloadTimer > 0) {
    p.reloadTimer -= dt;
    if (p.reloadTimer <= 0) {
      p.reloadTimer = 0;
      p.ammo = LEASE_BREAKER.magSize;
      events.push({ type: "reloadEnd" });
    }
  }

  const pressed = input.buttons & ~p.prevButtons;
  p.prevButtons = input.buttons;
  if (!p.alive) return;

  const jumpPressed = has(pressed, Btn.Jump);
  const crouchPressed = has(pressed, Btn.Crouch);
  const crouchHeld = has(input.buttons, Btn.Crouch);
  const sprintHeld = has(input.buttons, Btn.Sprint);
  if (jumpPressed) p.jumpBuffer = MOVE.jumpBuffer;
  else p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);

  // ---- Mantle: scripted pull-up, no physics ----
  if (p.stance === "mantle") {
    p.mantleT = Math.min(1, p.mantleT + dt / MOVE.mantleTime);
    const t = p.mantleT;
    // vertical first (ease-out), then forward (ease-in)
    const ty = Math.min(1, t / 0.6);
    const tf = Math.max(0, (t - 0.4) / 0.6);
    const ey = 1 - (1 - ty) * (1 - ty);
    const ef = tf * tf;
    p.pos.x = p.mantleFrom.x + (p.mantleTo.x - p.mantleFrom.x) * ef;
    p.pos.z = p.mantleFrom.z + (p.mantleTo.z - p.mantleFrom.z) * ef;
    p.pos.y = p.mantleFrom.y + (p.mantleTo.y - p.mantleFrom.y) * ey;
    set(p.vel, 0, 0, 0);
    if (t >= 1) {
      p.stance = "stand";
      p.height = MOVE.standHeight;
      const f = yawDir(p.yaw);
      set(p.vel, f.x * MOVE.mantleExitSpeed, 0, f.z * MOVE.mantleExitSpeed);
      p.grounded = true;
      events.push({ type: "mantleEnd" });
    }
    return;
  }

  const wish = wishDirection(input);
  const wasGrounded = p.grounded;
  const forward = yawDir(p.yaw);
  const forwardHeld = has(input.buttons, Btn.Forward) && dot(wish, forward) > 0.5;

  // ---- Slide state machine ----
  if (p.stance === "slide") {
    p.slideTime += dt;
    let speed = lenXZ(p.vel);
    const canStand = capsuleFree(p.pos, r, MOVE.standHeight, boxes);
    const slideJumping = p.jumpBuffer > 0 && p.grounded && canStand;
    if (p.grounded && !slideJumping) speed = Math.max(0, speed - MOVE.slideFriction * dt);
    // gentle steering toward wish direction
    if (wish.x !== 0 || wish.z !== 0) {
      const cur = Math.atan2(p.slideDir.x, p.slideDir.z);
      const want = Math.atan2(wish.x, wish.z);
      const delta = wrapAngle(want - cur);
      const step = clamp(delta, -MOVE.slideSteerRate * dt, MOVE.slideSteerRate * dt);
      const a = cur + step;
      set(p.slideDir, Math.sin(a), 0, Math.cos(a));
    }
    p.vel.x = p.slideDir.x * speed;
    p.vel.z = p.slideDir.z * speed;

    if (slideJumping) {
      // Slide-jump: keep the whole horizontal vector, launch.
      p.jumpBuffer = 0;
      p.vel.y = MOVE.slideJumpVel;
      p.grounded = false;
      p.stance = "stand";
      p.height = MOVE.standHeight;
      p.slideCooldown = MOVE.slideCooldown;
      p.stats.slideJumps++;
      p.stats.jumps++;
      events.push({ type: "slideJump" });
    } else if ((speed < MOVE.slideExitSpeed || (!crouchHeld && p.slideTime >= MOVE.slideMinTime)) && canStand) {
      p.stance = crouchHeld ? "crouch" : "stand";
      p.height = crouchHeld ? MOVE.lowHeight : MOVE.standHeight;
      p.slideCooldown = MOVE.slideCooldown;
      events.push({ type: "slideEnd" });
    }
  } else {
    // ---- Standing / crouching ----
    const hspeed = lenXZ(p.vel);
    const canSlide =
      crouchPressed && p.grounded && sprintHeld && hspeed >= MOVE.slideEntrySpeed && p.slideCooldown <= 0 && (wish.x !== 0 || wish.z !== 0);
    if (canSlide) {
      p.stance = "slide";
      p.height = MOVE.lowHeight;
      p.slideTime = 0;
      const d = hspeed > 1e-6 ? v3(p.vel.x / hspeed, 0, p.vel.z / hspeed) : wish;
      copy(p.slideDir, d);
      const s = Math.min(hspeed + MOVE.slideBoost, MOVE.slideMaxSpeed);
      p.vel.x = d.x * s;
      p.vel.z = d.z * s;
      p.stats.slides++;
      events.push({ type: "slide" });
    } else {
      // crouch toggle by hold
      if (crouchHeld && p.grounded) {
        p.stance = "crouch";
        p.height = MOVE.lowHeight;
      } else if (p.stance === "crouch" && (!crouchHeld || !p.grounded)) {
        if (capsuleFree(p.pos, r, MOVE.standHeight, boxes)) {
          p.stance = "stand";
          p.height = MOVE.standHeight;
        }
      }
      const maxSpeed = p.stance === "crouch" ? MOVE.crouchSpeed : sprintHeld && forwardHeld ? MOVE.sprintSpeed : MOVE.walkSpeed;
      if (p.grounded) {
        if (hspeed > maxSpeed + 0.05) {
          // Post-slide momentum: decay toward max, keep heading, allow steering.
          const ns = Math.max(maxSpeed, hspeed - MOVE.momentumDecay * dt);
          if (wish.x !== 0 || wish.z !== 0) {
            // steer the heading, never the magnitude
            p.vel.x += wish.x * MOVE.airAccel * dt;
            p.vel.z += wish.z * MOVE.airAccel * dt;
          }
          const k = ns / Math.max(1e-6, hyp2(p.vel.x, p.vel.z));
          p.vel.x *= k;
          p.vel.z *= k;
        } else if (wish.x !== 0 || wish.z !== 0) {
          const tx = wish.x * maxSpeed;
          const tz = wish.z * maxSpeed;
          const dx = tx - p.vel.x;
          const dz = tz - p.vel.z;
          const dl = hyp2(dx, dz);
          const maxStep = MOVE.groundAccel * dt;
          if (dl <= maxStep) {
            p.vel.x = tx;
            p.vel.z = tz;
          } else {
            p.vel.x += (dx / dl) * maxStep;
            p.vel.z += (dz / dl) * maxStep;
          }
        } else {
          const f = Math.max(0, 1 - MOVE.groundFriction * dt);
          p.vel.x *= f;
          p.vel.z *= f;
          if (hyp2(p.vel.x, p.vel.z) < 0.05) {
            p.vel.x = 0;
            p.vel.z = 0;
          }
        }
      } else if (wish.x !== 0 || wish.z !== 0) {
        // Air control: steer along wish up to walk speed on that axis, but the
        // total horizontal speed may never grow in the air — slide-jumps keep
        // their momentum, strafe-turning cannot manufacture more.
        const along = p.vel.x * wish.x + p.vel.z * wish.z;
        const cap = MOVE.walkSpeed;
        if (along < cap) {
          const add = Math.min(MOVE.airAccel * dt, cap - along);
          const limit = Math.max(hspeed, cap);
          p.vel.x += wish.x * add;
          p.vel.z += wish.z * add;
          const ns = hyp2(p.vel.x, p.vel.z);
          if (ns > limit) {
            p.vel.x *= limit / ns;
            p.vel.z *= limit / ns;
          }
        }
      }
      // Jump (with buffer + coyote)
      if (p.jumpBuffer > 0 && (p.grounded || p.airTime < MOVE.coyoteTime) && p.stance !== "crouch") {
        p.jumpBuffer = 0;
        p.vel.y = MOVE.jumpVel;
        p.grounded = false;
        p.airTime = MOVE.coyoteTime;
        p.stats.jumps++;
        events.push({ type: "jump" });
      }
    }
  }

  // ---- Mantle detection (airborne, pushing forward into a ledge) ----
  if (!p.grounded && forwardHeld && p.stance !== "slide") {
    const land = findMantle(p, boxes);
    if (land) {
      p.stance = "mantle";
      p.height = MOVE.standHeight;
      copy(p.mantleFrom, p.pos);
      copy(p.mantleTo, land);
      p.mantleT = 0;
      set(p.vel, 0, 0, 0);
      p.stats.mantles++;
      events.push({ type: "mantle", from: clone(p.mantleFrom), to: clone(p.mantleTo) });
      return;
    }
  }

  // ---- Gravity ----
  if (!p.grounded) p.vel.y = Math.max(-MOVE.terminalVel, p.vel.y - MOVE.gravity * dt);
  else if (p.vel.y < 0) p.vel.y = 0;

  // ---- Integrate with collision (substeps + step-up) ----
  const sub = dt / MOVE_SUBSTEPS;
  for (let i = 0; i < MOVE_SUBSTEPS; i++) {
    const pre = clone(p.pos);
    p.pos.x += p.vel.x * sub;
    p.pos.y += p.vel.y * sub;
    p.pos.z += p.vel.z * sub;
    const contacts = resolveCapsule(p.pos, r, p.height, boxes);
    let hitWall = false;
    for (const c of contacts) {
      if (Math.abs(c.normal.y) < 0.3) hitWall = true;
    }
    if (hitWall && (wasGrounded || p.grounded) && (p.vel.x !== 0 || p.vel.z !== 0)) {
      // Step-up attempt: lift, move horizontally, drop.
      const up = v3(pre.x, pre.y + MOVE.stepHeight, pre.z);
      if (capsuleFree(up, r, p.height, boxes)) {
        up.x += p.vel.x * sub;
        up.z += p.vel.z * sub;
        const c2 = resolveCapsule(up, r, p.height, boxes);
        const blocked = c2.some((c) => Math.abs(c.normal.y) < 0.3);
        if (!blocked) {
          // sweep down onto the step: lower until the capsule would penetrate
          const top = up.y;
          const N = 8;
          for (let k = 1; k <= N; k++) {
            const y = top - (MOVE.stepHeight * k) / N;
            if (!capsuleFree(v3(up.x, y, up.z), r, p.height, boxes, 0.0005)) break;
            up.y = y;
          }
          resolveCapsule(up, r, p.height, boxes);
          const g = groundContact(up, r, p.height, boxes);
          const progOrig = (p.pos.x - pre.x) * p.vel.x + (p.pos.z - pre.z) * p.vel.z;
          const progStep = (up.x - pre.x) * p.vel.x + (up.z - pre.z) * p.vel.z;
          if (g && progStep > progOrig + 1e-6 && up.y <= pre.y + MOVE.stepHeight + 0.01) {
            copy(p.pos, up);
            if (p.vel.y < 0) p.vel.y = 0;
            continue;
          }
        }
      }
    }
    for (const c of contacts) {
      const vn = p.vel.x * c.normal.x + p.vel.y * c.normal.y + p.vel.z * c.normal.z;
      if (vn < 0) {
        p.vel.x -= c.normal.x * vn;
        p.vel.y -= c.normal.y * vn;
        p.vel.z -= c.normal.z * vn;
      }
    }
  }

  // ---- Ground state ----
  const g = groundContact(p.pos, r, p.height, boxes);
  const nowGrounded = !!g && p.vel.y <= 0.01;
  if (nowGrounded && !wasGrounded) {
    events.push({ type: "land", speed: lenXZ(p.vel) });
  }
  p.grounded = nowGrounded;
  p.airTime = nowGrounded ? 0 : p.airTime + dt;
  if (nowGrounded && g) {
    // Snap the feet onto the surface found by the probe so we never hover.
    const surfaceY = p.pos.y - MOVE.groundProbe + g.depth + 1e-4;
    if (surfaceY < p.pos.y) p.pos.y = surfaceY;
    if (p.vel.y < 0) p.vel.y = 0;
  }

  const hs = lenXZ(p.vel);
  if (hs > p.stats.topSpeed) p.stats.topSpeed = hs;

  // ---- Weapon: reload + fire request (hitscan resolved by the world) ----
  const wantReload = has(pressed, Btn.Reload) || (has(input.buttons, Btn.Fire) && p.ammo === 0);
  if (wantReload && p.reloadTimer <= 0 && p.ammo < LEASE_BREAKER.magSize) {
    p.reloadTimer = LEASE_BREAKER.reloadTime;
    events.push({ type: "reloadStart" });
  }
  if (has(input.buttons, Btn.Fire) && p.fireCooldown <= 0 && p.reloadTimer <= 0) {
    if (p.ammo > 0) {
      p.ammo--;
      p.fireCooldown = 60 / LEASE_BREAKER.rpm;
      p.firedThisTick = true;
      p.stats.shots++;
      p.kickPitch += LEASE_BREAKER.kickPitch;
      // deterministic alternating yaw kick; full seeded pattern arrives in Stage 4
      p.kickYaw += (p.stats.shots & 1 ? 1 : -1) * LEASE_BREAKER.kickYaw;
    } else if (has(pressed, Btn.Fire)) {
      events.push({ type: "dryFire" });
    }
  }
}
