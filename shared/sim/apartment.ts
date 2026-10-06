/**
 * The file's apartment: one room off the street. Not a district. No gates,
 * no tram, no shop. The door is the control that loads Lease Row again.
 */
import { v3 } from "../math/vec3";
import { box, type Box } from "./box";
import type { LevelDef, LightDef, SignDef } from "./level";
import type { Account } from "../progression/account";
import { campaignOf } from "../campaign/save";

export const FILE_APARTMENT_ID = "file_apartment";

/** Four pieces of cloth the room can hold. Scrip buys them. It does not buy a stat. */
export const APARTMENT_DECOR = [
  { id: "cot", name: "COT", scrip: 120, box: [-5.4, 0, -3.4, -3.2, 0.42, -1.9] },
  { id: "lamp", name: "LAMP", scrip: 80, box: [4.55, 0, -3.7, 4.85, 1.7, -3.35] },
  { id: "crate", name: "CRATE", scrip: 40, box: [-5.4, 0, 2.35, -4.45, 0.55, 3.25] },
  { id: "plant", name: "PLANT", scrip: 60, box: [4.35, 0, 2.15, 5.25, 0.75, 3.05] },
] as const;

/** Spend scrip on one decoration. A second buy of the same id does not spend, and nothing is refunded. */
export function buyApartmentDecor(a: Account, id: string): { ok: boolean; reason?: string } {
  const item = APARTMENT_DECOR.find((d) => d.id === id);
  if (!item) return { ok: false, reason: "UNKNOWN DECOR" };
  const c = campaignOf(a);
  if (c.decor.includes(id)) return { ok: false, reason: "ALREADY OWNED" };
  if (a.wallet.scrip < item.scrip) return { ok: false, reason: "NEEDS SCRIP" };
  a.wallet.scrip -= item.scrip;
  c.decor.push(id);
  return { ok: true };
}

/** One box per owned id, inside this room only. A district level is left alone. */
export function placeApartmentDecor(level: { name: string; boxes: Box[] }, ids: readonly string[]): void {
  if (level.name !== FILE_APARTMENT_ID) return;
  for (const id of ids) {
    const item = APARTMENT_DECOR.find((d) => d.id === id);
    if (!item || level.boxes.some((b) => b.tag === item.id)) continue;
    const [x0, y0, z0, x1, y1, z1] = item.box;
    level.boxes.push(box(x0, y0, z0, x1, y1, z1, item.id));
  }
}

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
