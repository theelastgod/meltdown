/**
 * Walkability over a LevelDef: a 1 m grid of "where can a Blank stand at
 * street level (and up any run of steps)". Used by the city tests to prove
 * every spawn reaches every node, by probes to route bots along streets,
 * and later by campaign AI.
 */
import { capsuleBoxContact } from "./collision";
import { MOVE } from "./constants";
import type { Box, LevelDef } from "./level";
import type { Vec3 } from "../math/vec3";

export interface NavGrid {
  cell: number;
  minX: number;
  minZ: number;
  w: number;
  h: number;
  /** ground height per cell (NaN = not walkable) */
  top: Float32Array;
}

/** Top of the highest box under (x, z) no taller than `maxTop` (anything above is overhead: walkways, awnings, roofs). */
function groundTop(x: number, z: number, boxes: readonly Box[], maxTop: number): number {
  let top = -Infinity;
  for (const b of boxes) {
    if (x < b.min.x || x > b.max.x || z < b.min.z || z > b.max.z) continue;
    if (b.max.y > top && b.max.y <= maxTop) top = b.max.y;
  }
  return top;
}

/**
 * Can a Blank stand here? Vertical contacts no deeper than a step are what
 * the sim resolves as a step-up (a curb beside your foot), so they don't
 * block; anything else does.
 */
function standable(x: number, y: number, z: number, r: number, boxes: readonly Box[]): boolean {
  const feet = { x, y, z };
  for (const b of boxes) {
    const c = capsuleBoxContact(feet, r, MOVE.standHeight, b);
    if (!c || c.depth <= 0.005) continue;
    if (c.normal.y > 0.7 && c.depth <= MOVE.stepHeight + 0.01) continue;
    return false;
  }
  return true;
}

/**
 * Build the grid. `clearance` widens the capsule so routes keep off walls;
 * `maxTop` is the highest surface treated as ground (3 m = street level and
 * anything a run of steps reaches; raise it to route over the walkway).
 */
export function buildNav(level: LevelDef, cell = 1, clearance = 0.12, maxTop = 3): NavGrid {
  const H = level.bounds ?? 32;
  const minX = -H;
  const minZ = -H;
  const w = Math.floor((2 * H) / cell);
  const h = Math.floor((2 * H) / cell);
  const top = new Float32Array(w * h);
  const r = MOVE.capsuleRadius + clearance;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = minX + (i + 0.5) * cell;
      const z = minZ + (j + 0.5) * cell;
      let t = groundTop(x, z, level.boxes, maxTop);
      if (!Number.isFinite(t)) t = NaN;
      else if (!standable(x, t + 0.03, z, r, level.boxes)) t = NaN;
      top[j * w + i] = t;
    }
  }
  return { cell, minX, minZ, w, h, top };
}

export function cellOf(g: NavGrid, x: number, z: number): { i: number; j: number } {
  return { i: Math.floor((x - g.minX) / g.cell), j: Math.floor((z - g.minZ) / g.cell) };
}

export function walkable(g: NavGrid, i: number, j: number): boolean {
  return i >= 0 && j >= 0 && i < g.w && j < g.h && Number.isFinite(g.top[j * g.w + i]!);
}

/** Nearest walkable cell to a world point (spawns and nodes may sit on a seam). */
export function nearestCell(g: NavGrid, x: number, z: number, maxR = 3): { i: number; j: number } | null {
  const c = cellOf(g, x, z);
  for (let r = 0; r <= maxR; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        if (walkable(g, c.i + di, c.j + dj)) return { i: c.i + di, j: c.j + dj };
      }
    }
  }
  return null;
}

/**
 * BFS over 4-neighbours with a step limit (MOVE.stepHeight) — or, with
 * `mantle`, the mantle window too. Returns the path as world waypoints
 * (turning points only) or null when unreachable.
 */
export function findPath(g: NavGrid, from: Vec3, to: Vec3, mantle = false): Vec3[] | null {
  const a = nearestCell(g, from.x, from.z);
  const b = nearestCell(g, to.x, to.z);
  if (!a || !b) return null;
  const start = a.j * g.w + a.i;
  const goal = b.j * g.w + b.i;
  const prev = new Int32Array(g.w * g.h).fill(-1);
  prev[start] = start;
  const q = [start];
  const rise = mantle ? MOVE.mantleMaxHeight : MOVE.stepHeight + 0.05;
  let head = 0;
  while (head < q.length) {
    const cur = q[head++]!;
    if (cur === goal) break;
    const ci = cur % g.w;
    const cj = (cur - ci) / g.w;
    const ct = g.top[cur]!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = ci + di;
      const nj = cj + dj;
      if (!walkable(g, ni, nj)) continue;
      const n = nj * g.w + ni;
      if (prev[n] !== -1) continue;
      const nt = g.top[n]!;
      if (nt - ct > rise || ct - nt > 6) continue; // no long drops either: probes route what a Blank would walk
      prev[n] = cur;
      q.push(n);
    }
  }
  if (prev[goal] === -1) return null;
  const cells: number[] = [];
  for (let c = goal; c !== start; c = prev[c]!) cells.push(c);
  cells.push(start);
  cells.reverse();
  const pts = cells.map((c) => {
    const i = c % g.w;
    const j = (c - i) / g.w;
    return { x: g.minX + (i + 0.5) * g.cell, y: g.top[c]!, z: g.minZ + (j + 0.5) * g.cell };
  });
  // keep turning points and height changes only
  const out: Vec3[] = [pts[0]!];
  for (let k = 1; k < pts.length - 1; k++) {
    const p = pts[k - 1]!;
    const c = pts[k]!;
    const n = pts[k + 1]!;
    const straight = Math.sign(c.x - p.x) === Math.sign(n.x - c.x) && Math.sign(c.z - p.z) === Math.sign(n.z - c.z);
    if (!straight || Math.abs(n.y - c.y) > 0.01) out.push(c);
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

/** Every walkable cell reachable from `from` (with steps only). */
export function reachableFrom(g: NavGrid, from: Vec3): Set<number> {
  const a = nearestCell(g, from.x, from.z);
  const seen = new Set<number>();
  if (!a) return seen;
  const q = [a.j * g.w + a.i];
  seen.add(q[0]!);
  let head = 0;
  while (head < q.length) {
    const cur = q[head++]!;
    const ci = cur % g.w;
    const cj = (cur - ci) / g.w;
    const ct = g.top[cur]!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = ci + di;
      const nj = cj + dj;
      if (!walkable(g, ni, nj)) continue;
      const n = nj * g.w + ni;
      if (seen.has(n)) continue;
      const nt = g.top[n]!;
      if (nt - ct > MOVE.stepHeight + 0.05 || ct - nt > 6) continue;
      seen.add(n);
      q.push(n);
    }
  }
  return seen;
}
