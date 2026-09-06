/**
 * The mission runtime: steps a contract's objectives against the world.
 * Deterministic and host-agnostic — the offline client steps it after
 * each sim tick, the co-op room steps it after each server tick — and it
 * only *reads* the world plus the tick's events, except for the spawns a
 * contract asks for (relays to destroy, VANTAGE waves, Threat patrols).
 * Dialogue objectives wait for a resolution the UI (or the co-op host)
 * supplies.
 */
import { v3, type Vec3 } from "../math/vec3";
import type { LevelDef } from "../sim/level";
import type { SimEvent, World } from "../sim/world";
import { SIM_DT } from "../sim/constants";
import type { FactionId } from "./factions";
import { gateOpen, type Testimony } from "./testimony";
import { missionById, type MissionDef, type Objective, type Spot } from "./missions";
import { threatProfile, type ThreatProfile } from "./threat";

export type MissionEvent =
  | { type: "objective"; index: number; text: string }
  | { type: "wave"; count: number }
  | { type: "escort"; text: string }
  | { type: "dialogue"; script: string }
  | { type: "complete"; id: string }
  | { type: "failed"; reason: string };

export interface EscortState {
  pos: Vec3;
  /** index of the next path point */
  next: number;
  path: Vec3[];
  speed: number;
  leash: number;
  waiting: boolean;
}

export interface MissionState {
  def: MissionDef;
  objectives: Objective[];
  index: number;
  status: "running" | "complete" | "failed";
  /** progress of the current objective: kills, seconds, or 0 */
  progress: number;
  /** ticks since the current objective started */
  ticks: number;
  /** dummy ids spawned as this objective's targets */
  targets: number[];
  escort: EscortState | null;
  /** script awaiting a resolution */
  dialogue: string | null;
  testimony: Testimony;
  wavesSpawned: number;
  downTicks: number;
  events: MissionEvent[];
  threat: ThreatProfile;
  /** total VANTAGE spawned by this contract (probe bookkeeping) */
  spawned: { wasps: number; mechs: number; dummies: number };
}

function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function resolveSpot(level: LevelDef, s: Spot): Vec3 {
  if ("node" in s) {
    const n = level.nodes.find((x) => x.label === s.node);
    return n ? v3(n.pos.x, n.pos.y, n.pos.z) : v3(0, 0, 0);
  }
  return v3(s.x, 0, s.z);
}

/** A ring of waypoints in the air around a point: a wasp patrol. */
function patrolAround(c: Vec3, r: number, rnd: () => number): Vec3[] {
  const a0 = rnd() * Math.PI * 2;
  return [0, 1, 2].map((i) => {
    const a = a0 + (i / 3) * Math.PI * 2;
    return v3(c.x + Math.cos(a) * r, 3.4 + rnd() * 1.2, c.z + Math.sin(a) * r);
  });
}

/** Spawn the district's Threat presence: extra patrols around the wake nodes, a mech on the main street. */
export function spawnThreat(world: World, threat: ThreatProfile, seed = 7): { wasps: number; mechs: number } {
  const rnd = lcg(seed + world.seed);
  const anchors = world.level.nodes.length ? world.level.nodes.map((n) => n.pos) : world.level.spawns.map((s) => s.pos);
  let wasps = 0;
  let mechs = 0;
  for (let i = 0; i < threat.extraWasps; i++) {
    const c = anchors[Math.floor(rnd() * anchors.length)]!;
    world.spawnWasp(patrolAround(c, 9 + rnd() * 5, rnd));
    wasps++;
  }
  for (let i = 0; i < threat.extraMechs; i++) {
    const a = anchors[Math.floor(rnd() * anchors.length)]!;
    const b = anchors[Math.floor(rnd() * anchors.length)]!;
    world.spawnMech([v3(a.x, 0, a.z), v3(b.x, 0, b.z)]);
    mechs++;
  }
  return { wasps, mechs };
}

