/**
 * Street runs: the courses (Stage 703).
 *
 * A street run is a movement time trial through a district: a start ring, five to ten checkpoints
 * taken in order, the last of them the finish. The courses are the district's own: they are read off
 * its geometry, not written by hand, so a district that changes shape gets courses that fit it.
 *
 *  - The ground a course may use is the nav grid (`shared/sim/nav.ts`) built to the walkway's height:
 *    open street, the elevated walkway, and what a Blank can climb or mantle onto (loading docks,
 *    crates, stall roofs).
 *  - Each district has the same three course slots (`STREET_RUN_COURSES`): a HIGH LINE that takes
 *    the walkway, and a loop on each side of the district that comes back to its own start.
 *  - Every leg must have a nav path (`findPath`, with the mantle window), and then the whole course
 *    is RUN: a bot sprints it through the real movement sim, and the room's own checkpoint rules
 *    (`StreetRuns`, `shared/city/runs.ts`) decide whether it counted. A course that bot cannot finish
 *    inside its time bound is thrown away and the next candidate is tried. The bot's time is the
 *    course's PAR: what plain sprinting does. A slide, a slide-jump and a clean mantle beat it.
 *
 * Everything is deterministic: a function of the level and the slot, with no clock and no
 * Math.random, so every room and every client builds the same courses.
 *
 * It imports nothing from the campaign, the economy or the chain, and no PvP room loads it.
 */
import { v3, type Vec3 } from "../math/vec3";
import { MOVE, SIM_HZ } from "../sim/constants";
import { Btn, type InputFrame } from "../sim/input";
import type { LevelDef } from "../sim/level";
import { buildNav, findPath, nearestCell, walkable, type NavGrid } from "../sim/nav";
import { World } from "../sim/world";
import { STREET_RUN_COURSES } from "../progression/stamps";
import { cityHash } from "./events";

export type RunPointKind = "street" | "ledge" | "roof" | "walkway";

export interface RunPoint {
  x: number;
  y: number;
  z: number;
  kind: RunPointKind;
}

export interface StreetRunCourse {
  /** `<district>:<slot>` — the id the stamp, the counter and the leaderboard key on */
  id: string;
  district: string;
  slot: number;
  name: string;
  /** where the start ring stands */
  start: RunPoint;
  /** taken in order; the last is the finish (a loop's is its own start) */
  checkpoints: RunPoint[];
  /** metres along the route the proving bot ran */
  length: number;
  /** ticks the proving bot took, sprinting: the course's par */
  par: number;
  /** a digest of the points: a stored leaderboard entry for a course of another shape is not this course's */
  sig: string;
}

/** The rules' numbers (metres and seconds). */
export const STREET_RUN = {
  /** a start ring's and a checkpoint's radius */
  radius: 2.5,
  /** stood this long in a start ring, the run is armed; it starts the tick the runner leaves the ring */
  armSeconds: 1,
  /** at or above this a point is off the street: it counts only for a runner standing on it */
  raised: 0.6,
  /** how far off a raised point's height a runner may stand and still be on it */
  raisedTolerance: 0.35,
  /** a street point counts from this far below it (a curb) to this far above (a jump, not the walkway) */
  streetBelow: 0.5,
  streetAbove: 2.5,
  minCheckpoints: 5,
  maxCheckpoints: 10,
  /** the proof's bound: a course the sprinting bot cannot finish at this many times its route's sprint time is thrown away */
  proofSlack: 1.6,
  /** a run is void after max(par × this, par + limitExtra s) */
  limitFactor: 2.5,
  limitExtraSeconds: 45,
  /** a runner this far from the next checkpoint has left the course */
  offCourse: 90,
} as const;

