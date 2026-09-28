/**
 * The city's gates (Stage 697): the districts joined into one walkable world.
 *
 * Every district has eight street gates in its perimeter (shared/sim/city.ts writes them into the
 * level's `exits`, two to a side, on the avenues either side of the plaza). Until now nothing read
 * them: they were chain-link across a vista. In the city they are doors. A file that walks into a
 * gate and stands there for a moment travels to the neighbouring district's city room, and arrives
 * at the gate on the other side that leads back, facing into the streets.
 *
 * The map: the city tiles. The district at map cell (x, z) is CITY_DISTRICTS[(x + z) mod n], so
 * leaving east or south steps one along CITY_DISTRICTS and leaving west or north steps one back.
 * Every walk around a block of the map closes (east then south is south then east), and every gate
 * pairs with exactly one gate of its neighbour: the same avenue, the opposite side.
 *
 * Only the city (campaign mode "city") has doors. A PvP room, a contract, THE RUN and an Audit
 * walk the same levels and their gates stay shut: `gateToTravel` answers null for any other mode.
 *
 * The arrival is the server's to place. A page names where it came from and the gate it came
 * through (`from=<district>&gate=<n>`); the room accepts that only when gate n of its own district
 * really leads to `from`, and puts the file at its own gate's arrival point. A client names a gate,
 * never a coordinate.
 */
import { v3 } from "../math/vec3";
import { LEVEL_INFO, levelDisplayName, type DistrictCast, type LevelDef, type SpawnPoint, type StreetExit } from "../sim/level";
import { CITY_DISTRICTS, cityDistrict, cityPageUrl } from "./city";

/** gates in a district: the level's `exits`, in the order the generator writes them */
export const GATES_PER_DISTRICT = 8;

/**
 * The order `generateDistrict` writes a district's exits: for each avenue (x or z = -16.5, then
 * +16.5), north, south, west, east. So a gate's side is `g % 4` and the gate across the seam from
 * it, on the same avenue and the opposite side, is `g ^ 1` (n↔s, w↔e).
 */
export const GATE_SIDES: readonly StreetExit["dir"][] = ["n", "s", "w", "e"];

/** the side of the district a gate is in */
export const gateSide = (gate: number): StreetExit["dir"] => GATE_SIDES[gate % 4]!;

/** the gate of the neighbour that a gate joins: same avenue, opposite side */
export const pairedGate = (gate: number): number => gate ^ 1;

/** within this many metres of a gate's line (and in its mouth) the HUD names where it goes */
export const GATE_PROMPT_M = 5;
/** within this many metres of a gate's line, in its mouth, the file is walking into it */
export const GATE_TRIGGER_M = 1.2;
/** half the width of a gate's mouth that counts: the street is 9 m, its walls are the facade */
export const GATE_MOUTH_M = 3.5;
/** how long a file stands in the gate before it goes (seconds): long enough that a file never bounces */
export const GATE_HOLD_S = 1;
/** how far inside its gate an arriving file stands: clear of the prompt, so it does not bounce back */
export const GATE_ARRIVE_M = 6.5;

/** Where a gate goes: the neighbouring district and the gate there that leads back. */
export interface GateLink {
  district: string;
  gate: number;
}

/** A valid gate index: an integer in [0, 8). */
const isGate = (gate: number): boolean => Number.isInteger(gate) && gate >= 0 && gate < GATES_PER_DISTRICT;

/**
 * The neighbour graph: through gate `gate` of `district`, which district, and which of its gates.
 * Null for a district that is not a city, a gate that does not exist, or a city of one district
 * (a gate that led back into its own room would be a door to nowhere).
 */
export function neighbourAt(district: string, gate: number, districts: readonly string[] = CITY_DISTRICTS): GateLink | null {
  const i = districts.indexOf(district);
  const n = districts.length;
  if (i < 0 || n < 2 || !isGate(gate)) return null;
  const side = gateSide(gate);
  const step = side === "e" || side === "s" ? 1 : -1;
  return { district: districts[(i + step + n) % n]!, gate: pairedGate(gate) };
}

/** a gate's outward direction (x, z): out of the district, through the gate */
function outward(dir: StreetExit["dir"]): { x: number; z: number } {
  return dir === "n" ? { x: 0, z: -1 } : dir === "s" ? { x: 0, z: 1 } : dir === "w" ? { x: -1, z: 0 } : { x: 1, z: 0 };
}

