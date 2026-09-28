/**
 * Street runs (Stage 703): movement time trials through the city, generated from each district's own
 * geometry and proved by a bot that sprints them through the movement sim. The room keeps the clock
 * from where the sim put the runner, counts the next checkpoint and only the next, posts a finish to
 * the district's own board, and credits a course's first finish once. Nothing a client sends can set
 * a time, and no room but a city's ever runs a course.
 */
import { describe, expect, it } from "vitest";
import { Room, type Conn } from "../server/room";
import { createCityRoom, type RunBoardStore } from "../server/city-room";
import { createCampaignRoom } from "../server/campaign-room";
import { MemoryAccountStore } from "../server/accounts";
import { createAccount } from "../shared/progression/account";
import { decodeServerMessage, encodeCityRun, encodeInputs, encodeJoin, encodeTerminal, Msg, PROTOCOL_VERSION, type CityRunMsg } from "../shared/net/protocol";
import { atPoint, courseNavs, courseRoute, CourseBot, generateCourses, proveCourse, STREET_RUN, type RunPoint, type StreetRunCourse } from "../shared/city/courses";
import { BOARD_KEEP, judge, RunBoard, runLimit, runSeconds, streetRunsFor, StreetRuns, type RunNotice } from "../shared/city/runs";
import { creditStreetRun, STREET_RUN_XP } from "../shared/city/reward";
import { STAMPS, STREET_RUN_COURSES, stampById } from "../shared/progression/stamps";
import { CITY_DISTRICTS } from "../shared/net/city";
import { levelById, levelDisplayName } from "../shared/sim/level";
import { World } from "../shared/sim/world";
import { MOVE, SIM_HZ } from "../shared/sim/constants";
import { runCard, runClock, runDelta, runObjective, startPrompt } from "../client/cityrun";
import { reachable } from "./helpers/imports";

const LOADOUT = JSON.stringify({ primary: "lease_breaker", secondary: "shock_baton", attested: [] });
const ARM = Math.ceil(STREET_RUN.armSeconds * SIM_HZ);

function conn() {
  const msgs: ReturnType<typeof decodeServerMessage>[] = [];
  const c: Conn = { send: (buf) => msgs.push(decodeServerMessage(buf, () => null)), close: () => {} };
  return { c, msgs };
}
const idOf = (msgs: ReturnType<typeof decodeServerMessage>[]): number => {
  for (const m of msgs) if (m?.type === "welcome") return m.playerId;
  return -1;
};
const runMsgs = (msgs: ReturnType<typeof decodeServerMessage>[]): CityRunMsg[] => msgs.flatMap((m) => (m?.type === "cityRun" ? [m.cityRun] : []));

type Body = { pos: { x: number; y: number; z: number }; vel: { x: number; y: number; z: number }; grounded: boolean; alive: boolean; health: number };
/** put a runner somewhere, standing, as the sim would have carried it there */
function put(p: Body, at: { x: number; y: number; z: number }) {
  p.pos.x = at.x;
  p.pos.y = at.y;
  p.pos.z = at.z;
  p.vel.x = p.vel.y = p.vel.z = 0;
  p.grounded = true;
  if (p.alive) p.health = 100;
}
/** somewhere in the street well away from `c`'s start and first checkpoint, but on the course's side (not off it) */
const aside = (c: StreetRunCourse): RunPoint => {
  const s = c.start;
  const cp = c.checkpoints[0]!;
  const dx = s.x - cp.x, dz = s.z - cp.z, d = Math.hypot(dx, dz) || 1;
  return { x: s.x + (dx / d) * 6, y: s.y, z: s.z + (dz / d) * 6, kind: "street" };
};

// the courses are proved once per process; every test below reads the same ones
const COURSES = new Map(CITY_DISTRICTS.map((d) => [d, streetRunsFor(levelById(d), d)]));
const course = (district: string, slot: number) => COURSES.get(district)!.find((c) => c.slot === slot)!;