/** Whether a runner standing at `p` (feet), grounded or not, has reached `pt`. The one rule the room and the proof both use. */
export function atPoint(pt: RunPoint, p: { pos: Vec3; grounded: boolean }): boolean {
  if (Math.hypot(p.pos.x - pt.x, p.pos.z - pt.z) > STREET_RUN.radius) return false;
  // off the street (a dock, a roof, the walkway), it counts only standing on it: a jump from the street below does not
  if (pt.y >= STREET_RUN.raised) return p.grounded && Math.abs(p.pos.y - pt.y) <= STREET_RUN.raisedTolerance;
  // on the street, anywhere from the curb to a jump above it, but not from the walkway overhead
  return p.pos.y >= pt.y - STREET_RUN.streetBelow && p.pos.y <= pt.y + STREET_RUN.streetAbove;
}

const kindOf = (y: number): RunPointKind => (y < STREET_RUN.raised ? "street" : y < 2 ? "ledge" : y < 4 ? "roof" : "walkway");

/** The name a HUD gives a point's kind. */
export const RUN_POINT_WORD: Record<RunPointKind, string> = { street: "STREET", ledge: "LEDGE", roof: "ROOFTOP", walkway: "WALKWAY" };

// ---- the district's ground ----

/** the nav a course is planned on: 1 m cells, surfaces up to the walkway (the walkway's top is 4.6 m) */
/**
 * The two navs a course is planned on (1 m cells). The street's: surfaces up to 3 m, so the street
 * under the walkway is street, and a dock, a crate or a stall roof is somewhere to climb. The
 * walkway's: surfaces up to 6 m, so its top (4.6 m) is ground and its stairs lead to it. A leg that
 * touches the walkway is planned on the second; every other leg on the first.
 */
export interface CourseNavs {
  street: NavGrid;
  high: NavGrid;
}
export const courseNavs = (level: LevelDef): CourseNavs => ({ street: buildNav(level, 1, 0.12, 3), high: buildNav(level, 1, 0.12, 6) });
const navFor = (n: CourseNavs, a: RunPoint, b: RunPoint): NavGrid => (a.kind === "walkway" || b.kind === "walkway" ? n.high : n.street);

const topAt = (g: NavGrid, i: number, j: number): number => (walkable(g, i, j) ? g.top[j * g.w + i]! : NaN);

/**
 * Where a checkpoint may stand, read off the nav: open street on a 3 m lattice (every cell within 2 m
 * walkable at the street's height, so not an alley mouth, a kerb or the street under the walkway),
 * and raised surfaces with room to stand (the cell and its four neighbours at one height), thinned
 * to one every 3 m.
 */
export function runCandidates(g: NavGrid, step = 3): RunPoint[] {
  const out: RunPoint[] = [];
  const at = (i: number, j: number): RunPoint => {
    const t = topAt(g, i, j);
    return { x: g.minX + (i + 0.5) * g.cell, y: t, z: g.minZ + (j + 0.5) * g.cell, kind: kindOf(t) };
  };
  for (let j = 2; j < g.h - 2; j += step) {
    for (let i = 2; i < g.w - 2; i += step) {
      const t = topAt(g, i, j);
      if (!(t < STREET_RUN.raised)) continue;
      let ok = true;
      for (let dj = -2; dj <= 2 && ok; dj++) for (let di = -2; di <= 2 && ok; di++) if (!(Math.abs(topAt(g, i + di, j + dj) - t) <= 0.3)) ok = false;
      if (ok) out.push(at(i, j));
    }
  }
  const raised: RunPoint[] = [];
  for (let j = 1; j < g.h - 1; j++) {
    for (let i = 1; i < g.w - 1; i++) {
      const t = topAt(g, i, j);
      if (!(t >= STREET_RUN.raised)) continue;
      const same = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([di, dj]) => Math.abs(topAt(g, i + di!, j + dj!) - t) <= 0.05);
      if (!same) continue;
      const pt = at(i, j);
      if (raised.every((r) => Math.abs(r.y - pt.y) > 0.5 || flat(r, pt) >= 3)) raised.push(pt);
    }
  }
  return [...out, ...raised];
}

/** the most a leg climbs on foot in one 1 m cell (a hop: two stair treads, a planter), and the most it drops (a stall roof) */
const LEG_HOP = 0.8;
const LEG_DROP = 2.6;

