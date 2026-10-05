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
 *
 * Interest (Stage 706): each client is told about what is near it, not the whole district
 * (`shared/net/interest.ts`). This module says what only the city knows — which wasps a public event
 * has borrowed and who is taking part — and sends the roster (`Msg.CityRoster`), because the
 * snapshot's player list is no longer everyone in the room. A file that walks in without a gate
 * arrives at the spawn nearest somebody already in the street, so the city it enters is not empty.
 */
import { Room, type InterestPolicy, type RoomHooks, type RoomOptions } from "./room";
import { campaignOf, canLaunch, completeContract, nextMission } from "../shared/campaign/save";
import { dayIndex } from "../shared/endgame/clock";
import { protocolMods } from "../shared/campaign/protocols";
import { cityDistrict } from "../shared/net/city";
import { arrivalFromQuery } from "../shared/net/citygates";
import { reviveMotion } from "../shared/sim/player";
import { encodeCityEvent, encodeCityRoster, encodeCityRun, ENT_WASP, type CityEventMsg, type CityRunMsg } from "../shared/net/protocol";
import { bodyKey } from "../shared/net/interest";
import type { LevelDef, SpawnPoint } from "../shared/sim/level";
import { CityEvents, type CityEventKind, type CityEventView } from "../shared/city/events";
import { creditCityEvent, creditStreetRun } from "../shared/city/reward";
import { STREET_RUN, type StreetRunCourse } from "../shared/city/courses";
import { RunBoard, runSeconds, streetRunsFor, StreetRuns, type ActiveRun, type BoardData } from "../shared/city/runs";
import { districtPresence, type DistrictPresence } from "../shared/city/presence";
import { fileChits } from "../shared/city/chit";
import { contestRespawn, inContest } from "../shared/city/contest";
import { StreetLife, type StreetNotice } from "../shared/city/street";
import type { SimEvent } from "../shared/sim/world";

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
  /** the street: the contest block, the fixer, the carry */
  street: StreetLife;
}

/** a city holds more than a match does: it is somewhere to be, not a round to win */
export const CITY_MAX_PLAYERS = 24;

/** how often a running event's progress goes out (ticks): twice a second, as a contract's does */
const EVENT_PUSH_TICKS = 30;

/**
 * How often the roster goes out even when nobody came or went (ticks): every ten seconds, so a client
 * that relinked (a rejoin keeps its seat and misses the changes in between) is right again soon.
 */
export const ROSTER_EVERY_TICKS = 600;

/** an arrival is not put on top of somebody: a spawn closer than this to another file is passed over */
const CROWD_CLEAR = 3;

/**
 * Where a file that walked in without a gate should stand (Stage 706): the district spawn nearest to
 * any other file already in the street, or null to keep where the room put it. With interest a file
 * is shown only what is near it, and the room hands spawns out in turn — the first two files into
 * LEASE ROW used to stand 168 m apart, out of each other's view.
 */
export function crowdSpawn(level: LevelDef, others: readonly { x: number; z: number }[], from: { x: number; z: number }): SpawnPoint | null {
  if (!others.length) return null;
  const gap = (x: number, z: number) => Math.min(...others.map((o) => Math.hypot(o.x - x, o.z - z)));
  let best: SpawnPoint | null = null;
  let bestGap = gap(from.x, from.z);
  for (const sp of level.spawns) {
    const g = gap(sp.pos.x, sp.pos.z);
    if (g >= CROWD_CLEAR && g < bestGap) {
      best = sp;
      bestGap = g;
    }
  }
  return best;
}