describe("the courses are the district's own, and the same every time", () => {
  it("every walkable district has all three: a HIGH LINE up on the walkway and a loop on each side, 5 to 10 checkpoints each", () => {
    expect(STREET_RUN_COURSES.map((c) => c.district).filter((d, i, a) => a.indexOf(d) === i)).toEqual([...CITY_DISTRICTS]);
    for (const d of CITY_DISTRICTS) {
      const cs = COURSES.get(d)!;
      expect(cs.map((c) => c.id)).toEqual([`${d}:0`, `${d}:1`, `${d}:2`]);
      expect(cs.map((c) => c.name)).toEqual(["HIGH LINE", "WEST LOOP", "EAST LOOP"]);
      for (const c of cs) {
        expect(c.checkpoints.length, c.id).toBeGreaterThanOrEqual(STREET_RUN.minCheckpoints);
        expect(c.checkpoints.length, c.id).toBeLessThanOrEqual(STREET_RUN.maxCheckpoints);
        expect(c.start.kind).toBe("street");
      }
      const high = cs[0]!;
      expect(high.checkpoints.filter((p) => p.kind === "walkway").length, `${d} HIGH LINE`).toBeGreaterThanOrEqual(3);
      expect(high.checkpoints.at(-1)!.kind).not.toBe("walkway");
      // a loop comes back to its own start, and stays on its own side of the district
      for (const [slot, side] of [[1, -1], [2, 1]] as const) {
        const loop = cs[slot]!;
        expect(loop.checkpoints.at(-1)).toEqual(loop.start);
        for (const p of [loop.start, ...loop.checkpoints]) expect(p.x * side, `${loop.id}`).toBeGreaterThan(3);
      }
    }
  });

  it("every point stands on the district's geometry: a street point on the street, a raised one on a box's top", () => {
    for (const d of CITY_DISTRICTS) {
      const level = levelById(d);
      for (const c of COURSES.get(d)!) {
        for (const p of [c.start, ...c.checkpoints]) {
          const under = level.boxes.filter((b) => p.x >= b.min.x && p.x <= b.max.x && p.z >= b.min.z && p.z <= b.max.z && Math.abs(b.max.y - p.y) < 0.02);
          expect(under.length, `${c.id} (${p.x}, ${p.y}, ${p.z})`).toBeGreaterThan(0);
          if (p.kind === "walkway") expect(under.some((b) => b.tag === "walkway" || b.tag === "landing")).toBe(true);
        }
      }
    }
  });

  it("generating again builds the same courses to the centimetre, and the same par to the tick", { timeout: 60_000 }, () => {
    for (const d of CITY_DISTRICTS) expect(generateCourses(levelById(d), d, { judge })).toEqual(COURSES.get(d));
    // and the memo is that one result
    expect(streetRunsFor(levelById("repo_depot"), "repo_depot")).toBe(COURSES.get("repo_depot"));
  });
});

describe("a bot proves every course at a sprint", () => {
  it("each course, run again from its start by the sprinting bot through the movement sim, finishes in its par, inside the bound", { timeout: 60_000 }, () => {
    for (const d of CITY_DISTRICTS) {
      const level = levelById(d);
      const navs = courseNavs(level);
      for (const c of COURSES.get(d)!) {
        const route = courseRoute(navs, c.start, c.checkpoints);
        expect(typeof route, c.id).not.toBe("string");
        const bound = Math.ceil((c.length / MOVE.sprintSpeed) * STREET_RUN.proofSlack * SIM_HZ) + 2 * SIM_HZ;
        const proof = proveCourse(level, c, route as never, bound, judge(c));
        expect(proof, c.id).toMatchObject({ ok: true, reached: c.checkpoints.length });
        expect(proof.ticks).toBe(c.par);
        expect(proof.ticks).toBeLessThanOrEqual(bound);
        // a par is a sprint's, not a walk's: faster than walking the route, slower than the speed of light
        expect(runSeconds(c.par)).toBeLessThan(c.length / MOVE.walkSpeed);
        expect(runSeconds(c.par)).toBeGreaterThan(c.length / MOVE.slideMaxSpeed);
      }
    }
  });

  it("a course the bot cannot finish is thrown away: a judge that never counts the finish leaves no course at all", () => {
    const level = levelById("repo_depot");
    const why: string[] = [];
    const none = generateCourses(level, "repo_depot", { judge: () => () => ({ finished: null, reached: 0, restarted: false }), attempts: 2, onReject: (_s, _a, w) => why.push(w) });
    expect(none).toEqual([]);
    expect(why.some((w) => w.startsWith("the bot did not finish"))).toBe(true);
  });

  it("a checkpoint moved inside a building fails the proof", () => {
    const level = levelById("repo_depot");
    const c = course("repo_depot", 2);
    const tower = level.boxes.find((b) => b.tag === "building" && b.max.x - b.min.x > 8)!;
    const inside: RunPoint = { x: (tower.min.x + tower.max.x) / 2, y: 0, z: (tower.min.z + tower.max.z) / 2, kind: "street" };
    const bad = { start: c.start, checkpoints: [c.checkpoints[0]!, inside, ...c.checkpoints.slice(1)] };
    const route = courseRoute(courseNavs(level), bad.start, bad.checkpoints);
    // the nav has no way there, or the bot never gets there
    if (typeof route !== "string") expect(proveCourse(level, bad, route, 60 * SIM_HZ, judge(bad)).ok).toBe(false);
    else expect(route).toMatch(/no path|wanders/);
  });
});

