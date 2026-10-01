/**
 * The silhouette that walks (Stage 63): a hooded cloak on ten bones, one skinned mesh per material,
 * and the cloth's sway in the vertex shader. Every player wears it — the local rig behind the
 * camera and every remote — and it costs what the capsule cost: two draws for the body, the held
 * weapon's materials on top. The pose comes from pose.ts, which is pure; this file is the three.js
 * of it: geometry with skin weights baked at rest, a skeleton bound once, and a writer that puts a
 * PoseOut into bones and solves the arms toward the weapon.
 *
 * Nothing here is mechanical. The sim never sees a bone; the wire carries what it carried.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MOVE } from "../../shared/sim/constants";
import { WEAPON_LIST, weaponBySlot, type WeaponId } from "@shared/weapons/manifest";
import { parseTag, wearsFinish } from "@shared/identity/identity";
import { decodeLook, lookOption, sanitizeLookCode } from "@shared/identity/look";
import { bindPlate, PALETTE } from "./city";
import { buildViewmodel } from "./weapons";
import { markShared, release } from "./dispose";
import { createPoseState, FORE_A, FORE_B, MAG_WELL, nearestOnSegment, twoBoneIK, type PoseOut, type PoseState } from "./pose";
import { addScaled, sub, v3, type Vec3 } from "../../shared/math/vec3";

export const BONE = { hips: 0, chest: 1, head: 2, upperR: 3, foreR: 4, upperL: 5, foreL: 6, legL: 7, legR: 8, socket: 9 } as const;
export type BoneName = keyof typeof BONE;
/** rest positions in the body frame (feet at the origin, forward −z, right +x); a bone's local offset is from its parent's */
export const REST_BONES: Record<BoneName, { parent: BoneName | null; world: [number, number, number] }> = {
  hips: { parent: null, world: [0, 0.95, 0] },
  chest: { parent: "hips", world: [0, 1.3, 0] },
  head: { parent: "chest", world: [0, 1.52, 0] },
  upperR: { parent: "chest", world: [0.21, 1.47, 0.12] },
  foreR: { parent: "upperR", world: [0.21, 1.19, 0.12] },
  upperL: { parent: "chest", world: [-0.19, 1.47, -0.16] },
  foreL: { parent: "upperL", world: [-0.19, 1.19, -0.16] },
  legL: { parent: "hips", world: [-0.11, 0.58, 0] },
  legR: { parent: "hips", world: [0.11, 0.58, 0] },
  socket: { parent: null, world: [0.22, 1.32, -0.16] },
};
export const UPPER_ARM = 0.28;
export const FORE_ARM = 0.3;
/** the held weapon's pose in the socket: a little across the body so the support hand reaches the fore-end */
export const WEAPON_IN_SOCKET = { position: [0, 0, -0.26] as const, rotationY: 0.15 };
const CACHE_KEY = "cloak-sway-shade";

export interface SwayUniforms {
  uSway: { value: THREE.Vector3 };
  uFlap: { value: number };
  uPhase: { value: number };
  uFlare: { value: number };
}

export interface Rig {
  group: THREE.Group;
  /** the cloak's material: its emissive takes the worn tint */
  mat: THREE.MeshStandardMaterial;
  /** the trim's material: takes the tint outright, scaled by the strip-light's life */
  trim: THREE.MeshBasicMaterial;
  /** the weapon socket, a root-level bone: a weapon parents here */
  hand: THREE.Bone;
  bones: Record<BoneName, THREE.Bone>;
  skeleton: THREE.Skeleton;
  cloak: THREE.SkinnedMesh;
  trimMesh: THREE.SkinnedMesh;
  uniforms: SwayUniforms;
  state: PoseState;
  /** the tint the trim wears at full life, so the death fade can scale it and the respawn restore it */
  tint: THREE.Color;
  /** the last pose written, for the probe */
  last: PoseOut | null;
  /** the look the cloth is cut to (Stage 689), and the weapon baked into it, so either can change alone */
  look: number;
  slot: WeaponId | null;
}

// ---- geometry ----

/** the cloth's sway: none at the shoulders, growing to the full swing at the hem */
const tubeSway = (y: number): number => Math.min(1, Math.max(0, (1.5 - y) / 0.95) ** 2);

type Weighting = (x: number, y: number, z: number) => { a: number; b: number; wa: number; sway: number };
const fixed =
  (bone: number, sway = 0): Weighting =>
  () => ({ a: bone, b: 0, wa: 1, sway });
/** the cloth: hips below y 0.95, chest above 1.30, blended between; the hem sways most */
const tubeWeights: Weighting = (_x, y) => {
  const wChest = Math.min(1, Math.max(0, (y - 0.95) / 0.35));
  return { a: BONE.chest, b: BONE.hips, wa: wChest, sway: tubeSway(y) };
};
/** a thigh: the hip at its top, the knee (the leg bone's own origin) at its bottom */
const thighWeights =
  (leg: number): Weighting =>
  (_x, y) => ({ a: BONE.hips, b: leg, wa: Math.min(1, Math.max(0, (y - 0.58) / 0.37)), sway: 0 });

