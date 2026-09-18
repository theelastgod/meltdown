/**
 * The tutorial never left (Stage 130). The line at the foot of the screen — `WASD · HOLD CLICK
 * fire · R reload · SPACE jump · CTRL slide · SHIFT sprint` — had been there in every frame since
 * the first HUD, for a file on its first minute and a file on its thousandth. It now teaches only
 * what the file has not yet done, and goes once it has done all of it.
 */

export interface Seen {
  moved: boolean;
  fired: boolean;
  reloaded: boolean;
  jumped: boolean;
  slid: boolean;
  sprinted: boolean;
}

export const NOTHING_SEEN: Seen = { moved: false, fired: false, reloaded: false, jumped: false, slid: false, sprinted: false };

const LESSONS: readonly [keyof Seen, string][] = [
  ["moved", "WASD"],
  ["fired", "HOLD CLICK fire"],
  ["reloaded", "R reload"],
  ["jumped", "SPACE jump"],
  ["slid", "CTRL slide"],
  ["sprinted", "SHIFT sprint"],
];

/** the line for what is still to learn; empty once everything has been done */
export function keysLine(seen: Seen): string {
  return LESSONS.filter(([k]) => !seen[k]).map(([, text]) => text).join(" · ");
}

/** what this frame teaches, from the file's own state: a lesson once seen stays seen */
export function learn(seen: Seen, read: { speed: number; sprintSpeed: number; shots: number; reloading: boolean; jumps: number; slides: number }): Seen {
  return {
    moved: seen.moved || read.speed > 0.5,
    fired: seen.fired || read.shots > 0,
    reloaded: seen.reloaded || read.reloading,
    jumped: seen.jumped || read.jumps > 0,
    slid: seen.slid || read.slides > 0,
    sprinted: seen.sprinted || read.speed >= read.sprintSpeed,
  };
}
