/**
 * VANTAGE's machines (Stage 668): the Wasp and the repo mech.
 *
 * Until this stage a Wasp was a box with four flat discs over it and a mech was a box on two box
 * legs: the two things the player fights in every contract were the crudest shapes in the game.
 * Now a Wasp is a surveillance insect: a segmented body with a head, a tail that curls down to a
 * sensor sting, dangling legs, and four rotors in ducts on swept arms. A repo mech is a walker: a
 * hunched armoured hull, clamp arms for repossessing, exhaust stacks, a searchlight turret on a
 * neck, and digitigrade legs that swing from the hip as it walks.
 *
 * Both are built front-at-−z, the way the sim's yaw faces them. Geometry is cached and shared, so a
 * wave of drones costs no more to build than one. Amber is VANTAGE's colour: it appears on these
 * two and nowhere else on them.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { markShared } from "./dispose";
import { plantedBob, plantedGait, type PlantedWalk } from "./gait";

type P3 = readonly [number, number, number];
const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
const put = (g: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry => {
  g.applyMatrix4(m);
  return g.index ? g.toNonIndexed() : g;
};
/** an ellipsoid of the given radii */
const blob = (rx: number, ry: number, rz: number, at: P3, segs = 10): THREE.BufferGeometry => put(new THREE.SphereGeometry(1, segs, Math.max(6, segs - 2)), T(...at).multiply(new THREE.Matrix4().makeScale(rx, ry, rz)));
/** a bar from a to b, w across and d deep */
function strut(a: P3, b: P3, w: number, d: number): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return put(new THREE.BoxGeometry(w, len, d), new THREE.Matrix4().compose(va.add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
}
/** a box that is w0×d0 at its foot and w1×d1 at its top */
function taper(w0: number, d0: number, w1: number, d1: number, h: number, m: THREE.Matrix4): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, h, 1, 1, 2, 1);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / h + 0.5;
    p.setXYZ(i, p.getX(i) * (w0 + (w1 - w0) * t), p.getY(i), p.getZ(i) * (d0 + (d1 - d0) * t));
  }
  g.computeVertexNormals();
  return put(g, m);
}
const merge = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry => {
  const out = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
  for (const g of parts) g.dispose();
  out.computeVertexNormals();
  return markShared(out);
};

// ---- the Wasp ----

/** where each rotor spins, in the Wasp's own frame (the sim's pos is its centre) */
export const WASP_ROTORS: readonly P3[] = [[-0.36, 0.07, -0.28], [0.36, 0.07, -0.28], [-0.36, 0.07, 0.3], [0.36, 0.07, 0.3]];
export const WASP_DUCT_R = 0.2;

