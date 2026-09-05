/**
 * The Deadletter Office: the safehouse hub. An office room with a desk, a
 * cot and a trophy wall, a doorway onto a firing range with a start pad and
 * an end pad (the course the ghosts replay), and a locker for the file.
 * The room renovates itself with the file's Chapters and the trophy wall
 * fills from real match metadata — both are render-side (client/render/hub.ts);
 * the sim reads only the boxes. No wake nodes: the hub is off the model.
 */
import { v3, type Vec3 } from "../math/vec3";
import { box, type Box } from "./box";
import type { LevelDef, LightDef, SignDef } from "./level";

export interface HubDef {
  /** the range course: leave the start pad to begin, reach the end pad to finish */
  start: Box;
  end: Box;
  /** the trophy wall (world-space plane: centre, facing, size) */
  wall: { x: number; y: number; z: number; rotY: number; w: number; h: number };
  /** where the renovation decor goes per Chapter (render only) */
  renovation: { chapter: number; box: Box; tag: string }[];
  /** the office's floor area (for the radar) */
  office: Box;
}

export const HUB_LEVEL_ID = "deadletter_office";

export function deadletterOffice(): LevelDef & { hub: HubDef } {
  const boxes: Box[] = [];
  const decor: Box[] = [];
  // office: 28 × 16 m, 4.5 m ceiling, walls 0.4 m
  const ox0 = -14, ox1 = 14, oz0 = -8, oz1 = 8;
  boxes.push(box(ox0 - 1, -1, oz0 - 1, 64, 0, oz1 + 1, "floor"));
  boxes.push(box(ox0 - 0.4, 0, oz0 - 0.4, ox1 + 0.4, 4.5, oz0, "wall")); // north (trophy wall)
  boxes.push(box(ox0 - 0.4, 0, oz1, ox1 + 0.4, 4.5, oz1 + 0.4, "wall")); // south
  boxes.push(box(ox0 - 0.4, 0, oz0, ox0, 4.5, oz1, "wall")); // west
  // east wall with a 2.4 m doorway onto the range
  boxes.push(box(ox1, 0, oz0, ox1 + 0.4, 4.5, -1.2, "wall"));
  boxes.push(box(ox1, 0, 1.2, ox1 + 0.4, 4.5, oz1, "wall"));
  boxes.push(box(ox1, 3.2, -1.2, ox1 + 0.4, 4.5, 1.2, "lintel"));
  decor.push(box(ox0 - 0.4, 4.5, oz0 - 0.4, ox1 + 0.4, 4.9, oz1 + 0.4, "ceiling"));
  // furniture: desk, chair, cot, locker, terminal
  boxes.push(box(-6, 0, -6.5, -1, 0.85, -4.5, "desk"));
  boxes.push(box(-3.9, 0, -3.8, -3.1, 0.5, -3.0, "chair"));
  boxes.push(box(8, 0, 4, 12.5, 0.55, 6.2, "cot"));
  boxes.push(box(-13.5, 0, 2, -12.6, 2.1, 4.4, "locker"));
  boxes.push(box(-1.4, 0.85, -6.3, 0.6, 1.6, -5.6, "terminal"));
  boxes.push(box(3, 0, -6.6, 7, 0.4, -5.9, "bench"));
  decor.push(box(-13.9, 3.4, -2, -13.5, 3.7, 0, "strip_cy"));
  decor.push(box(2, 4.3, -7.6, 12, 4.45, -7.4, "strip_mg"));
  // the range: 46 m lane east of the office, side walls, a few cover blocks, pads at both ends
  const rx0 = ox1 + 0.4, rx1 = 62, rz0 = -6, rz1 = 6;
  boxes.push(box(rx0, 0, rz0 - 0.4, rx1, 4, rz0, "rangewall"));
  boxes.push(box(rx0, 0, rz1, rx1, 4, rz1 + 0.4, "rangewall"));
  boxes.push(box(rx1, 0, rz0, rx1 + 0.4, 4, rz1, "rangewall"));
  boxes.push(box(rx0, 0, oz0 - 0.4, rx0 + 0.4, 4, rz0, "rangewall"));
  boxes.push(box(rx0, 0, rz1, rx0 + 0.4, 4, oz1 + 0.4, "rangewall"));
  boxes.push(box(26, 0, -5.5, 27.2, 1.2, -3.5, "cover"));
  boxes.push(box(34, 0, 2.5, 35.2, 1.2, 4.5, "cover"));
  boxes.push(box(42, 0, -1, 43.2, 2.2, 1, "cover"));
  boxes.push(box(48, 0, -5.5, 49.2, 1.0, -3.5, "cover"));
  // pads: painted low plates (step-height) so the sim can read them by position only
  const start = box(16, 0, -2, 19, 0.05, 2, "pad_start");
  const end = box(56, 0, -2, 59, 0.05, 2, "pad_end");
  boxes.push(start, end);
  decor.push(box(30, 0, 5.6, 54, 2.2, 5.9, "target_wall"));

  const spawns = [
    { pos: v3(0, 0, 3), yaw: 0 }, // facing the trophy wall (−z)
    { pos: v3(17.5, 0, 0), yaw: -Math.PI / 2 },
  ];
  const dummies = [
    { id: 1, pos: v3(30, 0, 4.6) },
    { id: 2, pos: v3(38, 0, 4.6), patrolTo: v3(46, 0, 4.6) },
    { id: 3, pos: v3(52, 0, 4.6) },
    { id: 4, pos: v3(45, 0, -4.6), patrolTo: v3(53, 0, -4.6) },
  ];
  const lights: LightDef[] = [
    { x: -3, y: 4.2, z: -5, color: "cyan", intensity: 14, range: 16 },
    { x: 9, y: 4.2, z: 4, color: "magenta", intensity: 10, range: 14 },
    { x: 24, y: 3.6, z: 0, color: "amber", intensity: 10, range: 18 },
    { x: 44, y: 3.6, z: 0, color: "cyan", intensity: 10, range: 20 },
    { x: -10, y: 4, z: 3, color: "magenta", intensity: 9, range: 14 },
    { x: 9, y: 4, z: -5, color: "cyan", intensity: 9, range: 14 },
    { x: 34, y: 3.6, z: 0, color: "cyan", intensity: 9, range: 18 },
    { x: 56, y: 3.6, z: 0, color: "magenta", intensity: 9, range: 18 },
  ];
  const signs: SignDef[] = [
    { text: "DEADLETTER OFFICE", fg: "#35f2ff", bg: "#07111a", border: "#35f2ff", w: 5, h: 1.2, x: -9, y: 3.4, z: oz0 + 0.06, rotY: 0 },
    { text: "RANGE ▸", fg: "#ffb02e", bg: "#160f04", border: "#ffb02e", w: 2.6, h: 0.7, x: ox1 - 0.06, y: 3.7, z: 0, rotY: -Math.PI / 2 },
    { text: "START", fg: "#37ff8b", bg: "#04120a", border: "#37ff8b", w: 2.2, h: 0.6, x: 17.5, y: 2.6, z: rz0 + 0.06, rotY: 0 },
    { text: "END", fg: "#ff3ec9", bg: "#170714", border: "#ff3ec9", w: 2.2, h: 0.6, x: 57.5, y: 2.6, z: rz0 + 0.06, rotY: 0 },
  ];
  const hub: HubDef = {
    start,
    end,
    wall: { x: 2, y: 2.2, z: oz0 + 0.05, rotY: 0, w: 22, h: 3.2 },
    renovation: [
      { chapter: 1, box: box(-13.9, 0, -7.6, -9, 2.4, -7.0, "shelf"), tag: "shelf" },
      { chapter: 1, box: box(9, 0, -7.6, 13.5, 1.0, -6.6, "crates"), tag: "crates" },
      { chapter: 2, box: box(-6, 0.01, -3, 6, 0.03, 3, "rug"), tag: "rug" },
      { chapter: 2, box: box(-13.9, 0, -2, -12.9, 3.0, 1.5, "server_rack"), tag: "server_rack" },
      { chapter: 3, box: box(-3.5, 0.86, -6.2, -1.7, 1.06, -5.9, "nameplate"), tag: "nameplate" },
      { chapter: 3, box: box(4, 0, 6.6, 12, 0.02, 7.6, "window_glow"), tag: "window_glow" },
    ],
    office: box(ox0, 0, oz0, ox1, 0, oz1, "office"),
  };
  return {
    name: HUB_LEVEL_ID,
    displayName: "DEADLETTER OFFICE",
    district: "cyan",
    bounds: 64,
    boxes,
    decor,
    spawns,
    dummies,
    killY: -20,
    wasps: [],
    mechs: [],
    nodes: [],
    lights,
    signs,
    skylineSeed: 77,
    hub,
  };
}

/** Is a position over a pad (the sim's only reading of the course: XZ containment)? */
export function overPad(pad: Box, pos: Vec3): boolean {
  return pos.x >= pad.min.x && pos.x <= pad.max.x && pos.z >= pad.min.z && pos.z <= pad.max.z;
}
