/**
 * VANTAGE AI: wasp drones on patrol and the repo mech with its searchlight.
 * Deterministic (per-tick, seeded aim), server-authoritative, environmental
 * threat in every district. Smoke blocks sight.
 */
import { SIM_DT } from "./constants";
import { rayBox } from "./collision";
import type { Box } from "./level";
import { segmentHitsSphere, type Cloud } from "./projectiles";
import { magJitter } from "../weapons/manifest";
import { type Vec3, v3, sub, len, normalize, clone, wrapAngle, clamp } from "../math/vec3";

export const WASP = { health: 40, patrolSpeed: 6, chaseSpeed: 8, detect: 18, fireRange: 25, holdDistance: 8, fireInterval: 0.5, damage: 5, aimJitter: 0.035, respawn: 20, loseAfter: 3 } as const;
export const MECH = { health: 400, speed: 1.2, lightRange: 30, lightHalfAngle: 0.21, sweep: 1.05, sweepRate: 0.6, lockTime: 0.6, fireInterval: 0.5, damage: 25, respawn: 60, lightHeight: 3.2 } as const;

export interface Wasp {
  id: number;
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  health: number;
  alive: boolean;
  respawnTimer: number;
  waypoints: Vec3[];
  wp: number;
  state: "patrol" | "chase";
  targetId: number;
  fireCooldown: number;
  shots: number;
  disabledTimer: number;
  lostTimer: number;
  /** Player who jammed it (Stage 10 weapon 7); -1 = VANTAGE. */
  jammedBy: number;
  jamTimer: number;
}

export interface Mech {
  id: number;
  pos: Vec3;
  yaw: number;
  /** Searchlight sweep centre (yaw); independent of walking direction. */
  face: number;
  faceFixed: boolean;
  health: number;
  alive: boolean;
  respawnTimer: number;
  path: Vec3[];
  pathT: number;
  dir: number;
  lightYaw: number;
  sweepDir: number;
  targetId: number;
  lockTimer: number;
  fireCooldown: number;
  disabledTimer: number;
}

export interface SightTarget {
  id: number;
  eye: Vec3;
  chest: Vec3;
  alive: boolean;
  /** detection radius multiplier against this target (build) */
  detectMult?: number;
}

export type AiRequest =
  | { kind: "waspShot"; wasp: number; origin: Vec3; yaw: number; pitch: number; targetId: number }
  | { kind: "mechFlag"; mech: number; targetId: number }
  | { kind: "mechBeam"; mech: number; origin: Vec3; targetId: number; damage: number };

export function createWasp(id: number, waypoints: Vec3[]): Wasp {
  return { id, pos: clone(waypoints[0]!), vel: v3(), yaw: 0, health: WASP.health, alive: true, respawnTimer: 0, waypoints, wp: 1 % waypoints.length, state: "patrol", targetId: -1, fireCooldown: 1, shots: 0, disabledTimer: 0, lostTimer: 0, jammedBy: -1, jamTimer: 0 };
}

export function createMech(id: number, path: Vec3[], face?: number): Mech {
  const a = path[0]!;
  const b = path[1] ?? a;
  const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
  return { id, pos: clone(a), yaw, face: face ?? yaw, faceFixed: face !== undefined, health: MECH.health, alive: true, respawnTimer: 0, path, pathT: 0, dir: 1, lightYaw: 0, sweepDir: 1, targetId: -1, lockTimer: 0, fireCooldown: 0, disabledTimer: 0 };
}

export function canSee(from: Vec3, to: Vec3, boxes: readonly Box[], clouds: readonly Cloud[]): boolean {
  const d = sub(to, from);
  const dist = len(d);
  if (dist < 1e-6) return true;
  const dir = normalize(d);
  for (const b of boxes) {
    const t = rayBox(from, dir, b, dist);
    if (t !== null && t < dist - 0.01) return false;
  }
  for (const c of clouds) if (segmentHitsSphere(from, to, c.pos, c.radius)) return false;
  return true;
}

