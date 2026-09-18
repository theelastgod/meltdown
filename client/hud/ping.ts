/**
 * The map never heard the shot (Stage 104).
 *
 * Stage 81 gave every gun in the street a voice from its muzzle, panned and delayed by where it
 * was fired from; the map in the corner drew none of it. A shooter in every game leaves a mark on
 * the minimap where the gun went off — the one read that turns "somewhere to the left" into a
 * place to go or a place to leave — and this map drew nodes, dummies and the contract's spots and
 * nothing that moved. The position was already in hand: both shot paths compute the gun cue from
 * the muzzle before this stage, so the ping is the same point the ear was given.
 *
 * Pure so the rule is unit-tested: what is remembered, for how long, and where it lands on the map
 * (`place`, the same rim-pinning the contract's spots use, so a shot off the map still says which
 * way it was).
 */
import { place } from "./radar";

/** seconds a ping stays on the map */
export const PING_LIFE = 1.5;
/** the most pings kept: a street full of guns is a street full of guns, not a wall of dots */
export const PING_MAX = 12;

export type PingKind = "file" | "wasp";

export interface Ping {
  x: number;
  z: number;
  /** the clock reading when the shot was heard (seconds) */
  at: number;
  kind: PingKind;
}

export interface PingMark {
  x: number;
  y: number;
  /** 1 as it lands, 0 as it fades */
  alpha: number;
  edge: boolean;
  kind: PingKind;
}

/** Remember a shot; the oldest goes when the book is full. */
export function rememberPing(pings: Ping[], ping: Ping, max = PING_MAX): Ping[] {
  const out = [...pings, ping];
  return out.length > max ? out.slice(out.length - max) : out;
}

/** Drop what has faded. */
export function prunePings(pings: readonly Ping[], now: number, life = PING_LIFE): Ping[] {
  return pings.filter((p) => now - p.at >= 0 && now - p.at < life);
}

/** The marks to draw, newest last so it lands on top. */
export function pingMarks(pings: readonly Ping[], at: { x: number; z: number }, yaw: number, scale: number, w: number, h: number, now: number, life = PING_LIFE, pad = 3): PingMark[] {
  const out: PingMark[] = [];
  for (const p of pings) {
    const age = now - p.at;
    if (age < 0 || age >= life) continue;
    const m = place(p, at, yaw, scale, w, h, pad);
    out.push({ x: m.x, y: m.y, alpha: 1 - age / life, edge: m.edge, kind: p.kind });
  }
  return out;
}
