/**
 * Street runs: the clock and the leaderboard (Stage 703).
 *
 * The room keeps the clock. A runner stands a second in a course's start ring and the run is armed;
 * the tick they step out of it, it starts. Every tick after, the room looks at where the sim put
 * them (`atPoint`, `shared/city/courses.ts`) and counts the NEXT checkpoint only — the one after it,
 * reached first, is not counted, and neither is anything the client says. The finish is the last
 * checkpoint; the time is ticks, from the room's own counter. A death, a runner who leaves the room
 * or the course, or a run past its limit is void.
 *
 * The leaderboard is the district's (one city room serves one district): per course, each file's
 * best run with its splits, fastest first. A file's splits are what the HUD measures the next run
 * against. The room holds it; a host that can keep it (the campaign Worker's Durable Object storage)
 * is given it to save.
 *
 * This module knows player ids and the keys a caller gives it for them, never files or rewards (the
 * room decides what a finish is worth, `shared/city/reward.ts`). It imports nothing from the
 * campaign, the economy or the chain, and no PvP room loads it.
 */
import { SIM_HZ } from "../sim/constants";
import type { LevelDef } from "../sim/level";
import type { World } from "../sim/world";
import { atPoint, generateCourses, STREET_RUN, type StreetRunCourse } from "./courses";

export type RunState = "armed" | "running";

export interface ActiveRun {
  course: StreetRunCourse;
  playerId: number;
  /** the caller's key for the runner when the run was armed (a file id), or null for a guest */
  key: string | null;
  state: RunState;
  /** the tick the runner left the start ring (running) */
  startTick: number;
  /** index of the checkpoint to take next */
  next: number;
  /** ticks from the start at each checkpoint taken */
  splits: number[];
}

export type RunNotice =
  | { type: "armed"; run: ActiveRun }
  | { type: "start"; run: ActiveRun }
  | { type: "split"; run: ActiveRun; index: number; ticks: number }
  | { type: "finish"; run: ActiveRun; ticks: number }
  | { type: "void"; run: ActiveRun; reason: string };

/** ticks → seconds, to the millisecond */
export const runSeconds = (ticks: number): number => Math.round((ticks / SIM_HZ) * 1000) / 1000;

/** the ticks after which a running course is void */
export const runLimit = (course: StreetRunCourse): number => Math.max(Math.round(course.par * STREET_RUN.limitFactor), course.par + STREET_RUN.limitExtraSeconds * SIM_HZ);

/**
 * The runs in one room. The room steps it after every tick and reads what it says happened; nothing
 * a client sends reaches it.
 */
export class StreetRuns {
  /** player id → the run it is armed for or running */
  readonly runs = new Map<number, ActiveRun>();
  /** player id → ticks stood in a start ring (which course's) */
  private inRing = new Map<number, { course: string; ticks: number }>();

  constructor(readonly courses: readonly StreetRunCourse[]) {}

  /** the start ring a runner is standing in, if any */
  ringAt(p: { pos: { x: number; y: number; z: number }; grounded: boolean }): StreetRunCourse | null {
    for (const c of this.courses) if (atPoint(c.start, p)) return c;
    return null;
  }

  /**
   * One tick, after the world stepped. `keyOf` names a player (the room passes its file id); a run
   * whose seat has changed hands since it was armed is void.
   */
  step(world: World, keyOf: (playerId: number) => string | null = () => null): RunNotice[] {
    const out: RunNotice[] = [];
    // a runner gone from the room takes its run with it
    for (const [id, r] of this.runs) {
      if (!world.players.has(id)) {
        this.runs.delete(id);
        out.push({ type: "void", run: r, reason: "LEFT THE CITY" });
      }
    }
    for (const id of [...this.inRing.keys()]) if (!world.players.has(id)) this.inRing.delete(id);
    for (const p of world.players.values()) {
      const run = this.runs.get(p.id);
      if (run && keyOf(p.id) !== run.key) {
        this.runs.delete(p.id);
        out.push({ type: "void", run, reason: "THE SEAT CHANGED HANDS" });
        continue;
      }
      if (!p.alive) {
        this.inRing.delete(p.id);
        if (run) {
          this.runs.delete(p.id);
          out.push({ type: "void", run, reason: "DOWNED" });
        }
        continue;
      }
      // still loading in: not on the street yet (Stage 699)
      if (world.arriving.has(p.id)) continue;
      let live: ActiveRun | undefined = run;
      if (live?.state === "running") {
        // the next checkpoint, and only the next: one further on reached first is not counted
        const ticks = world.tick - live.startTick;
        const cp = live.course.checkpoints[live.next]!;
        if (atPoint(cp, p)) {
          live.splits.push(ticks);
          const index = live.next++;
          if (live.next >= live.course.checkpoints.length) {
            this.runs.delete(p.id);
            out.push({ type: "finish", run: live, ticks });
          } else out.push({ type: "split", run: live, index, ticks });
          continue;
        }
        const why = ticks > runLimit(live.course) ? "OUT OF TIME" : Math.hypot(p.pos.x - cp.x, p.pos.z - cp.z) > STREET_RUN.offCourse ? "OFF THE COURSE" : null;
        if (why) {
          this.runs.delete(p.id);
          out.push({ type: "void", run: live, reason: why });
          live = undefined;
        }
      }
      // the start rings: a second in one arms its course (a runner already running may re-arm only its own: a restart)
      const ring = this.ringAt(p);
      if (ring && (!live || live.course.id === ring.id)) {
        const was = this.inRing.get(p.id);
        const ticks = was && was.course === ring.id ? was.ticks + 1 : 1;
        this.inRing.set(p.id, { course: ring.id, ticks });
        if (ticks === Math.ceil(STREET_RUN.armSeconds * SIM_HZ) && live?.state !== "armed") {
          const armed: ActiveRun = { course: ring, playerId: p.id, key: keyOf(p.id), state: "armed", startTick: -1, next: 0, splits: [] };
          this.runs.set(p.id, armed);
          out.push({ type: "armed", run: armed });
        }
        continue;
      }
      this.inRing.delete(p.id);
      if (live?.state === "armed") {
        // out of the ring: GO. The clock starts on this tick.
        live.state = "running";
        live.startTick = world.tick;
        out.push({ type: "start", run: live });
      }
    }
    return out;
  }
}

