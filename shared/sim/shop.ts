/**
 * The walk-in shop (Stage 940). Standing at the counter is how the clerk answers.
 * The line is talk. It pays nothing and it changes no gun.
 */
import type { Vec3 } from "../math/vec3";
import type { LevelDef } from "./level";

/** How close to the counter the clerk still answers, in metres. */
export const SHOP_TALK_RADIUS = 2.2;

/** How close to the open ground the edge still announces itself, in metres. */
export const WILD_TALK_RADIUS = 3.5;

export function wildLine(pos: Vec3, level: Pick<LevelDef, "wild">): string | null {
  const w = level.wild;
  if (!w) return null;
  const dx = pos.x - w.outside.x;
  const dz = pos.z - w.outside.z;
  if (dx * dx + dz * dz > WILD_TALK_RADIUS * WILD_TALK_RADIUS) return null;
  return w.line;
}

export function shopLine(pos: Vec3, level: Pick<LevelDef, "shop">): string | null {
  const s = level.shop;
  if (!s) return null;
  const dx = pos.x - s.counter.x;
  const dz = pos.z - s.counter.z;
  if (dx * dx + dz * dz > SHOP_TALK_RADIUS * SHOP_TALK_RADIUS) return null;
  return s.line;
}
