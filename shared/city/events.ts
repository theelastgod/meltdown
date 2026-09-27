/**
 * Public world events in the city (Stage 699).
 *
 * The city (Stage 692) put every file in one district's streets, and the only thing there was to do
 * together was walk past the patrols. Every few minutes, after a quiet gap, the room now starts one
 * public event somewhere in the district, and everyone in the room hears about it:
 *
 *  - HOLD: stand in the ring at one of the district's lattice posts while VANTAGE sends wasps at it;
 *  - INTERCEPT: a convoy of the district's own wasps flies a lease-scan round the posts, down it;
 *  - ESCORT: walk a cell from one post to another along the streets; it moves while someone is close.
 *
 * Everything here is deterministic. The schedule (which kind, where, how long the quiet lasts) is a
 * function of the room's seed and the event's index and nothing else, so two rooms with one seed
 * run the same city; the event itself is stepped from the world and the tick's sim events, as the
 * mission runtime is.
 *
 * No entity is created. An event borrows the district's own patrol wasps — retasks them onto a ring
 * or a route — and hands them back when it ends, so a room that stays open all day never grows its
 * entity list (a wire count is one byte) and the frame draws what it always drew.
 *
 * This module knows player ids and the keys a caller gives it for them, never files or rewards: the
 * room that runs it decides what taking part is worth (`shared/city/reward.ts`). It imports nothing
 * from the campaign, the economy or the chain, and no PvP room loads it.
 */
import { v3, clone, type Vec3 } from "../math/vec3";
import { SIM_DT, SIM_HZ } from "../sim/constants";
import { WASP, type Wasp } from "../sim/ai";
import type { LevelDef } from "../sim/level";
import type { SimEvent, World } from "../sim/world";

export const CITY_EVENT_KINDS = ["hold", "intercept", "escort"] as const;
export type CityEventKind = (typeof CITY_EVENT_KINDS)[number];

/** The city's clock and each kind's numbers (seconds and metres). */
export const CITY_EVENTS = {
  /** the first event after a room opens */
  firstSeconds: 90,
  /** the quiet between the end of one event and the start of the next */
  gapMinSeconds: 150,
  gapMaxSeconds: 270,
  /** an event came due with nobody in the streets: look again this much later */
  retrySeconds: 5,
  /** an ended event stays in the view this long, so a message that arrives late still says how it went */
  lingerSeconds: 8,
  /** alive and this close to the event when it completes: you were there */
  finishRadius: 20,
  hold: { seconds: 40, limit: 150, radius: 6, waveEvery: 15, perWave: 2, waveRing: 9 },
  intercept: { count: 3, limit: 150, radius: 20, altitude: 4.2 },
  escort: { limit: 180, speed: 2.4, leash: 7, ambush: 2, ambushRing: 10 },
} as const;

/** One scheduled event: what, where (an index into the district's posts), and the quiet after it. */
export interface CityEventPlan {
  index: number;
  kind: CityEventKind;
  site: number;
  gapSeconds: number;
}