describe("the checkpoints count in order, from where the sim put the runner", () => {
  function track(district = "repo_depot", slot = 2) {
    const world = new World(levelById(district), { ai: false, seed: 1, wakePhase: "off", pvp: false });
    const p = world.addPlayer(1, "ALPHA");
    const c = course(district, slot);
    const runs = new StreetRuns([c]);
    const seen: RunNotice[] = [];
    const tick = (n = 1, at?: { x: number; y: number; z: number }) => {
      for (let i = 0; i < n; i++) {
        if (at) put(p, at);
        world.step(new Map(), { online: true });
        seen.push(...runs.step(world, () => "file-a"));
      }
    };
    return { world, p, c, runs, seen, tick };
  }

  it("a second in the ring arms it; the clock starts the tick the runner steps out", () => {
    const { c, seen, tick, world } = track();
    tick(ARM - 1, c.start);
    expect(seen).toEqual([]);
    tick(1, c.start);
    expect(seen.map((n) => n.type)).toEqual(["armed"]);
    tick(30, c.start); // standing in it longer arms nothing more and starts nothing
    expect(seen.map((n) => n.type)).toEqual(["armed"]);
    tick(1, aside(c));
    expect(seen.map((n) => n.type)).toEqual(["armed", "start"]);
    expect(seen[1]!.run.startTick).toBe(world.tick);
  });

  it("running through a ring without stopping arms nothing", () => {
    const { c, seen, tick } = track();
    tick(ARM - 2, c.start);
    tick(20, aside(c));
    expect(seen).toEqual([]);
  });

  it("skipping a checkpoint does not count the one after it; taking them in order does, and the finish is the last", () => {
    const { c, seen, tick } = track();
    tick(ARM, c.start);
    tick(1, aside(c));
    // straight to the second: nothing
    tick(10, c.checkpoints[1]!);
    expect(seen.filter((n) => n.type === "split")).toEqual([]);
    // the first, then the second
    tick(5, c.checkpoints[0]!);
    tick(5, c.checkpoints[1]!);
    expect(seen.filter((n) => n.type === "split").map((n) => (n as { index: number }).index)).toEqual([0, 1]);
    // the finish, skipping the rest: nothing
    tick(5, c.checkpoints.at(-1)!);
    expect(seen.some((n) => n.type === "finish")).toBe(false);
    for (const cp of c.checkpoints.slice(2)) tick(3, cp);
    const fin = seen.find((n) => n.type === "finish") as Extract<RunNotice, { type: "finish" }>;
    expect(fin).toBeDefined();
    expect(fin.run.splits.length).toBe(c.checkpoints.length);
    expect(fin.ticks).toBe(fin.run.splits.at(-1));
  });

  it("a raised checkpoint counts only standing on it: not from the street below, not in the air beside it", () => {
    const c = course("repo_depot", 0);
    const up = c.checkpoints.find((p) => p.kind === "walkway")!;
    const body = (y: number, grounded: boolean) => ({ pos: { x: up.x, y, z: up.z }, grounded });
    expect(atPoint(up, body(up.y, true))).toBe(true);
    expect(atPoint(up, body(0, true))).toBe(false); // the street under the walkway
    expect(atPoint(up, body(up.y + 0.2, false))).toBe(false); // a jump past it
    expect(atPoint(up, { pos: { x: up.x + STREET_RUN.radius + 0.1, y: up.y, z: up.z }, grounded: true })).toBe(false);
    // a street point: from the curb to a jump above it, never from the walkway overhead
    const st: RunPoint = { x: 0, y: 0, z: 0, kind: "street" };
    expect(atPoint(st, { pos: { x: 1, y: 0.15, z: 1 }, grounded: true })).toBe(true);
    expect(atPoint(st, { pos: { x: 1, y: 1.2, z: 1 }, grounded: false })).toBe(true);
    expect(atPoint(st, { pos: { x: 1, y: 4.6, z: 1 }, grounded: true })).toBe(false);
  });

  it("a death, the limit, leaving the course or the room, or the seat changing hands voids the run", () => {
    const go = () => {
      const t = track();
      t.tick(ARM, t.c.start);
      t.tick(1, aside(t.c));
      return t;
    };
    const dead = go();
    dead.p.alive = false;
    dead.p.respawnTimer = 3; // as a death leaves it (World.killPlayer)
    dead.tick(1);
    expect(dead.seen.at(-1)).toMatchObject({ type: "void", reason: "DOWNED" });

    const slow = go();
    slow.tick(runLimit(slow.c) + 1, aside(slow.c));
    expect(slow.seen.at(-1)).toMatchObject({ type: "void", reason: "OUT OF TIME" });

    const lost = go();
    const cp = lost.c.checkpoints[0]!;
    lost.tick(1, { x: cp.x + STREET_RUN.offCourse + 5, y: 0, z: cp.z });
    expect(lost.seen.at(-1)).toMatchObject({ type: "void", reason: "OFF THE COURSE" });

    const gone = go();
    gone.world.removePlayer(1);
    gone.world.step(new Map(), { online: true });
    expect(gone.runs.step(gone.world, () => "file-a").at(-1)).toMatchObject({ type: "void", reason: "LEFT THE CITY" });

    const handed = go();
    handed.world.step(new Map(), { online: true });
    expect(handed.runs.step(handed.world, () => "file-b").at(-1)).toMatchObject({ type: "void", reason: "THE SEAT CHANGED HANDS" });
  });

  it("a file still loading in is not on the street: it arms nothing", () => {
    const { c, seen, tick, world } = track();
    world.arriving.add(1);
    tick(ARM * 2, c.start);
    expect(seen).toEqual([]);
  });

  it("a loop's finish is its own start ring: finishing there does not re-arm it, and a second in it afterwards starts the next lap", () => {
    const { c, seen, tick } = track("repo_depot", 1);
    tick(ARM, c.start);
    tick(1, aside(c));
    for (const cp of c.checkpoints) tick(2, cp);
    expect(seen.filter((n) => n.type === "finish").length).toBe(1);
    const after = seen.length;
    tick(ARM, c.start);
    expect(seen.slice(after).map((n) => n.type)).toEqual(["armed"]);
  });
});