// ---- the courses a district has, built once per process ----

const built = new Map<string, StreetRunCourse[]>();

/** A proof judge: a StreetRuns over the one course, reporting on player 1. */
export function judge(course: Pick<StreetRunCourse, "start" | "checkpoints">) {
  const full: StreetRunCourse = { id: "proof", district: "", slot: -1, name: "PROOF", length: 0, par: 1e9, sig: "", ...course };
  const runs = new StreetRuns([full]);
  let finished: number | null = null;
  let reached = 0;
  let restarted = false;
  let started = false;
  return (world: World) => {
    for (const n of runs.step(world, () => null)) {
      if (n.type === "start") started = true;
      if (n.type === "armed" && started) restarted = true;
      if (n.type === "split") reached = n.index + 1;
      if (n.type === "finish") {
        finished = n.ticks;
        reached = course.checkpoints.length;
      }
    }
    return { finished, reached, restarted };
  };
}

/**
 * A district's courses: generated and proved the first time they are asked for in this process, then
 * kept. Deterministic, so every process builds the same ones.
 */
export function streetRunsFor(level: LevelDef, district: string): StreetRunCourse[] {
  let c = built.get(district);
  if (!c) {
    c = generateCourses(level, district, { judge });
    built.set(district, c);
  }
  return c;
}

// ---- the leaderboard ----

export interface BoardEntry {
  /** the file (a board never holds a guest) */
  key: string;
  name: string;
  ticks: number;
  splits: number[];
  /** when it was run (the host's clock, ms): a tie goes to whoever ran it first */
  at: number;
}

/** What a host keeps of a district's board. */
export interface BoardData {
  v: 1;
  district: string;
  /** course id → its signature and entries (a course re-shaped since is not the same course) */
  courses: Record<string, { sig: string; entries: BoardEntry[] }>;
}

/** entries kept per course (the HUD shows the first five) */
export const BOARD_KEEP = 50;

const byTime = (a: BoardEntry, b: BoardEntry): number => a.ticks - b.ticks || a.at - b.at || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** The district's leaderboard: each file's best per course, fastest first. */
export class RunBoard {
  private boards = new Map<string, BoardEntry[]>();

  constructor(readonly district: string, readonly courses: readonly StreetRunCourse[]) {
    for (const c of courses) this.boards.set(c.id, []);
  }

  /** Post a finish. Returns the file's place (1-based) and whether it beat its own best; a slower run changes nothing. */
  post(courseId: string, e: BoardEntry): { rank: number; best: boolean; previous: BoardEntry | null } {
    const list = this.boards.get(courseId);
    if (!list) return { rank: 0, best: false, previous: null };
    const i = list.findIndex((x) => x.key === e.key);
    const previous = i >= 0 ? { ...list[i]!, splits: list[i]!.splits.slice() } : null;
    if (previous && byTime(previous, e) <= 0) return { rank: i + 1, best: false, previous };
    if (i >= 0) list.splice(i, 1);
    list.push({ ...e, splits: e.splits.slice() });
    list.sort(byTime);
    if (list.length > BOARD_KEEP) list.length = BOARD_KEEP;
    const rank = list.findIndex((x) => x.key === e.key) + 1;
    return { rank, best: rank > 0, previous };
  }

  /** the course's board, fastest first */
  top(courseId: string, n = 5): BoardEntry[] {
    return (this.boards.get(courseId) ?? []).slice(0, n);
  }

  /** a file's best run on a course, if it is on the board */
  bestOf(courseId: string, key: string | null): BoardEntry | null {
    if (!key) return null;
    return this.boards.get(courseId)?.find((x) => x.key === key) ?? null;
  }

  /** how many files are on a course's board */
  size(courseId: string): number {
    return this.boards.get(courseId)?.length ?? 0;
  }

  save(): BoardData {
    const courses: BoardData["courses"] = {};
    for (const c of this.courses) courses[c.id] = { sig: c.sig, entries: (this.boards.get(c.id) ?? []).map((e) => ({ ...e, splits: e.splits.slice() })) };
    return { v: 1, district: this.district, courses };
  }

  /**
   * Take in what a host kept: another district's board, a course whose shape has changed since, and an
   * entry that does not add up are left out; an entry for a file already on the board keeps the faster.
   */
  load(data: unknown): number {
    const d = data as Partial<BoardData> | null;
    if (!d || d.v !== 1 || d.district !== this.district || typeof d.courses !== "object" || !d.courses) return 0;
    let n = 0;
    for (const c of this.courses) {
      const kept = (d.courses as BoardData["courses"])[c.id];
      if (!kept || kept.sig !== c.sig || !Array.isArray(kept.entries)) continue;
      for (const e of kept.entries) {
        const sane = e && typeof e.key === "string" && typeof e.name === "string" && Number.isInteger(e.ticks) && e.ticks > 0 && Array.isArray(e.splits) && e.splits.length === c.checkpoints.length && e.splits[e.splits.length - 1] === e.ticks && typeof e.at === "number";
        if (!sane) continue;
        this.post(c.id, { key: e.key, name: e.name, ticks: e.ticks, splits: e.splits.map(Number), at: e.at });
        n++;
      }
    }
    return n;
  }
}