/** A deterministic unit number from the seed, the event index and a salt (no Math.random, no clock). */
export function cityHash(seed: number, index: number, salt: number): number {
  let h = (seed >>> 0) ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * The schedule, as a pure sequence: `count` plans for a room seeded `seed` in a district with
 * `sites` posts. Every three events run all three kinds and never the same kind twice in a row, and
 * no post is used twice running.
 */
export function planCityEvents(seed: number, count: number, sites: number): CityEventPlan[] {
  const out: CityEventPlan[] = [];
  const offset = Math.floor(cityHash(seed, 0, 1) * CITY_EVENT_KINDS.length);
  let last = -1;
  for (let i = 0; i < count; i++) {
    const kind = CITY_EVENT_KINDS[(offset + i) % CITY_EVENT_KINDS.length]!;
    let site = Math.floor(cityHash(seed, i, 2) * sites);
    if (sites > 1 && site === last) site = (site + 1) % sites;
    last = site;
    const gapSeconds = Math.round(CITY_EVENTS.gapMinSeconds + cityHash(seed, i, 3) * (CITY_EVENTS.gapMaxSeconds - CITY_EVENTS.gapMinSeconds));
    out.push({ index: i, kind, site, gapSeconds });
  }
  return out;
}

/** The district's posts: its wake nodes (lattice posts), or its spawns in a level without any. */
export function citySites(level: LevelDef): { label: string; pos: Vec3 }[] {
  if (level.nodes.length) return level.nodes.map((n) => ({ label: n.label, pos: v3(n.pos.x, 0, n.pos.z) }));
  return level.spawns.map((s, i) => ({ label: String.fromCharCode(65 + i), pos: v3(s.pos.x, 0, s.pos.z) }));
}

/**
 * The ring of outer posts in order round the district: every post off the centre, sorted by angle.
 * The districts' posts sit on the street crossings, so a leg from one to the next runs down a street.
 */
export function cityRing(level: LevelDef): { label: string; pos: Vec3 }[] {
  const sites = citySites(level);
  const outer = sites.filter((s) => Math.hypot(s.pos.x, s.pos.z) > 1);
  const ring = outer.length >= 3 ? outer : sites;
  return ring.slice().sort((a, b) => Math.atan2(a.pos.z, a.pos.x) - Math.atan2(b.pos.z, b.pos.x));
}

export interface CityEscort {
  pos: Vec3;
  path: Vec3[];
  next: number;
  speed: number;
  leash: number;
  waiting: boolean;
  /** metres walked, and the path's length: progress */
  walked: number;
  length: number;
}

export interface CityEvent {
  /** 1-based, counting up for the life of the room */
  id: number;
  kind: CityEventKind;
  title: string;
  text: string;
  status: "running" | "complete" | "failed";
  reason: string;
  /** where the marker stands (the post; the convoy's start; the cell's destination) */
  site: Vec3;
  radius: number;
  startTick: number;
  deadlineTick: number;
  endedTick: number;
  progress: number;
  need: number;
  /** the convoy (intercept): wasp ids to down, and the ones downed */
  targets: number[];
  downed: number[];
  escort: CityEscort | null;
  waves: number;
  /** who took part: a caller's key for the player (a file id) → the player id it was seen as */
  participants: Map<string, number>;
  /** the participants were handed out once, at completion; never again */
  closed: boolean;
}

/** What `step` tells the room happened this tick. */
export type CityEventNotice = { type: "start"; event: CityEvent } | { type: "end"; event: CityEvent } | null;

/** The event as a HUD, a probe or a late joiner sees it. */
export interface CityEventView {
  id: number;
  kind: CityEventKind;
  title: string;
  text: string;
  status: "running" | "complete" | "failed";
  reason: string;
  x: number;
  z: number;
  radius: number;
  progress: number;
  need: number;
  /** seconds left on the clock (0 once ended) */
  left: number;
  escort: { x: number; z: number; waiting: boolean; heading: number } | null;
  /** the convoy's living wasps, where they are */
  targets: { x: number; y: number; z: number }[];
  participants: number;
}

const ringAround = (c: Vec3, r: number, y: number, phase: number): Vec3[] =>
  [0, 1, 2, 3].map((i) => {
    const a = phase + (i / 4) * Math.PI * 2;
    return v3(c.x + Math.cos(a) * r, y, c.z + Math.sin(a) * r);
  });

const pathLength = (p: readonly Vec3[]): number => {
  let n = 0;
  for (let i = 1; i < p.length; i++) n += Math.hypot(p[i]!.x - p[i - 1]!.x, p[i]!.z - p[i - 1]!.z);
  return n;
};

/**
 * The city's public events for one room: the schedule, the running event, and the district's wasps
 * it has borrowed. The room steps it after every tick and reads what it says happened.
 */
export class CityEvents {
  current: CityEvent | null = null;
  /** the tick the next event is due (while one runs: when the one after it was due, unused) */
  nextAt: number;
  /** events started so far */
  count = 0;
  private plans: CityEventPlan[] = [];
  /** a kind asked for by `startNow` (the dev host; the tests), or null for the schedule's */
  private forced: CityEventKind | null = null;
  /** wasp id → its own patrol, while an event has it */
  private borrowed = new Map<number, Vec3[]>();

  constructor(readonly seed: number, readonly level: LevelDef, startTick = 0) {
    this.nextAt = startTick + Math.round(CITY_EVENTS.firstSeconds * SIM_HZ);
  }

  /** the plan for event `index` (0-based) */
  plan(index: number): CityEventPlan {
    const sites = citySites(this.level).length;
    while (this.plans.length <= index) this.plans = planCityEvents(this.seed, Math.max(8, this.plans.length * 2), sites);
    return this.plans[index]!;
  }

  /** Bring the next event forward to the next tick (optionally of one kind): the dev host's button, and the tests'. */
  startNow(tick: number, kind: CityEventKind | null = null): void {
    this.forced = kind;
    this.nextAt = tick;
  }

  /**
   * Hold the schedule back: no event starts on its own for `seconds` from `tick` (a running one runs
   * on). The dev host's `quiet` (Stage 704), so a probe's own events and street runs are not raced by
   * the schedule's; `startNow` still starts one at once.
   */
  postpone(tick: number, seconds: number): void {
    this.nextAt = Math.max(this.nextAt, tick + Math.round(seconds * SIM_HZ));
  }

  /** Whether a player (by key) has taken part in the event running or just ended. */
  took(key: string): boolean {
    return !!this.current && this.current.participants.has(key);
  }

  /**
   * One tick, after the world stepped: start an event that is due, advance the one running, and say
   * whether one started or ended. `keyOf` names a player for the participant list (the room passes
   * the file id); a player without one is keyed by id and simply never credited.
   */
  step(world: World, events: readonly SimEvent[], keyOf: (playerId: number) => string | null = () => null): CityEventNotice {
    const tick = world.tick;
    const ev = this.current;
    if (!ev || ev.status !== "running") {
      if (ev && tick - ev.endedTick > CITY_EVENTS.lingerSeconds * SIM_HZ) this.current = null;
      if (tick < this.nextAt) return null;
      if (![...world.players.values()].some((p) => p.alive)) {
        this.nextAt = tick + Math.round(CITY_EVENTS.retrySeconds * SIM_HZ);
        return null;
      }
      const started = this.start(world);
      return { type: "start", event: started };
    }
    let status = this.advance(ev, world, events, keyOf);
    // the clock runs out after the tick's work: an event finished on its last tick is finished
    if (status === "running" && tick >= ev.deadlineTick) {
      status = ev.status = "failed";
      ev.reason = ev.kind === "hold" ? "THE POST WAS NOT HELD IN TIME" : ev.kind === "intercept" ? "THE CONVOY CLEARED THE DISTRICT" : "THE CELL WAS LEFT IN THE STREET";
    }
    if (status === "running") return null;
    if (status === "complete") {
      // alive and near when it closed: you were there
      const focus = this.focus(ev, world);
      for (const p of world.players.values()) if (p.alive && Math.hypot(p.pos.x - focus.x, p.pos.z - focus.z) <= CITY_EVENTS.finishRadius) this.mark(ev, p.id, keyOf);
    }
    ev.endedTick = tick;
    this.giveBack(world);
    this.nextAt = tick + Math.round(this.plan(ev.id - 1).gapSeconds * SIM_HZ);
    return { type: "end", event: ev };
  }

  /**
   * Who takes the reward: every participant of a completed event, once. A failed event pays nobody,
   * and a second call on the same event hands out nothing.
   */
  close(ev: CityEvent | null = this.current): { key: string; playerId: number }[] {
    if (!ev || ev.status !== "complete" || ev.closed) return [];
    ev.closed = true;
    return [...ev.participants].map(([key, playerId]) => ({ key, playerId }));
  }

  view(world: World): CityEventView | null {
    const ev = this.current;
    if (!ev) return null;
    const e = ev.escort;
    const living = ev.targets.filter((id) => !ev.downed.includes(id)).map((id) => world.wasps.find((w) => w.id === id)).filter((w): w is Wasp => !!w && w.alive);
    return {
      id: ev.id,
      kind: ev.kind,
      title: ev.title,
      text: ev.text,
      status: ev.status,
      reason: ev.reason,
      x: ev.site.x,
      z: ev.site.z,
      radius: ev.radius,
      progress: Math.round(ev.progress * 100) / 100,
      need: ev.need,
      left: ev.status === "running" ? Math.max(0, Math.ceil((ev.deadlineTick - world.tick) / SIM_HZ)) : 0,
      escort: e ? { x: e.pos.x, z: e.pos.z, waiting: e.waiting, heading: escortYaw(e) } : null,
      targets: ev.status === "running" ? living.map((w) => ({ x: w.pos.x, y: w.pos.y, z: w.pos.z })) : [],
      participants: ev.participants.size,
    };
  }

  /** seconds until the next event is due, or -1 while one runs */
  nextIn(tick: number): number {
    if (this.current?.status === "running") return -1;
    return Math.max(0, Math.ceil((this.nextAt - tick) / SIM_HZ));
  }

  // ---- inside ----

  private start(world: World): CityEvent {
    const plan = this.plan(this.count);
    let kind = this.forced ?? plan.kind;
    // a district with no patrol has no convoy to fly
    if (kind === "intercept" && world.wasps.length === 0) kind = "hold";
    this.forced = null;
    this.count++;
    const sites = citySites(world.level);
    const site = sites[plan.site % sites.length]!;
    const ring = cityRing(world.level);
    const r0 = Math.max(0, ring.findIndex((s) => s.label === site.label));
    const tick = world.tick;
    const base = { id: this.count, kind, status: "running" as const, reason: "", startTick: tick, endedTick: -1, progress: 0, targets: [] as number[], downed: [] as number[], escort: null as CityEscort | null, waves: 0, participants: new Map<string, number>(), closed: false };
    let ev: CityEvent;
    if (kind === "hold") {
      const c = CITY_EVENTS.hold;
      ev = { ...base, title: `HOLD THE LATTICE POST AT ${site.label}`, text: `STAND IN THE RING AT ${site.label} FOR ${c.seconds}S · VANTAGE IS SENDING WASPS`, site: clone(site.pos), radius: c.radius, deadlineTick: tick + c.limit * SIM_HZ, need: c.seconds };
      this.wave(ev, world);
    } else if (kind === "intercept") {
      const c = CITY_EVENTS.intercept;
      // the lease-scan flies the posts round the district, starting from this one
      const route = ring.map((_, i) => ring[(r0 + i) % ring.length]!.pos).map((p) => v3(p.x, c.altitude, p.z));
      const start = route[0]!;
      const picks = world.wasps
        .filter((w) => !this.borrowed.has(w.id))
        .map((w) => ({ w, d: Math.hypot(w.waypoints[0]!.x - start.x, w.waypoints[0]!.z - start.z) }))
        .sort((a, b) => a.d - b.d || a.w.id - b.w.id)
        .slice(0, c.count)
        .map((x) => x.w);
      for (const w of picks) this.borrow(w, route);
      ev = { ...base, title: `DRONE CONVOY OVER ${world.level.displayName ?? "THE DISTRICT"}`, text: `DOWN ${picks.length === 1 ? "THE CONVOY WASP" : `ALL ${picks.length} CONVOY WASPS`} BEFORE THEY CLEAR THE DISTRICT`, site: v3(start.x, 0, start.z), radius: c.radius, deadlineTick: tick + c.limit * SIM_HZ, need: picks.length, targets: picks.map((w) => w.id) };
    } else {
      const c = CITY_EVENTS.escort;
      const legs = [0, 1, 2].map((i) => ring[(r0 + i) % ring.length]!);
      const path = legs.map((s) => v3(s.pos.x, 0, s.pos.z));
      const to = legs[legs.length - 1]!;
      ev = { ...base, title: `CELL RESCUE · ${legs[0]!.label} TO ${to.label}`, text: `WALK THE CELL FROM ${legs[0]!.label} TO ${to.label} · IT MOVES WHILE SOMEONE IS CLOSE`, site: clone(to.pos), radius: c.leash, deadlineTick: tick + c.limit * SIM_HZ, need: 1, escort: { pos: clone(path[0]!), path, next: 1, speed: c.speed, leash: c.leash, waiting: true, walked: 0, length: pathLength(path) } };
    }
    this.current = ev;
    return ev;
  }

  /** Lend a patrol wasp to the event: its own route is kept to hand back; a downed one comes up on the new route. */
  private borrow(w: Wasp, route: Vec3[]): void {
    if (!this.borrowed.has(w.id)) this.borrowed.set(w.id, w.waypoints.map(clone));
    w.waypoints = route.map(clone);
    w.wp = 0;
    // a wasp that is down comes back next tick where the event wants it (and fresh from its own respawn)
    if (!w.alive) w.respawnTimer = 0;
  }

  /** Every borrowed wasp goes back to its own patrol; one the event kept down comes back on the usual timer. */
  private giveBack(world: World): void {
    for (const [id, own] of this.borrowed) {
      const w = world.wasps.find((x) => x.id === id);
      if (!w) continue;
      w.waypoints = own;
      w.wp = 0;
      if (!w.alive && !Number.isFinite(w.respawnTimer)) w.respawnTimer = WASP.respawn;
    }
    this.borrowed.clear();
  }

  /** VANTAGE answers a hold: up to `perWave` of the district's wasps not already lent are sent to circle the post. */
  private wave(ev: CityEvent, world: World, around: Vec3 = ev.site, ring: number = CITY_EVENTS.hold.waveRing, count: number = CITY_EVENTS.hold.perWave): void {
    const free = world.wasps
      .filter((w) => w.alive && !this.borrowed.has(w.id))
      .map((w) => ({ w, d: Math.hypot(w.pos.x - around.x, w.pos.z - around.z) }))
      .sort((a, b) => a.d - b.d || a.w.id - b.w.id)
      .slice(0, count);
    const phase = cityHash(this.seed, ev.id, 10 + ev.waves) * Math.PI * 2;
    for (const { w } of free) this.borrow(w, ringAround(around, ring, 3.6, phase));
    ev.waves++;
  }

  private mark(ev: CityEvent, playerId: number, keyOf: (id: number) => string | null): void {
    // a player with no file is keyed by a name no file id can take ('#' never survives the join's sanitising)
    const key = keyOf(playerId) ?? `#${playerId}`;
    if (!ev.participants.has(key)) ev.participants.set(key, playerId);
  }

  /** where the event is, for "you were there" */
  private focus(ev: CityEvent, world: World): Vec3 {
    if (ev.escort) return ev.escort.pos;
    if (ev.kind === "intercept") {
      const last = ev.downed.length ? world.wasps.find((w) => w.id === ev.downed[ev.downed.length - 1]) : undefined;
      if (last) return last.pos;
    }
    return ev.site;
  }

  private advance(ev: CityEvent, world: World, events: readonly SimEvent[], keyOf: (id: number) => string | null): CityEvent["status"] {
    const alive = [...world.players.values()].filter((p) => p.alive);
    const near = (at: Vec3, r: number) => alive.filter((p) => Math.hypot(p.pos.x - at.x, p.pos.z - at.z) <= r);
    // a player who hits or downs a wasp the event sent took part, wherever they stood
    for (const e of events) {
      if (!world.players.has(e.playerId)) continue;
      const hits = e.type === "shot" ? e.hits : e.type === "melee" ? e.hits : [];
      for (const h of hits) if (h.kind === "wasp" && this.borrowed.has(h.id)) this.mark(ev, e.playerId, keyOf);
      if (e.type === "kill" && e.victimKind === "wasp" && this.borrowed.has(e.victimId)) this.mark(ev, e.playerId, keyOf);
    }
    if (ev.kind === "hold") {
      const c = CITY_EVENTS.hold;
      const inside = near(ev.site, ev.radius);
      for (const p of inside) this.mark(ev, p.id, keyOf);
      if (inside.length) ev.progress = Math.min(ev.need, ev.progress + SIM_DT);
      const elapsed = (world.tick - ev.startTick) / SIM_HZ;
      if (elapsed >= ev.waves * c.waveEvery) this.wave(ev, world);
      if (ev.progress >= ev.need - 1e-9) ev.status = "complete";
    } else if (ev.kind === "intercept") {
      for (const e of events) {
        if (e.type !== "kill" || e.victimKind !== "wasp" || !ev.targets.includes(e.victimId) || ev.downed.includes(e.victimId)) continue;
        ev.downed.push(e.victimId);
        // a convoy wasp downed stays down for the event: the convoy is what is left of it
        const w = world.wasps.find((x) => x.id === e.victimId);
        if (w) w.respawnTimer = Infinity;
      }
      for (const id of ev.targets) {
        if (ev.downed.includes(id)) continue;
        const w = world.wasps.find((x) => x.id === id);
        if (w?.alive) for (const p of near(w.pos, ev.radius)) this.mark(ev, p.id, keyOf);
      }
      ev.progress = ev.downed.length;
      if (ev.need > 0 && ev.downed.length >= ev.need) ev.status = "complete";
    } else {
      const e = ev.escort!;
      const by = near(e.pos, e.leash);
      for (const p of by) this.mark(ev, p.id, keyOf);
      e.waiting = by.length === 0;
      if (!e.waiting && e.next < e.path.length) {
        const to = e.path[e.next]!;
        const dx = to.x - e.pos.x;
        const dz = to.z - e.pos.z;
        const d = Math.hypot(dx, dz);
        const step = e.speed * SIM_DT;
        if (d <= step) {
          e.pos.x = to.x;
          e.pos.z = to.z;
          e.walked += d;
          e.next++;
          // halfway along, VANTAGE notices: an ambush at the corner the cell just turned
          if (e.next === 2 && ev.waves === 0) this.wave(ev, world, to, CITY_EVENTS.escort.ambushRing, CITY_EVENTS.escort.ambush);
        } else {
          e.pos.x += (dx / d) * step;
          e.pos.z += (dz / d) * step;
          e.walked += step;
        }
      }
      ev.progress = e.length > 0 ? Math.min(1, e.walked / e.length) : 1;
      if (e.next >= e.path.length) ev.status = "complete";
    }
    return ev.status;
  }
}

/** the way the cell faces (a sim yaw, front -z at 0): along the leg it is walking */
function escortYaw(e: CityEscort): number {
  const i = Math.min(e.next, e.path.length - 1);
  const to = e.path[i]!;
  const from = i > 0 ? e.path[i - 1]! : e.pos;
  const dx = to.x - from.x, dz = to.z - from.z;
  return dx === 0 && dz === 0 ? 0 : Math.atan2(-dx, -dz);
}
