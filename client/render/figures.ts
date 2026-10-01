/**
 * The fixers, in the flesh (Stage 667).
 *
 * Until this stage the four people who drive the campaign — the Deacon, Marrow, Ida Vessel and
 * August Wern — existed only as a name and a sigil on the terminal. They had no body anywhere in the
 * game. Each is now a figure with a silhouette of their own, built the way the Blank's body is (a
 * lathe for cloth, boxes and cylinders for the rest), static and posed, three materials: the body in
 * near-black, the void inside a hood, and the fixer's strip-light.
 *
 * The art bible decides the lights. Cyan is the wake cells' (the Deacon). Magenta is the Clockeaters'
 * (Marrow). Amber is reserved for VANTAGE, so Ida Vessel — whose terminal colour is amber — wears the
 * Estate's gold instead. Blood-red is "THE KERNEL / campaign power only", which is August Wern and
 * nobody else. Faces are never lit: a hood's inside is its own black material, and a bare
 * head's face stays unlit. The hair on that head is darker than the coat.
 *
 * Built feet-at-the-origin with the front at -z, like the rig; the caller turns the group to face.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { inside, lathe, lerpProfile, type Profile } from "./rig";
import { PALETTE } from "./city";
import { markShared } from "./dispose";
import type { HandlerId } from "@shared/campaign/factions";

export type FixerBody = Exclude<HandlerId, "vantage">;
/** VANTAGE is the model's voice: it has no body, and never will */
export const EMBODIED: readonly FixerBody[] = ["deacon", "marrow", "vessel", "wern"];

/** each fixer's strip-light, by the art bible's rules above */
export const FIXER_TRIM: Record<FixerBody, number> = { deacon: PALETTE.cyan, marrow: PALETTE.magenta, vessel: PALETTE.yellow, wern: PALETTE.red };

interface Parts {
  body: THREE.BufferGeometry[];
  trim: THREE.BufferGeometry[];
  void: THREE.BufferGeometry[];
  /** legs that can swing (Stage 677): part of the body when the figure stands */
  legs: THREE.BufferGeometry[];
  /** arms that can swing (Stage 685): part of the body when the figure stands */
  arms: THREE.BufferGeometry[];
}
const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
const put = (g: THREE.BufferGeometry, m: THREE.Matrix4) => g.applyMatrix4(m);
/** hair on a bare head: darker than the coat (1), not the unlit face (0) */
export const HAIR_SHADE = 0.46;
/** Ida's trousers: darker than the coat, not the hair and not a boot */
export const TROUSER_SHADE = 0.33;
/** Ida's boots: darker than the trouser, not the unlit face */
export const VESSEL_BOOT_SHADE = 0.2;
/** Wern's shoes: darker than the coat, not the unlit face */
export const WERN_SHOE_SHADE = 0.18;
/** the Deacon's toes: darker than the robe, not a void */
export const DEACON_TOE_SHADE = 0.24;
/** vertex colour on a part: 0 is unlit (a bare head), 1 is the coat as it was */
function paint(g: THREE.BufferGeometry, v: number): THREE.BufferGeometry {
  const n = g.getAttribute("position").count;
  const a = new Float32Array(n * 3);
  a.fill(v);
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}
/** cloth, unless a head already painted itself black */
function ensureCloth(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!g.getAttribute("color")) paint(g, 1);
  return g;
}
const bead = (w: number, h: number, d: number, x: number, y: number, z: number) => put(new THREE.BoxGeometry(w, h, d), T(x, y, z));

/** the radius of a lathe surface at an angle, folds included — the rig's formula */
function surf(pr: Profile, phi: number, y: number, folds = 0, fold: (y: number) => number = () => 0): number {
  return lerpProfile(pr, y) * (1 + (folds ? fold(y) * Math.sin(folds * phi) : 0));
}
/** a point on a lathe's surface, pushed out by `out` (sx/sz the lathe's own squash) */
function onLathe(pr: Profile, sx: number, sz: number, phi: number, y: number, out: number, folds = 0, fold: (y: number) => number = () => 0): [number, number, number] {
  const r = surf(pr, phi, y, folds, fold) + out;
  return [r * Math.sin(phi) * sx, y, r * Math.cos(phi) * sz];
}