describe("the room keeps the clock", () => {
  function city(district = "repo_depot", store: MemoryAccountStore | null = new MemoryAccountStore(createAccount), runBoard?: RunBoardStore) {
    const h = createCityRoom({ district, accounts: store, seed: 7, now: () => 1_000, ...(runBoard ? { runBoard } : {}) });
    const join = (acct: string, name: string) => {
      const x = conn();
      h.room.onOpen(x.c);
      h.room.onMessage(x.c, encodeJoin(name, "", acct, LOADOUT));
      h.room.step();
      const id = idOf(x.msgs);
      // one input ends the arrival grace (Stage 699): the file is on the street
      h.room.onMessage(x.c, encodeInputs([{ seq: 1, tick: h.room.tick, viewTick: h.room.tick, viewFrac: 0, buttons: 0, yaw: 0, pitch: 0, px: 0, py: 0, pz: 0 }], 0));
      h.room.step();
      return { ...x, id, p: h.room.world.players.get(id)! };
    };
    /** run a course by the checkpoints, `gap` ticks apart; returns the ticks the room should count */
    const runIt = (who: { p: Body }, c: StreetRunCourse, gap = 30): number => {
      for (let i = 0; i < ARM; i++) {
        put(who.p, c.start);
        h.room.step();
      }
      put(who.p, aside(c));
      h.room.step(); // the start
      for (const cp of c.checkpoints) {
        for (let i = 0; i < gap - 1; i++) {
          put(who.p, aside(c));
          h.room.step();
        }
        put(who.p, cp);
        h.room.step();
      }
      return gap * c.checkpoints.length;
    };
    return { h, store, join, runIt };
  }

  it("the time is the room's ticks between the start and the finish, told to the runner and posted to the board", () => {
    const { h, join, runIt } = city();
    const a = join("run-a", "ALPHA");
    const c = h.runs.courses[2]!;
    const ticks = runIt(a, c);
    const fin = runMsgs(a.msgs).filter((m) => m.run?.state === "finished").at(-1)!;
    expect(fin.run!.time).toBe(runSeconds(ticks));
    expect(fin.run!.splits).toEqual(c.checkpoints.map((_, i) => runSeconds(30 * (i + 1))));
    expect(fin.run!.rank).toBe(1);
    expect(fin.run!.pb).toBe(true);
    expect(h.board.top(c.id)).toMatchObject([{ key: "run-a", name: "ALPHA", ticks }]);
    expect(h.finishes()).toEqual([{ course: c.id, name: "ALPHA", file: "run-a", time: runSeconds(ticks), rank: 1, xp: STREET_RUN_XP }]);
  });

  it("nothing a client sends sets a time: a forged run message, a forged terminal, inputs that claim to stand on every checkpoint", () => {
    const { h, join } = city();
    const a = join("run-a", "ALPHA");
    const c = h.runs.courses[2]!;
    const forged = encodeCityRun({ run: { course: c.id, state: "finished", next: c.checkpoints.length, elapsed: 0.01, splits: [0.01], deltas: [null], time: 0.01, rank: 1, pb: true } });
    h.room.onMessage(a.c, forged);
    h.room.onMessage(a.c, encodeTerminal({ script: "x", node: "y", choices: ["FINISH"], picked: "FINISH", recall: -1 }));
    // an input claims a position on each checkpoint in turn; the room moves the runner by the sim, not by the claim
    let seq = 2;
    for (const cp of [c.start, ...c.checkpoints]) {
      for (let i = 0; i < 3; i++) {
        h.room.onMessage(a.c, encodeInputs([{ seq: seq++, tick: h.room.tick, viewTick: h.room.tick, viewFrac: 0, buttons: 0, yaw: 0, pitch: 0, px: cp.x, py: cp.y, pz: cp.z }], 0));
        h.room.step();
      }
    }
    expect(h.finishes()).toEqual([]);
    expect(h.board.size(c.id)).toBe(0);
    expect(runMsgs(a.msgs).some((m) => m.run?.state === "finished")).toBe(false);
  });

  it("the runner's splits are measured against its best; a slower run leaves the best and the board alone", () => {
    const { h, join, runIt } = city();
    const a = join("run-a", "ALPHA");
    const c = h.runs.courses[2]!;
    runIt(a, c, 30);
    runIt(a, c, 40);
    const slow = runMsgs(a.msgs).filter((m) => m.run?.state === "finished").at(-1)!.run!;
    expect(slow.pb).toBe(false);
    expect(slow.deltas).toEqual(c.checkpoints.map((_, i) => runSeconds(10 * (i + 1))));
    expect(h.board.top(c.id)[0]!.ticks).toBe(30 * c.checkpoints.length);
    runIt(a, c, 25);
    const fast = runMsgs(a.msgs).filter((m) => m.run?.state === "finished").at(-1)!.run!;
    expect(fast.pb).toBe(true);
    expect(fast.deltas.at(-1)).toBe(runSeconds(-5 * c.checkpoints.length));
    expect(h.board.top(c.id)[0]!.ticks).toBe(25 * c.checkpoints.length);
  });

  it("everyone else hears the finish as a line, and gets the new board", () => {
    const { h, join, runIt } = city();
    const a = join("run-a", "ALPHA");
    const b = join("run-b", "BRAVO");
    const c = h.runs.courses[2]!;
    const ticks = runIt(a, c);
    const feed = runMsgs(b.msgs).find((m) => m.feed)!;
    expect(feed.feed).toBe(`ALPHA RAN ${c.name} IN ${runSeconds(ticks).toFixed(1)}S · THE DISTRICT'S BEST`);
    expect(feed.board!.find((x) => x.course === c.id)!.top).toEqual([{ name: "ALPHA", time: runSeconds(ticks) }]);
    // the runner gets its card, not the line about itself
    expect(runMsgs(a.msgs).some((m) => m.feed)).toBe(false);
  });

  it("the first finish of a course pays once; the next finish of it pays nothing; another course's first pays again", () => {
    const { h, store: kept, join, runIt } = city();
    const store = kept!;
    const a = join("run-a", "ALPHA");
    const [c1, c2] = [h.runs.courses[2]!, h.runs.courses[1]!];
    runIt(a, c1);
    const f = store.accounts.get("run-a")!;
    expect(f.xp).toBe(STREET_RUN_XP);
    expect(f.counters[`streetRun:${c1.id}`]).toBe(1);
    expect(f.stamps).toContain(`street_run:${c1.id}`);
    const first = runMsgs(a.msgs).filter((m) => m.run?.state === "finished").at(-1)!.run!;
    expect(first.reward).toEqual([`STREET RUN · ${c1.name} · ${first.time!.toFixed(3)}S · FIRST FINISH · +${STREET_RUN_XP} XP`]);
    runIt(a, c1, 20);
    expect(store.accounts.get("run-a")!.xp).toBe(STREET_RUN_XP);
    expect(store.accounts.get("run-a")!.counters[`streetRun:${c1.id}`]).toBe(2);
    expect(runMsgs(a.msgs).filter((m) => m.run?.state === "finished").at(-1)!.run!.reward).toBeUndefined();
    runIt(a, c2);
    expect(store.accounts.get("run-a")!.xp).toBe(STREET_RUN_XP * 2);
    expect(h.finishes().map((x) => x.xp)).toEqual([STREET_RUN_XP, 0, STREET_RUN_XP]);
    // money is not on the list
    expect(store.accounts.get("run-a")!.wallet).toEqual(createAccount("y").wallet);
  });

  it("a runner with no file (a host with no file store) is timed and told, and neither posted nor paid", () => {
    const { h, join, runIt } = city("repo_depot", null);
    const g = join("", "GUEST");
    const c = h.runs.courses[2]!;
    runIt(g, c);
    const fin = runMsgs(g.msgs).filter((m) => m.run?.state === "finished").at(-1)!.run!;
    expect(fin.time).toBeGreaterThan(0);
    expect(fin.rank).toBe(0);
    expect(h.board.size(c.id)).toBe(0);
  });

  it("at the door: the district's courses, the board and this file's bests", () => {
    const { h, join, runIt } = city();
    const a = join("run-a", "ALPHA");
    const c = h.runs.courses[2]!;
    runIt(a, c);
    const b = join("run-a2", "BRAVO");
    const door = runMsgs(b.msgs)[0]!;
    expect(door.courses!.map((x) => x.id)).toEqual(h.runs.courses.map((x) => x.id));
    expect(door.courses![2]!.checkpoints.length).toBe(c.checkpoints.length);
    expect(door.courses![2]!.par).toBe(runSeconds(c.par));
    expect(door.board!.find((x) => x.course === c.id)!.top[0]!.name).toBe("ALPHA");
    expect(door.best).toEqual([]);
    expect(door.run).toBeNull();
  });

  it("each district keeps its own board: a finish in one city is on no other's", () => {
    const docks = city("deadletter_docks");
    const depot = city("repo_depot");
    const a = docks.join("run-a", "ALPHA");
    docks.runIt(a, docks.h.runs.courses[1]!);
    expect(docks.h.state().runs.board.some((b) => b.top.length > 0)).toBe(true);
    expect(depot.h.state().runs.board.every((b) => b.top.length === 0)).toBe(true);
    expect(docks.h.state().runs.board.every((b) => b.course.startsWith("deadletter_docks:"))).toBe(true);
    // a board a host kept for one district is not read into another's
    expect(depot.h.board.load(docks.h.board.save())).toBe(0);
  });

  it("a host that keeps the board has it saved on a new best, and read back into the next room", async () => {
    let kept: unknown = null;
    const saves: unknown[] = [];
    const store: RunBoardStore = { load: async () => kept, save: (d) => { kept = JSON.parse(JSON.stringify(d)); saves.push(kept); } };
    const one = city("repo_depot", new MemoryAccountStore(createAccount), store);
    await one.h.boardLoaded;
    const a = one.join("run-a", "ALPHA");
    const c = one.h.runs.courses[2]!;
    one.runIt(a, c);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(saves.length).toBe(1);
    const two = city("repo_depot", new MemoryAccountStore(createAccount), store);
    await two.h.boardLoaded;
    expect(two.h.board.top(c.id)).toMatchObject([{ key: "run-a", name: "ALPHA", ticks: 30 * c.checkpoints.length }]);
  });
});

