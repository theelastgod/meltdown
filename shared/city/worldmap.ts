/**
 * The WORLD MAP's layout (Stage 705): the city's districts drawn where the gates put them.
 *
 * The city tiles (shared/net/citygates.ts): the district at map cell (x, z) is
 * CITY_DISTRICTS[(x + z) mod n], and leaving east or south steps one along the list. So one run of
 * the tiling that holds every district once is a staircase: district i at (ceil(i/2), floor(i/2)),
 * east, south, east, south. That is what the map draws — a real window of the tiling, not a picture
 * of it — and the joins between neighbouring tiles are real gate pairs.
 *
 * A tile's side with no tile beside it in the window still has gates; those are drawn as stubs that
 * name where they lead (the tiling wraps: LEASE ROW's west is RELAY HEIGHTS).
 *
 * Every link and stub here is read off `neighbourAt`, never assumed: a tile beside another is joined
 * only when that side's gates really lead there, and the test holds the whole layout to it.
 */
import { CITY_DISTRICTS } from "../net/city";
import { GATES_PER_DISTRICT, gateSide, neighbourAt, pairedGate } from "../net/citygates";
import { LEVEL_INFO, levelDisplayName, type DistrictCast, type StreetExit } from "../sim/level";

export interface MapTile {
  district: string;
  name: string;
  cast: DistrictCast;
  /** the tiling cell: column and row */
  x: number;
  z: number;
}

/** A join between two tiles side by side: the gates of `a` on `side` that lead to `b`, and theirs back. */
export interface MapLink {
  a: string;
  b: string;
  /** the side of `a` it leaves by: east (b is to the right) or south (b is below) */
  side: "e" | "s";
  /** [gate of a, gate of b] pairs */
  gates: [number, number][];
}

/** A side of a tile with no tile beside it: where its gates lead. */
export interface MapStub {
  district: string;
  side: StreetExit["dir"];
  to: string;
  gates: number[];
}

export interface WorldMapLayout {
  cols: number;
  rows: number;
  tiles: MapTile[];
  links: MapLink[];
  stubs: MapStub[];
}

const STEP: Record<StreetExit["dir"], { dx: number; dz: number }> = { n: { dx: 0, dz: -1 }, s: { dx: 0, dz: 1 }, w: { dx: -1, dz: 0 }, e: { dx: 1, dz: 0 } };
const SIDES: readonly StreetExit["dir"][] = ["n", "e", "s", "w"];

/** the gates of `district` on `side`, and where each leads */
function gatesOn(district: string, side: StreetExit["dir"], districts: readonly string[]): { gate: number; to: string; back: number }[] {
  const out: { gate: number; to: string; back: number }[] = [];
  for (let g = 0; g < GATES_PER_DISTRICT; g++) {
    if (gateSide(g) !== side) continue;
    const n = neighbourAt(district, g, districts);
    if (n) out.push({ gate: g, to: n.district, back: n.gate });
  }
  return out;
}

/** The map: each district on its staircase cell, the joins between tiles side by side, and the stubs. */
export function worldMapLayout(districts: readonly string[] = CITY_DISTRICTS): WorldMapLayout {
  const tiles: MapTile[] = districts.map((d, i) => ({ district: d, name: levelDisplayName(d), cast: LEVEL_INFO.find((l) => l.id === d)?.cast ?? "magenta", x: Math.ceil(i / 2), z: Math.floor(i / 2) }));
  const at = (x: number, z: number) => tiles.find((t) => t.x === x && t.z === z) ?? null;
  const links: MapLink[] = [];
  const stubs: MapStub[] = [];
  for (const t of tiles) {
    for (const side of SIDES) {
      const gs = gatesOn(t.district, side, districts);
      if (!gs.length) continue;
      const beside = at(t.x + STEP[side].dx, t.z + STEP[side].dz);
      // a join is drawn once, from the tile it leaves east or south, and only where the gates agree
      if (beside && gs.every((g) => g.to === beside.district)) {
        if (side === "e" || side === "s") links.push({ a: t.district, b: beside.district, side, gates: gs.map((g) => [g.gate, g.back]) });
        continue;
      }
      // the gates on one side all lead to one neighbour (the tiling steps one district per side)
      stubs.push({ district: t.district, side, to: gs[0]!.to, gates: gs.map((g) => g.gate) });
    }
  }
  return { cols: tiles.reduce((m, t) => Math.max(m, t.x + 1), 0), rows: tiles.reduce((m, t) => Math.max(m, t.z + 1), 0), tiles, links, stubs };
}

/** Where a district's gates lead, side by side, for the map's details: `N · W → RELAY HEIGHTS`. */
export function gateSummary(district: string, districts: readonly string[] = CITY_DISTRICTS): { sides: StreetExit["dir"][]; to: string }[] {
  const by = new Map<string, StreetExit["dir"][]>();
  for (const side of SIDES) {
    for (const g of gatesOn(district, side, districts)) {
      const s = by.get(g.to) ?? [];
      if (!s.includes(side)) s.push(side);
      by.set(g.to, s);
    }
  }
  return [...by.entries()].map(([to, sides]) => ({ sides, to }));
}

/** a gate pair really is one: gate `a` of `from` leads to `to`'s gate `b`, and `b` leads back to `a` */
export const isGatePair = (from: string, a: number, to: string, b: number, districts: readonly string[] = CITY_DISTRICTS): boolean =>
  neighbourAt(from, a, districts)?.district === to && neighbourAt(from, a, districts)?.gate === b && neighbourAt(to, b, districts)?.district === from && neighbourAt(to, b, districts)?.gate === a && pairedGate(a) === b;