const flat = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

const routeLength = (pts: readonly Vec3[]): number => {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += flat(pts[i - 1]!, pts[i]!);
  return n;
};

/**
 * One leg's nav path: on foot if there is a way that is not much longer, else with the mantle window
 * (a dock, a crate, a roof). Null when there is none, or it wanders (more than 2.5× the straight line
 * and 20 m): a course goes somewhere, it does not tour the district.
 */
function legPath(n: CourseNavs, a: RunPoint, b: RunPoint): Vec3[] | string {
  const g = navFor(n, a, b);
  const from = v3(a.x, a.y, a.z), to = v3(b.x, b.y, b.z);
  // a drop off anything taller than a stall is a drop through a rail (the walkway's): stairs down only
  const climb = findPath(g, from, to, true, { drop: LEG_DROP });
  if (!climb || climb.length < 2) return "no path";
  // on foot: a step, or the hop a stair's two treads in one cell or a kerb takes
  const walk = findPath(g, from, to, false, { rise: LEG_HOP, drop: LEG_DROP });
  const p = walk && routeLength(walk) <= routeLength(climb) * 1.5 + 8 ? walk : climb;
  if (routeLength(p) > flat(a, b) * 2.5 + 20) return `wanders (${Math.round(routeLength(p))} m for ${Math.round(flat(a, b))})`;
  return p;
}

// ---- the proof: a bot sprints it through the movement sim ----

export interface CourseProof {
  ok: boolean;
  /** ticks from the start to the finish (the par), or the ticks spent before it failed */
  ticks: number;
  /** checkpoints the runtime counted */
  reached: number;
  reason: string;
}

/**
 * A plain driver for the proof: sprint at each waypoint of the nav route in turn, jump where the next
 * one is a climb (the mantle catches it), never slide. It is the floor of what a player can do.
 */
export class CourseBot {
  private i = 1;
  private lastJump = false;
  private since = 0;
  /** the closest it has been to the waypoint it is heading for */
  private best = Infinity;
  constructor(readonly route: readonly Vec3[]) {}

  get done(): boolean {
    return this.i >= this.route.length;
  }

  /** ticks without getting any closer to the next waypoint */
  get stalled(): number {
    return this.since;
  }

  input(tick: number, p: { pos: Vec3; yaw: number; grounded: boolean; stance: string }): InputFrame {
    // take every waypoint already reached (a corner cut short is a corner taken)
    while (this.i < this.route.length) {
      const w = this.route[this.i]!;
      const climb = w.y - p.pos.y > MOVE.stepHeight + 0.1;
      if (flat(p.pos, w) < (climb ? 0.45 : 0.85) && !(climb && p.stance === "mantle")) {
        this.i++;
        this.best = Infinity;
      } else break;
    }
    const w = this.route[Math.min(this.i, this.route.length - 1)]!;
    const d = flat(p.pos, w) + Math.abs(w.y - p.pos.y);
    if (d < this.best - 0.25) {
      this.best = d;
      this.since = 0;
    } else this.since++;
    const yaw = Math.atan2(-(w.x - p.pos.x), -(w.z - p.pos.z));
    let buttons = Btn.Forward | Btn.Sprint;
    // a climb ahead: jump at it once close, and keep pushing so the mantle catches the ledge
    const climb = w.y - p.pos.y > MOVE.stepHeight + 0.1;
    const jump = climb && p.grounded && flat(p.pos, w) < 2.2 && !this.lastJump;
    if (jump) buttons |= Btn.Jump;
    this.lastJump = jump;
    return { tick, buttons, yaw, pitch: 0 };
  }
}