describe("the board", () => {
  const cs = [course("repo_depot", 2)];
  const id = cs[0]!.id;
  const n = cs[0]!.checkpoints.length;
  const e = (key: string, ticks: number, at = 0) => ({ key, name: key.toUpperCase(), ticks, splits: Array.from({ length: n }, (_, i) => Math.round((ticks * (i + 1)) / n)), at });

  it("fastest first; one entry per file, its best; a tie goes to whoever ran it first", () => {
    const b = new RunBoard("repo_depot", cs);
    expect(b.post(id, e("a", 900, 1))).toMatchObject({ rank: 1, best: true });
    expect(b.post(id, e("b", 800, 2))).toMatchObject({ rank: 1, best: true });
    expect(b.post(id, e("c", 900, 3))).toMatchObject({ rank: 3, best: true });
    expect(b.post(id, e("a", 950, 4))).toMatchObject({ rank: 2, best: false });
    expect(b.top(id).map((x) => [x.key, x.ticks])).toEqual([["b", 800], ["a", 900], ["c", 900]]);
    expect(b.post(id, e("c", 850, 5))).toMatchObject({ rank: 2, best: true });
    expect(b.top(id).map((x) => x.key)).toEqual(["b", "c", "a"]);
    // an equal time is not a better one
    expect(b.post(id, e("b", 800, 6))).toMatchObject({ best: false });
    expect(b.bestOf(id, "b")!.at).toBe(2);
  });

  it("keeps the fastest BOARD_KEEP files; one slower than all of them does not get on", () => {
    const b = new RunBoard("repo_depot", cs);
    for (let i = 0; i < BOARD_KEEP; i++) b.post(id, e(`f${i}`, 1000 + i));
    expect(b.post(id, e("late", 5000))).toMatchObject({ rank: 0, best: false });
    expect(b.size(id)).toBe(BOARD_KEEP);
    expect(b.post(id, e("quick", 10))).toMatchObject({ rank: 1 });
    expect(b.size(id)).toBe(BOARD_KEEP);
    expect(b.bestOf(id, `f${BOARD_KEEP - 1}`)).toBeNull();
  });

  it("what a host kept is read back only for this district's courses as they are, and only entries that add up", () => {
    const b = new RunBoard("repo_depot", cs);
    b.post(id, e("a", 900));
    const data = b.save();
    expect(new RunBoard("repo_depot", cs).load(data)).toBe(1);
    expect(new RunBoard("lease_row", cs).load(data)).toBe(0);
    const reshaped = JSON.parse(JSON.stringify(data));
    reshaped.courses[id].sig = "other";
    expect(new RunBoard("repo_depot", cs).load(reshaped)).toBe(0);
    const liar = JSON.parse(JSON.stringify(data));
    liar.courses[id].entries.push({ key: "z", name: "Z", ticks: 1, splits: [1], at: 0 }, { key: "y", name: "Y", ticks: -5, splits: [], at: 0 });
    expect(new RunBoard("repo_depot", cs).load(liar)).toBe(1);
    expect(new RunBoard("repo_depot", cs).load(null)).toBe(0);
    expect(new RunBoard("repo_depot", cs).load({ v: 2 })).toBe(0);
  });
});

