/**
 * The endgame clock: UTC day, ISO-ish week and 28-day season indices from
 * a millisecond timestamp. Everything seeded by the server (daily
 * contracts, the week's Audit playlist) derives from these so every host
 * and every client agrees without talking.
 */
export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;
export const SEASON_DAYS = 28;

/** days since the epoch (UTC) */
export const dayIndex = (now = Date.now()): number => Math.floor(now / DAY_MS);
/** weeks since the epoch, weeks starting on Monday (day 4 of the epoch was a Thursday) */
export const weekIndex = (now = Date.now()): number => Math.floor((dayIndex(now) + 3) / 7);
/** 28-day seasons since the epoch */
export const seasonIndex = (now = Date.now()): number => Math.floor(dayIndex(now) / SEASON_DAYS);
/** week within the season (1–4) */
export const seasonWeek = (now = Date.now()): number => Math.floor((dayIndex(now) % SEASON_DAYS) / 7) + 1;

export function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** A deterministic pick of `n` distinct indices out of `count`. */
export function pickDistinct(seed: number, count: number, n: number): number[] {
  const rnd = lcg(seed);
  const pool = Array.from({ length: count }, (_, i) => i);
  const out: number[] = [];
  while (out.length < Math.min(n, count)) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!);
  return out;
}
