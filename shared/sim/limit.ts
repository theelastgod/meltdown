/**
 * The city limit: open ground outside the city. Not a district.
 * Not a city room. No gates, no tram, no shop signs, no patrols.
 */
import { v3 } from "../math/vec3";
import { box, type Box } from "./box";
import type { LevelDef, LightDef } from "./level";

export const CITY_LIMIT_ID = "city_limit";

export function cityLimit(): LevelDef {
  const boxes: Box[] = [];
  boxes.push(box(-50, -1, -50, 50, 0.01, 50, "floor"));
  boxes.push(box(-30, 0, -12, -18, 0.7, 4, "ridge"));
  boxes.push(box(-6, 0, -34, 8, 0.5, -20, "ridge"));
  boxes.push(box(16, 0, 8, 32, 0.9, 20, "ridge"));
  const spawns = [{ pos: v3(0, 0, 12), yaw: Math.PI }];
  const lights: LightDef[] = [{ x: 0, y: 12, z: 0, color: "cyan", intensity: 24, range: 60 }];
  return {
    name: CITY_LIMIT_ID,
    displayName: "CITY LIMIT",
    district: "cyan",
    bounds: 48,
    boxes,
    spawns,
    dummies: [],
    killY: -20,
    wasps: [],
    mechs: [],
    nodes: [],
    lights,
    skylineSeed: 11,
  };
}