describe("what a finish is worth", () => {
  it("the first finish of each course pays once, ever, and meets its stamp; the rest count", () => {
    const a = createAccount("x");
    const c = { id: "repo_depot:2", name: "EAST LOOP" };
    expect(creditStreetRun(a, c, 21.5)).toMatchObject({ xp: STREET_RUN_XP, first: true });
    expect(creditStreetRun(a, c, 20)).toMatchObject({ xp: 0, first: false, lines: [] });
    expect(a.xp).toBe(STREET_RUN_XP);
    expect(a.counters["streetRun:repo_depot:2"]).toBe(2);
    expect(a.counters["streetRuns"]).toBe(2);
    expect(a.wallet).toEqual(createAccount("y").wallet);
    // every course's first finish together is a third of one good match (≈ 4,200 XP)
    expect(STREET_RUN_XP * STREET_RUN_COURSES.length).toBeLessThan(4200 / 2);
  });

  it("one stamp per course, in the city's group, read off the course's own counter", () => {
    for (const c of STREET_RUN_COURSES) {
      expect(stampById(`street_run:${c.id}`)).toMatchObject({ group: "city", counter: `streetRun:${c.id}`, need: 1, line: `STREET RUN · ${c.districtName} · ${c.name}` });
      expect(c.districtName).toBe(levelDisplayName(c.district));
    }
    expect(new Set(STAMPS.map((s) => s.id)).size).toBe(STAMPS.length);
  });
});