const moveToward = (pos: Vec3, target: Vec3, speed: number, dt: number): boolean => {
  const d = sub(target, pos);
  const dist = len(d);
  const step = speed * dt;
  if (dist <= step) {
    pos.x = target.x;
    pos.y = target.y;
    pos.z = target.z;
    return true;
  }
  pos.x += (d.x / dist) * step;
  pos.y += (d.y / dist) * step;
  pos.z += (d.z / dist) * step;
  return false;
};

export function stepWasp(w: Wasp, targets: readonly SightTarget[], boxes: readonly Box[], clouds: readonly Cloud[], tick: number, out: AiRequest[]): void {
  const dt = SIM_DT;
  if (!w.alive) {
    w.respawnTimer -= dt;
    if (w.respawnTimer <= 0) {
      w.alive = true;
      w.health = WASP.health;
      w.pos = clone(w.waypoints[0]!);
      w.wp = 1 % w.waypoints.length;
      w.state = "patrol";
      w.targetId = -1;
      w.jammedBy = -1;
    }
    return;
  }
  if (w.disabledTimer > 0) {
    w.disabledTimer -= dt;
    w.pos.y = Math.max(0.6, w.pos.y - 2 * dt); // sags while EMP'd
    return;
  }
  if (w.jamTimer > 0) {
    w.jamTimer -= dt;
    if (w.jamTimer <= 0) w.jammedBy = -1;
  }
  w.fireCooldown = Math.max(0, w.fireCooldown - dt);
  // acquire: nearest visible target (jammed wasps hunt other players' enemies: anyone but the jammer)
  let best: SightTarget | null = null;
  let bestD = w.state === "chase" ? WASP.fireRange + 4 : WASP.detect;
  for (const t of targets) {
    if (!t.alive || t.id === w.jammedBy) continue;
    const d = len(sub(t.chest, w.pos)) / (t.detectMult ?? 1);
    if (d < bestD && canSee(w.pos, t.chest, boxes, clouds)) {
      best = t;
      bestD = d;
    }
  }
  if (best) {
    w.state = "chase";
    w.targetId = best.id;
    w.lostTimer = 0;
    // hold distance from the target at a hover height above it
    const away = normalize(sub(w.pos, best.chest));
    const hold = v3(best.chest.x + away.x * WASP.holdDistance, clamp(best.chest.y + 2.5, 1.5, 7), best.chest.z + away.z * WASP.holdDistance);
    moveToward(w.pos, hold, WASP.chaseSpeed, dt);
    w.yaw = Math.atan2(-(best.chest.x - w.pos.x), -(best.chest.z - w.pos.z));
    if (bestD <= WASP.fireRange && w.fireCooldown <= 0) {
      w.fireCooldown = WASP.fireInterval;
      const d = sub(best.chest, w.pos);
      const flat = Math.sqrt(d.x * d.x + d.z * d.z);
      const yaw = Math.atan2(-d.x, -d.z) + magJitter(w.id * 131 + 7, w.shots, 0) * WASP.aimJitter;
      const pitch = Math.atan2(d.y, flat) + magJitter(w.id * 131 + 7, w.shots, 1) * WASP.aimJitter;
      w.shots++;
      out.push({ kind: "waspShot", wasp: w.id, origin: clone(w.pos), yaw, pitch, targetId: best.id });
    }
    return;
  }
  if (w.state === "chase") {
    w.lostTimer += dt;
    if (w.lostTimer > WASP.loseAfter) {
      w.state = "patrol";
      w.targetId = -1;
    }
  }
  const wp = w.waypoints[w.wp]!;
  if (moveToward(w.pos, wp, WASP.patrolSpeed, dt)) w.wp = (w.wp + 1) % w.waypoints.length;
  w.yaw = Math.atan2(-(wp.x - w.pos.x), -(wp.z - w.pos.z));
  void tick;
}