/** a hood with its face cut away toward -z: the shell, and the black inside the opening shows */
function hood(parts: Parts, o: { r: number; cy: number; sy: number; sz: number; trail: number; opening: number; rim: number }): void {
  const shell = (k: number) => {
    const g = new THREE.SphereGeometry(o.r * k, 14, 9, (3 * Math.PI) / 2 + o.opening / 2, Math.PI * 2 - o.opening, 0, Math.PI * 0.72);
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setXYZ(i, p.getX(i), y * o.sy + o.cy, p.getZ(i) * o.sz + o.trail * Math.max(0, y / o.r) + 0.015);
    }
    g.computeVertexNormals();
    return g;
  };
  parts.body.push(shell(1));
  parts.void.push(inside(shell(0.93)));
  // the rim of the opening, lit, from crown to jaw
  for (const side of [-1, 1]) {
    const phi = (3 * Math.PI) / 2 + side * (o.opening / 2);
    for (let k = 0; k < 8; k++) {
      const th = 0.42 + (k / 7) * (Math.PI * 0.72 - 0.5);
      const r = o.r * 1.02;
      const x = -r * Math.cos(phi) * Math.sin(th), y = r * Math.cos(th), z = r * Math.sin(phi) * Math.sin(th);
      for (let n = 0; n < o.rim; n++) parts.trim.push(bead(0.022, 0.03, 0.022, x, y * o.sy + o.cy, z * o.sz + o.trail * Math.max(0, y / o.r) + 0.015));
    }
  }
}

// ---- the Deacon: a tall keeper in a floor-length robe, hands clasped on the ledger of the woken ----
function deacon(): Parts {
  const parts: Parts = { body: [], trim: [], void: [], legs: [], arms: [] };
  const ROBE: Profile = [[0.36, 0.02], [0.33, 0.3], [0.28, 0.7], [0.24, 1.0], [0.22, 1.2], [0.25, 1.38], [0.21, 1.48], [0.12, 1.56]];
  const fold = (y: number) => 0.05 * Math.min(1, Math.max(0, (1.0 - y) / 1.0));
  parts.body.push(lathe(ROBE, 14, { sx: 1, sz: 0.85, folds: 6, fold }));
  // toes of two boots under the hem. Darker than the robe, so the foot is not the cloth.
  for (const x of [-0.1, 0.1]) parts.body.push(paint(put(new THREE.BoxGeometry(0.1, 0.06, 0.12), T(x, 0.03, -0.3)), DEACON_TOE_SHADE));
  hood(parts, { r: 0.175, cy: 1.66, sy: 1.2, sz: 1.15, trail: 0.1, opening: 1.7, rim: 1 });
  // bell sleeves meeting in front, and the ledger held against the chest
  for (const side of [-1, 1]) {
    parts.body.push(put(new THREE.CylinderGeometry(0.07, 0.12, 0.46, 8), T(side * 0.2, 1.18, -0.12).multiply(new THREE.Matrix4().makeRotationZ(side * 0.5)).multiply(new THREE.Matrix4().makeRotationX(0.6))));
  }
  parts.body.push(put(new THREE.BoxGeometry(0.2, 0.27, 0.045), T(0, 1.02, -0.3).multiply(new THREE.Matrix4().makeRotationX(-0.25))));
  // the stole: two lines of light from the shoulders to the hem
  for (const side of [-1, 1]) {
    const phi = Math.PI + side * 0.33;
    for (let y = 1.38; y > 0.1; y -= 0.09) parts.trim.push(bead(0.02, 0.06, 0.02, ...onLathe(ROBE, 1, 0.85, phi, y, 0.014, 6, fold)));
  }
  // a triangle on the ledger's cover: the wake cell's sigil
  parts.trim.push(put(new THREE.ConeGeometry(0.04, 0.06, 3), T(0, 1.05, -0.33).multiply(new THREE.Matrix4().makeRotationX(-0.25 - Math.PI / 2))));
  return parts;
}