describe("only a city runs courses", () => {
  it("a match room and a contract room never send a street run, even with a file standing in a start ring", () => {
    const c = course("lease_row", 1);
    const rooms = [new Room({ ai: false, seed: 7, level: "lease_row", wakePhase: "off" }), createCampaignRoom({ mission: "g_escrow_row", seed: 7 }).room];
    for (const r of rooms) {
      const x = conn();
      r.onOpen(x.c);
      r.onMessage(x.c, encodeJoin("ALPHA", "", "", LOADOUT));
      r.step();
      const p = r.world.players.get(idOf(x.msgs));
      for (let i = 0; i < ARM * 3; i++) {
        if (p) put(p, i < ARM * 2 ? c.start : aside(c));
        r.step();
      }
      expect(runMsgs(x.msgs)).toEqual([]);
    }
  });

  it("the match room and the PvP worker never reach the street runs; the runs reach no campaign, economy or chain", () => {
    for (const entry of ["server/room.ts", "server/worker.ts"]) expect([...reachable(entry)].filter((f) => /shared[\\/]city[\\/]/.test(f))).toEqual([]);
    for (const entry of ["shared/city/courses.ts", "shared/city/runs.ts", "shared/city/reward.ts"]) {
      expect([...reachable(entry)].filter((f) => /shared[\\/](campaign|economy)[\\/]|server[\\/]chain[\\/]/.test(f))).toEqual([]);
    }
    // the client is told the courses; it never builds or times one
    expect([...reachable("client/campaign.ts", { valueOnly: true })].filter((f) => /shared[\\/]city[\\/]/.test(f))).toEqual([]);
  });
});

