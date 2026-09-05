import { MOVE } from "./constants";
import type { Box } from "./level";
import { type Vec3, v3, clamp } from "../math/vec3";

export interface Contact {
  normal: Vec3;
  depth: number;
  box: Box;
}

/** Closest point on an AABB to point p. */
export function closestPointAABB(p: Vec3, b: Box): Vec3 {
  return v3(clamp(p.x, b.min.x, b.max.x), clamp(p.y, b.min.y, b.max.y), clamp(p.z, b.min.z, b.max.z));
}

/**
 * Contact between a vertical capsule (feet at `feet`, radius r, total height h)
 * and an AABB. Returns null when separated.
 */
export function capsuleBoxContact(feet: Vec3, r: number, h: number, b: Box): Contact | null {
  const ay = feet.y + r; // bottom sphere centre
  const by = feet.y + h - r; // top sphere centre
  // Broad-phase reject
  if (feet.x + r <= b.min.x || feet.x - r >= b.max.x) return null;
  if (feet.z + r <= b.min.z || feet.z - r >= b.max.z) return null;
  if (feet.y + h <= b.min.y || feet.y >= b.max.y) return null;

  // Flat foot / flat crown: when the box top is below the bottom sphere centre
  // (or its bottom above the top sphere centre) and the axis is within the
  // radius of the footprint, treat the contact as a pure vertical push. This
  // keeps ledge standing stable and makes step-ups deterministic.
  if (b.max.y < ay || b.min.y > by) {
    const dhx = Math.max(b.min.x - feet.x, 0, feet.x - b.max.x);
    const dhz = Math.max(b.min.z - feet.z, 0, feet.z - b.max.z);
    if (dhx * dhx + dhz * dhz <= r * r) {
      if (b.max.y < ay) return { normal: v3(0, 1, 0), depth: b.max.y - feet.y, box: b };
      return { normal: v3(0, -1, 0), depth: feet.y + h - b.min.y, box: b };
    }
  }
  // Closest point on the (vertical) segment to the box's y-range: any point in
  // the overlap when the ranges overlap, otherwise the nearer endpoint.
  const lo = Math.max(ay, b.min.y);
  const hi = Math.min(by, b.max.y);
  const segY = lo <= hi ? 0.5 * (lo + hi) : b.max.y < ay ? ay : by;
  const sp = v3(feet.x, segY, feet.z);
  const q = closestPointAABB(sp, b);
  const dx = sp.x - q.x;
  const dy = sp.y - q.y;
  const dz = sp.z - q.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    return { normal: v3(dx / d, dy / d, dz / d), depth: r - d, box: b };
  }
  // Segment point is inside the box: push out along the axis of least penetration
  // using the capsule's bounding extents.
  const px = Math.min(feet.x + r - b.min.x, b.max.x - (feet.x - r));
  const pz = Math.min(feet.z + r - b.min.z, b.max.z - (feet.z - r));
  const pyUp = b.max.y - feet.y;
  const pyDown = feet.y + h - b.min.y;
  const py = Math.min(pyUp, pyDown);
  if (py <= px && py <= pz) {
    return pyUp <= pyDown ? { normal: v3(0, 1, 0), depth: pyUp, box: b } : { normal: v3(0, -1, 0), depth: pyDown, box: b };
  }
  if (px <= pz) {
    const left = feet.x + r - b.min.x;
    const right = b.max.x - (feet.x - r);
    return left <= right ? { normal: v3(-1, 0, 0), depth: left, box: b } : { normal: v3(1, 0, 0), depth: right, box: b };
  }
  const back = feet.z + r - b.min.z;
  const front = b.max.z - (feet.z - r);
  return back <= front ? { normal: v3(0, 0, -1), depth: back, box: b } : { normal: v3(0, 0, 1), depth: front, box: b };
}

/**
 * Push the capsule out of every box it penetrates. Mutates `feet`. Returns the
 * contact normals applied (used to clip velocity and to detect ground/walls).
 */