/** A route that visits the course: the start, then each checkpoint in order, as nav waypoints; or why a leg has none. */
export function courseRoute(g: CourseNavs, start: RunPoint, checkpoints: readonly RunPoint[]): Vec3[] | string {
  const out: Vec3[] = [v3(start.x, start.y, start.z)];
  let from = start;
  for (const [k, cp] of checkpoints.entries()) {
    const p = legPath(g, from, cp);
    if (typeof p === "string") return `leg ${k + 1} (${from.x},${from.z})→(${cp.x},${cp.z}): ${p}`;
    // the nav's cell centres, then the checkpoint's own centre (it is a cell centre too)
    out.push(...p.slice(1));
    from = cp;
  }
  return out;
}

/**
 * Run the course: one player in a world with no AI, placed in the start ring, armed, then driven by
 * the bot along the route. The room's own runtime (`StreetRuns`) keeps the clock and counts the
 * checkpoints, so what is proved is what the room will count. `run` is injected (the runtime lives in
 * runs.ts, which imports this file).
 */
export function proveCourse(
  level: LevelDef,
  course: Pick<StreetRunCourse, "start" | "checkpoints">,
  route: readonly Vec3[],
  maxTicks: number,
  run: (world: World) => { finished: number | null; reached: number; restarted: boolean },
): CourseProof {
  const world = new World(level, { ai: false, seed: 1, wakePhase: "off", pvp: false });
  const p = world.addPlayer(1, "PROOF");
  p.pos.x = course.start.x;
  p.pos.y = course.start.y + 0.02;
  p.pos.z = course.start.z;
  const bot = new CourseBot(route);
  const armTicks = Math.ceil(STREET_RUN.armSeconds * SIM_HZ) + 2;
  const first = route[1] ?? route[0]!;
  const yaw0 = Math.atan2(-(first.x - p.pos.x), -(first.z - p.pos.z));
  let reached = 0;
  for (let t = 0; t < maxTicks + armTicks; t++) {
    const input = t < armTicks ? { tick: world.tick, buttons: 0, yaw: yaw0, pitch: 0 } : bot.input(world.tick, p);
    world.step(new Map([[1, input]]), { silent: true });
    world.drainEvents();
    const r = run(world);
    reached = r.reached;
    if (r.restarted) return { ok: false, ticks: t, reached, reason: "the route re-armed its own start" };
    if (r.finished !== null) return { ok: true, ticks: r.finished, reached, reason: "" };
    if (!p.alive) return { ok: false, ticks: t, reached, reason: "the runner died" };
    if (bot.stalled > 4 * SIM_HZ) return { ok: false, ticks: t, reached, reason: `stuck at (${p.pos.x.toFixed(1)}, ${p.pos.y.toFixed(1)}, ${p.pos.z.toFixed(1)})` };
  }
  return { ok: false, ticks: maxTicks, reached, reason: "out of time" };
}

// ---- building a slot's course ----

export interface CoursePlan {
  start: RunPoint;
  checkpoints: RunPoint[];
}

interface Ctx {
  level: LevelDef;
  g: CourseNavs;
  cands: RunPoint[];
  seed: number;
  half: number;
}

/**
 * The cells a Blank can get to from `from` AND get back from, by the legs' rules (a climb up to the
 * mantle window, a drop no further than a stall roof). A checkpoint off this set is one a runner could
 * reach and never leave, or never reach.
 */
export function roundTrip(g: NavGrid, from: { x: number; z: number }): Uint8Array {
  const a = nearestCell(g, from.x, from.z);
  const both = new Uint8Array(g.w * g.h);
  if (!a) return both;
  const sweep = (reverse: boolean): Uint8Array => {
    const seen = new Uint8Array(g.w * g.h);
    const q = [a.j * g.w + a.i];
    seen[q[0]!] = 1;
    for (let head = 0; head < q.length; head++) {
      const cur = q[head]!;
      const ci = cur % g.w, cj = (cur - ci) / g.w;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = ci + di, nj = cj + dj;
        if (!walkable(g, ni, nj)) continue;
        const n = nj * g.w + ni;
        if (seen[n]) continue;
        // the edge walked is cur → n forward, n → cur in reverse
        const up = reverse ? g.top[cur]! - g.top[n]! : g.top[n]! - g.top[cur]!;
        if (up > MOVE.mantleMaxHeight || -up > LEG_DROP) continue;
        seen[n] = 1;
        q.push(n);
      }
    }
    return seen;
  };
  const f = sweep(false), r = sweep(true);
  for (let k = 0; k < both.length; k++) both[k] = f[k]! & r[k]!;
  return both;
}