describe("the wire", () => {
  it("a street run round-trips as its own message; the version is unchanged", () => {
    const m: CityRunMsg = {
      courses: [{ id: "repo_depot:2", name: "EAST LOOP", start: { x: 1, y: 0, z: 2 }, checkpoints: [{ x: 3, y: 4.6, z: 5, kind: "walkway" }], radius: 2.5, par: 21.5, length: 160 }],
      board: [{ course: "repo_depot:2", top: [{ name: "ALPHA", time: 19.2 }], files: 1 }],
      best: [{ course: "repo_depot:2", time: 19.2, splits: [19.2] }],
      run: { course: "repo_depot:2", state: "finished", next: 1, elapsed: 19.2, splits: [19.2], deltas: [-0.5], time: 19.2, rank: 1, pb: true, reward: ["X"] },
      feed: "ALPHA RAN EAST LOOP IN 19.2S",
    };
    const buf = encodeCityRun(m);
    expect(new Uint8Array(buf)[0]).toBe(Msg.CityRun);
    expect(decodeServerMessage(buf, () => null)).toEqual({ type: "cityRun", cityRun: m });
    expect(Object.values(Msg).filter((n) => n === Msg.CityRun).length).toBe(1);
    expect(PROTOCOL_VERSION).toBe(11);
  });

  it("the door's message for the biggest district fits the wire's string", () => {
    const h = createCityRoom({ district: "lease_row", seed: 7 });
    const x = conn();
    h.room.onOpen(x.c);
    h.room.onMessage(x.c, encodeJoin("ALPHA", "", "", LOADOUT));
    h.room.step();
    const door = runMsgs(x.msgs)[0]!;
    expect(door.courses!.length).toBe(3);
    // a u16-length string: the door's JSON is well inside it
    expect(JSON.stringify(door).length).toBeLessThan(16_000);
  });
});

describe("the HUD's words", () => {
  const c = { id: "r:2", name: "EAST LOOP", start: { x: 0, y: 0, z: 0 }, checkpoints: [{ x: 0, y: 0, z: 30, kind: "street" }, { x: 40, y: 4.6, z: 30, kind: "walkway" }, { x: 0, y: 0, z: 0, kind: "street" }], radius: 2.5, par: 21.5, length: 100 };
  it("a stopwatch to the hundredth, and a split against your best", () => {
    expect(runClock(38.217)).toBe("38.21");
    expect(runClock(95.5)).toBe("1:35.50");
    expect(runDelta(-1.2)).toBe("−1.20");
    expect(runDelta(0.84)).toBe("+0.84");
    expect(runDelta(null)).toBe("");
  });
  it("the line says which checkpoint, what it is and how far; the clock and the last split", () => {
    const run = { course: c.id, state: "running" as const, next: 1, elapsed: 5, splits: [5], deltas: [-0.25] };
    expect(runObjective(c, run, 7.5, { x: 40, z: 0 })).toEqual({ title: "◈ STREET RUN · EAST LOOP", text: "CHECKPOINT 2/3 · WALKWAY · 30 M", progress: "7.50 · −0.25" });
    expect(runObjective(c, { ...run, next: 2 }, 9, null).text).toBe("FINISH");
    expect(startPrompt(c, null, null, 12).progress).toBe("NO TIME POSTED YET");
    expect(startPrompt(c, 20.1, { name: "BRAVO", time: 19 }, 1).text).toBe("STAND IN THE RING TO ARM · 3 CHECKPOINTS · PAR 21.50");
  });
  it("the card: the time against the par and the best, the place, what it paid; or why it was void", () => {
    const fin = { course: c.id, state: "finished" as const, next: 3, elapsed: 20, splits: [5, 12, 20], deltas: [0, 0, -1], time: 20, rank: 1, pb: true, reward: ["STREET RUN · EAST LOOP · 20.000S · FIRST FINISH · +150 XP"] };
    expect(runCard(c, fin, 21)).toEqual({ title: "DISTRICT RECORD · EAST LOOP", lines: ["20.00 · PAR 21.50 (−1.50)", "NEW BEST · −1.00", "#1 IN THE DISTRICT", "STREET RUN · EAST LOOP · 20.000S · FIRST FINISH · +150 XP"], color: "cy" });
    expect(runCard(c, { ...fin, rank: 0, pb: false, reward: undefined, deltas: [null, null, null] }, null)!.lines).toContain("NO FILE · TIMED, NOT POSTED");
    expect(runCard(c, { ...fin, state: "void", reason: "DOWNED" }, null)).toEqual({ title: "RUN VOID · EAST LOOP", lines: ["DOWNED", "STAND IN THE START RING TO GO AGAIN"], color: "mg" });
  });
});

// the bot is exported for the probe; its jump is edge-triggered so a held key is not a second jump
describe("the proving bot", () => {
  it("presses jump for one tick at a climb, then lets go", () => {
    const bot = new CourseBot([{ x: 0, y: 0, z: 0 }, { x: 0, y: 1.2, z: -1 }]);
    const p = { pos: { x: 0, y: 0, z: 0 }, yaw: 0, grounded: true, stance: "stand" };
    const a = bot.input(1, p), b = bot.input(2, p);
    expect(a.buttons & 16).toBe(16);
    expect(b.buttons & 16).toBe(0);
  });
});