/** A position against a gate: how far inside its line (metres, ≥ 0 inside), and how far off its centre along it. */
function against(e: StreetExit, pos: { x: number; z: number }): { inside: number; off: number } {
  const o = outward(e.dir);
  const dx = pos.x - e.x;
  const dz = pos.z - e.z;
  return { inside: -(dx * o.x + dz * o.z), off: Math.abs(dx * o.z - dz * o.x) };
}

/** Whether this page may use the gates at all: the city, a district level with its eight gates. */
function gated(level: LevelDef, mode: string): boolean {
  return mode === "city" && CITY_DISTRICTS.includes(level.name) && (level.exits?.length ?? 0) === GATES_PER_DISTRICT;
}

/** The gate a file stands near, within `range` metres of its line and in its mouth, or null. */
function gateWithin(level: LevelDef, mode: string, pos: { x: number; z: number }, range: number): number | null {
  if (!gated(level, mode)) return null;
  const exits = level.exits!;
  for (let g = 0; g < exits.length; g++) {
    const a = against(exits[g]!, pos);
    // inside ≥ -1 m: the gate's own box is 0.6 m deep, and nothing stands beyond it
    if (a.off <= GATE_MOUTH_M && a.inside <= range && a.inside >= -1 && neighbourAt(level.name, g)) return g;
  }
  return null;
}

/**
 * The trigger: the gate a file at `pos` is walking into, or null. Only in the city; only a gate
 * with somewhere to go. The hold (`stepGateHold`) decides when it goes.
 */
export function gateToTravel(pos: { x: number; z: number }, level: LevelDef, mode: string): number | null {
  return gateWithin(level, mode, pos, GATE_TRIGGER_M);
}

/** The prompt: the gate near enough to name, and where it leads, or null. */
export function gatePrompt(pos: { x: number; z: number }, level: LevelDef, mode: string): { gate: number; to: GateLink } | null {
  const g = gateWithin(level, mode, pos, GATE_PROMPT_M);
  if (g === null) return null;
  return { gate: g, to: neighbourAt(level.name, g)! };
}

/**
 * A gate dressed as a door (Stage 704): what the renderer hangs over its mouth and the map marks it
 * with. The street it seals (centre, side, half its width, the gate's height) and where it leads:
 * the neighbour's name and its cast colour.
 */
export interface GateSign {
  gate: number;
  x: number;
  z: number;
  dir: StreetExit["dir"];
  /** half the street's width at the gate: the gate box's own extent along its line */
  half: number;
  /** the top of the gate box (metres) */
  top: number;
  to: GateLink;
  /** the destination's name, as the HUD line says it */
  name: string;
  /** the destination's cast: its sign and its map mark are drawn in that colour */
  cast: DistrictCast;
}

/**
 * The gates to dress as doors, in gate order. Only in the city, like everything else here: any other
 * mode answers [] and its gates are the chain-link they always were. A gate with nowhere to go is left
 * out (a city of one district has no doors).
 */
export function gateSigns(level: LevelDef, mode: string): GateSign[] {
  if (!gated(level, mode)) return [];
  const out: GateSign[] = [];
  const exits = level.exits!;
  for (let g = 0; g < exits.length; g++) {
    const e = exits[g]!;
    const to = neighbourAt(level.name, g);
    if (!to) continue;
    const ns = e.dir === "n" || e.dir === "s";
    // the gate box on this exit's line: its extent across the street is the mouth
    const box = level.boxes.find((b) => {
      if (b.tag !== "gate") return false;
      return ns
        ? Math.abs((b.min.x + b.max.x) / 2 - e.x) < 0.01 && e.z >= b.min.z - 0.01 && e.z <= b.max.z + 0.01
        : Math.abs((b.min.z + b.max.z) / 2 - e.z) < 0.01 && e.x >= b.min.x - 0.01 && e.x <= b.max.x + 0.01;
    });
    const half = box ? (ns ? box.max.x - box.min.x : box.max.z - box.min.z) / 2 : GATE_MOUTH_M;
    const cast = LEVEL_INFO.find((l) => l.id === to.district)?.cast ?? "magenta";
    out.push({ gate: g, x: e.x, z: e.z, dir: e.dir, half, top: box?.max.y ?? 3.2, to, name: levelDisplayName(to.district), cast });
  }
  return out;
}

/** a gate's inward direction (x, z): from its line into the district */
export function gateInward(dir: StreetExit["dir"]): { x: number; z: number } {
  const o = outward(dir);
  return { x: -o.x, z: -o.z };
}

