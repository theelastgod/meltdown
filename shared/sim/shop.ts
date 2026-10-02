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

export function wildLine(pos: Vec3, level: Pick<LevelDef, "wild" | "yard" | "east">): string | null {
  const spots = [level.wild, level.yard, level.east].filter((w): w is NonNullable<typeof w> => !!w);
  let best: (typeof spots)[number] | null = null;
  let bestD = WILD_TALK_RADIUS * WILD_TALK_RADIUS;
  for (const w of spots) {
    const dx = pos.x - w.outside.x;
    const dz = pos.z - w.outside.z;
    const d = dx * dx + dz * dz;
    if (d <= bestD) {
      best = w;
      bestD = d;
    }
  }
  return best ? best.line : null;
}

export function shopLine(pos: Vec3, level: Pick<LevelDef, "shop" | "pawn" | "night" | "cold" | "impound">): string | null {
  const spots = [level.shop, level.pawn, level.night, level.cold, level.impound].filter((s): s is NonNullable<typeof s> => !!s);
  let best: (typeof spots)[number] | null = null;
  let bestD = SHOP_TALK_RADIUS * SHOP_TALK_RADIUS;
  for (const s of spots) {
    const dx = pos.x - s.counter.x;
    const dz = pos.z - s.counter.z;
    const d = dx * dx + dz * dz;
    if (d <= bestD) {
      best = s;
      bestD = d;
    }
  }
  return best ? best.line : null;
}
