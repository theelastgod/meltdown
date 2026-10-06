/**
 * The file's apartment: one room off the street. Not a district. No gates,
 * no tram, no shop. The door is the control that loads Lease Row again.
 */
import { v3 } from "../math/vec3";
import { box, type Box } from "./box";
import type { LevelDef, LightDef, SignDef } from "./level";

export const FILE_APARTMENT_ID = "file_apartment";

/** How close a file has to stand before the door starts loading Lease Row. */
export const APARTMENT_DOOR_M = 1.35;

/** A step in front of the door panel, inside the room. */
export function apartmentDoorSpot(level: { boxes: readonly { min: { x: number; z: number }; max: { x: number; z: number }; tag?: string }[] }): { x: number; z: number } | null {
  const b = level.boxes.find((x) => x.tag === "door");
  if (!b) return null;
  return { x: (b.min.x + b.max.x) / 2, z: b.min.z - 0.9 };
}

export function fileApartment(): LevelDef {
  const boxes: Box[] = [];
  const x0 = -6, x1 = 6, z0 = -4, z1 = 4;
  boxes.push(box(x0 - 1, -1, z0 - 1, x1 + 1, 0.01, z1 + 1, "floor"));
  boxes.push(box(x0 - 0.4, 0, z0 - 0.4, x1 + 0.4, 3.2, z0, "wall"));
  boxes.push(box(x0 - 0.4, 0, z1, x1 + 0.4, 3.2, z1 + 0.4, "wall"));
  boxes.push(box(x0 - 0.4, 0, z0, x0, 3.2, z1, "wall"));
  boxes.push(box(x1, 0, z0, x1 + 0.4, 3.2, z1, "wall"));
  boxes.push(box(-0.7, 0, 3.15, 0.7, 2.2, 3.55, "door"));
  const spawns = [{ pos: v3(0, 0, -1), yaw: Math.PI }];
  const lights: LightDef[] = [{ x: 0, y: 2.8, z: 0, color: "yellow", intensity: 16, range: 14 }];
  const signs: SignDef[] = [{ text: "LEASE ROW", fg: "#ffe34a", bg: "#1a1206", border: "#ffe34a", w: 2.4, h: 0.6, x: 0, y: 2.4, z: z1 - 0.02, rotY: Math.PI }];
  return {
    name: FILE_APARTMENT_ID,
    displayName: "FILE APARTMENT",
    district: "cyan",
    bounds: 8,
    boxes,
    spawns,
    dummies: [],
    killY: -20,
    wasps: [],
    mechs: [],
    nodes: [],
    lights,
    signs,
    skylineSeed: 3,
  };
}