// ---- Marrow: short, hunched, in a ragged layered cloak, a clock face on the back ----
function marrow(): Parts {
  const parts: Parts = { body: [], trim: [], void: [], legs: [], arms: [] };
  const CLOAK: Profile = [[0.42, 0.15], [0.38, 0.4], [0.32, 0.75], [0.28, 1.0], [0.3, 1.2], [0.27, 1.33], [0.17, 1.45], [0.1, 1.5]];
  const fold = (y: number) => 0.09 * Math.min(1, Math.max(0, (1.1 - y) / 0.95));
  const cloak = lathe(CLOAK, 16, { sx: 1.05, sz: 0.95, folds: 9, fold });
  // a ragged hem: the bottom ring's vertices alternately torn up
  const p = cloak.getAttribute("position");
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.16) p.setY(i, p.getY(i) + (i % 3 === 0 ? 0.07 : i % 3 === 1 ? 0.02 : 0));
  cloak.computeVertexNormals();
  parts.body.push(cloak);
  // a second, shorter layer over the shoulders
  parts.body.push(lathe([[0.37, 1.02], [0.35, 1.13], [0.29, 1.29], [0.17, 1.44]], 14, { sx: 1.05, sz: 0.95, folds: 7, fold: () => 0.06 }));
  for (const x of [-0.11, 0.11]) parts.body.push(put(new THREE.BoxGeometry(0.11, 0.18, 0.14), T(x, 0.09, -0.02)));
  hood(parts, { r: 0.19, cy: 1.6, sy: 1.15, sz: 1.2, trail: 0.16, opening: 1.4, rim: 1 });
  // the clock on the back: twelve hours and one hand, eaten
  const zb = surf(CLOAK, 0, 1.12, 9, fold) * 0.95 + 0.018;
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    parts.trim.push(bead(0.022, 0.022, 0.012, Math.sin(a) * 0.12, 1.12 + Math.cos(a) * 0.12, zb));
  }
  parts.trim.push(put(new THREE.BoxGeometry(0.012, 0.1, 0.01), T(0.02, 1.15, zb).multiply(new THREE.Matrix4().makeRotationZ(-0.5))));
  // torn light along the hem, never evenly spaced
  for (const phi of [0.4, 1.3, 2.1, 2.9, 3.6, 4.5, 5.3]) parts.trim.push(bead(0.05, 0.014, 0.014, ...onLathe(CLOAK, 1.05, 0.95, phi, 0.3, 0.02, 9, fold)));
  // the hunch: everything above the waist leans forward, the head most
  for (const g of [...parts.body, ...parts.trim, ...parts.void]) {
    const q = g.getAttribute("position");
    for (let i = 0; i < q.count; i++) {
      const y = q.getY(i);
      if (y > 0.9) q.setZ(i, q.getZ(i) - (y - 0.9) * 0.28);
    }
    g.computeVertexNormals();
  }
  return parts;
}

// ---- Ida Vessel: no hood, a tailored Estate coat, squared shoulders, a high collar ----