let waspCache: { hull: THREE.BufferGeometry; eye: THREE.BufferGeometry; rotor: THREE.BufferGeometry } | null = null;
export function waspGeometry(): { hull: THREE.BufferGeometry; eye: THREE.BufferGeometry; rotor: THREE.BufferGeometry } {
  if (waspCache) return waspCache;
  const hull: THREE.BufferGeometry[] = [
    // thorax, head, and the tail in three shrinking segments curling down to the sting
    blob(0.24, 0.15, 0.27, [0, 0, 0]),
    blob(0.14, 0.11, 0.14, [0, -0.01, -0.33]),
    blob(0.18, 0.12, 0.16, [0, 0.01, 0.27]),
    blob(0.14, 0.1, 0.13, [0, -0.04, 0.42]),
    blob(0.09, 0.07, 0.09, [0, -0.1, 0.53], 8),
    strut([0, -0.13, 0.58], [0, -0.26, 0.64], 0.04, 0.04),
    // the gun under the jaw
    put(new THREE.CylinderGeometry(0.03, 0.04, 0.26, 6), T(0, -0.12, -0.38).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))),
  ];
  for (const [x, y, z] of WASP_ROTORS) {
    // a swept arm to each duct, and the duct round the rotor
    hull.push(strut([Math.sign(x) * 0.16, 0.04, Math.sign(z) * 0.12], [x - Math.sign(x) * WASP_DUCT_R * 0.9, y, z], 0.035, 0.03));
    hull.push(put(new THREE.TorusGeometry(WASP_DUCT_R, 0.022, 5, 16), T(x, y, z).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))));
  }
  // three pairs of legs hanging under the thorax
  for (const z of [-0.12, 0, 0.12]) for (const s of [-1, 1]) hull.push(strut([s * 0.1, -0.09, z], [s * 0.2, -0.3, z + 0.08], 0.02, 0.02));
  // the eye: three lenses across the face, and a stripe down the tail you see as it chases
  const eye: THREE.BufferGeometry[] = [];
  for (const x of [-0.06, 0, 0.06]) eye.push(put(new THREE.BoxGeometry(0.04, 0.035, 0.02), T(x, 0.0, -0.47)));
  eye.push(put(new THREE.BoxGeometry(0.035, 0.014, 0.32), T(0, 0.13, 0.36).multiply(new THREE.Matrix4().makeRotationX(0.12))));
  // a rotor: two blades crossed, in its own frame
  const rotor = [put(new THREE.BoxGeometry(0.34, 0.008, 0.045), new THREE.Matrix4()), put(new THREE.BoxGeometry(0.045, 0.008, 0.34), new THREE.Matrix4())];
  waspCache = { hull: merge(hull), eye: merge(eye), rotor: merge(rotor) };
  return waspCache;
}

// ---- the repo mech ----

/** the hip joints, in the mech's own frame (feet at the origin) */
export const MECH_HIP = { x: 0.62, y: 1.85 } as const;
/** the searchlight turret's pivot: the sim's light height */
export const MECH_HEAD_Y = 3.2;
/** one full walk cycle, in metres travelled: two steps */
export const MECH_STRIDE = 2.4;
/** the hip swing that keeps a planted foot planted: the foot travels half a stride while the body does */
/** hip to the bottom of the sole, read off the built leg: the radius the planted foot swings on */
let legLength = 0;
export function mechLegLength(): number {
  if (!legLength) {
    const g = mechGeometry().leg;
    g.computeBoundingBox();
    legLength = -g.boundingBox!.min.y;
  }
  return legLength;
}