export function resolveCapsule(feet: Vec3, r: number, h: number, boxes: readonly Box[], maxIter = 4): Contact[] {
  const out: Contact[] = [];
  for (let it = 0; it < maxIter; it++) {
    let any = false;
    for (const b of boxes) {
      const c = capsuleBoxContact(feet, r, h, b);
      if (!c) continue;
      any = true;
      const push = c.depth + 1e-4;
      feet.x += c.normal.x * push;
      feet.y += c.normal.y * push;
      feet.z += c.normal.z * push;
      out.push(c);
    }
    if (!any) break;
  }
  return out;
}

/** True when a capsule at `feet` overlaps nothing (with a small tolerance). */
export function capsuleFree(feet: Vec3, r: number, h: number, boxes: readonly Box[], tol = 0.01): boolean {
  for (const b of boxes) {
    const c = capsuleBoxContact(feet, r, h, b);
    if (c && c.depth > tol) return false;
  }
  return true;
}

/** Ground test: a capsule slightly below `feet` touches a surface with an upward normal. */
export function groundContact(feet: Vec3, r: number, h: number, boxes: readonly Box[]): Contact | null {
  const probe = v3(feet.x, feet.y - MOVE.groundProbe, feet.z);
  let best: Contact | null = null;
  for (const b of boxes) {
    const c = capsuleBoxContact(probe, r, h, b);
    if (c && c.normal.y > 0.7 && (!best || c.depth > best.depth)) best = c;
  }
  return best;
}

/** Ray vs AABB (slab test). Returns the entry distance or null. */
export function rayBox(o: Vec3, d: Vec3, b: Box, maxT: number): number | null {
  let tmin = 0;
  let tmax = maxT;
  const oa = [o.x, o.y, o.z];
  const da = [d.x, d.y, d.z];
  const mn = [b.min.x, b.min.y, b.min.z];
  const mx = [b.max.x, b.max.y, b.max.z];
  for (let i = 0; i < 3; i++) {
    const oi = oa[i]!;
    const di = da[i]!;
    if (Math.abs(di) < 1e-9) {
      if (oi < mn[i]! || oi > mx[i]!) return null;
      continue;
    }
    const inv = 1 / di;
    let t1 = (mn[i]! - oi) * inv;
    let t2 = (mx[i]! - oi) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return tmin;
}

/** Ray vs vertical capsule (feet, radius, height). Returns entry distance or null. */
export function rayCapsule(o: Vec3, d: Vec3, feet: Vec3, r: number, h: number, maxT: number): number | null {
  const a = v3(feet.x, feet.y + r, feet.z);
  const b = v3(feet.x, feet.y + h - r, feet.z);
  // Infinite cylinder around the segment axis (vertical) first.
  const ox = o.x - a.x;
  const oz = o.z - a.z;
  const A = d.x * d.x + d.z * d.z;
  const B = 2 * (ox * d.x + oz * d.z);
  const C = ox * ox + oz * oz - r * r;
  let best: number | null = null;
  if (A > 1e-9) {
    const disc = B * B - 4 * A * C;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      const t = (-B - s) / (2 * A);
      if (t >= 0 && t <= maxT) {
        const y = o.y + d.y * t;
        if (y >= a.y && y <= b.y) best = t;
      }
    }
  } else if (C > 0) {
    return null; // vertical ray outside the cylinder
  }
  // Spheres at each end.
  for (const c of [a, b]) {
    const px = o.x - c.x;
    const py = o.y - c.y;
    const pz = o.z - c.z;
    const bb = 2 * (px * d.x + py * d.y + pz * d.z);
    const cc = px * px + py * py + pz * pz - r * r;
    const disc = bb * bb - 4 * cc;
    if (disc < 0) continue;
    const t = (-bb - Math.sqrt(disc)) / 2;
    if (t >= 0 && t <= maxT && (best === null || t < best)) best = t;
  }
  return best;
}