/** Ida's hips, where her trousers start: the pivots her legs swing on when she walks (Stage 677) */
export const VESSEL_HIP = { x: 0.09, y: 0.72 } as const;
/** one of Ida's legs, trouser, boot and shoe, standing under a hip at x = 0 */
function vesselLeg(): THREE.BufferGeometry[] {
  return [
    // the trouser is the coat's mesh. Darker than the cloth, so the leg is not the hem.
    paint(put(new THREE.CylinderGeometry(0.065, 0.058, 0.5, 8), T(0, VESSEL_HIP.y - 0.25, 0)), TROUSER_SHADE),
    // the boot shaft and the sole are the coat's mesh. Darker than the trouser, so the foot is not the leg.
    paint(put(new THREE.CylinderGeometry(0.068, 0.072, 0.24, 8), T(0, 0.12, 0)), VESSEL_BOOT_SHADE),
    paint(put(new THREE.BoxGeometry(0.1, 0.06, 0.22), T(0, 0.03, -0.04)), VESSEL_BOOT_SHADE),
  ];
}
/** the height of Ida's shoulders: the pivot her arms swing on when she walks (Stage 685) */
export const VESSEL_SHOULDER = 1.4;
/** one of Ida's slim sleeves as she stands: the left (-1) hanging, the right (+1) with its hand on her hip */
function vesselArm(side: -1 | 1): THREE.BufferGeometry[] {
  if (side < 0) return [put(new THREE.CylinderGeometry(0.055, 0.06, 0.58, 8), T(-0.25, 1.12, 0).multiply(new THREE.Matrix4().makeRotationZ(-0.06)))];
  return [
    put(new THREE.CylinderGeometry(0.055, 0.06, 0.32, 8), T(0.27, 1.27, 0).multiply(new THREE.Matrix4().makeRotationZ(0.5))),
    put(new THREE.CylinderGeometry(0.052, 0.056, 0.3, 8), T(0.3, 1.02, 0).multiply(new THREE.Matrix4().makeRotationZ(-0.55))),
  ];
}

function vessel(): Parts {
  const parts: Parts = { body: [], trim: [], void: [], legs: [], arms: [] };
  const COAT: Profile = [[0.25, 0.5], [0.23, 0.7], [0.2, 0.95], [0.17, 1.03], [0.19, 1.2], [0.21, 1.38], [0.13, 1.49]];
  parts.body.push(lathe(COAT.slice(0, 4), 12, { sx: 1.1, sz: 0.8, gap: 0.5 }));
  parts.body.push(inside(lathe(COAT.slice(0, 4), 12, { sx: 1.1, sz: 0.8, gap: 0.5 })));
  parts.body.push(lathe(COAT.slice(3), 12, { sx: 1.1, sz: 0.8 }));
  // the Estate's cut: a hard yoke across the shoulders
  parts.body.push(put(new THREE.BoxGeometry(0.5, 0.06, 0.22), T(0, 1.42, 0)));
  // high collar, head, and the hair drawn back
  parts.body.push(lathe([[0.1, 1.47], [0.105, 1.6]], 12, { gap: 0.9 }));
  // the head is the coat's mesh. Black vertices keep the street off the face. The hair is darker than the coat.
  parts.body.push(paint(put(new THREE.SphereGeometry(0.1, 12, 10), T(0, 1.69, 0).multiply(new THREE.Matrix4().makeScale(0.92, 1.12, 1))), 0));
  parts.body.push(paint(put(new THREE.SphereGeometry(0.107, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), T(0, 1.705, 0.018)), HAIR_SHADE));
  // trousers and boots under the coat
  for (const x of [-VESSEL_HIP.x, VESSEL_HIP.x]) for (const g of vesselLeg()) parts.legs.push(put(g, T(x, 0, 0)));
  // slim sleeves, one hand on the hip
  for (const side of [-1, 1] as const) parts.arms.push(...vesselArm(side));
  // gold: the collar's rim, the belt, and the coat's two front edges
  for (let k = 0; k < 10; k++) {
    const a = Math.PI + 0.45 + (k / 9) * (Math.PI * 2 - 0.9);
    parts.trim.push(bead(0.02, 0.012, 0.02, Math.sin(a) * 0.113, 1.6, Math.cos(a) * 0.113));
  }
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    parts.trim.push(bead(0.05, 0.02, 0.012, ...onLathe(COAT, 1.1, 0.8, a, 1.03, 0.012)));
  }
  for (const side of [-1, 1]) for (let y = 0.95; y > 0.52; y -= 0.08) parts.trim.push(bead(0.014, 0.05, 0.014, ...onLathe(COAT, 1.1, 0.8, Math.PI + side * 0.25, y, 0.012)));
  return parts;
}

