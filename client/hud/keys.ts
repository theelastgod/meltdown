/**
 * The tutorial never left (Stage 130). The line at the foot of the screen — `WASD · HOLD CLICK
 * fire · R reload · SPACE jump · CTRL slide · SHIFT sprint` — had been there in every frame since
 * the first HUD, for a file on its first minute and a file on its thousandth. It now teaches only
 * what the file has not yet done, and goes once it has done all of it.
 *
 * Five of the six facts were counted and one was sampled, and the sampled one was the one that
 * went missing (Stage 164). Shots, jumps and slides are running totals, and a reload lasts long
 * enough to land in any frame; sprinting was read from the frame's own instantaneous speed, and
 * the tutorial is folded on drawn frames only. On a machine whose sim outruns its renderer a
 * sprint can peak and fall away between two frames, and the line goes on asking for a key the
 * file has already pressed. The speed is now read from the sim's own high-water mark, which is
 * taken every tick and only ever rises.
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

/**
 * what this frame teaches, from the file's own state: a lesson once seen stays seen. Every fact
 * here is cumulative, so a frame missed is not a lesson missed — `topSpeed` is the sim's
 * high-water mark, not the speed this frame happens to be drawn at (Stage 164).
 */
export function learn(seen: Seen, read: { topSpeed: number; sprintSpeed: number; shots: number; reloading: boolean; jumps: number; slides: number }): Seen {
  return {
    moved: seen.moved || read.topSpeed > 0.5,
    fired: seen.fired || read.shots > 0,
    reloaded: seen.reloaded || read.reloading,
    jumped: seen.jumped || read.jumps > 0,
    slid: seen.slid || read.slides > 0,
    sprinted: seen.sprinted || read.topSpeed >= read.sprintSpeed,
  };
}