export function createCityRoom(opts: CityRoomOptions): CityRoomHandle {
  const district = cityDistrict(opts.district);
  let events: CityEvents | null = null;
  /** every credit this room has made, for /stats and the tests */
  const credited: { event: number; file: string; xp: number }[] = [];
  const eventsOf = (room: Room): CityEvents => (events ??= new CityEvents(room.world.seed, room.world.level, room.world.tick));
  /** the key a player takes part under: the file it plays (a guest has none, and is never credited) */
  const keyOf = (room: Room) => (playerId: number): string | null => room.accountOf(playerId)?.id ?? null;
  let street: StreetLife | null = null;
  const streetOf = (room: Room): StreetLife => (street ??= new StreetLife(room.world.level));
  const msgFor = (room: Room, playerId: number, reward?: string[]): CityEventMsg => {
    const ev = eventsOf(room);
    const key = keyOf(room)(playerId);
    const mark = streetOf(room).marker(playerId);
    return { event: ev.view(room.world), next: ev.nextIn(room.world.tick), you: key !== null && ev.took(key), ...(reward ? { reward } : {}), ...(mark ? { street: mark } : {}) };
  };
  const applyStreet = (room: Room, n: StreetNotice): void => {
    const a = room.accountOf(n.playerId);
    if (n.type === "lines") {
      if (a) room.pushFile(n.playerId, n.lines);
      return;
    }
    if (n.type === "exchange") {
      if (a && n.units > 0) room.opts.onRunBank(dayIndex(room.opts.now()), a.id, n.units);
      if (a) room.pushFile(n.playerId, [n.line]);
      return;
    }
    if (n.type === "event") {
      const ev = eventsOf(room);
      if (ev.current?.status !== "running") ev.startNow(room.world.tick + 1, null);
      return;
    }
    if (!a) return;
    const before = fileChits(a);
    const done = completeContract(a, n.id, {});
    if (fileChits(a) !== before) a.chits = before;
    room.pushFile(n.playerId, [done.ok ? `CONTRACT CLOSED · ${n.id} · 0 CHITS` : `CONTRACT · ${done.reason ?? "REFUSED"}`]);
  };
  const stepStreet = (room: Room, simEvents: readonly SimEvent[]): void => {
    const life = streetOf(room);
    const notices = life.step({
      tick: room.world.tick,
      day: dayIndex(room.opts.now()),
      players: [...room.world.players.values()].map((p) => ({ id: p.id, x: p.pos.x, z: p.pos.z, alive: p.alive })),
      account: (id) => room.accountOf(id),
      deaths: simEvents.flatMap((e) => (e.type === "death" ? [{ playerId: e.playerId, killerId: e.killerId, x: room.world.players.get(e.playerId)?.pos.x ?? 0, z: room.world.players.get(e.playerId)?.pos.z ?? 0 }] : [])),
      offer: (a) => {
        const save = campaignOf(a);
        const next = nextMission(save);
        return next && canLaunch(a, save, next.id).ok ? { id: next.id, title: next.title } : null;
      },
      eventRunning: eventsOf(room).current?.status === "running",
    });
    for (const n of notices) applyStreet(room, n);
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

  // ---- who is in the room, and what each client is told about (Stage 706) ----
  let rosterSent = "";
  const sendRoster = (room: Room, force: boolean): void => {
    const players = room.roster();
    const sig = players.map((x) => `${x.id}:${x.name}:${x.tag}`).join("|");
    if (!force && sig === rosterSent) return;
    rosterSent = sig;
    room.send(encodeCityRoster({ players }));
  };
  let lentAt = -1;
  let lentKeys: ReadonlySet<number> = new Set();
  const interest: InterestPolicy = {
    eventKeys(room) {
      // asked once per client per snapshot: worked out once per tick
      if (lentAt !== room.world.tick) {
        lentAt = room.world.tick;
        const ev = eventsOf(room);
        lentKeys = ev.current?.status === "running" ? new Set([...ev.lent].map((id) => bodyKey(ENT_WASP, id))) : new Set();
      }
      return lentKeys;
    },
    participant: (room, playerId) => eventsOf(room).takesPart(playerId, keyOf(room)(playerId)),
  };

  const hooks: RoomHooks = {
    onAdmit(room, playerId, account, query) {
      const p = room.world.players.get(playerId);
      if (p && account) room.world.setLoadout(p, account.loadout, protocolMods(campaignOf(account).worn));
      // a file walking in through a gate (Stage 697) stands at that gate, facing in — when the gate
      // it names really leads back to where it says it came from; anything else takes the room's spawn,
      // the one nearest somebody already in the street when there is anybody (Stage 706)
      const arrive = arrivalFromQuery(room.world.level, query);
      if (p && arrive) reviveMotion(p, arrive);
      else if (p) {
        const others = [...room.world.players.values()].filter((o) => o.id !== playerId).map((o) => o.pos);
        const near = crowdSpawn(room.world.level, others, p.pos);
        if (near) reviveMotion(p, near);
      }
      // a late joiner sees the event already running (or the one just ended, or when the next is due)
      room.send(encodeCityEvent(msgFor(room, playerId)), playerId);
      // and the district's street runs: where they start, the board, and this file's bests (Stage 703)
      room.send(encodeCityRun({ courses: coursesMsg(runsOf(room).courses), board: boardMsg(room), best: bestMsg(room, account?.id ?? null), run: null }), playerId);
    },
    afterStep(room, simEvents) {
      // the roster: on every change of who is in the room, and every ten seconds anyway
      sendRoster(room, room.world.tick % ROSTER_EVERY_TICKS === 0);
      stepRuns(room);
      stepStreet(room, simEvents);
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
  const room = new Room({ maxPlayers: CITY_MAX_PLAYERS, ...opts, hooks, level: district, ai: true, wakePhase: "off", dummyRespawn: true, pvp: false, run: false, arrivalGrace: true, interest });
  const life = streetOf(room);
  room.world.contestAt = (x, z) => inContest(room.world.level, x, z, life.vol);
  room.world.contestGate = (x, z) => contestRespawn(room.world.level, x, z);
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
    street: life,
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
        contest: life.contestUp,
      }),
  };
}