let mechCache: { hull: THREE.BufferGeometry; leg: THREE.BufferGeometry; visor: THREE.BufferGeometry; head: THREE.BufferGeometry } | null = null;
export function mechGeometry(): { hull: THREE.BufferGeometry; leg: THREE.BufferGeometry; visor: THREE.BufferGeometry; head: THREE.BufferGeometry } {
  if (mechCache) return mechCache;
  const lean = new THREE.Matrix4().makeRotationX(-0.12);
  const hull: THREE.BufferGeometry[] = [
    // pelvis, and the hunched hull above it, leaning into the walk
    taper(1.0, 0.7, 1.15, 0.8, 0.35, T(0, MECH_HIP.y, 0)),
    taper(1.25, 0.95, 1.85, 1.2, 1.0, T(0, 2.5, 0.05).multiply(lean)),
    // the lease plate on the chest
    put(new THREE.BoxGeometry(0.9, 0.42, 0.08), T(0, 2.42, -0.6).multiply(lean)),
    // shoulder pods
    taper(0.5, 0.8, 0.42, 0.7, 0.5, T(-1.02, 2.72, 0.02)),
    taper(0.5, 0.8, 0.42, 0.7, 0.5, T(1.02, 2.72, 0.02)),
    // neck, and two exhaust stacks behind
    put(new THREE.BoxGeometry(0.34, 0.3, 0.34), T(0, 3.02, 0.08)),
    put(new THREE.CylinderGeometry(0.09, 0.1, 0.62, 8), T(-0.45, 3.1, 0.55)),
    put(new THREE.CylinderGeometry(0.09, 0.1, 0.62, 8), T(0.45, 3.1, 0.55)),
  ];
  for (const s of [-1, 1]) {
    // clamp arms: upper arm, forearm, and two prongs of the claw that repossesses
    hull.push(strut([s * 1.05, 2.55, 0], [s * 1.12, 1.95, -0.12], 0.24, 0.26));
    hull.push(strut([s * 1.12, 1.95, -0.12], [s * 1.1, 1.55, -0.42], 0.2, 0.22));
    hull.push(strut([s * 1.1, 1.55, -0.42], [s * 1.02, 1.28, -0.58], 0.07, 0.07));
    hull.push(strut([s * 1.1, 1.55, -0.42], [s * 1.2, 1.28, -0.58], 0.07, 0.07));
  }
  // a leg, hanging from its hip at the origin: thigh back, shin forward, the reverse knee between,
  // three toes and a heel spur, soles on the ground when the leg hangs straight
  const foot = -MECH_HIP.y + 0.075;
  const leg: THREE.BufferGeometry[] = [
    blob(0.22, 0.22, 0.22, [0, 0, 0], 8),
    strut([0, 0, 0], [0, -0.8, 0.38], 0.32, 0.38),
    blob(0.17, 0.17, 0.17, [0, -0.8, 0.38], 8),
    strut([0, -0.8, 0.38], [0, -1.5, -0.2], 0.24, 0.28),
    blob(0.12, 0.12, 0.12, [0, -1.5, -0.2], 6),
    strut([0, -1.5, -0.2], [0, foot, 0], 0.18, 0.18),
    strut([0, foot, 0], [-0.2, foot, -0.42], 0.14, 0.1),
    strut([0, foot, 0], [0.2, foot, -0.42], 0.14, 0.1),
    strut([0, foot, 0], [0, foot, 0.32], 0.12, 0.1),
  ];
  // VANTAGE's amber: the visor band across the chest, and a lamp on each shoulder pod
  const visor = [put(new THREE.BoxGeometry(1.5, 0.09, 0.05), T(0, 2.78, -0.7).multiply(lean)), put(new THREE.BoxGeometry(0.16, 0.05, 0.03), T(-1.02, 2.8, -0.39)), put(new THREE.BoxGeometry(0.16, 0.05, 0.03), T(1.02, 2.8, -0.39))];
  // the searchlight turret, round its own pivot: a barrel pointing forward under a hood, with fins
  const head = [
    put(new THREE.CylinderGeometry(0.27, 0.3, 0.56, 14), T(0, 0, -0.05).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))),
    put(new THREE.BoxGeometry(0.64, 0.06, 0.5), T(0, 0.3, -0.1)),
    put(new THREE.BoxGeometry(0.05, 0.36, 0.4), T(-0.33, 0.02, 0.02)),
    put(new THREE.BoxGeometry(0.05, 0.36, 0.4), T(0.33, 0.02, 0.02)),
  ];
  mechCache = { hull: merge(hull), leg: merge(leg), visor: merge(visor), head: merge(head) };
  return mechCache;
}

/** how high a stepping foot is lifted at the top of its swing */
export const MECH_LIFT = 0.22;
/** the mech's walk: its stride, its leg read off the geometry, its lift */
const mechWalk = (): PlantedWalk => ({ stride: MECH_STRIDE, leg: mechLegLength(), lift: MECH_LIFT });

/**
 * A leg's pose after `walked` metres (Stage 668): the planted-foot walk in `gait.ts`. `angle` is the
 * hip's pitch (positive swings the foot forward, toward -z); `lift` raises the leg.
 */
export function mechGait(walked: number, side: -1 | 1): { angle: number; lift: number } {
  return plantedGait(mechWalk(), walked, side);
}

/** how far the hull sinks so the planted foot, on its rigid leg, stays on the ground: a heavy walker's bob */
export function mechBob(walked: number): number {
  return plantedBob(mechWalk(), walked);
}
