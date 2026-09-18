/**
 * The wasp that found you (Stage 98).
 *
 * A VANTAGE wasp on patrol sees a file and turns to chase it. Its light goes from amber to a hot
 * orange — a point light on a drone half a metre long, very often behind you, in the rain. That is
 * the whole announcement. The first thing most players hear of it is its gun, which Stage 81 made
 * audible. A mech that flags you gets a two-tone and a HUD flag; a wasp that acquires you gets
 * nothing, and it is the one that shoots first.
 *
 * The client already receives every wasp's state each frame — patrol, chase, disabled — offline from
 * the simulation and online from the room's entity list. This is the edge rule, pure so it is
 * unit-tested: which wasps went live this frame, how far and which way, and which of those are
 * worth a cue. A wasp loses its target after three seconds and finds it again a moment later, so a
 * wasp that has cued recently does not cue again; the room can be loud without becoming a klaxon.
 *
 * What it will not claim is *whose* target the wasp has: the wire does not say. WASP LIVE is a
 * wasp gone live near you, which is what a player needs to know either way.
 */
import { clamp } from "../shared/math/vec3";
import { bearing } from "./hud/damage";

export interface WaspSeen {
  id: number;
  /** 0 patrol, 1 chase, 2 disabled — the same numbers the renderer reads */
  state: number;
  x: number;
  y: number;
  z: number;
}

export interface WaspCue {
  id: number;
  /** radians, clockwise from where the file is looking */
  bearing: number;
  /** −1 hard left, +1 hard right */
  pan: number;
  /** 0..1 */
  gain: number;
  distance: number;
}

/** past this a wasp going live is somebody else's problem (metres) */
export const LOCK_RANGE = 34;
/** a wasp that cued this recently does not cue again (seconds): it loses and re-finds every few seconds */
export const LOCK_COOLDOWN = 5;

/**
 * The wasps that went live this frame and are worth a cue. `prev` is last frame's state by id and
 * `cued` the clock at each wasp's last cue; both are updated in place, and both forget wasps that
 * are gone.
 */
export function waspLocks(prev: Map<number, number>, cued: Map<number, number>, now: readonly WaspSeen[], listener: { x: number; y: number; z: number; yaw: number }, clock: number): WaspCue[] {
  const out: WaspCue[] = [];
  const seen = new Set<number>();
  for (const w of now) {
    seen.add(w.id);
    const was = prev.get(w.id);
    prev.set(w.id, w.state);
    // the edge is into chase from anything else; a wasp first seen already chasing counts too,
    // because to this client that is the moment it went live
    if (w.state !== 1 || was === 1) continue;
    const distance = Math.hypot(w.x - listener.x, w.y - listener.y, w.z - listener.z);
    if (distance >= LOCK_RANGE) continue;
    const last = cued.get(w.id);
    if (last !== undefined && clock - last < LOCK_COOLDOWN) continue;
    cued.set(w.id, clock);
    const b = bearing(w.x, w.z, listener.x, listener.z, listener.yaw);
    const fall = 1 - distance / LOCK_RANGE;
    out.push({ id: w.id, bearing: b, pan: Math.sin(b) * clamp(distance / 3, 0, 1), gain: 0.4 + 0.6 * fall, distance });
  }
  for (const id of [...prev.keys()]) if (!seen.has(id)) prev.delete(id);
  for (const id of [...cued.keys()]) if (!seen.has(id)) cued.delete(id);
  return out;
}
