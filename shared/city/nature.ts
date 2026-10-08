/**
 * A few plants on sidewalks the district already has.
 *
 * Indoor rooms and a street with no walks get none. The renderer draws the
 * spots. Nothing here is a dressed triangle or a new district.
 */
export interface GroveWalk {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

const INDOOR = new Set(["drainage_yard", "deadletter_office", "white_office", "file_apartment"]);

/** Up to six kerb spots, taken off existing walks. */
export function groveSpots(name: string | undefined, walks: readonly GroveWalk[]): { x: number; z: number }[] {
  if (!name || INDOOR.has(name) || walks.length === 0) return [];
  const n = Math.min(6, walks.length);
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const w = walks[(i * 3) % walks.length]!;
    const nudge = ((name.charCodeAt(i % name.length) % 5) - 2) * 0.35;
    out.push({ x: (w.x0 + w.x1) / 2 + nudge, z: (w.z0 + w.z1) / 2 });
  }
  return out;
}