/** bake a part at a body-frame transform and give every vertex its bones and its sway */
function part(geo: THREE.BufferGeometry, m: THREE.Matrix4, w: Weighting, shade = 1): THREE.BufferGeometry {
  geo.applyMatrix4(m);
  const pos = geo.getAttribute("position");
  const n = pos.count;
  const idx = new Uint16Array(n * 4);
  const wt = new Float32Array(n * 4);
  const sw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = w(pos.getX(i), pos.getY(i), pos.getZ(i));
    idx[i * 4] = r.a;
    idx[i * 4 + 1] = r.b;
    wt[i * 4] = r.wa;
    wt[i * 4 + 1] = 1 - r.wa;
    sw[i] = r.sway;
  }
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(wt, 4));
  geo.setAttribute("sway", new THREE.Float32BufferAttribute(sw, 1));
  // baked occlusion (Stage 665): 1 is lit as the material says, 0 is the void inside the hood
  geo.setAttribute("shade", new THREE.Float32BufferAttribute(new Float32Array(n).fill(shade), 1));
  // the same occlusion as a vertex colour, so a material that does not run the sway patch (the office ghost) can still black the hood
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = shade;
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return geo;
}
const at = (x: number, y: number, z: number): THREE.Matrix4 => new THREE.Matrix4().makeTranslation(x, y, z);

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (!out) throw new Error("rig: the parts do not share an attribute set");
  out.computeBoundingSphere();
  return out;
}

// ---- the silhouette (Stage 665) ----
//
// "Hooded silhouettes; faces never lit. Faction trim is a strip-light on the body" (docs/ART_BIBLE.md).
// Until Stage 665 the body was a ten-sided tube, an eight-sided cone for a hood with no opening in
// it, box arms and box boots: it read as a hooded shape, not a person. It is now a slim torso the
// arms hang outside of, a shoulder mantle that gives it its width, a long coat split at the front so
// the stride shows through it, a hood with a face opening and nothing lit inside, sleeves, gloves,
// thighs, shins and boots. Every part is still one skinned mesh on the same ten bones and one
// material, so it costs no draw call the old body did not.

export type Profile = [number, number][];
/** a surface of revolution with the body's proportions: squashed front-to-back, optional cloth folds, optional front opening */
export function lathe(profile: Profile, segs: number, o: { sx?: number; sz?: number; folds?: number; fold?: (y: number) => number; gap?: number } = {}): THREE.BufferGeometry {
  const gap = o.gap ?? 0;
  // three's lathe puts phi 0 at +z (the back) and phi pi at -z (the front)
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs, Math.PI + gap / 2, Math.PI * 2 - gap);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = o.folds && o.fold ? 1 + o.fold(y) * Math.sin(o.folds * Math.atan2(x, z)) : 1;
    p.setXYZ(i, x * k * (o.sx ?? 1), y, z * k * (o.sz ?? 1));
  }
  g.computeVertexNormals();
  return g;
}
/** the same surface seen from inside: winding and normals reversed, for the underside of cloth */
export function inside(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const idx = geo.index!;
  for (let i = 0; i < idx.count; i += 3) {
    const b = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, b);
  }
  const n = geo.getAttribute("normal");
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return geo;
}
export const lerpProfile = (pr: Profile, y: number): number => {
  for (let i = 1; i < pr.length; i++) {
    const [r0, y0] = pr[i - 1]!;
    const [r1, y1] = pr[i]!;
    if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return y < pr[0]![1] ? pr[0]![0] : pr[pr.length - 1]![0];
};

export const TORSO: Profile = [[0.155, 0.95], [0.145, 1.08], [0.16, 1.25], [0.17, 1.38], [0.15, 1.46], [0.1, 1.52]];
const TORSO_S = { sx: 1, sz: 0.78 };
export const MANTLE: Profile = [[0.3, 1.27], [0.295, 1.33], [0.275, 1.4], [0.23, 1.47], [0.15, 1.535], [0.11, 1.555]];
const MANTLE_S = { sx: 1, sz: 0.85 };
const mantleFold = (y: number) => 0.04 * Math.max(0, (1.46 - y) / 0.19);
export const SKIRT: Profile = [[0.34, 0.5], [0.3, 0.62], [0.245, 0.78], [0.2, 0.9], [0.18, 0.985]];
const SKIRT_S = { sx: 1.1, sz: 0.95 };
/** the coat's front opening, in radians of arc: the stride shows through it */
export const SKIRT_GAP = 0.8;
const skirtFold = (y: number) => 0.075 * Math.min(1, Math.max(0, (0.985 - y) / 0.485));
/** the short jacket's hem (Stage 689): the coat's own profile, cut above the knee */
export const SKIRT_SHORT: Profile = [[0.235, 0.74], [0.215, 0.82], [0.2, 0.9], [0.18, 0.985]];

/**
 * The look (Stage 689): the cloth cut to a body, a build, a coat and a shoulder. It never moves a
 * bone, the hood or a limb, so the pose, the eye height and the crouch check are the same for every
 * look; it widens or narrows the torso, the mantle and the coat by height, and never past where the
 * coat's hem already was, so every look stays inside the sim's capsule.
 */
export interface LookShape {
  shoulder: number;
  waist: number;
  hip: number;
  girth: number;
  short: boolean;
  plateR: boolean;
  plateL: boolean;
}
/** shoulder, waist, hip, as fractions of the Blank's own */
const BODY_SHAPE: Record<string, [number, number, number]> = { neutral: [1, 1, 1], masc: [1.07, 1.0, 0.95], fem: [0.92, 0.88, 1.05] };
const BUILD_GIRTH: Record<string, number> = { standard: 1, slim: 0.92, heavy: 1.06 };
export function lookShape(code: number): LookShape {
  const l = decodeLook(sanitizeLookCode(code));
  const [shoulder, waist, hip] = BODY_SHAPE[lookOption(l, "body")] ?? [1, 1, 1];
  const kit = lookOption(l, "kit");
  return { shoulder, waist, hip, girth: BUILD_GIRTH[lookOption(l, "build")] ?? 1, short: lookOption(l, "coat") === "short", plateR: kit === "right" || kit === "both", plateL: kit === "left" || kit === "both" };
}
const mix = (a: number, b: number, t: number): number => a + (b - a) * Math.min(1, Math.max(0, t));
/** how much wider the cloth is at a height for a look: the shoulders over the mantle, the waist at the belt, the hips over the coat's top; below the hips it eases back, so the hem is never wider than the Blank's */
export function lookWidth(sh: LookShape, y: number): number {
  const band = y >= 1.3 ? sh.shoulder : y >= 1.05 ? mix(sh.waist, sh.shoulder, (y - 1.05) / 0.25) : y >= 0.98 ? sh.waist : y >= 0.9 ? mix(sh.hip, sh.waist, (y - 0.9) / 0.08) : sh.hip;
  const f = band * sh.girth;
  return y < 0.8 && f > 1 ? mix(f, 1, (0.8 - y) / 0.2) : f;
}
const plainShape = (sh: LookShape): boolean => sh.shoulder === 1 && sh.waist === 1 && sh.hip === 1 && sh.girth === 1;
/** cut a baked part to the look: x and z scaled by the width at each vertex's height, normals to match */
function cut(geo: THREE.BufferGeometry, sh: LookShape): THREE.BufferGeometry {
  if (plainShape(sh)) return geo;
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  for (let i = 0; i < pos.count; i++) {
    const f = lookWidth(sh, pos.getY(i));
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i), pos.getZ(i) * f);
    if (nor) {
      const nx = nor.getX(i) / f, ny = nor.getY(i), nz = nor.getZ(i) / f;
      const m = Math.hypot(nx, ny, nz) || 1;
      nor.setXYZ(i, nx / m, ny / m, nz / m);
    }
  }
  pos.needsUpdate = true;
  return geo;
}
/** where a look's coat surface is, by angle and height: the lathe's formula, cut to the look */
export function coatSurfaceRadiusFor(code: number, phi: number, y: number): number {
  const sh = lookShape(code);
  return lerpProfile(sh.short ? SKIRT_SHORT : SKIRT, y) * (1 + skirtFold(y) * Math.sin(7 * phi));
}