/** candidates within `within` of `at` that pass `ok`, best first (a raised point about as near counts as nearer) */
const nearest = (cands: readonly RunPoint[], at: { x: number; z: number }, within: number, ok: (c: RunPoint) => boolean, bonus: (c: RunPoint) => number = () => 0): RunPoint[] =>
  cands
    .filter((c) => flat(c, at) <= within && ok(c))
    .map((c) => ({ c, s: flat(c, at) - bonus(c) }))
    .sort((x, y) => x.s - y.s || x.c.x - y.c.x || x.c.z - y.c.z)
    .map((x) => x.c);

/** apart from every point already on the course (a loop's finish is its own start, and is allowed that) */
const apart = (taken: readonly RunPoint[], min: number) => (c: RunPoint) => taken.every((t) => flat(t, c) >= min);

/** a raised point is the movement's reason to exist: prefer it when it is about as close */
const raisedBonus = (c: RunPoint): number => (c.kind === "street" ? 0 : c.kind === "walkway" ? 3 : 8);

/** the first of `options` (at most `tries` of them) with a good leg from `from` */
function firstLeg(g: CourseNavs, from: RunPoint, options: readonly RunPoint[], tries = 6): RunPoint | null {
  for (const o of options.slice(0, tries)) if (typeof legPath(g, from, o) !== "string") return o;
  return null;
}

/**
 * A loop on one side of the district: a ring of ideal points round a centre on that side, each snapped
 * to the nearest standable point with a good leg from the one before (a raised point if it is about
 * as near), and back to its own start.
 */
function planLoop(c: Ctx, side: -1 | 1, attempt: number): CoursePlan | string {
  const h = (salt: number) => cityHash(c.seed, attempt, salt);
  const H = c.half;
  const centre = { x: side * H * (0.36 + 0.14 * h(1)), z: H * (h(2) - 0.5) * 0.7 };
  const radius = H * (0.26 + 0.12 * h(3));
  const n = 6 + Math.floor(h(4) * 3); // 6..8 checkpoints, the last back at the start
  const a0 = h(5) * Math.PI * 2;
  const dir = h(6) < 0.5 ? 1 : -1;
  const onSide = (p: RunPoint) => p.x * side > 3;
  const ideal = (k: number) => {
    const a = a0 + (dir * k * Math.PI * 2) / n;
    return { x: centre.x + Math.cos(a) * radius, z: centre.z + Math.sin(a) * radius };
  };
  const start = nearest(c.cands, ideal(0), 12, (p) => p.kind === "street" && onSide(p))[0];
  if (!start) return "no street for the start";
  const cps: RunPoint[] = [];
  let from = start;
  for (let k = 1; k < n; k++) {
    const last = k === n - 1;
    // within 11 m of the ideal point; where the side is all tower footprint (RELAY HEIGHTS' west) and
    // nothing stands that near, the search widens to 16 m, then 22 m (Stage 703)
    const near = (r: number) => nearest(c.cands, ideal(k), r, (p) => onSide(p) && apart([start, ...cps], 10)(p), raisedBonus);
    let options = near(11);
    if (!options.length) options = near(16);
    if (!options.length) options = near(22);
    // the last one must also have a way home
    const pick = last ? options.slice(0, 6).find((o) => typeof legPath(c.g, from, o) !== "string" && typeof legPath(c.g, o, start) !== "string") ?? null : firstLeg(c.g, from, options);
    if (!pick) return `no point ${k} near (${ideal(k).x.toFixed(0)}, ${ideal(k).z.toFixed(0)}) with a leg from the last`;
    cps.push(pick);
    from = pick;
  }
  cps.push(start);
  return { start, checkpoints: cps };
}

