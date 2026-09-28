/**
 * The city room (Stage 692): a district's shared open world. A Room with no match and no mission,
 * the district's patrols live, and players unable to hurt each other. Every file wears its own
 * Kernel Protocols here, as in a co-op contract: the city is campaign, and no PvP room ever loads
 * this module (the PvP worker does not import it).
 *
 * Public events (Stage 699): every few minutes, after a quiet gap, the city starts one event
 * somewhere in the district (`shared/city/events.ts`) and tells everyone in the room. When it
 * completes, every file that took part is credited, here, by the room that ran it — the same rule a
 * contract is closed by (Stage 27) — and nobody can ask for it.
 *
 * Street runs (Stage 703): the district's time trials (`shared/city/courses.ts`, `shared/city/runs.ts`).
 * The room keeps every runner's clock from where the sim put them; a finish is posted to the district's
 * board, told to everyone, and the first finish of each course is credited to the file. A host that
 * can keep the board (the campaign Worker's Durable Object storage) passes `runBoard`.
 *
 * Presence (Stage 705): `presence()` is this district's line of the city's public feed (GET /city,
 * shared/city/presence.ts): how many are online, their display names, the running event and the
 * course records. Display names only: the room's ids and secrets go in as what it must never print.
 */
import { Room, type RoomHooks, type RoomOptions } from "./room";
import { campaignOf } from "../shared/campaign/save";
import { protocolMods } from "../shared/campaign/protocols";
import { cityDistrict } from "../shared/net/city";
import { arrivalFromQuery } from "../shared/net/citygates";
import { reviveMotion } from "../shared/sim/player";
import { encodeCityEvent, encodeCityRun, type CityEventMsg, type CityRunMsg } from "../shared/net/protocol";
import { CityEvents, type CityEventKind, type CityEventView } from "../shared/city/events";
import { creditCityEvent, creditStreetRun } from "../shared/city/reward";
import { STREET_RUN, type StreetRunCourse } from "../shared/city/courses";
import { RunBoard, runSeconds, streetRunsFor, StreetRuns, type ActiveRun, type BoardData } from "../shared/city/runs";
import { districtPresence, type DistrictPresence } from "../shared/city/presence";

/** Where a host keeps a district's street-run board between the room's lives (Stage 703). */
export interface RunBoardStore {
  load(): Promise<unknown>;
  save(data: BoardData): Promise<void> | void;
}

export interface CityRoomOptions extends RoomOptions {
  district: string;
  /** the host's keeping of the street-run board; without one the board lives as long as the room */
  runBoard?: RunBoardStore | null;
}

export interface CityRoomHandle {
  room: Room;
  district: string;
  /** the district's public events (Stage 699) */
  events: CityEvents;
  state: () => { district: string; players: number; pvp: boolean; event: CityEventView | null; next: number; events: number; credited: { event: number; file: string; xp: number }[]; runs: { courses: { id: string; name: string; par: number; checkpoints: number; start: { x: number; y: number; z: number } }[]; running: number; finishes: number; board: NonNullable<CityRunMsg["board"]> } };
  /** bring the next public event forward to the next tick (the dev host's button, and the tests') */
  startEvent: (kind?: CityEventKind | null) => void;
  /** hold the district's own schedule back this many seconds (the dev host's `quiet`, Stage 704) */
  quietEvents: (seconds: number) => void;
  /** an EMP over the whole district: every wasp and mech held down this many seconds (the dev host's, Stage 704) */
  empDistrict: (seconds: number) => void;
  /** the district's street runs (Stage 703): the courses, the clocks and the board */
  runs: StreetRuns;
  board: RunBoard;
  /** every finish this room has timed, for /stats, the probe and the tests */
  finishes: () => { course: string; name: string; file: string | null; time: number; rank: number; xp: number }[];
  /** resolves once the host's kept board has been read in (at once when there is none) */
  boardLoaded: Promise<void>;
  /** this district's report for the city's presence feed (Stage 705): display names only */
  presence: () => DistrictPresence;
}

/** a city holds more than a match does: it is somewhere to be, not a round to win */
export const CITY_MAX_PLAYERS = 24;

/** how often a running event's progress goes out (ticks): twice a second, as a contract's does */
const EVENT_PUSH_TICKS = 30;