// ---- August Wern: a tall black greatcoat to the ankle, a stiff collar, hands behind his back ----
function wern(): Parts {
  const parts: Parts = { body: [], trim: [], void: [], legs: [], arms: [] };
  const COAT: Profile = [[0.34, 0.06], [0.31, 0.4], [0.27, 0.8], [0.24, 1.05], [0.23, 1.2], [0.26, 1.38], [0.25, 1.45], [0.15, 1.53]];
  parts.body.push(lathe(COAT, 14, { sx: 1.12, sz: 0.8, folds: 4, fold: () => 0.015, gap: 0.3 }));
  parts.body.push(inside(lathe(COAT, 14, { sx: 1.12, sz: 0.8, folds: 4, fold: () => 0.015, gap: 0.3 })));
  parts.body.push(put(new THREE.BoxGeometry(0.58, 0.06, 0.24), T(0, 1.43, 0)));
  parts.body.push(lathe([[0.125, 1.47], [0.14, 1.64]], 12, { gap: 0.8 }));
  parts.body.push(paint(put(new THREE.SphereGeometry(0.105, 12, 10), T(0, 1.73, 0).multiply(new THREE.Matrix4().makeScale(0.9, 1.15, 1))), 0));
  parts.body.push(paint(put(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), T(0, 1.75, 0.012)), HAIR_SHADE));
  // the shoes are the coat's mesh. Darker than the cloth, so the toe is not the hem.
  for (const x of [-0.1, 0.1]) parts.body.push(paint(put(new THREE.BoxGeometry(0.1, 0.06, 0.24), T(x, 0.03, -0.12)), WERN_SHOE_SHADE));
  // arms folded behind, the hands meeting at the small of the back
  for (const side of [-1, 1]) {
    parts.body.push(put(new THREE.CylinderGeometry(0.06, 0.065, 0.34, 8), T(side * 0.25, 1.28, 0.05).multiply(new THREE.Matrix4().makeRotationX(-0.35))));
    parts.body.push(put(new THREE.CylinderGeometry(0.058, 0.062, 0.3, 8), T(side * 0.15, 1.06, 0.2).multiply(new THREE.Matrix4().makeRotationZ(side * 1.1)).multiply(new THREE.Matrix4().makeRotationX(-0.4))));
  }
  // the only red in the room: the coat's front edges and the collar's rim
  for (const side of [-1, 1]) for (let y = 1.4; y > 0.1; y -= 0.075) parts.trim.push(bead(0.012, 0.05, 0.012, ...onLathe(COAT, 1.12, 0.8, Math.PI + side * 0.15, y, 0.012, 4, () => 0.015)));
  for (let k = 0; k < 10; k++) {
    const a = Math.PI + 0.4 + (k / 9) * (Math.PI * 2 - 0.8);
    parts.trim.push(bead(0.02, 0.012, 0.02, Math.sin(a) * 0.15, 1.64, Math.cos(a) * 0.15));
  }
  return parts;
}

const BUILDERS: Record<FixerBody, () => Parts> = { deacon, marrow, vessel, wern };
/** each fixer's height, as a scale on the built figure: the Deacon and Wern tall, Marrow bent small */
export const FIXER_SCALE: Record<FixerBody, number> = { deacon: 1.06, marrow: 0.93, vessel: 1.0, wern: 1.07 };

const cache = new Map<FixerBody, { body: THREE.BufferGeometry; trim: THREE.BufferGeometry; void: THREE.BufferGeometry }>();
function flat(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  for (const g of list) g.dispose();
  return out ?? new THREE.BufferGeometry();
}

/** a fixer's three geometries, built once: body, strip-light, hood void */
export function fixerGeometry(id: FixerBody): { body: THREE.BufferGeometry; trim: THREE.BufferGeometry; void: THREE.BufferGeometry } {
  let g = cache.get(id);
  if (!g) {
    const p = BUILDERS[id]();
    for (const partGeo of [...p.body, ...p.legs, ...p.arms]) ensureCloth(partGeo);
    // shared: every visit and every level load reuses them, so release() must never dispose them
    g = { body: markShared(flat([...p.body, ...p.legs, ...p.arms])), trim: markShared(flat(p.trim)), void: markShared(flat(p.void.length ? p.void : [new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([], 3))])) };
    cache.set(id, g);
  }
  return g;
}

