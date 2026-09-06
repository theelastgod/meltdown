/**
 * The white office: Wern's room at the top of the Estate, where the arc
 * ends. No guards, no wake, no rain. A long desk, one chair, glass onto
 * the city. The only input that matters here is a choice.
 */
import { v3 } from "../math/vec3";
import { box, type Box } from "./box";
import type { LevelDef, LightDef, SignDef } from "./level";

export const WHITE_LEVEL_ID = "white_office";

export function whiteOffice(): LevelDef {
  const boxes: Box[] = [];
  const decor: Box[] = [];
  const x0 = -11, x1 = 11, z0 = -8, z1 = 8;
  boxes.push(box(x0 - 1, -1, z0 - 1, x1 + 1, 0.01, z1 + 1, "white_floor"));
  boxes.push(box(x0 - 0.4, 0, z0 - 0.4, x1 + 0.4, 4.2, z0, "white_wall"));
  boxes.push(box(x0 - 0.4, 0, z1, x1 + 0.4, 4.2, z1 + 0.4, "white_wall"));
  boxes.push(box(x0 - 0.4, 0, z0, x0, 4.2, z1, "white_wall"));
  boxes.push(box(x1, 0, z0, x1 + 0.4, 4.2, z1, "glass_wall"));
  decor.push(box(x0 - 0.4, 4.2, z0 - 0.4, x1 + 0.4, 4.5, z1 + 0.4, "white_ceiling"));
  // the desk, the chair, the pen
  boxes.push(box(-3.5, 0, -6.5, 3.5, 0.8, -5.2, "white_desk"));
  boxes.push(box(-0.45, 0, -7.6, 0.45, 1.1, -6.9, "chair"));
  decor.push(box(-0.9, 0.8, -6.1, 0.9, 0.82, -5.6, "directive_page"));
  decor.push(box(-6, 0.01, -3, 6, 0.02, 3, "white_rug"));
  const spawns = [{ pos: v3(0, 0, 5), yaw: 0 }, { pos: v3(2, 0, 5.5), yaw: 0 }];
  const lights: LightDef[] = [
    { x: 0, y: 3.9, z: -4, color: "yellow", intensity: 26, range: 22 },
    { x: -6, y: 3.9, z: 3, color: "yellow", intensity: 18, range: 18 },
    { x: 6, y: 3.9, z: 3, color: "cyan", intensity: 10, range: 18 },
    { x: 0, y: 1.2, z: -6, color: "yellow", intensity: 6, range: 6 },
  ];
  const signs: SignDef[] = [{ text: "THE ESTATE", fg: "#1a1a1a", bg: "#f2f2ee", border: "#c9c9c0", w: 4, h: 1, x: -5, y: 3.1, z: z0 + 0.06, rotY: 0 }];
  return { name: WHITE_LEVEL_ID, displayName: "THE WHITE OFFICE", district: "amber", bounds: 14, boxes, decor, spawns, dummies: [], killY: -20, wasps: [], mechs: [], nodes: [], lights, signs, skylineSeed: 5 };
}