export function stepMech(m: Mech, targets: readonly SightTarget[], boxes: readonly Box[], clouds: readonly Cloud[], out: AiRequest[]): void {
  const dt = SIM_DT;
  if (!m.alive) {
    m.respawnTimer -= dt;
    if (m.respawnTimer <= 0) {
      m.alive = true;
      m.health = MECH.health;
      m.pos = clone(m.path[0]!);
      m.pathT = 0;
      m.targetId = -1;
      m.lockTimer = 0;
    }
    return;
  }
  if (m.disabledTimer > 0) {
    m.disabledTimer -= dt;
    m.targetId = -1;
    m.lockTimer = 0;
    return;
  }
  m.fireCooldown = Math.max(0, m.fireCooldown - dt);
  // path patrol
  const a = m.path[0]!;
  const b = m.path[1] ?? a;
  const length = len(sub(b, a));
  if (length > 0) {
    m.pathT += (m.dir * MECH.speed * dt) / length;
    if (m.pathT >= 1) {
      m.pathT = 1;
      m.dir = -1;
    } else if (m.pathT <= 0) {
      m.pathT = 0;
      m.dir = 1;
    }
    m.pos.x = a.x + (b.x - a.x) * m.pathT;
    m.pos.y = a.y + (b.y - a.y) * m.pathT;
    m.pos.z = a.z + (b.z - a.z) * m.pathT;
    const fx = (b.x - a.x) * m.dir;
    const fz = (b.z - a.z) * m.dir;
    m.yaw = Math.atan2(-fx, -fz);
    if (!m.faceFixed) m.face = m.yaw;
  }
  const origin = v3(m.pos.x, m.pos.y + MECH.lightHeight, m.pos.z);
  // searchlight: sweep unless locked
  let flagged: SightTarget | null = null;
  const lightDirYaw = m.face + m.lightYaw;
  for (const t of targets) {
    if (!t.alive) continue;
    const d = sub(t.chest, origin);
    const dist = len(d);
    if (dist > MECH.lightRange * (t.detectMult ?? 1)) continue;
    const yawTo = Math.atan2(-d.x, -d.z);
    const ang = Math.abs(wrapAngle(yawTo - lightDirYaw));
    const half = m.targetId === t.id ? MECH.lightHalfAngle * 1.8 : MECH.lightHalfAngle;
    if (ang > half) continue;
    if (!canSee(origin, t.chest, boxes, clouds)) continue;
    if (!flagged || dist < len(sub(flagged.chest, origin))) flagged = t;
  }
  if (flagged) {
    if (m.targetId !== flagged.id) {
      m.targetId = flagged.id;
      m.lockTimer = 0;
    }
    m.lockTimer += dt;
    // track the target with the light
    const d = sub(flagged.chest, origin);
    const want = wrapAngle(Math.atan2(-d.x, -d.z) - m.face);
    m.lightYaw += clamp(wrapAngle(want - m.lightYaw), -1.5 * dt, 1.5 * dt);
    out.push({ kind: "mechFlag", mech: m.id, targetId: flagged.id });
    if (m.lockTimer >= MECH.lockTime && m.fireCooldown <= 0) {
      m.fireCooldown = MECH.fireInterval;
      out.push({ kind: "mechBeam", mech: m.id, origin, targetId: flagged.id, damage: MECH.damage });
    }
    return;
  }
  if (m.targetId >= 0) {
    m.lockTimer -= dt * 2;
    if (m.lockTimer <= 0) {
      m.targetId = -1;
      m.lockTimer = 0;
    }
  }
  m.lightYaw += m.sweepDir * MECH.sweepRate * dt;
  if (m.lightYaw > MECH.sweep) {
    m.lightYaw = MECH.sweep;
    m.sweepDir = -1;
  } else if (m.lightYaw < -MECH.sweep) {
    m.lightYaw = -MECH.sweep;
    m.sweepDir = 1;
  }
}
