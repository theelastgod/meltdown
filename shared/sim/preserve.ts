/**
 * The green hold: a nature preserve the file can enter. Not a district.
 * Not a city room. No gates, no tram, no shop signs, no patrols.
 */
import { v3 } from "../math/vec3";
import { box, type Box } from "./box";
import type { LevelDef, LightDef } from "./level";

export const GREEN_HOLD_ID = "green_hold";

export function greenHold(): LevelDef {
  const boxes: Box[] = [];
  boxes.push(box(-30, -1, -30, 30, 0.01, 30, "floor"));
  const trunks: readonly [number, number][] = [
    [-18, -14],
    [-8, -20],
    [6, -16],
    [18, -4],
    [14, 12],
    [-12, 16],
  ];
  for (const [x, z] of trunks) {
    boxes.push(box(x, 0, z, x + 0.45, 7.5, z + 0.45, "tree"));
  }
  const spawns = [{ pos: v3(0, 0, 6), yaw: Math.PI }];
  const lights: LightDef[] = [{ x: 0, y: 10, z: 0, color: "green", intensity: 22, range: 48 }];
  return {
    name: GREEN_HOLD_ID,
    displayName: "GREEN HOLD",
    district: "cyan",
    bounds: 28,
    boxes,
    spawns,
    dummies: [],
    killY: -20,
    wasps: [],
    mechs: [],
    nodes: [],
    lights,
    skylineSeed: 17,
  };
}