/**
 * The HIGH LINE: from the street near one end of the walkway, up its stair, three or four checkpoints
 * along its top, down at the far end (the nearest way down), and one more in the street beyond.
 */
function planHighLine(c: Ctx, attempt: number): CoursePlan | string {
  const h = (salt: number) => cityHash(c.seed, attempt, salt);
  const walk = c.cands.filter((p) => p.kind === "walkway");
  if (walk.length < 3) return "no walkway";
  // the walkway's axis: the way its points spread
  const xs = walk.map((p) => p.x), zs = walk.map((p) => p.z);
  const spanX = Math.max(...xs) - Math.min(...xs), spanZ = Math.max(...zs) - Math.min(...zs);
  const alongX = spanX >= spanZ;
  const lo = alongX ? Math.min(...xs) : Math.min(...zs);
  const hi = alongX ? Math.max(...xs) : Math.max(...zs);
  const line = (alongX ? zs : xs).reduce((a, b) => a + b, 0) / walk.length;
  const fwd = h(1) < 0.5 ? 1 : -1;
  const from0 = fwd > 0 ? lo : hi;
  const len = hi - lo;
  const at = (s: number, lateral = 0) => (alongX ? { x: from0 + fwd * s, z: line + lateral } : { x: line + lateral, z: from0 + fwd * s });
  const offLine = (p: RunPoint) => Math.abs((alongX ? p.z : p.x) - line);
  // up on it: three or four points along its top, from a tenth of the way to nine tenths
  const m = 3 + Math.floor(h(3) * 2);
  const up: RunPoint[] = [];
  for (let k = 0; k < m; k++) {
    const s = len * (0.1 + (0.8 * k) / (m - 1)) + (h(10 + k) - 0.5) * 6;
    const pick = nearest(walk, at(s), 6, apart(up, 14))[0];
    if (!pick) return `no walkway point ${k}`;
    up.push(pick);
  }
  for (let k = 1; k < up.length; k++) if (typeof legPath(c.g, up[k - 1]!, up[k]!) === "string") return `the walkway is broken between points ${k} and ${k + 1}`;
  // the start: in the street near the first end, with a way up (the nearest few, one of them by the seed)
  const starts = nearest(c.cands, at(0), 24, (p) => p.kind === "street" && offLine(p) > 4 && flat(p, up[0]!) >= 10)
    .slice(0, 12)
    .filter((p) => typeof legPath(c.g, p, up[0]!) !== "string");
  if (!starts.length) return "no start with a way up";
  const start = starts[Math.floor(h(2) * Math.min(3, starts.length))]!;
  // down: off the walkway near its far end, by whichever way is shortest from the last point on top
  const downs = nearest(c.cands, at(len), 26, (p) => p.kind !== "walkway" && offLine(p) > 4 && apart([start, ...up], 10)(p))
    .slice(0, 16)
    .map((p) => ({ p, leg: legPath(c.g, up[up.length - 1]!, p) }))
    .filter((x): x is { p: RunPoint; leg: Vec3[] } => typeof x.leg !== "string")
    .map((x) => ({ p: x.p, d: routeLength(x.leg) }))
    .sort((a, b) => a.d - b.d || a.p.x - b.p.x || a.p.z - b.p.z);
  if (!downs.length) return "no way down";
  const down = downs[Math.floor(h(4) * Math.min(3, downs.length))]!.p;
  // and one more in the street, away from the walkway
  const onward = c.cands
    .filter((p) => p.kind === "street" && flat(p, down) >= 14 && flat(p, down) <= 28 && offLine(p) > 8 && apart([start, ...up, down], 12)(p))
    .sort((a, b) => cityHash(c.seed, attempt, Math.round(a.x * 7 + a.z * 13)) - cityHash(c.seed, attempt, Math.round(b.x * 7 + b.z * 13)) || a.x - b.x || a.z - b.z);
  const last = firstLeg(c.g, down, onward, 8);
  if (!last) return "no street beyond the way down";
  return { start, checkpoints: [...up, down, last] };
}

