/**
 * The walk-in shop (Stage 940). Standing at the counter is how the clerk answers.
 * The line is talk. It pays nothing and it changes no gun.
 */
import type { Vec3 } from "../math/vec3";
import type { LevelDef } from "./level";

/** How close to the counter the clerk still answers, in metres. */
export const SHOP_TALK_RADIUS = 2.2;

export function shopLine(pos: Vec3, level: Pick<LevelDef, "shop">): string | null {
  const s = level.shop;
  if (!s) return null;
  const dx = pos.x - s.counter.x;
  const dz = pos.z - s.counter.z;
  if (dx * dx + dz * dz > SHOP_TALK_RADIUS * SHOP_TALK_RADIUS) return null;
  return s.line;
}