/** Build a contract's state and place its VANTAGE presence and Threat patrols. */
export function createMission(id: string, world: World, testimony: Testimony, faction: FactionId | null, threatRating: number): MissionState | null {
  const def = missionById(id);
  if (!def) return null;
  const threat = threatProfile(threatRating);
  let objectives = def.objectives;
  let extraWasps = 0;
  let extraMechs = 0;
  for (const v of def.variants ?? []) {
    if (gateOpen(v.gate, testimony, faction)) {
      if (v.objectives) objectives = v.objectives;
      extraWasps += v.extraWasps ?? 0;
      extraMechs += v.extraMechs ?? 0;
    }
  }
  const st: MissionState = { def, objectives: objectives.slice(), index: 0, status: "running", progress: 0, ticks: 0, targets: [], escort: null, dialogue: null, testimony: { ...testimony }, wavesSpawned: 0, downTicks: 0, events: [], threat, spawned: { wasps: 0, mechs: 0, dummies: 0 } };
  const rnd = lcg(11 + world.seed);
  const anchors = world.level.nodes.length ? world.level.nodes.map((n) => n.pos) : world.level.spawns.map((s) => s.pos);
  for (let i = 0; i < def.wasps + extraWasps; i++) {
    const c = anchors[(i * 2 + 1) % anchors.length]!;
    world.spawnWasp(patrolAround(c, 8 + rnd() * 6, rnd));
    st.spawned.wasps++;
  }
  for (let i = 0; i < def.mechs + extraMechs; i++) {
    const a = anchors[(i + 1) % anchors.length]!;
    const b = anchors[(i + 3) % anchors.length]!;
    world.spawnMech([v3(a.x, 0, a.z), v3(b.x, 0, b.z)]);
    st.spawned.mechs++;
  }
  if (!def.noThreat) {
    const t = spawnThreat(world, threat, 3);
    st.spawned.wasps += t.wasps;
    st.spawned.mechs += t.mechs;
  }
  startObjective(st, world);
  return st;
}

export function current(st: MissionState): Objective | null {
  return st.objectives[st.index] ?? null;
}

function startObjective(st: MissionState, world: World): void {
  const o = current(st);
  st.progress = 0;
  st.ticks = 0;
  st.targets = [];
  st.escort = null;
  st.dialogue = null;
  st.wavesSpawned = 0;
  if (!o) return;
  st.events.push({ type: "objective", index: st.index, text: o.text });
  if (o.kind === "destroy") {
    for (const s of o.spots) {
      const p = resolveSpot(world.level, s);
      const d = world.spawnDummy(v3(p.x, 0, p.z));
      st.targets.push(d.id);
      st.spawned.dummies++;
    }
  } else if (o.kind === "escort") {
    const path = o.path.map((s) => {
      const p = resolveSpot(world.level, s);
      return v3(p.x, 0, p.z);
    });
    st.escort = { pos: v3(path[0]!.x, 0, path[0]!.z), next: 1, path, speed: o.speed, leash: o.leash, waiting: true };
  } else if (o.kind === "dialogue") {
    st.dialogue = o.script;
    st.events.push({ type: "dialogue", script: o.script });
  }
}

function alivePlayers(world: World) {
  return [...world.players.values()].filter((p) => p.alive);
}

function nearAny(world: World, at: Vec3, radius: number): boolean {
  return alivePlayers(world).some((p) => Math.hypot(p.pos.x - at.x, p.pos.z - at.z) <= radius);
}

function spawnWave(st: MissionState, world: World, around: Vec3, count: number): void {
  const rnd = lcg(101 + st.index * 13 + st.wavesSpawned * 7 + world.seed);
  for (let i = 0; i < count; i++) {
    world.spawnWasp(patrolAround(around, 7 + rnd() * 6, rnd));
    st.spawned.wasps++;
  }
  st.wavesSpawned++;
  st.events.push({ type: "wave", count });
}

/** Resolve the open dialogue with the choices made (testimony) and move on. */
export function resolveDialogue(st: MissionState, testimony: Testimony): boolean {
  if (!st.dialogue || st.status !== "running") return false;
  for (const [k, v] of Object.entries(testimony)) st.testimony[k] = v;
  st.dialogue = null;
  return true;
}