/** A four-character digest of a course's points (FNV-1a over their centimetres). */
export function courseSig(start: RunPoint, checkpoints: readonly RunPoint[]): string {
  let h = 0x811c9dc5;
  for (const p of [start, ...checkpoints]) {
    for (const n of [p.x, p.y, p.z]) {
      h ^= Math.round(n * 100) & 0xffff;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(36);
}

export interface CourseGenOptions {
  /** candidates tried per slot before the slot is given up */
  attempts?: number;
  /** the runtime that judges the proof (runs.ts passes its own) */
  judge: (course: Pick<StreetRunCourse, "start" | "checkpoints">) => (world: World) => { finished: number | null; reached: number; restarted: boolean };
  /** told why each candidate was rejected (the tests read it) */
  onReject?: (slot: number, attempt: number, why: string) => void;
  /** shown each plan that reached the proof, with its route (the tests read it) */
  onPlan?: (slot: number, attempt: number, plan: CoursePlan, route: readonly Vec3[]) => void;
}

/**
 * The district's courses: one per slot, the first candidate (in the slot's deterministic order) that
 * has a nav path for every leg and that the proving bot finishes within the bound. A slot with no
 * such candidate is left out.
 */
export function generateCourses(level: LevelDef, district: string, opts: CourseGenOptions, g: CourseNavs = courseNavs(level)): StreetRunCourse[] {
  // only where a runner can get to from the street and get back from: the street's points on the
  // street's nav, the walkway's on the walkway's
  const home = level.spawns[0]?.pos ?? v3(0, 0, 0);
  const inTrip = (nav: NavGrid) => {
    const trip = roundTrip(nav, home);
    return (p: RunPoint) => {
      const k = nearestCell(nav, p.x, p.z);
      return !!k && trip[k.j * nav.w + k.i] === 1;
    };
  };
  const cands = [...runCandidates(g.street).filter(inTrip(g.street)), ...runCandidates(g.high).filter((p) => p.kind === "walkway").filter(inTrip(g.high))];
  const slots = STREET_RUN_COURSES.filter((s) => s.district === district);
  const out: StreetRunCourse[] = [];
  for (const slot of slots) {
    const c: Ctx = { level, g, cands, seed: (level.skylineSeed ?? 1) * 31 + slot.slot * 7919, half: level.bounds ?? 54 };
    for (let attempt = 0; attempt < (opts.attempts ?? 24); attempt++) {
      const plan = slot.slot === 0 ? planHighLine(c, attempt) : planLoop(c, slot.slot === 1 ? -1 : 1, attempt);
      const reject = (why: string) => opts.onReject?.(slot.slot, attempt, why);
      if (typeof plan === "string") {
        reject(plan);
        continue;
      }
      if (plan.checkpoints.length < STREET_RUN.minCheckpoints || plan.checkpoints.length > STREET_RUN.maxCheckpoints) {
        reject(`${plan.checkpoints.length} checkpoints`);
        continue;
      }
      const route = courseRoute(g, plan.start, plan.checkpoints);
      if (typeof route === "string") {
        reject(route);
        continue;
      }
      opts.onPlan?.(slot.slot, attempt, plan, route);
      const length = routeLength(route);
      const bound = Math.ceil((length / MOVE.sprintSpeed) * STREET_RUN.proofSlack * SIM_HZ) + 2 * SIM_HZ;
      const proof = proveCourse(level, plan, route, bound, opts.judge(plan));
      if (!proof.ok) {
        reject(`the bot did not finish: ${proof.reason} (${proof.reached}/${plan.checkpoints.length})`);
        continue;
      }
      out.push({ id: slot.id, district, slot: slot.slot, name: slot.name, start: plan.start, checkpoints: plan.checkpoints, length: Math.round(length * 10) / 10, par: proof.ticks, sig: courseSig(plan.start, plan.checkpoints) });
      break;
    }
  }
  return out;
}
