import { type Vec3, v3 } from "../math/vec3";
import { box, type Box } from "./box";
import type { HubDef } from "./hub";
import type { ClaimDef, ZoneDef } from "./run";

export { box, type Box };

export interface SpawnPoint {
  pos: Vec3;
  yaw: number;
}

export interface DummyDef {
  id: number;
  pos: Vec3;
  /** Optional patrol endpoint; dummy paces between pos and patrolTo. */
  patrolTo?: Vec3;
}

export type DistrictCast = "magenta" | "cyan" | "amber";

/** A flat emissive sign quad (text rendered client-side; the sim ignores it). */
export interface SignDef {
  text: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  w: number;
  h: number;
  fg: string;
  bg: string;
  border: string;
}

/** A point light in the district rig (the client caps how many it honours). */
export interface LightDef {
  x: number;
  y: number;
  z: number;
  color: "cyan" | "magenta" | "amber" | "violet" | "yellow" | "green";
  intensity: number;
  range: number;
}

/** A traffic lane beyond the perimeter: head/tail-light streaks move from → to (render only). */
export interface TrafficLane {
  from: Vec3;
  to: Vec3;
  speed: number;
  count: number;
}

/** A sidewalk loop citizens walk (render-only crowds). */
export interface WalkLoop {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** The monorail line over a street: axis it runs along, the fixed coordinate, height, and span. */
export interface TramLine {
  axis: "x" | "z";
  at: number;
  y: number;
  from: number;
  to: number;
  /** seconds between passes (each direction) */
  period: number;
}

/** A street exit through the perimeter: where the vista beyond starts and which way it runs. */
export interface StreetExit {
  x: number;
  z: number;
  dir: "n" | "s" | "e" | "w";
}

/** A holographic ad panel: a ticker of VANTAGE copy cycling colours (render only). */
export interface AdPanel {
  x: number;
  y: number;
  z: number;
  rotY: number;
  w: number;
  h: number;
}

export interface LevelDef {
  name: string;
  /** city life (render only): crowds, monorail, steam, exits, ads */
  walks?: WalkLoop[];
  pedestrians?: number;
  tram?: TramLine;
  vents?: Vec3[];
  exits?: StreetExit[];
  ads?: AdPanel[];
  /** Ledger-UI name, e.g. "LEASE ROW". */
  displayName?: string;
  /** District colour cast; drives fog, rig, and skyline. */
  district?: DistrictCast;
  /** Half extent of the playable area (radar scale, skyline inner radius). */
  bounds?: number;
  /** Render-only geometry (awnings, canopies): never collides. */
  decor?: Box[];
  signs?: SignDef[];
  lights?: LightDef[];
  traffic?: TrafficLane[];
  skylineSeed?: number;
  boxes: Box[];
  spawns: SpawnPoint[];
  dummies: DummyDef[];
  /** Kill plane: falling below this respawns the player. */
  killY: number;
  /** VANTAGE wasp patrols (waypoints in the air). */
  wasps: { waypoints: Vec3[] }[];
  /** Repo mechs walking a two-point path with a sweeping searchlight centred on `face` (yaw; default: path heading). */
  mechs: { path: Vec3[]; face?: number }[];
  /** Wake nodes (hex city nodes) and their district-graph links. */
  nodes: { id: number; label: string; pos: Vec3; links: number[] }[];
  /** The Deadletter Office: range course pads, trophy wall, renovation slots (Stage 8). */
  hub?: HubDef;
  /** THE RUN (Stage 14): safe zones (no damage, the markets, banking) — everything else is the PvP zone. */
  zones?: ZoneDef[];
  /** THE RUN: where $CAPITAL claims lie; deeper into the district is worth more. */
  claims?: ClaimDef[];
}

/**
 * Stage 1 grey-box: "Drainage Yard". A 64x64 m arena with a sunken channel,
 * mantle ledges, crates for step-ups, a long sightline for the rifle, and a
 * raised gantry. Layout is authored so the probe can exercise sprint → slide →
 * slide-jump → mantle → kill on one straight-ish run.
 */
export function drainageYard(): LevelDef {
  const boxes: Box[] = [];
  const H = 32; // half extent
  // floor slab
  boxes.push(box(-H, -1, -H, H, 0, H, "floor"));
  // perimeter walls
  boxes.push(box(-H, 0, -H - 1, H, 6, -H, "wall"));
  boxes.push(box(-H, 0, H, H, 6, H + 1, "wall"));
  boxes.push(box(-H - 1, 0, -H, -H, 6, H, "wall"));
  boxes.push(box(H, 0, -H, H + 1, 6, H, "wall"));

  // --- probe lane (runs along -Z from spawn at z=+24) ---
  // low curb for step-up at z=12
  boxes.push(box(-3, 0, 11.6, 3, 0.3, 12.4, "curb"));
  // mantle ledge block (1.2 m) at z=-2..-8 : the landing deck
  boxes.push(box(-4, 0, -8, 4, 1.2, -2, "deck"));
  // second, taller mantle (1.55 m) on top of the deck's far end -> upper deck
  boxes.push(box(-4, 0, -14, 4, 2.7, -8, "upperdeck"));
  // stairs of crates down the west side of the deck
  boxes.push(box(-8, 0, -6, -4.5, 0.4, -3, "crate"));
  boxes.push(box(-8, 0, -9.5, -4.5, 0.8, -6.5, "crate"));

  // --- sunken channel cutting east-west at z = 2..6 (a slide-jump gap) ---
  // The floor is one slab, so model the channel as a pit: replace with rims
  // (we simply leave the floor and mark the channel with kerbs; the gap is
  // represented by the drop into the pit below.)
  boxes.push(box(-H, 0, 5.6, -6, 0.5, 6.4, "kerb"));
  boxes.push(box(6, 0, 5.6, H, 0.5, 6.4, "kerb"));

  // --- east arena: pillars and cover for future PvP ---
  for (let i = 0; i < 4; i++) {
    const x = 12 + i * 5;
    boxes.push(box(x - 0.6, 0, -0.6, x + 0.6, 4.5, 0.6, "pillar"));
  }
  boxes.push(box(10, 0, -18, 26, 1.0, -16, "lowwall"));
  boxes.push(box(14, 0, 14, 22, 2.2, 15, "highwall"));
  // gantry (raised walkway) along the east wall
  boxes.push(box(26, 3.2, -26, 30, 3.5, 26, "gantry"));
  boxes.push(box(26, 0, 22, 30, 3.2, 26, "gantrystair"));

  // --- west arena: warehouse blocks ---
  boxes.push(box(-28, 0, -26, -16, 5, -14, "block"));
  boxes.push(box(-28, 0, 10, -18, 3, 22, "block"));
  boxes.push(box(-14, 0, 18, -8, 1.6, 24, "crate"));
  boxes.push(box(-14, 1.6, 21, -11, 2.4, 24, "crate"));

  // --- dressing that also collides: light gantry over the lane, barrels, cones ---
  boxes.push(box(-6.3, 0, 13.7, -5.7, 4.6, 14.3, "post"));
  boxes.push(box(5.7, 0, 13.7, 6.3, 4.6, 14.3, "post"));
  boxes.push(box(-6.3, 4.4, 13.8, 6.3, 4.6, 14.2, "bar"));
  boxes.push(box(-15.5, 0, -15.3, -14.9, 0.9, -14.7, "barrel"));
  boxes.push(box(-14.8, 0, -15.9, -14.2, 0.9, -15.3, "barrel"));
  boxes.push(box(10.4, 0, -15.6, 11.0, 0.9, -15.0, "barrel"));
  boxes.push(box(23.2, 0, 12.6, 23.8, 0.9, 13.2, "barrel"));
  boxes.push(box(26.6, 0, 13.8, 27.2, 0.7, 14.4, "cone"));
  boxes.push(box(-9.5, 0, 25.0, -8.9, 0.7, 25.6, "cone"));

  const spawns: SpawnPoint[] = [
    { pos: v3(0, 0, 24), yaw: 0 },
    { pos: v3(20, 0, 20), yaw: Math.PI / 2 },
    { pos: v3(-20, 0, 0), yaw: -Math.PI / 2 },
    { pos: v3(0, 3.5, -24), yaw: Math.PI },
  ];

  const dummies: DummyDef[] = [
    { id: 1, pos: v3(0, 2.7, -12) }, // on the upper deck, the probe's target
    { id: 2, pos: v3(18, 0, -10), patrolTo: v3(18, 0, 8) },
    { id: 3, pos: v3(-12, 0, -4) },
    { id: 4, pos: v3(6, 0, 18), patrolTo: v3(-6, 0, 18) },
    { id: 5, pos: v3(28, 3.5, 0) },
  ];

  const wasps = [
    { waypoints: [v3(16, 3.5, -6), v3(24, 3.8, 6), v3(14, 3.2, 10)] },
    { waypoints: [v3(-12, 3.5, -10), v3(-20, 3.8, 4), v3(-10, 3.2, 8)] },
  ];
  const mechs = [{ path: [v3(13, 0, -22), v3(24, 0, -22)], face: Math.PI }]; // light sweeps the arena to the north
  const nodes = [
    { id: 1, label: "A", pos: v3(0, 1.2, -5), links: [2, 3, 4] },
    { id: 2, label: "B", pos: v3(18, 0, 0), links: [1, 4, 5] },
    { id: 3, label: "C", pos: v3(-14, 0, -2), links: [1, 4] },
    { id: 4, label: "D", pos: v3(0, 0, 17), links: [1, 2, 3] },
    { id: 5, label: "E", pos: v3(20, 0, -12), links: [2] },
  ];
  const lights: LightDef[] = [
    { x: 22, y: 9, z: 18, color: "magenta", intensity: 60, range: 80 },
    { x: -20, y: 9, z: -20, color: "cyan", intensity: 60, range: 80 },
    { x: 0, y: 4.5, z: -6, color: "cyan", intensity: 14, range: 22 },
    { x: 0, y: 4.3, z: 14, color: "cyan", intensity: 12, range: 20 },
    { x: -11, y: 2.5, z: 21, color: "amber", intensity: 8, range: 12 },
  ];
  const signs: SignDef[] = [
    { text: "DEADLETTER", fg: "#35f2ff", bg: "#07111a", border: "#35f2ff", w: 6, h: 1.5, x: -22, y: 3.8, z: -13.9, rotY: 0 },
    { text: "REPO DEPOT", fg: "#ff3ec9", bg: "#170714", border: "#ff3ec9", w: 5, h: 1.25, x: -23, y: 1.9, z: 22.06, rotY: 0 },
    { text: "再租 RE-LEASE", fg: "#ffe34a", bg: "#1a1206", border: "#ffe34a", w: 4.4, h: 1.1, x: 18, y: 1.7, z: 15.06, rotY: 0 },
    { text: "VANTAGE", fg: "#ffb02e", bg: "#160f04", border: "#ffb02e", w: 5, h: 1.25, x: 31.9, y: 4.6, z: 0, rotY: -Math.PI / 2 },
    { text: "CHILL UNDER", fg: "#35f2ff", bg: "#07111a", border: "#ff3ec9", w: 3.6, h: 0.9, x: 0, y: 3.2, z: -31.9, rotY: 0 },
    { text: "LEASE-BREAKER", fg: "#ff3ec9", bg: "#170714", border: "#35f2ff", w: 4.2, h: 1.0, x: -31.9, y: 3.4, z: -4, rotY: Math.PI / 2 },
  ];
  // the gate sits on the west spawn: you wake safe, and the street beyond is the PvP zone
  const zones: ZoneDef[] = [{ kind: "safe", label: "GATE", pos: v3(-20, 0, 0), radius: 5 }];
  // claims on the nodes and one deep in the far corner; none inside the gate or on a spawn (a respawn must not pick one up)
  const claims: ClaimDef[] = [...nodes.map((n, i) => ({ pos: v3(n.pos.x, n.pos.y, n.pos.z), value: 1 + (i % 3) })), { pos: v3(H - 8, 0, H - 8), value: 5 }].filter(
    (c) => !zones.some((z) => Math.hypot(c.pos.x - z.pos.x, c.pos.z - z.pos.z) < z.radius + 2) && !spawns.some((sp) => Math.hypot(c.pos.x - sp.pos.x, c.pos.z - sp.pos.z) < 4),
  );
  return { name: "drainage_yard", displayName: "DRAINAGE YARD", district: "magenta", bounds: H, boxes, spawns, dummies, killY: -20, wasps, mechs, nodes, lights, signs, skylineSeed: 42, zones, claims };
}

// ---------------------------------------------------------------------------
// Registry: the range plus the three districts of Neo-China (shared/sim/city.ts).
import { DISTRICT_SPECS, generateDistrict } from "./city";
import { deadletterOffice, HUB_LEVEL_ID } from "./hub";
import { whiteOffice, WHITE_LEVEL_ID } from "./white";

export const DEFAULT_LEVEL_ID = "lease_row";

export const LEVEL_IDS: readonly string[] = ["drainage_yard", ...DISTRICT_SPECS.map((d) => d.id), HUB_LEVEL_ID, WHITE_LEVEL_ID];

/** What the district select lists, without building the levels. */
export const LEVEL_INFO: readonly { id: string; displayName: string; cast: DistrictCast; kind: "range" | "district" | "hub" }[] = [
  { id: "drainage_yard", displayName: "DRAINAGE YARD (RANGE)", cast: "magenta", kind: "range" },
  ...DISTRICT_SPECS.map((d) => ({ id: d.id, displayName: d.displayName, cast: d.cast, kind: "district" as const })),
  { id: HUB_LEVEL_ID, displayName: "DEADLETTER OFFICE (HUB)", cast: "cyan", kind: "hub" },
];
/** Levels the district select does not list (reached by the campaign only). */
export const HIDDEN_LEVELS: readonly string[] = [WHITE_LEVEL_ID];

/** Build a level by id; unknown ids fall back to the default district. */
export function levelById(id: string | null | undefined): LevelDef {
  if (id === "drainage_yard") return drainageYard();
  if (id === HUB_LEVEL_ID) return deadletterOffice();
  if (id === WHITE_LEVEL_ID) return whiteOffice();
  const spec = DISTRICT_SPECS.find((d) => d.id === id) ?? DISTRICT_SPECS.find((d) => d.id === DEFAULT_LEVEL_ID)!;
  return generateDistrict(spec);
}
