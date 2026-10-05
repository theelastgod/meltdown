/**
 * One contest block per district, taken off the street the district already has.
 *
 * The block is the middle of a leg between two wake posts, and only a leg that sits clear of
 * every gate and of the metro booth. Nothing is added to the level: no box, no sign, no light.
 * Inside it, the city room's world applies player damage. Outside it, the street stays PvE.
 */
import type { LevelDef, SpawnPoint } from "../sim/level";
import { cityRing } from "./events";
import { ledgerSpot } from "../net/cityledger";
import { gateArrival } from "../net/citygates";

export interface ContestVol {
  x: number;
  z: number;
  /** half the block, on both axes */
  half: number;
  label: string;
}

const HALF = 6;
const CLEAR_EXIT = 20;
const CLEAR_BOOTH = 12;

function clearOf(level: LevelDef, x: number, z: number, exits: number, booth: number): boolean {
  for (const e of level.exits ?? []) if (Math.hypot(e.x - x, e.z - z) < exits) return false;
  const spot = ledgerSpot(level);
  if (spot && Math.hypot(spot.x - x, spot.z - z) < booth) return false;
  return true;
}

/** The district's contest block, or null when no street leg sits clear of the gates and the booth. */
export function contestOf(level: LevelDef): ContestVol | null {
  const ring = cityRing(level);
  if (ring.length < 2) return null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!.pos;
    const b = ring[(i + 1) % ring.length]!.pos;
    const x = (a.x + b.x) / 2;
    const z = (a.z + b.z) / 2;
    if (!clearOf(level, x, z, CLEAR_EXIT, CLEAR_BOOTH)) continue;
    return { x, z, half: HALF, label: `${ring[i]!.label}–${ring[(i + 1) % ring.length]!.label}` };
  }
  return null;
}

export function inContest(level: LevelDef, x: number, z: number, vol: ContestVol | null = contestOf(level)): boolean {
  if (!vol) return false;
  return Math.abs(x - vol.x) <= vol.half && Math.abs(z - vol.z) <= vol.half;
}

/** The gate whose line is nearest to a point. 0 when the level has no exits. */
export function nearestGate(level: LevelDef, x: number, z: number): number {
  const exits = level.exits ?? [];
  let best = 0;
  let dist = Infinity;
  for (let i = 0; i < exits.length; i++) {
    const d = Math.hypot(exits[i]!.x - x, exits[i]!.z - z);
    if (d < dist) {
      dist = d;
      best = i;
    }
  }
  return best;
}

/** Where a file that died in the block stands up: the nearest gate, inside the street. */
export function contestRespawn(level: LevelDef, x: number, z: number): SpawnPoint | null {
  return gateArrival(level, nearestGate(level, x, z));
}

export interface FixerSpot {
  x: number;
  z: number;
  label: string;
}

/**
 * A wake post the fixer can stand on: clear of the contest block, the booth and the gate mouths.
 * The post is already in the level. Lease Row gains no triangle.
 */
export function fixerOf(level: LevelDef, vol: ContestVol | null = contestOf(level)): FixerSpot | null {
  const ring = cityRing(level);
  let best: (FixerSpot & { score: number }) | null = null;
  for (const s of ring) {
    const x = s.pos.x;
    const z = s.pos.z;
    if (vol && Math.hypot(vol.x - x, vol.z - z) < vol.half + 8) continue;
    if (!clearOf(level, x, z, 8, CLEAR_BOOTH)) continue;
    const score = vol ? Math.hypot(vol.x - x, vol.z - z) : Math.hypot(x, z);
    if (!best || score > best.score) best = { x, z, label: s.label, score };
  }
  return best ? { x: best.x, z: best.z, label: best.label } : null;
}