/** One sim tick: read the world and the tick's events, advance the current objective. */
export function stepMission(st: MissionState, world: World, events: readonly SimEvent[]): void {
  if (st.status !== "running") return;
  const o = current(st);
  if (!o) {
    st.status = "complete";
    st.events.push({ type: "complete", id: st.def.id });
    return;
  }
  // every Blank down for too long: the contract fails
  if (world.players.size > 0 && alivePlayers(world).length === 0) {
    st.downTicks++;
    if (st.downTicks * SIM_DT > (st.def.failAfterDownSeconds ?? 8)) {
      st.status = "failed";
      st.events.push({ type: "failed", reason: "EVERY BLANK RE-LEASED" });
      return;
    }
  } else st.downTicks = 0;
  st.ticks++;
  let done = false;
  switch (o.kind) {
    case "dialogue":
      done = st.dialogue === null;
      break;
    case "reach":
      done = nearAny(world, resolveSpot(world.level, o.at), o.radius);
      break;
    case "kill": {
      for (const ev of events) if (ev.type === "kill" && (o.target === "any" || ev.victimKind === o.target)) st.progress++;
      done = st.progress >= o.count;
      break;
    }
    case "destroy": {
      st.progress = st.targets.filter((id) => !world.dummies.find((d) => d.id === id)?.alive).length;
      done = st.progress >= st.targets.length;
      break;
    }
    case "survive":
    case "hold": {
      const at = o.at ? resolveSpot(world.level, o.at) : null;
      const inside = !at || nearAny(world, at, o.radius ?? 6);
      if (inside) st.progress += SIM_DT;
      const waves = o.waves ?? 0;
      if (waves > 0) {
        const every = o.seconds / (waves + 1);
        if (st.wavesSpawned < waves && st.progress >= every * (st.wavesSpawned + 1) - 1e-6) spawnWave(st, world, at ?? alivePlayers(world)[0]?.pos ?? v3(0, 0, 0), 2 + Math.floor(st.threat.rating / 3));
      }
      done = st.progress >= o.seconds;
      break;
    }
    case "escort": {
      const e = st.escort!;
      const near = alivePlayers(world).some((p) => Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z) <= e.leash);
      if (near !== !e.waiting) st.events.push({ type: "escort", text: near ? "IDA IS MOVING" : "IDA IS WAITING — STAY CLOSE" });
      e.waiting = !near;
      if (near && e.next < e.path.length) {
        const to = e.path[e.next]!;
        const dx = to.x - e.pos.x;
        const dz = to.z - e.pos.z;
        const d = Math.hypot(dx, dz);
        const step = e.speed * SIM_DT;
        if (d <= step) {
          e.pos.x = to.x;
          e.pos.z = to.z;
          e.next++;
        } else {
          e.pos.x += (dx / d) * step;
          e.pos.z += (dz / d) * step;
        }
      }
      st.progress = e.next / e.path.length;
      done = e.next >= e.path.length;
      break;
    }
  }
  if (done) {
    st.index++;
    startObjective(st, world);
    if (!current(st)) {
      st.status = "complete";
      st.events.push({ type: "complete", id: st.def.id });
    }
  }
}

/** Drain pending UI events. */
export function drainMissionEvents(st: MissionState): MissionEvent[] {
  const out = st.events.slice();
  st.events.length = 0;
  return out;
}

/** A compact view for HUDs and probes. */
export function missionView(st: MissionState) {
  const o = current(st);
  return {
    id: st.def.id,
    title: st.def.title,
    status: st.status,
    index: st.index,
    total: st.objectives.length,
    objective: o ? o.text : "",
    kind: o?.kind ?? "",
    progress: Math.round(st.progress * 100) / 100,
    need: o ? (o.kind === "kill" ? o.count : o.kind === "survive" || o.kind === "hold" ? o.seconds : o.kind === "destroy" ? st.targets.length : 1) : 0,
    dialogue: st.dialogue,
    escort: st.escort ? { x: st.escort.pos.x, z: st.escort.pos.z, waiting: st.escort.waiting } : null,
    targets: st.targets.slice(),
    spawned: { ...st.spawned },
    testimony: { ...st.testimony },
    threat: st.threat.rating,
  };
}