/** the hood: a shell with its face cut away, pulled back over the head; its peak stays under head + 0.3 m, where rigReport measures it */
export const HOOD = { centre: [0, 1.62, 0.015] as const, r: 0.165, sy: 1.18, sz: 1.12, trail: 0.09, opening: 1.9, thetaLen: Math.PI * 0.72 };
/** sphere-local to body frame for the hood: elongate, pull the crown back, seat it on the head */
export function hoodWarp(x: number, y: number, z: number): [number, number, number] {
  return [x + HOOD.centre[0], y * HOOD.sy + HOOD.centre[1], z * HOOD.sz + HOOD.trail * Math.max(0, y / HOOD.r) + HOOD.centre[2]];
}
/** a point on the hood's surface by sphere angles, for the trim that rides its rim */
export function hoodPoint(phi: number, theta: number, scale = 1): [number, number, number] {
  const r = HOOD.r * scale;
  return hoodWarp(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
}
function hoodShell(scale: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(HOOD.r * scale, 14, 9, (3 * Math.PI) / 2 + HOOD.opening / 2, Math.PI * 2 - HOOD.opening, 0, HOOD.thetaLen);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) p.setXYZ(i, ...hoodWarp(p.getX(i), p.getY(i), p.getZ(i)));
  g.computeVertexNormals();
  return g;
}

/**
 * The body's triangle budget (Stage 665). Stage 63 held the cloak under 500 triangles so it cost
 * what the capsule had; the binding limit is the district's 200k-triangle frame budget, and the
 * tightest district (lease_row) measured 117k before this stage. Eight files, each drawn in the
 * scene and again in the wet-floor mirror, at this budget plus the trim's, is 8 x 2 x (2000 + 700)
 * = 43k at the very worst - inside that headroom with room left for the crowd.
 */
/** boots on the cloak mesh: darker than the cloth, not a void (0) and not the lining (0.3–0.35) */
export const BOOT_SHADE = 0.22;
/** gloves on the cloak mesh: darker than the sleeve, clear of the boot and the lining */
export const GLOVE_SHADE = 0.48;
/** the buckle on the cloak mesh: darker than the belt, clear of the glove */
export const BUCKLE_SHADE = 0.62;
/** the chest strap on the cloak mesh: darker than the cloth, clear of the buckle */
export const STRAP_SHADE = 0.78;
export const BODY_TRIANGLES = 2000;
export const TRIM_TRIANGLES = 700;

/** where the coat's outer surface is, by angle round the body and height: the lathe's own formula, for the test that no light sits inside the cloth */
export function coatSurfaceRadius(phi: number, y: number): number {
  return lerpProfile(SKIRT, y) * (1 + skirtFold(y) * Math.sin(7 * phi));
}
export const COAT_SCALE = SKIRT_S;

