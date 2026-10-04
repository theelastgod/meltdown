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

export function wildLine(pos: Vec3, level: Pick<LevelDef, "wild" | "yard" | "east" | "lane" | "berth" | "apron" | "ramp" | "quay" | "slip" | "stall" | "span" | "bay" | "crest" | "wharf" | "ledge" | "aisle" | "booth" | "mast" | "keel" | "spire" | "cleat" | "bollard" | "pylon" | "crate" | "hoist" | "bitt" | "strut" | "lantern" | "jack" | "tie" | "hook" | "spar" | "tarp" | "chock" | "skid" | "fender" | "stem" | "awning" | "vane" | "winch" | "valance" | "stay" | "dolly">): string | null {
  const spots = [level.wild, level.yard, level.east, level.lane, level.berth, level.apron, level.ramp, level.quay, level.slip, level.stall, level.span, level.bay, level.crest, level.wharf, level.ledge, level.aisle, level.booth, level.mast, level.keel, level.spire, level.cleat, level.bollard, level.pylon, level.crate, level.hoist, level.bitt, level.strut, level.lantern, level.jack, level.tie, level.hook, level.spar, level.tarp, level.chock, level.skid, level.fender, level.stem, level.awning, level.vane, level.winch, level.valance, level.stay, level.dolly].filter((w): w is NonNullable<typeof w> => !!w);
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

export function shopLine(pos: Vec3, level: Pick<LevelDef, "shop" | "pawn" | "night" | "cold" | "impound" | "rack">): string | null {
  const spots = [level.shop, level.pawn, level.night, level.cold, level.impound, level.rack].filter((s): s is NonNullable<typeof s> => !!s);
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