/** A file's time in a gate: which gate, and how long it has stood there. */
export interface GateHold {
  gate: number;
  held: number;
}

/**
 * One step of the hold. Standing in the same gate adds `dt`; stepping out (or into another gate)
 * starts again. `go` is true on the step the hold reaches GATE_HOLD_S.
 */
export function stepGateHold(hold: GateHold | null, gate: number | null, dt: number): { hold: GateHold | null; go: boolean } {
  if (gate === null) return { hold: null, go: false };
  const held = (hold && hold.gate === gate ? hold.held : 0) + dt;
  // sixty sums of 1/60 fall a hair short of 1: the tolerance keeps a one-second hold at sixty ticks
  return { hold: { gate, held }, go: held >= GATE_HOLD_S - 1e-9 };
}

/** How far through the hold, 0..1, for the HUD. */
export const holdProgress = (hold: GateHold | null): number => (hold ? Math.min(1, hold.held / GATE_HOLD_S) : 0);

/**
 * Where a file arriving through `gate` stands: GATE_ARRIVE_M inside the gate's line on its centre,
 * facing into the district. Null when the level has no such gate.
 */
export function gateArrival(level: LevelDef, gate: number): SpawnPoint | null {
  const e = isGate(gate) ? level.exits?.[gate] : undefined;
  if (!e) return null;
  const o = outward(e.dir);
  // yaw 0 faces -z (the sim's forward is (-sin yaw, -cos yaw)); inward is -o
  return { pos: v3(e.x - o.x * GATE_ARRIVE_M, 0, e.z - o.z * GATE_ARRIVE_M), yaw: Math.atan2(o.x, o.z) };
}

/**
 * The server's check of a page's arrival hint. Accepted only when `gate` is one of this level's
 * gates and it really leads to `from`: then the arrival point of that gate, else null (the room's
 * own spawn). Never a coordinate the client chose.
 */
export function arrivalFor(level: LevelDef, from: string | null | undefined, gate: string | null | undefined): SpawnPoint | null {
  if (!from || gate == null || !/^[0-7]$/.test(gate)) return null;
  const g = Number(gate);
  if (!CITY_DISTRICTS.includes(level.name) || neighbourAt(level.name, g)?.district !== from) return null;
  return gateArrival(level, g);
}

/** The arrival a socket's (or a page's) query names, checked against the level. */
export const arrivalFromQuery = (level: LevelDef, q: URLSearchParams | null | undefined): SpawnPoint | null => (q ? arrivalFor(level, q.get("from"), q.get("gate")) : null);

/** The campaign host a city socket is on (`ws://h` for `ws://h/campaign/city-lease_row?…`), or null. */
export function cityWsBase(net: string | null | undefined): string | null {
  if (!net) return null;
  try {
    const u = new URL(net);
    const m = u.pathname.match(/^(.*)\/campaign\/city-[a-z_]+$/);
    return m ? `${u.protocol}//${u.host}${m[1]}` : null;
  } catch {
    return null;
  }
}

/**
 * The page a file walks into through gate `gate` of the city it is in: the neighbour's city, with
 * the arrival hint for the room. Null when the page is not a city or the gate goes nowhere.
 */
export function gateTravelUrl(href: string, gate: number): { url: string; to: GateLink } | null {
  let q: URLSearchParams;
  try {
    q = new URL(href).searchParams;
  } catch {
    return null;
  }
  const here = q.get("level");
  if (!here || cityDistrict(here) !== here) return null;
  const wsBase = cityWsBase(q.get("net"));
  const to = neighbourAt(here, gate);
  if (!wsBase || !to) return null;
  return { url: cityPageUrl(href, { wsBase, level: to.district, shop: q.get("shop"), arrive: { from: here, gate: to.gate } }), to };
}

/**
 * The WORLD MAP's trip (Stage 705): the page that walks another district's city, from a page walking
 * this one — the same campaign host, the same kept `shop`, no gate (the room puts the file at its own
 * spawn). Null when the page is not a city, the district is not one, or it is where the page already is.
 */
export function cityMapTravelUrl(href: string, district: string): string | null {
  let q: URLSearchParams;
  try {
    q = new URL(href).searchParams;
  } catch {
    return null;
  }
  const here = q.get("level");
  const wsBase = cityWsBase(q.get("net"));
  if (!wsBase || !here || cityDistrict(here) !== here || !CITY_DISTRICTS.includes(district) || district === here) return null;
  return cityPageUrl(href, { wsBase, level: district, shop: q.get("shop") });
}