/** the body's own parts: torso, mantle, coat, belt, hood, sleeves, gloves, legs, boots */
function cloakParts(look = 0): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const I = new THREE.Matrix4();
  const sh = lookShape(look);
  const coat = sh.short ? SKIRT_SHORT : SKIRT;
  // torso, under everything: slim enough that the arms hang outside it
  parts.push(cut(part(lathe(TORSO, 12, TORSO_S), I.clone(), tubeWeights), sh));
  // the mantle over the shoulders: the silhouette's width, and its underside for when the arms come up
  parts.push(cut(part(lathe(MANTLE, 14, { ...MANTLE_S, folds: 6, fold: mantleFold }), I.clone(), fixed(BONE.chest)), sh));
  parts.push(cut(part(inside(lathe(MANTLE, 14, { ...MANTLE_S, folds: 6, fold: mantleFold })), I.clone(), fixed(BONE.chest), 0.3), sh));
  // the coat below the belt, split at the front, folded toward the hem; its inside is in shadow
  parts.push(cut(part(lathe(coat, 16, { ...SKIRT_S, folds: 7, fold: skirtFold, gap: SKIRT_GAP }), I.clone(), tubeWeights), sh));
  parts.push(cut(part(inside(lathe(coat, 16, { ...SKIRT_S, folds: 7, fold: skirtFold, gap: SKIRT_GAP })), I.clone(), tubeWeights, 0.35), sh));
  // belt, buckle, and a strap across the chest
  parts.push(cut(part(lathe([[0.19, 0.965], [0.19, 1.03]], 14, { sx: 1.08, sz: 0.86 }), I.clone(), tubeWeights), sh));
  // the buckle is the cloak mesh. Darker than the belt, so the clasp is not the cloth.
  parts.push(cut(part(new THREE.BoxGeometry(0.075, 0.06, 0.025), at(0, 0.998, -0.19 * 0.86 - 0.01), tubeWeights, BUCKLE_SHADE), sh));
  // the strap is the cloak mesh. Darker than the cloth, so the band is not the chest.
  parts.push(cut(part(new THREE.BoxGeometry(0.045, 0.5, 0.02), at(-0.01, 1.2, -0.16 * 0.78 - 0.018).multiply(new THREE.Matrix4().makeRotationZ(0.62)), fixed(BONE.chest), STRAP_SHADE), sh));
  // a plate on the right shoulder: kitbash, and it breaks the symmetry; the look may move it, double it or leave the shoulder bare
  if (sh.plateR) parts.push(cut(part(new THREE.BoxGeometry(0.14, 0.04, 0.2), at(0.235, 1.445, 0).multiply(new THREE.Matrix4().makeRotationZ(-0.6)), fixed(BONE.chest)), sh));
  if (sh.plateL) parts.push(cut(part(new THREE.BoxGeometry(0.14, 0.04, 0.2), at(-0.235, 1.445, 0).multiply(new THREE.Matrix4().makeRotationZ(0.6)), fixed(BONE.chest)), sh));
  // the hood: a cowl at the neck, the shell with its face cut away and its crown pulled back, a void inside it
  parts.push(part(lathe([[0.19, 1.44], [0.175, 1.5], [0.15, 1.56]], 12, { sx: 1.05, sz: 1, folds: 5, fold: () => 0.05 }), I.clone(), fixed(BONE.head)));
  parts.push(part(hoodShell(1), I.clone(), fixed(BONE.head)));
  // faces are never lit: what the hood opening shows is its own inside, baked to black
  parts.push(part(inside(hoodShell(0.93)), I.clone(), fixed(BONE.head), 0));
  // sleeves widening to the cuff, and gloves; the arms hang straight at rest and the pose bends them
  const arm = (upper: BoneName, fore: BoneName) => {
    const u = REST_BONES[upper].world;
    const f = REST_BONES[fore].world;
    parts.push(part(new THREE.CylinderGeometry(0.062, 0.074, UPPER_ARM, 8), at(u[0], u[1] - UPPER_ARM / 2, u[2]), fixed(BONE[upper])));
    parts.push(part(new THREE.CylinderGeometry(0.066, 0.084, FORE_ARM - 0.04, 8), at(f[0], f[1] - (FORE_ARM - 0.04) / 2, f[2]), fixed(BONE[fore])));
    // the glove is the cloak mesh. Darker than the sleeve, so the hand is not the cuff.
    parts.push(part(new THREE.BoxGeometry(0.06, 0.085, 0.05), at(f[0], f[1] - FORE_ARM + 0.005, f[2]), fixed(BONE[fore]), GLOVE_SHADE));
  };
  arm("upperR", "foreR");
  arm("upperL", "foreL");
  // legs: a thigh from the hip to the knee, a shin, a boot shaft, a sole with a toe; the sole's bottom is the floor
  for (const [leg, x] of [["legL", -0.11], ["legR", 0.11]] as const) {
    parts.push(part(new THREE.CylinderGeometry(0.08, 0.07, 0.4, 8), at(x, 0.77, 0), thighWeights(BONE[leg])));
    parts.push(part(new THREE.CylinderGeometry(0.066, 0.062, 0.3, 8), at(x, 0.43, 0), fixed(BONE[leg])));
    // the boot shaft and the sole are the cloak mesh. Darker than the cloth, so they are not the hem.
    parts.push(part(new THREE.CylinderGeometry(0.078, 0.083, 0.26, 8), at(x, 0.17, 0.005), fixed(BONE[leg]), BOOT_SHADE));
    parts.push(part(new THREE.BoxGeometry(0.115, 0.075, 0.25), at(x, 0.0375, -0.045), fixed(BONE[leg]), BOOT_SHADE));
  }
  return parts;
}