/** a fixer standing, facing -z; three draw calls */
export function buildFixer(id: FixerBody): THREE.Group {
  const g = fixerGeometry(id);
  const group = new THREE.Group();
  group.name = `fixer:${id}`;
  const body = new THREE.Mesh(g.body, new THREE.MeshStandardMaterial({ color: 0x06070b, roughness: 0.95, vertexColors: true }));
  const trim = new THREE.Mesh(g.trim, new THREE.MeshBasicMaterial({ color: FIXER_TRIM[id] }));
  group.add(body, trim);
  if (g.void.getAttribute("position").count) group.add(new THREE.Mesh(g.void, new THREE.MeshBasicMaterial({ color: 0x000000 })));
  group.scale.setScalar(FIXER_SCALE[id]);
  return group;
}

// ---- Ida Vessel, walking (Stage 677) ----
//
// Mission 4 walks Ida from B to D. Until this stage the escort was an amber capsule under a cone, and
// the only person in the arc the player walks beside had no body there. She walks in her own: the
// standing figure without its legs, and the legs on their hips, swung by the planted-foot walk the
// repo mech uses (a person's stride, a person's lift), so neither foot slides over the street. Her
// arms (Stage 685) swing from the shoulder against the leg on their own side, a little, as a tailored
// coat walks; the bent right arm, hand at her hip, swings as one piece. They stay in the body's mesh
// and are swung in its vertex shader, so walking costs no more draw calls than standing.

/** Ida's walk: 1.3 m a cycle at her 2.2 m/s escort pace, the leg read off the built geometry */
export const VESSEL_STRIDE = 1.3;
export const VESSEL_LIFT = 0.07;
/** how far her arms swing each way (rad): a hand moves about 9 cm fore and aft, not a march */
export const VESSEL_ARM_SWING = 0.16;

/** a part of Ida's walking body, tagged with the arm it swings with: 0 none, -1 the left, +1 the right */
function armTag(g: THREE.BufferGeometry, side: number): THREE.BufferGeometry {
  return g.setAttribute("arm", new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute("position").count).fill(side), 1));
}

let walker: { body: THREE.BufferGeometry; leg: THREE.BufferGeometry } | null = null;
/** Ida without her legs, her sleeves tagged by `arm` for `armSwingPatch`, and one leg with its hip at the origin: built once, shared */
export function vesselWalkerGeometry(): { body: THREE.BufferGeometry; leg: THREE.BufferGeometry } {
  if (!walker) {
    const p = vessel();
    for (const g of [...p.legs, ...p.arms]) g.dispose();
    for (const g of [...p.trim, ...p.void]) g.dispose();
    for (const g of p.body) ensureCloth(g);
    const arms = ([-1, 1] as const).flatMap((side) => vesselArm(side).map((g) => armTag(ensureCloth(g), side)));
    const legs = vesselLeg().map((g) => put(g, T(0, -VESSEL_HIP.y, 0)));
    for (const g of legs) ensureCloth(g);
    walker = { body: markShared(flat([...p.body.map((g) => armTag(g, 0)), ...arms])), leg: markShared(flat(legs)) };
  }
  return walker;
}

/** what Ida's walking body swings her arms by: `uArm` x the left's pitch and y the right's (rad), about the x axis at height `uShoulder` */
export interface ArmUniforms {
  uArm: { value: THREE.Vector2 };
  uShoulder: { value: number };
}

/**
 * Swing Ida's arms on the GPU (Stage 685), as the rig's cloak sways (rig.ts `swayPatch`). Every vertex
 * tagged `arm` turns about the x axis through (0, uShoulder, 0) by its side's angle a; positive
 * swings the hand forward (-z), as a leg's `plantedGait` angle swings the foot:
 *   y' = uShoulder + (y - uShoulder) cos a - z sin a,   z' = (y - uShoulder) sin a + z cos a
 */
