/** Grenades and launcher rounds: deterministic ballistic integration against the level. */
import { SIM_DT } from "./constants";
import { rayBox, rayCapsule } from "./collision";
import type { Box } from "./level";
import { GRENADES, WEAPONS, type GrenadeId } from "../weapons/manifest";
import { type Vec3, v3, dot, sub, len } from "../math/vec3";

export type ProjKind = "phage" | "sticky" | GrenadeId;

export interface Projectile {
  id: number;
  kind: ProjKind;
  owner: number;
  pos: Vec3;
  vel: Vec3;
  fuse: number;
  gravity: number;
  bounce: number;
  stuck: boolean;
  armed: number;
  radius: number;
  damage: number;
  edgeDamage: number;
  direct: number;
  proximity: number;
}

export interface Cloud {
  id: number;
  pos: Vec3;
  radius: number;
  ttl: number;
}

export interface CapsuleTarget {
  id: number;
  pos: Vec3;
  height: number;
  radius: number;
}

export function createProjectile(id: number, kind: ProjKind, owner: number, pos: Vec3, vel: Vec3): Projectile {
  if (kind === "phage" || kind === "sticky") {
    const p = WEAPONS.phage.projectile!;
    const sticky = kind === "sticky";
    return {
      id, kind, owner, pos, vel,
      fuse: sticky ? 12 : p.fuse,
      gravity: p.gravity,
      bounce: 0,
      stuck: false,
      armed: sticky ? WEAPONS.phage.alt.stickyArm ?? 0.5 : 0,
      radius: p.radius,
      damage: sticky ? WEAPONS.phage.alt.damage ?? p.damage : p.damage,
      edgeDamage: p.edgeDamage,
      direct: p.direct,
      proximity: sticky ? WEAPONS.phage.alt.proximity ?? 2 : 0,
    };
  }
  const g = GRENADES[kind];
  return { id, kind, owner, pos, vel, fuse: g.fuse, gravity: g.gravity, bounce: g.bounce, stuck: false, armed: 0, radius: g.radius, damage: g.damage, edgeDamage: g.edgeDamage, direct: 0, proximity: 0 };
}

export interface Detonation {
  proj: Projectile;
  pos: Vec3;
  /** Direct-hit target (phage on a body). */
  directTarget: CapsuleTarget | null;
}

/** Segment vs sphere test (for smoke clouds blocking sight). */
export function segmentHitsSphere(a: Vec3, b: Vec3, c: Vec3, r: number): boolean {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const l2 = dot(ab, ab);
  const t = l2 > 0 ? Math.max(0, Math.min(1, dot(ac, ab) / l2)) : 0;
  const p = v3(a.x + ab.x * t, a.y + ab.y * t, a.z + ab.z * t);
  return len(sub(c, p)) <= r;
}

/**
 * Integrate all projectiles one tick. Detonations are returned for the world
 * to apply. `targets` are live capsules that launcher rounds detonate on and
 * sticky rounds arm against (never the owner).
 */
export function stepProjectiles(list: Projectile[], boxes: readonly Box[], targets: readonly CapsuleTarget[]): Detonation[] {
  const out: Detonation[] = [];
  const dt = SIM_DT;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i]!;
    p.fuse -= dt;
    if (p.stuck) {
      if (p.armed > 0) p.armed -= dt;
      else if (p.proximity > 0) {
        for (const t of targets) {
          if (t.id === p.owner) continue;
          const c = v3(t.pos.x, t.pos.y + t.height * 0.5, t.pos.z);
          if (len(sub(c, p.pos)) <= p.proximity + t.radius) {
            out.push({ proj: p, pos: p.pos, directTarget: null });
            list.splice(i, 1);
            break;
          }
        }
        if (list[i] !== p) continue;
      }
      if (p.fuse <= 0) {
        out.push({ proj: p, pos: p.pos, directTarget: null });
        list.splice(i, 1);
      }
      continue;
    }
    if (p.fuse <= 0) {
      out.push({ proj: p, pos: p.pos, directTarget: null });
      list.splice(i, 1);
      continue;
    }
    p.vel.y -= p.gravity * dt;
    const step = v3(p.vel.x * dt, p.vel.y * dt, p.vel.z * dt);
    const dist = len(step);
    if (dist < 1e-9) continue;
    const dir = v3(step.x / dist, step.y / dist, step.z / dist);
    // bodies first (launcher rounds burst on contact)
    if (p.kind === "phage" || p.kind === "sticky") {
      let bestT = dist;
      let bestTarget: CapsuleTarget | null = null;
      for (const t of targets) {
        if (t.id === p.owner) continue;
        const h = rayCapsule(p.pos, dir, t.pos, t.radius, t.height, bestT);
        if (h !== null && h < bestT) {
          bestT = h;
          bestTarget = t;
        }
      }
      if (bestTarget) {
        const hit = v3(p.pos.x + dir.x * bestT, p.pos.y + dir.y * bestT, p.pos.z + dir.z * bestT);
        out.push({ proj: p, pos: hit, directTarget: bestTarget });
        list.splice(i, 1);
        continue;
      }
    }
    // level
    let bestT = dist;
    let hitBox: Box | null = null;
    for (const b of boxes) {
      const t = rayBox(p.pos, dir, b, bestT);
      if (t !== null && t < bestT) {
        bestT = t;
        hitBox = b;
      }
    }
    if (!hitBox) {
      p.pos.x += step.x;
      p.pos.y += step.y;
      p.pos.z += step.z;
      if (p.pos.y < -30) list.splice(i, 1);
      continue;
    }
    const hit = v3(p.pos.x + dir.x * Math.max(0, bestT - 0.02), p.pos.y + dir.y * Math.max(0, bestT - 0.02), p.pos.z + dir.z * Math.max(0, bestT - 0.02));
    // surface normal from the dominant penetration axis at the hit point
    const n = faceNormal(hit, hitBox);
    if (p.kind === "phage") {
      out.push({ proj: p, pos: hit, directTarget: null });
      list.splice(i, 1);
      continue;
    }
    if (p.kind === "sticky") {
      p.pos = hit;
      p.vel = v3();
      p.stuck = true;
      continue;
    }
    // grenade bounce: reflect with restitution, damp tangential motion
    const vn = dot(p.vel, n);
    p.vel.x = (p.vel.x - n.x * vn) * 0.7 - n.x * vn * p.bounce;
    p.vel.y = (p.vel.y - n.y * vn) * 0.7 - n.y * vn * p.bounce;
    p.vel.z = (p.vel.z - n.z * vn) * 0.7 - n.z * vn * p.bounce;
    p.pos = hit;
    if (n.y > 0.5 && Math.abs(p.vel.y) < 1.2) p.vel.y = 0;
  }
  return out;
}

function faceNormal(p: Vec3, b: Box): Vec3 {
  const dx = Math.min(Math.abs(p.x - b.min.x), Math.abs(p.x - b.max.x));
  const dy = Math.min(Math.abs(p.y - b.min.y), Math.abs(p.y - b.max.y));
  const dz = Math.min(Math.abs(p.z - b.min.z), Math.abs(p.z - b.max.z));
  if (dy <= dx && dy <= dz) return v3(0, Math.abs(p.y - b.max.y) < Math.abs(p.y - b.min.y) ? 1 : -1, 0);
  if (dx <= dz) return v3(Math.abs(p.x - b.max.x) < Math.abs(p.x - b.min.x) ? 1 : -1, 0, 0);
  return v3(0, 0, Math.abs(p.z - b.max.z) < Math.abs(p.z - b.min.z) ? 1 : -1);
}