/** the weapon as a remote wears it: its lit parts skinned to the socket, at the held pose */
function weaponParts(id: WeaponId, lit: boolean): THREE.BufferGeometry[] {
  const vm = buildViewmodel(id);
  const s = REST_BONES.socket.world;
  const socket = new THREE.Matrix4().makeTranslation(s[0], s[1], s[2]).multiply(new THREE.Matrix4().makeRotationY(WEAPON_IN_SOCKET.rotationY)).multiply(new THREE.Matrix4().makeTranslation(...WEAPON_IN_SOCKET.position));
  const parts: THREE.BufferGeometry[] = [];
  for (const o of vm.children) {
    if (!(o instanceof THREE.Mesh)) continue;
    const isLit = o.material instanceof THREE.MeshStandardMaterial;
    if (isLit !== lit) continue;
    o.updateMatrix();
    parts.push(part(o.geometry.clone(), socket.clone().multiply(o.matrix), fixed(BONE.socket)));
  }
  release(vm);
  return parts;
}

const cloakCache = new Map<string, THREE.BufferGeometry>();
const trimCache = new Map<number, THREE.BufferGeometry>();
const stripCache = new Map<string, THREE.BufferGeometry>();

/** the cloak geometry, shared: with a weapon baked in for a remote's slot, bare for the local rig */
export function cloakGeometry(slot: WeaponId | null, look = 0): THREE.BufferGeometry {
  const code = sanitizeLookCode(look);
  const key = `${slot ?? "-"}|${code}`;
  let g = cloakCache.get(key);
  if (!g) {
    g = markShared(merged([...cloakParts(code), ...(slot ? weaponParts(slot, true) : [])]));
    cloakCache.set(key, g);
  }
  return g;
}

/**
 * The trim: the faction's strip-light (Stage 665). A spine down the back, which is what the
 * third-person camera sees most; a ring round the mantle's hem, which carries the shoulders'
 * width in the dark; the coat's two front edges, which part as the legs stride; the rim of the
 * hood opening, and never anything inside it; the buckle; a band on each boot.
 */
export function trimGeometry(look = 0): THREE.BufferGeometry {
  const code = sanitizeLookCode(look);
  const hit = trimCache.get(code);
  if (hit) return hit;
  const parts: THREE.BufferGeometry[] = [];
  const sh = lookShape(code);
  // the short jacket (Stage 689) has its own hem: the coat's lights stop above it
  const coat = sh.short ? SKIRT_SHORT : SKIRT;
  const hem = coat[0]![1];
  // The cloth's true surface, folds and all. A bar is placed with its INNER face on it, sampled
  // across the bar's width, so no part of a light sits inside the cloth: the first version centred
  // bars on the smooth profile and a test found 51 of their vertices up to 15 mm inside the coat.
  const surfR = (pr: Profile, phi: number, y: number): number =>
    pr === SKIRT || pr === SKIRT_SHORT ? coatSurfaceRadiusFor(code, phi, y) : pr === MANTLE ? lerpProfile(MANTLE, y) * (1 + mantleFold(y) * Math.sin(6 * phi)) : lerpProfile(pr, y);
  const onSurface = (pr: Profile, sc: { sx: number; sz: number }, phi: number, y: number, depth: number, halfW = 0): [number, number, number] => {
    const r0 = surfR(pr, phi, y);
    const d = halfW / Math.max(0.05, r0);
    const r = Math.max(r0, surfR(pr, phi - d, y), surfR(pr, phi + d, y)) + depth / 2 + 0.002;
    return [r * Math.sin(phi) * sc.sx, y, r * Math.cos(phi) * sc.sz];
  };
  // a bar laid along the cloth: its long axis follows the surface's meridian, so on the flaring coat
  // it lies on the slope instead of standing vertical with its lower half through the cloth (the
  // first turntable showed the spine glowing through the coat's front opening for exactly that)
  const along = (pr: Profile, sc: { sx: number; sz: number }, phi: number, y: number, depth: number, halfW: number, halfH: number): THREE.Matrix4 => {
    // the bar's ends reach halfH up and down the slope: sit the whole bar on the widest point it spans
    const lift = Math.max(...[-halfH, 0, halfH].map((dy) => surfR(pr, phi, y + dy) - surfR(pr, phi, y)));
    const a = new THREE.Vector3(...onSurface(pr, sc, phi, y - 0.03, depth, halfW));
    const b = new THREE.Vector3(...onSurface(pr, sc, phi, y + 0.03, depth, halfW));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    const c = onSurface(pr, sc, phi, y, depth + 2 * lift, halfW);
    return new THREE.Matrix4().compose(new THREE.Vector3(...c), q, new THREE.Vector3(1, 1, 1));
  };
  // the spine: the torso between mantle and belt, then the coat's back down to the hem
  for (const y of [1.08, 1.2]) parts.push(cut(part(new THREE.BoxGeometry(0.028, 0.11, 0.02), along(TORSO, TORSO_S, 0, y, 0.02, 0.014, 0.055), tubeWeights), sh));
  for (const y of [0.9, 0.8, 0.7, 0.6]) if (!sh.short || y - 0.045 >= hem) parts.push(cut(part(new THREE.BoxGeometry(0.028, 0.09, 0.02), along(coat, SKIRT_S, 0, y, 0.02, 0.014, 0.045), tubeWeights), sh));
  // the mantle's hem, all the way round
  const ring = 18;
  for (let k = 0; k < ring; k++) {
    const phi = (k / ring) * Math.PI * 2;
    const [x, y, z] = onSurface(MANTLE, MANTLE_S, phi, 1.275, 0.018, 0.05);
    parts.push(cut(part(new THREE.BoxGeometry(0.1, 0.018, 0.018), at(x, y, z).multiply(new THREE.Matrix4().makeRotationY(phi + Math.PI / 2)), fixed(BONE.chest)), sh));
  }
  // the coat's two front edges
  for (const side of [-1, 1]) {
    const phi = Math.PI + side * (SKIRT_GAP / 2);
    for (const y of [0.92, 0.82, 0.72, 0.62, 0.53]) if (!sh.short || y - 0.05 >= hem) parts.push(cut(part(new THREE.BoxGeometry(0.018, 0.1, 0.018), along(coat, SKIRT_S, phi, y, 0.018, 0.009, 0.05), tubeWeights), sh));
  }
  // the hood's rim: beads along both edges of the opening, from the crown down to the jaw
  for (const side of [-1, 1]) {
    const phi = (3 * Math.PI) / 2 + side * (HOOD.opening / 2);
    for (let k = 0; k < 8; k++) {
      const theta = 0.42 + (k / 7) * (HOOD.thetaLen - 0.5);
      parts.push(part(new THREE.BoxGeometry(0.022, 0.03, 0.022), at(...hoodPoint(phi, theta, 1.02)), fixed(BONE.head)));
    }
  }
  parts.push(cut(part(new THREE.BoxGeometry(0.04, 0.025, 0.012), at(0, 0.998, -0.19 * 0.86 - 0.026), tubeWeights), sh));
  for (const [leg, x] of [["legL", -0.11], ["legR", 0.11]] as const) {
    parts.push(part(new THREE.BoxGeometry(0.17, 0.018, 0.17), at(x, 0.23, 0.005), fixed(BONE[leg])));
  }
  const out = markShared(merged(parts));
  trimCache.set(code, out);
  return out;
}

