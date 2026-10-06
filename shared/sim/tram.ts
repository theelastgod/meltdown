import type { TramLine } from "./level";

/** Metres per second along the beam. The rendered car uses this same number. */
export const TRAM_SPEED = 17;
/** Feet stand this far above the running surface, inside the hull. */
export const TRAM_CABIN = 0.4;
/** Cabin half-length along the beam, and half-width across it. */
export const TRAM_ALONG = 6.5;
export const TRAM_ACROSS = 1.3;
/** A jump while seated steps this far off the beam, past `TRAM_ACROSS`, so the next tick is not still aboard. */
export const TRAM_STEP_OFF = 1.6;

export interface TramCar {
  dir: 1 | -1;
  /** Feet position in the cabin. */
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  visible: boolean;
}

function wrap(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** Both cars on the line at a sim time in seconds. The rendered mesh origin is `y - TRAM_CABIN`. */
export function tramCars(line: TramLine, time: number): readonly [TramCar, TramCar] {
  const span = line.to - line.from;
  const out: TramCar[] = [];
  for (const dir of [1, -1] as const) {
    const phase = dir > 0 ? 0 : line.period / 2;
    const along = wrap(time + phase, line.period) * TRAM_SPEED;
    const visible = along < span;
    const s = dir > 0 ? line.from + along : line.to - along;
    const x = line.axis === "x" ? s : line.at;
    const z = line.axis === "z" ? s : line.at;
    out.push({
      dir,
      x,
      y: line.y + TRAM_CABIN,
      z,
      vx: visible && line.axis === "x" ? dir * TRAM_SPEED : 0,
      vz: visible && line.axis === "z" ? dir * TRAM_SPEED : 0,
      visible,
    });
  }
  return out as [TramCar, TramCar];
}

function split(line: TramLine, car: TramCar, pos: { x: number; z: number }): { along: number; across: number } {
  if (line.axis === "x") return { along: pos.x - car.x, across: pos.z - car.z };
  return { along: pos.z - car.z, across: pos.x - car.x };
}

/** The car whose cabin the feet are already in, or null. */
export function tramAboard(line: TramLine, time: number, pos: { x: number; y: number; z: number }): TramCar | null {
  for (const car of tramCars(line, time)) {
    if (!car.visible) continue;
    if (Math.abs(pos.y - car.y) > 1.2) continue;
    const d = split(line, car, pos);
    if (Math.abs(d.along) <= TRAM_ALONG && Math.abs(d.across) <= TRAM_ACROSS) return car;
  }
  return null;
}

/** A visible car close enough to hail from the street or the walkway, while looking up. */
export function tramHail(line: TramLine, time: number, pos: { x: number; y: number; z: number }): TramCar | null {
  if (tramAboard(line, time, pos)) return null;
  let best: TramCar | null = null;
  let bestD = 8;
  for (const car of tramCars(line, time)) {
    if (!car.visible) continue;
    if (pos.y > car.y - 1.2 || pos.y < car.y - 14) continue;
    const d = Math.hypot(pos.x - car.x, pos.z - car.z);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  return best;
}
