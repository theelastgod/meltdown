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
import { WEAPON_LIST, type WeaponId } from "@shared/weapons/manifest";
import { PALETTE } from "./city";
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
const CACHE_KEY = "cloak-sway";

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
}

// ---- geometry ----

const tubeR = (y: number): number => 0.21 + (0.15 * (1.5 - y)) / 0.95;
const tubeSway = (y: number): number => Math.max(0, (1.5 - y) / 0.95) ** 2;

type Weighting = (x: number, y: number, z: number) => { a: number; b: number; wa: number; sway: number };
const fixed =
  (bone: number, sway = 0): Weighting =>
  () => ({ a: bone, b: 0, wa: 1, sway });
/** the cloak's tube: hips below y 0.95, chest above 1.30, blended between; the hem sways most */
const tubeWeights: Weighting = (_x, y) => {
  const wChest = Math.min(1, Math.max(0, (y - 0.95) / 0.35));
  return { a: BONE.chest, b: BONE.hips, wa: wChest, sway: tubeSway(y) };
};

/** bake a part at a body-frame transform and give every vertex its bones and its sway */
function part(geo: THREE.BufferGeometry, m: THREE.Matrix4, w: Weighting): THREE.BufferGeometry {
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

/** the cloak's own parts: tube, yoke, hood, arms, boots */
function cloakParts(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(new THREE.CylinderGeometry(0.21, 0.36, 0.95, 10, 6, true), at(0, 1.025, 0), tubeWeights));
  parts.push(part(new THREE.CylinderGeometry(0.16, 0.22, 0.14, 10, 1, true), at(0, 1.49, 0), fixed(BONE.chest)));
  parts.push(part(new THREE.CircleGeometry(0.16, 10).rotateX(-Math.PI / 2), at(0, 1.56, 0), fixed(BONE.chest)));
  // the hood: a closed cone with nothing inside it, its point trailing behind the head
  const hood = new THREE.ConeGeometry(0.24, 0.32, 8, 1, true);
  const hp = hood.getAttribute("position");
  for (let i = 0; i < hp.count; i++) hp.setZ(i, hp.getZ(i) + (0.1 * (hp.getY(i) + 0.16)) / 0.32);
  parts.push(part(hood, at(0, 1.66, 0), fixed(BONE.head)));
  parts.push(part(new THREE.CylinderGeometry(0.24, 0.22, 0.1, 8, 1, true), at(0, 1.49, 0), fixed(BONE.head)));
  // arms hang straight down at rest; the pose bends them
  const arm = (upper: BoneName, fore: BoneName) => {
    const u = REST_BONES[upper].world;
    const f = REST_BONES[fore].world;
    parts.push(part(new THREE.BoxGeometry(0.09, UPPER_ARM, 0.09), at(u[0], u[1] - UPPER_ARM / 2, u[2]), fixed(BONE[upper])));
    parts.push(part(new THREE.BoxGeometry(0.08, FORE_ARM, 0.08), at(f[0], f[1] - FORE_ARM / 2, f[2]), fixed(BONE[fore])));
  };
  arm("upperR", "foreR");
  arm("upperL", "foreL");
  // boots: a shin and a toe per leg
  for (const [leg, x] of [["legL", -0.11], ["legR", 0.11]] as const) {
    parts.push(part(new THREE.BoxGeometry(0.13, 0.58, 0.16), at(x, 0.29, 0), fixed(BONE[leg])));
    parts.push(part(new THREE.BoxGeometry(0.13, 0.08, 0.1), at(x, 0.04, -0.13), fixed(BONE[leg])));
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
let trimCache: THREE.BufferGeometry | null = null;
const stripCache = new Map<WeaponId, THREE.BufferGeometry>();

/** the cloak geometry, shared: with a weapon baked in for a remote's slot, bare for the local rig */
export function cloakGeometry(slot: WeaponId | null): THREE.BufferGeometry {
  const key = slot ?? "-";
  let g = cloakCache.get(key);
  if (!g) {
    g = markShared(merged([...cloakParts(), ...(slot ? weaponParts(slot, true) : [])]));
    cloakCache.set(key, g);
  }
  return g;
}

/** the trim: a spine strip riding the cloth and a strip on each boot */
export function trimGeometry(): THREE.BufferGeometry {
  if (trimCache) return trimCache;
  const parts: THREE.BufferGeometry[] = [];
  const az = Math.PI / 3;
  for (const y of [1.36, 1.12, 0.88, 0.66]) {
    const r = tubeR(y) + 0.01;
    parts.push(part(new THREE.BoxGeometry(0.04, 0.22, 0.04), at(r * Math.sin(az), y, r * Math.cos(az)), tubeWeights));
  }
  for (const [leg, x] of [["legL", -0.175], ["legR", 0.175]] as const) parts.push(part(new THREE.BoxGeometry(0.02, 0.02, 0.16), at(x, 0.08, -0.05), fixed(BONE[leg])));
  trimCache = markShared(merged(parts));
  return trimCache;
}

/** a remote's weapon strip: the unlit parts of the weapon, socket-local, in the tracer colour */
export function weaponStripGeometry(id: WeaponId): THREE.BufferGeometry {
  let g = stripCache.get(id);
  if (!g) {
    const vm = buildViewmodel(id);
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
    stripCache.set(id, g);
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
      .replace("#include <common>", "#include <common>\nattribute float sway;\nuniform vec3 uSway; uniform float uFlap; uniform float uPhase; uniform float uFlare;")
      .replace("#include <skinning_vertex>", "#include <skinning_vertex>\ntransformed += sway * uSway;\ntransformed.x += sway * uFlap * sin(uPhase + transformed.y * 6.0);\ntransformed.xz *= 1.0 + sway * uFlare;");
  };
  material.customProgramCacheKey = () => CACHE_KEY;
  material.userData.sway = uniforms;
}

// ---- the rig ----

export function buildRig(slot: WeaponId | null = null): Rig {
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
  const mat = new THREE.MeshStandardMaterial({ color: 0x05060a, emissive: PALETTE.cyan, emissiveIntensity: 0.025, roughness: 1 });
  const trim = new THREE.MeshBasicMaterial({ color: PALETTE.cyan });
  swayPatch(mat, uniforms);
  swayPatch(trim, uniforms);
  const cloak = new THREE.SkinnedMesh(cloakGeometry(slot), mat);
  const trimMesh = new THREE.SkinnedMesh(trimGeometry(), trim);
  for (const m of [cloak, trimMesh]) {
    m.frustumCulled = true;
    group.add(m);
    m.bind(skeleton);
    // a slide's lead boot is 0.58 m ahead and a mantle's hands 1.95 m up: both inside this, never recomputed
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.5);
  }
  return { group, mat, trim, hand: bones.socket, bones, skeleton, cloak, trimMesh, uniforms, state: createPoseState(), tint: new THREE.Color(PALETTE.cyan), last: null };
}

/** put a remote's weapon on its rig by slot: the cloak's geometry with that weapon baked in, and its strip */
export function setRigSlot(rig: Rig, slot: WeaponId | null, strip: THREE.Mesh | null): void {
  rig.cloak.geometry = cloakGeometry(slot);
  if (strip) {
    strip.visible = !!slot;
    if (slot) strip.geometry = weaponStripGeometry(slot);
  }
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
    wristErr: { r: dist(wrists?.r, wrists?.tR), l: dist(wrists?.l, wrists?.tL) },
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
  };
}

/** a rig with the skeleton it owns: released with the group, disposed here */
export function disposeRig(rig: Rig): void {
  rig.skeleton.dispose();
  release(rig.group);
}