/**
 * a remote's weapon strip: the unlit parts of the weapon, socket-local, in the tracer colour. With
 * `mastered` it carries the mastery finish's inlays, which the viewmodel merges into its first strip.
 */
export function weaponStripGeometry(id: WeaponId, mastered = false): THREE.BufferGeometry {
  const key = mastered ? `${id}+finish` : id;
  let g = stripCache.get(key);
  if (!g) {
    const vm = buildViewmodel(id, mastered);
    const local = new THREE.Matrix4().makeRotationY(WEAPON_IN_SOCKET.rotationY).multiply(new THREE.Matrix4().makeTranslation(...WEAPON_IN_SOCKET.position));
    const parts: THREE.BufferGeometry[] = [];
    for (const o of vm.children) {
      if (!(o instanceof THREE.Mesh) || o.material instanceof THREE.MeshStandardMaterial) continue;
      o.updateMatrix();
      parts.push(o.geometry.clone().applyMatrix4(local.clone().multiply(o.matrix)));
    }
    release(vm);
    const out = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    g = markShared(out ?? new THREE.BufferGeometry());
    stripCache.set(key, g);
  }
  return g;
}

// ---- the sway shader ----

function swayPatch(material: THREE.Material, uniforms: SwayUniforms): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSway = uniforms.uSway;
    shader.uniforms.uFlap = uniforms.uFlap;
    shader.uniforms.uPhase = uniforms.uPhase;
    shader.uniforms.uFlare = uniforms.uFlare;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float sway;\nattribute float shade;\nvarying float vShade;\nuniform vec3 uSway; uniform float uFlap; uniform float uPhase; uniform float uFlare;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvShade = shade;")
      .replace("#include <skinning_vertex>", "#include <skinning_vertex>\ntransformed += sway * uSway;\ntransformed.x += sway * uFlap * sin(uPhase + transformed.y * 6.0);\ntransformed.xz *= 1.0 + sway * uFlare;");
    // the baked occlusion reaches both the albedo and the worn tint's glow, so the void in the hood stays black
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vShade;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= vShade;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vShade;");
  };
  material.customProgramCacheKey = () => CACHE_KEY;
  material.userData.sway = uniforms;
}

// ---- the rig ----

/** the cloak's resting emissive: a hit lights it above this and it falls back here (Stage 89) */
export const RIG_EMISSIVE = 0.025;

export function buildRig(slot: WeaponId | null = null, look = 0): Rig {
  const group = new THREE.Group();
  const bones = {} as Record<BoneName, THREE.Bone>;
  for (const name of Object.keys(REST_BONES) as BoneName[]) {
    const b = new THREE.Bone();
    b.name = name;
    bones[name] = b;
  }
  for (const name of Object.keys(REST_BONES) as BoneName[]) {
    const def = REST_BONES[name];
    const w = def.world;
    if (def.parent) {
      const p = REST_BONES[def.parent].world;
      bones[name].position.set(w[0] - p[0], w[1] - p[1], w[2] - p[2]);
      bones[def.parent].add(bones[name]);
    } else {
      bones[name].position.set(w[0], w[1], w[2]);
      group.add(bones[name]);
    }
  }
  group.updateMatrixWorld(true);
  const ordered = (Object.keys(BONE) as BoneName[]).sort((a, b) => BONE[a] - BONE[b]).map((n) => bones[n]);
  const skeleton = new THREE.Skeleton(ordered);
  const uniforms: SwayUniforms = { uSway: { value: new THREE.Vector3() }, uFlap: { value: 0 }, uPhase: { value: 0 }, uFlare: { value: 0 } };
  // the cloak is near-black: a silhouette the strip-lights barely find, with the faintest cast of the worn tint
  const mat = new THREE.MeshStandardMaterial({ color: 0x05060a, emissive: PALETTE.cyan, emissiveIntensity: RIG_EMISSIVE, roughness: 1 });
  bindPlate(mat, "tex_cloak");
  const trim = new THREE.MeshBasicMaterial({ color: PALETTE.cyan });
  swayPatch(mat, uniforms);
  swayPatch(trim, uniforms);
  const code = sanitizeLookCode(look);
  const cloak = new THREE.SkinnedMesh(cloakGeometry(slot, code), mat);
  const trimMesh = new THREE.SkinnedMesh(trimGeometry(code), trim);
  for (const m of [cloak, trimMesh]) {
    m.frustumCulled = true;
    group.add(m);
    m.bind(skeleton);
    // a slide's lead boot is 0.58 m ahead and a mantle's hands 1.95 m up: both inside this, never recomputed
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.5);
  }
  return { group, mat, trim, hand: bones.socket, bones, skeleton, cloak, trimMesh, uniforms, state: createPoseState(), tint: new THREE.Color(PALETTE.cyan), last: null, look: code, slot };
}