export function armSwingPatch(material: THREE.Material, uniforms: ArmUniforms): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uArm = uniforms.uArm;
    shader.uniforms.uShoulder = uniforms.uShoulder;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float arm;\nuniform vec2 uArm; uniform float uShoulder;\nmat2 armTurn() { float a = arm < 0.0 ? uArm.x : arm > 0.0 ? uArm.y : 0.0; float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nobjectNormal.yz = armTurn() * objectNormal.yz;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed.yz = armTurn() * (transformed.yz - vec2(uShoulder, 0.0)) + vec2(uShoulder, 0.0);");
  };
  material.customProgramCacheKey = () => "vessel-arms";
}

/** hip to the bottom of the sole, read off the built leg */
export function vesselLegLength(): number {
  const g = vesselWalkerGeometry().leg;
  g.computeBoundingBox();
  return -g.boundingBox!.min.y;
}

// ---- a fixer waiting for you (Stage 672) ----
//
// A figure that never moves reads as a statue however well it is cut. A person waiting in a room
// breathes, and when you come close they turn to you: not all the way (they were facing the room
// for a reason) and not at once. The turn is the whole figure — these bodies have no bones — and
// the breath is a slow rise of the chest, pivoting at the feet so nobody floats.

/** how near the player must come to be turned to; how far round a fixer will turn; how fast (rad/s); how deep a breath */
export const ATTEND = { near: 7, turn: 0.9, rate: 1.6, breath: 0.012, period: 4.2 } as const;

/** the yaw (relative to where the figure was set facing) a fixer turns toward a player at (px, pz), or 0 if they are too far */
export function attendTarget(at: { x: number; z: number }, baseYaw: number, px: number, pz: number): number {
  const dx = px - at.x;
  const dz = pz - at.z;
  if (Math.hypot(dx, dz) > ATTEND.near) return 0;
  // a figure faces -z; the yaw that faces the player, as an offset from the base, wrapped and capped
  const want = Math.atan2(-dx, -dz) - baseYaw;
  const off = Math.atan2(Math.sin(want), Math.cos(want));
  return Math.max(-ATTEND.turn, Math.min(ATTEND.turn, off));
}

/**
 * A dialogue line holds the facing (Stage 720). The waiting turn is capped, and it runs after the
 * close-up has aimed the figure, so without this the frame draws the cap and the lens films the hood.
 * Letting go starts the ease from the line (Stage 721). Leaving the old offset snaps the hood off
 * you while the camera is still on the face.
 */
export function holdFace(f: THREE.Group, yaw: number | null): void {
  const u = f.userData as { faceHold?: number; baseYaw?: number; turned?: number };
  if (yaw === null) {
    if (typeof u.faceHold === "number" && typeof u.baseYaw === "number") {
      u.turned = Math.atan2(Math.sin(u.faceHold - u.baseYaw), Math.cos(u.faceHold - u.baseYaw));
    }
    delete u.faceHold;
    return;
  }
  u.faceHold = yaw;
}

/** step a fixer standing in the scene: turn toward (or back from) the player, and breathe */
export function attend(f: THREE.Group, dt: number, px: number, pz: number, time: number): void {
  const u = f.userData as { baseYaw?: number; turned?: number; faceHold?: number; id?: FixerBody };
  u.baseYaw ??= f.rotation.y;
  u.turned ??= 0;
  if (typeof u.faceHold !== "number") {
    const target = attendTarget(f.position, u.baseYaw, px, pz);
    const step = ATTEND.rate * Math.max(0, dt);
    u.turned += Math.max(-step, Math.min(step, target - u.turned));
    f.rotation.y = u.baseYaw + u.turned;
  } else f.rotation.y = u.faceHold;
  const id = f.name.slice("fixer:".length) as FixerBody;
  const s = FIXER_SCALE[id] ?? 1;
  f.scale.set(s, s * (1 + ATTEND.breath * Math.sin((time / ATTEND.period) * Math.PI * 2)), s);
}