export function createCityRoom(opts: CityRoomOptions): CityRoomHandle {
  const district = cityDistrict(opts.district);
  let events: CityEvents | null = null;
  /** every credit this room has made, for /stats and the tests */
  const credited: { event: number; file: string; xp: number }[] = [];
  const eventsOf = (room: Room): CityEvents => (events ??= new CityEvents(room.world.seed, room.world.level, room.world.tick));
  /** the key a player takes part under: the file it plays (a guest has none, and is never credited) */
  const keyOf = (room: Room) => (playerId: number): string | null => room.accountOf(playerId)?.id ?? null;
  const msgFor = (room: Room, playerId: number, reward?: string[]): CityEventMsg => {
    const ev = eventsOf(room);
    const key = keyOf(room)(playerId);
    return { event: ev.view(room.world), next: ev.nextIn(room.world.tick), you: key !== null && ev.took(key), ...(reward ? { reward } : {}) };
  };
  const pushAll = (room: Room, rewards: Map<number, string[]> = new Map()): void => {
    for (const id of room.playerIds()) room.send(encodeCityEvent(msgFor(room, id, rewards.get(id))), id);
  };

  // ---- street runs (Stage 703) ----
  let runs: StreetRuns | null = null;
  let board: RunBoard | null = null;
  const finishes: { course: string; name: string; file: string | null; time: number; rank: number; xp: number }[] = [];
  const runsOf = (room: Room): StreetRuns => (runs ??= new StreetRuns(streetRunsFor(room.world.level, district)));
  const boardOf = (room: Room): RunBoard => (board ??= new RunBoard(district, runsOf(room).courses));
  const coursesMsg = (cs: readonly StreetRunCourse[]): NonNullable<CityRunMsg["courses"]> =>
    cs.map((c) => ({ id: c.id, name: c.name, start: { x: c.start.x, y: c.start.y, z: c.start.z }, checkpoints: c.checkpoints.map((p) => ({ x: p.x, y: p.y, z: p.z, kind: p.kind })), radius: STREET_RUN.radius, par: runSeconds(c.par), length: c.length }));
  const boardMsg = (room: Room): NonNullable<CityRunMsg["board"]> => {
    const b = boardOf(room);
    return runsOf(room).courses.map((c) => ({ course: c.id, top: b.top(c.id).map((e) => ({ name: e.name, time: runSeconds(e.ticks) })), files: b.size(c.id) }));
  };
  const bestMsg = (room: Room, key: string | null): NonNullable<CityRunMsg["best"]> => {
    const b = boardOf(room);
    return runsOf(room).courses.flatMap((c) => {
      const e = b.bestOf(c.id, key);
      return e ? [{ course: c.id, time: runSeconds(e.ticks), splits: e.splits.map(runSeconds) }] : [];
    });
  };
  /** a run as its runner is told it: the splits, and each against the file's best there */
  const runMsg = (room: Room, r: ActiveRun, state: NonNullable<CityRunMsg["run"]>["state"], extra: Partial<NonNullable<CityRunMsg["run"]>> = {}, best = boardOf(room).bestOf(r.course.id, r.key)): NonNullable<CityRunMsg["run"]> => ({
    course: r.course.id,
    state,
    next: r.next,
    elapsed: r.startTick >= 0 ? runSeconds(room.world.tick - r.startTick) : 0,
    splits: r.splits.map(runSeconds),
    deltas: r.splits.map((t, i) => (best && best.splits[i] !== undefined ? runSeconds(t - best.splits[i]!) : null)),
    ...extra,
  });
  const stepRuns = (room: Room): void => {
    const rs = runsOf(room);
    for (const n of rs.step(room.world, keyOf(room))) {
      const r = n.run;
      const id = r.playerId;
      if (n.type === "armed") room.send(encodeCityRun({ run: runMsg(room, r, "armed") }), id);
      else if (n.type === "start" || n.type === "split") room.send(encodeCityRun({ run: runMsg(room, r, "running") }), id);
      else if (n.type === "void") {
        room.send(encodeCityRun({ run: runMsg(room, r, "void", { reason: n.reason }) }), id);
        room.opts.onLog(`street run ${r.course.id} void for ${id}: ${n.reason}`);
      } else {
        // the finish: the room's own ticks, and nothing the client said
        const b = boardOf(room);
        const before = b.bestOf(r.course.id, r.key);
        const time = runSeconds(n.ticks);
        const name = room.world.players.get(id)?.name ?? "BLANK";
        const a = room.accountOf(id);
        let rank = 0;
        let pb = false;
        let xp = 0;
        let reward: string[] | undefined;
        // a file, still in the seat it ran from, goes on the board and is credited; a guest is timed and nothing more
        if (r.key && a && a.id === r.key) {
          const posted = b.post(r.course.id, { key: r.key, name, ticks: n.ticks, splits: r.splits.slice(), at: room.opts.now() });
          rank = posted.rank;
          pb = posted.best;
          const credit = creditStreetRun(a, r.course, time);
          xp = credit.xp;
          if (credit.lines.length) reward = credit.lines;
          room.pushFile(id, credit.lines);
          if (pb && opts.runBoard) {
            const data = b.save();
            Promise.resolve()
              .then(() => opts.runBoard!.save(data))
              .catch((err) => room.opts.onLog(`street run board save failed: ${String(err)}`));
          }
        }
        finishes.push({ course: r.course.id, name, file: r.key, time, rank, xp });
        const boardNow = boardMsg(room);
        room.send(encodeCityRun({ run: runMsg(room, r, "finished", { time, rank, pb, ...(reward ? { reward } : {}) }, before), board: boardNow, best: bestMsg(room, r.key) }), id);
        const feed = `${name} RAN ${r.course.name} IN ${time.toFixed(1)}S${rank === 1 && pb ? " · THE DISTRICT'S BEST" : ""}`;
        for (const other of room.playerIds()) if (other !== id) room.send(encodeCityRun({ feed, board: boardNow }), other);
        room.opts.onLog(`street run ${r.course.id} · ${name} · ${time}s · rank ${rank}${xp ? ` · +${xp} XP` : ""}`);
      }
    }
  };

  const hooks: RoomHooks = {
    onAdmit(room, playerId, account, query) {
      const p = room.world.players.get(playerId);
      if (p && account) room.world.setLoadout(p, account.loadout, protocolMods(campaignOf(account).worn));
      // a file walking in through a gate (Stage 697) stands at that gate, facing in — when the gate
      // it names really leads back to where it says it came from; anything else takes the room's spawn
      const arrive = arrivalFromQuery(room.world.level, query);
      if (p && arrive) reviveMotion(p, arrive);
      // a late joiner sees the event already running (or the one just ended, or when the next is due)
      room.send(encodeCityEvent(msgFor(room, playerId)), playerId);
      // and the district's street runs: where they start, the board, and this file's bests (Stage 703)
      room.send(encodeCityRun({ courses: coursesMsg(runsOf(room).courses), board: boardMsg(room), best: bestMsg(room, account?.id ?? null), run: null }), playerId);
    },
    afterStep(room, simEvents) {
      stepRuns(room);
      const ev = eventsOf(room);
      const notice = ev.step(room.world, simEvents, keyOf(room));
      if (notice?.type === "start") {
        room.opts.onLog(`city event ${notice.event.id} · ${notice.event.kind} · ${notice.event.title}`);
        pushAll(room);
        return;
      }
      if (notice?.type === "end") {
        const e = notice.event;
        const rewards = new Map<number, string[]>();
        for (const { key, playerId } of ev.close(e)) {
          const a = room.accountOf(playerId);
          // the seat must still hold the file that took part: an id handed on to someone else is not them
          if (!a || a.id !== key) continue;
          const r = creditCityEvent(a, e, room.opts.now());
          credited.push({ event: e.id, file: a.id, xp: r.xp });
          rewards.set(playerId, r.lines);
          room.pushFile(playerId, r.lines);
        }
        room.opts.onLog(`city event ${e.id} ${e.status}${e.reason ? ` (${e.reason})` : ""} · ${e.participants.size} took part · ${rewards.size} credited`);
        pushAll(room, rewards);
        return;
      }
      if (ev.current?.status === "running" && room.world.tick % EVENT_PUSH_TICKS === 0) pushAll(room);
    },
  };
  const room = new Room({ maxPlayers: CITY_MAX_PLAYERS, ...opts, hooks, level: district, ai: true, wakePhase: "off", dummyRespawn: true, pvp: false, run: false, arrivalGrace: true });
  // the courses are built (and proved) now, before anyone is in the street, not on the first join
  const rs = runsOf(room);
  const b = boardOf(room);
  const boardLoaded: Promise<void> = opts.runBoard
    ? Promise.resolve()
        .then(() => opts.runBoard!.load())
        .then((data) => {
          const n = b.load(data);
          if (n) {
            room.opts.onLog(`street run board: ${n} kept entries read in`);
            const boardNow = boardMsg(room);
            for (const id of room.playerIds()) room.send(encodeCityRun({ board: boardNow, best: bestMsg(room, room.accountOf(id)?.id ?? null) }), id);
          }
        })
        .catch((err) => room.opts.onLog(`street run board load failed: ${String(err)}`))
    : Promise.resolve();
  return {
    room,
    district,
    get events() {
      return eventsOf(room);
    },
    runs: rs,
    board: b,
    finishes: () => finishes.slice(),
    boardLoaded,
    state: () => {
      const ev = eventsOf(room);
      return {
        district,
        players: room.playerIds().length,
        pvp: room.world.pvp,
        event: ev.view(room.world),
        next: ev.nextIn(room.world.tick),
        events: ev.count,
        credited: credited.slice(),
        runs: { courses: rs.courses.map((c) => ({ id: c.id, name: c.name, par: runSeconds(c.par), checkpoints: c.checkpoints.length, start: { x: c.start.x, y: c.start.y, z: c.start.z } })), running: [...rs.runs.values()].filter((r) => r.state === "running").length, finishes: finishes.length, board: boardMsg(room) },
      };
    },
    startEvent: (kind = null) => eventsOf(room).startNow(room.world.tick + 1, kind),
    quietEvents: (seconds) => eventsOf(room).postpone(room.world.tick, seconds),
    empDistrict: (seconds) => {
      // the same hold an EMP grenade puts on what it catches (`disabledTimer`, seconds), on all of them
      for (const w of room.world.wasps) w.disabledTimer = Math.max(w.disabledTimer, seconds);
      for (const m of room.world.mechs) m.disabledTimer = Math.max(m.disabledTimer, seconds);
    },
    presence: () =>
      districtPresence({
        district,
        seats: room.presenceSeats(),
        event: eventsOf(room).view(room.world),
        records: rs.courses.flatMap((c) => {
          const e = b.top(c.id, 1)[0];
          return e ? [{ course: c.name, time: runSeconds(e.ticks), holder: e.name, key: e.key }] : [];
        }),
      }),
  };
}