/** put a remote's weapon on its rig by slot: the cloak's geometry with that weapon baked in, and its strip */
export function setRigSlot(rig: Rig, slot: WeaponId | null, strip: THREE.Mesh | null, mastered = false): void {
  rig.slot = slot;
  rig.cloak.geometry = cloakGeometry(slot, rig.look);
  if (strip) {
    strip.visible = !!slot;
    if (slot) strip.geometry = weaponStripGeometry(slot, mastered);
  }
}

/**
 * A remote's weapon from what the wire carries: the weapon of its slot, with the mastery finish
 * when that file's tag says its record has that weapon at the cap. Rebuilds only on a change and
 * returns whether there was one. The finish lives in the strip, so it costs no draw call.
 */
export function holdRemoteWeapon(rig: Rig, strip: THREE.Mesh, slot: number | undefined, tag: string | undefined): boolean {
  const id = slot !== undefined ? (weaponBySlot(slot)?.id ?? null) : null;
  const mastered = !!id && wearsFinish(parseTag(tag ?? "", "").finish, id);
  const key = `${id ?? "-"}|${mastered ? 1 : 0}`;
  if (strip.userData.held === key) return false;
  strip.userData.held = key;
  setRigSlot(rig, id, strip, mastered);
  return true;
}

/** cut a rig's cloth to a look (Stage 689): the cloak and its lights change, the bones do not. Returns whether it changed. */
export function setRigLook(rig: Rig, look: number): boolean {
  const code = sanitizeLookCode(look);
  if (code === rig.look) return false;
  rig.look = code;
  rig.cloak.geometry = cloakGeometry(rig.slot, code);
  rig.trimMesh.geometry = trimGeometry(code);
  return true;
}

// ---- the pose writer ----

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);
const poleR = v3(1, -0.5, 0.3);
const poleL = v3(-1, -0.5, 0.3);
const rotY = (p: Vec3, yaw: number): Vec3 => v3(p.x * Math.cos(yaw) + p.z * Math.sin(yaw), p.y, -p.x * Math.sin(yaw) + p.z * Math.cos(yaw));
const world = (o: THREE.Object3D, p: Vec3): Vec3 => {
  tmpA.set(p.x, p.y, p.z);
  o.localToWorld(tmpA);
  return v3(tmpA.x, tmpA.y, tmpA.z);
};

/** write one arm: the upper arm from the shoulder to the elbow, the forearm from the elbow to the wrist, in the bones' parents' frames */
function writeArm(upper: THREE.Bone, fore: THREE.Bone, parent: THREE.Object3D, shoulder: Vec3, target: Vec3, pole: Vec3): { wrist: Vec3 } {
  const ik = twoBoneIK(shoulder, target, pole, UPPER_ARM, FORE_ARM);
  const toElbow = sub(ik.elbow, shoulder);
  const toWrist = sub(ik.wrist, ik.elbow);
  parent.getWorldQuaternion(tmpQ);
  tmpB.set(toElbow.x, toElbow.y, toElbow.z).normalize();
  tmpQ2.setFromUnitVectors(DOWN, tmpB);
  upper.quaternion.copy(tmpQ).invert().multiply(tmpQ2);
  // the forearm hangs from the upper arm, whose world rotation is parent × upper
  tmpQ.multiply(upper.quaternion);
  tmpB.set(toWrist.x, toWrist.y, toWrist.z).normalize();
  tmpQ2.setFromUnitVectors(DOWN, tmpB);
  fore.quaternion.copy(tmpQ).invert().multiply(tmpQ2);
  return { wrist: ik.wrist };
}

/**
 * Write a pose into the rig. The group's position and yaw must already be set for this frame:
 * the arms are solved in world space toward the weapon, which hangs from the socket, which hangs
 * from the group.
 */
