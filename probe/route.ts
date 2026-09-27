/**
 * A sprinted route for a probe bot (Stage 694).
 *
 * Every probe used to give each `goto` leg a flat 700 ticks. The nav grid returns straight runs as
 * a single leg, and on the 5×5 LEASE ROW one of those runs is 99 m: 825 ticks at sprint speed. The
 * leg timed out ~12 m short of the node and the Audit round opened with ALPHA still walking. A
 * leg's timeout is now what that leg costs at sprint speed, with half again for corners and
 * crowds, and never less than the old 700. The checks that read where the bot ended up are
 * untouched: a bot that is stuck still ends up in the wrong place.
 */
import type { BotStep } from "../client/bot";
import { MOVE, SIM_HZ } from "../shared/sim/constants";
import { findPath, type NavGrid } from "../shared/sim/nav";

export function legTicks(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.max(700, Math.ceil((Math.hypot(to.x - from.x, to.z - from.z) / MOVE.sprintSpeed) * SIM_HZ * 1.5) + 120);
}

export function sprintRoute(nav: NavGrid, from: { x: number; z: number }, to: { x: number; z: number }, lastRadius = 1.2): BotStep[] {
  const pts = findPath(nav, { x: from.x, y: 0, z: from.z }, { x: to.x, y: 0, z: to.z }) ?? [{ x: from.x, y: 0, z: from.z }, { x: to.x, y: 0, z: to.z }];
  return pts.slice(1).map((p, i, arr) => ({ kind: "goto" as const, x: p.x, z: p.z, sprint: true, radius: i === arr.length - 1 ? lastRadius : 1.4, timeoutTicks: legTicks(pts[i]!, p), stop: i === arr.length - 1 }));
}