export function applyPose(rig: Rig, out: PoseOut, yaw: number): void {
  const b = rig.bones;
  b.hips.position.y = out.hips.y;
  b.hips.rotation.set(out.hips.rx, 0, 0);
  b.chest.rotation.set(out.chest.rx, out.chest.ry, 0);
  b.head.rotation.set(out.head.rx, 0, 0);
  b.legL.rotation.set(out.legL.rx, out.legL.ry, 0);
  b.legL.scale.y = out.legL.sy;
  b.legR.rotation.set(out.legR.rx, out.legR.ry, 0);
  b.legR.scale.y = out.legR.sy;
  b.socket.position.set(out.socket.x, out.socket.y, out.socket.z);
  b.socket.rotation.set(out.socket.rx, 0, 0);
  rig.uniforms.uSway.value.set(out.sway.x, out.sway.y, out.sway.z);
  rig.uniforms.uFlap.value = out.flap;
  rig.uniforms.uPhase.value = out.phase;
  rig.uniforms.uFlare.value = out.flare;
  rig.trim.color.copy(rig.tint).multiplyScalar(out.trimScale);
  // the arms: shoulders and targets in world, after the torso is placed
  rig.group.updateMatrixWorld(true);
  const sR = world(b.upperR, v3(0, 0, 0));
  const sL = world(b.upperL, v3(0, 0, 0));
  let tR: Vec3, tL: Vec3;
  if (out.armsOnWeapon) {
    tR = world(b.socket, out.armTargetR);
    const a = world(b.socket, FORE_A), c = world(b.socket, FORE_B);
    const fore = nearestOnSegment(sL, a, c);
    const well = world(b.socket, MAG_WELL);
    tL = addScaled(fore, sub(well, fore), out.leftReloadMix);
  } else {
    tR = world(rig.group, out.armTargetR);
    tL = world(rig.group, out.armTargetL);
  }
  const wr = writeArm(b.upperR, b.foreR, b.chest, sR, tR, rotY(poleR, yaw));
  const wl = writeArm(b.upperL, b.foreL, b.chest, sL, tL, rotY(poleL, yaw));
  rig.group.updateMatrixWorld(true);
  rig.last = out;
  (rig as Rig & { wrists?: { r: Vec3; l: Vec3; tR: Vec3; tL: Vec3 } }).wrists = { r: wr.wrist, l: wl.wrist, tR, tL };
}

export interface RigReport {
  bones: Record<string, { x: number; y: number; z: number }>;
  wristErr: { r: number | null; l: number | null };
  socketPitch: number;
  headPitch: number;
  chestAhead: number;
  hoodApex: number;
  bootBottom: { l: number; r: number };
  out: PoseOut | null;
  uniforms: { swayX: number; swayY: number; swayZ: number; flap: number; flare: number } | null;
  sameUniforms: boolean;
  trim: string;
  bones10: number;
  skinned: boolean;
  /** the cloak's emissive: at rest `RIG_EMISSIVE`, lit above it by a hit that landed (Stage 89) */
  emissive: number;
  /** a remote's flinch and the world bearing back toward whatever hit it (Stage 89) */
  hurt?: number;
  hurtFrom?: number;
  /** a remote's slot and its weapon strip's colour; the group's drawables */
  slot?: number;
  stripColor?: number | null;
  calls?: number;
}

/** what the probe reads off a rig after a frame */
export function rigReport(rig: Rig): RigReport {
  const b = rig.bones;
  const gp = rig.group.position;
  const w = (o: THREE.Object3D, p = v3(0, 0, 0)) => {
    const q = world(o, p);
    return { x: q.x, y: q.y, z: q.z };
  };
  const wrists = (rig as Rig & { wrists?: { r: Vec3; l: Vec3; tR: Vec3; tL: Vec3 } }).wrists;
  // the wrist as the WRITTEN BONES put it — the end of the forearm in world space — rather than the
  // point the solver returned. Comparing the solver's answer to the solver's own target says only
  // that the arithmetic closed; it cannot fail if applyPose writes the result to the wrong bone
  // (Stage 65: two reviewers found the headline "both hands reach the weapon" check unfalsifiable)
  const wristOf = (fore: THREE.Bone) => world(fore, v3(0, -FORE_ARM, 0));
  const socketFwd = world(b.socket, v3(0, 0, -1));
  const socketAt = world(b.socket, v3(0, 0, 0));
  const fwd = sub(socketFwd, socketAt);
  const headFwd = sub(world(b.head, v3(0, 0, -1)), world(b.head, v3(0, 0, 0)));
  const chest = world(b.chest, v3(0, 0, 0));
  const hips = world(b.hips, v3(0, 0, 0));
  const yaw = rig.group.rotation.y;
  const forward = v3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const chestAhead = (chest.x - hips.x) * forward.x + (chest.z - hips.z) * forward.z;
  const boot = (leg: THREE.Bone) => world(leg, v3(0, -0.58, 0)).y - gp.y;
  const dist = (a: Vec3 | undefined, c: Vec3 | undefined) => (a && c ? Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z) : null);
  return {
    bones: Object.fromEntries((Object.keys(b) as BoneName[]).map((n) => [n, w(b[n])])),
    wristErr: { r: dist(wristOf(b.foreR), wrists?.tR), l: dist(wristOf(b.foreL), wrists?.tL) },
    socketPitch: Math.asin(Math.max(-1, Math.min(1, fwd.y / Math.hypot(fwd.x, fwd.y, fwd.z)))),
    headPitch: Math.asin(Math.max(-1, Math.min(1, headFwd.y / Math.hypot(headFwd.x, headFwd.y, headFwd.z)))),
    chestAhead,
    hoodApex: world(b.head, v3(0, 0.3, 0.1)).y - gp.y,
    bootBottom: { l: boot(b.legL), r: boot(b.legR) },
    out: rig.last,
    uniforms: rig.mat.userData.sway ? { swayX: rig.uniforms.uSway.value.x, swayY: rig.uniforms.uSway.value.y, swayZ: rig.uniforms.uSway.value.z, flap: rig.uniforms.uFlap.value, flare: rig.uniforms.uFlare.value } : null,
    sameUniforms: rig.mat.userData.sway === rig.trim.userData.sway,
    trim: "#" + rig.trim.color.getHexString(),
    bones10: rig.skeleton.bones.length,
    skinned: rig.cloak.isSkinnedMesh && rig.trimMesh.isSkinnedMesh,
    emissive: rig.mat.emissiveIntensity,
  };
}

/** a rig with the skeleton it owns: released with the group, disposed here */
export function disposeRig(rig: Rig): void {
  rig.skeleton.dispose();
  release(rig.group);
}

