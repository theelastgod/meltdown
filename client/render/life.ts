/**
 * City life: everything that moves in Neo-China and touches nothing in the sim.
 * Crowds of leased citizens on the sidewalks, the monorail over the walkway
 * street, steam from the grates, holographic ad tickers, blinking warning
 * lights on the skyline, an airship, and the shader flicker on the signs.
 * All of it is render-only; the collision boxes it needs (gates, posts)
 * live in the level as boxes.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { LevelDef, TramLine, WalkLoop } from "@shared/sim/level";
import { TRAM_SPEED } from "@shared/sim/tram";
import { bindPlate, PALETTE } from "./city";
import { placeFeel } from "./places";
import { markShared } from "./dispose";
import { tickerStep } from "./ticker";
import { FAR_LAYER } from "./renderer";

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

interface Ped {
  loop: WalkLoop;
  /** distance along the loop perimeter */
  t: number;
  dir: 1 | -1;
  speed: number;
  bob: number;
  /** standing still (leaning at a storefront) */
  idle: boolean;
  umbrella: boolean;
  /** body scale: the crowd is not one height (Stage 665) */
  h: number;
  /** shoulder width against that height. Lease Row is 1. */
  bulk: number;
  x: number;
  z: number;
  yaw: number;
}

/**
 * Who walks a named place. Lease Row is the crowd the street already had: mixed height, some
 * umbrellas, an amber lease-lamp. The other four are other people. No new mesh.
 */
export type CrowdCast = {
  h0: number;
  hSpan: number;
  bulk: number;
  umbrella: number;
  idle: number;
  speed0: number;
  speedSpan: number;
  coat: number;
  lamp: number;
};

export function crowdCast(name: string | undefined): CrowdCast {
  const felt = placeFeel(name);
  if (felt) return felt.crowd;
  switch (name) {
    case "deadletter_docks":
      return { h0: 0.98, hSpan: 0.1, bulk: 1.18, umbrella: 0.78, idle: 0.05, speed0: 0.62, speedSpan: 0.35, coat: 0x8eb4c4, lamp: 0x7ee7ff };
    case "night_market":
      return { h0: 0.82, hSpan: 0.14, bulk: 1.04, umbrella: 0.1, idle: 0.34, speed0: 0.48, speedSpan: 0.9, coat: 0xe090b0, lamp: 0xff6ec8 };
    case "relay_heights":
      return { h0: 1.14, hSpan: 0.08, bulk: 0.76, umbrella: 0.02, idle: 0.03, speed0: 1.12, speedSpan: 0.3, coat: 0xc5d0dc, lamp: 0xd5f2ff };
    case "repo_depot":
      return { h0: 1.02, hSpan: 0.06, bulk: 1.16, umbrella: 0.05, idle: 0.16, speed0: 0.68, speedSpan: 0.22, coat: 0xd2a15a, lamp: 0xffc14a };
    default:
      return { h0: 0.92, hSpan: 0.16, bulk: 1, umbrella: 0.3, idle: 0.12, speed0: 0.8, speedSpan: 0.7, coat: 0xffffff, lamp: PALETTE.amber };
  }
}

const perimeter = (l: WalkLoop) => 2 * (l.x1 - l.x0 + (l.z1 - l.z0));

/** Point and heading at distance t around a rectangle loop (clockwise from the NW corner). */
function onLoop(l: WalkLoop, t: number): { x: number; z: number; yaw: number } {
  const w = l.x1 - l.x0;
  const d = l.z1 - l.z0;
  const P = 2 * (w + d);
  let s = ((t % P) + P) % P;
  if (s < w) return { x: l.x0 + s, z: l.z0, yaw: Math.PI / 2 };
  s -= w;
  if (s < d) return { x: l.x1, z: l.z0 + s, yaw: 0 };
  s -= d;
  if (s < w) return { x: l.x1 - s, z: l.z1, yaw: -Math.PI / 2 };
  s -= w;
  return { x: l.x0, z: l.z1 - s, yaw: Math.PI };
}

/** Hooded silhouettes walking the sidewalks. Faces never lit; one amber lease-light on the chest. */
// ---- the leased citizen (Stage 665) ----
//
// Until Stage 665 a citizen was a capsule 0.6 m wide with a cone on top: a pill in a hat. Now a
// citizen is a person in a long drab coat with the hood up, arms hanging, legs and shoes under the
// hem, and a face that is a dark opening rather than a solid cone. They carry no strip-light: that
// is what marks a Blank out from the leased crowd (the lease lamp on the chest is VANTAGE's amber,
// not theirs). Built feet-at-the-origin with the front at +z, the way the walk loops face them.
// The same two instanced meshes and materials as before, so a crowd still costs its four calls.

type CitizenProfile = [number, number][];
function citizenLathe(profile: CitizenProfile, segs: number, sx: number, sz: number, folds: number, fold: (y: number) => number): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + fold(y) * Math.sin(folds * Math.atan2(x, z));
    p.setXYZ(i, x * k * sx, y, z * k * sz);
  }
  g.computeVertexNormals();
  return g;
}
const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);

/** the coat: the crowd's `dark` material. The limbs are separate instances so they can move (Stage 666) */
export function citizenBodyGeometry(): THREE.BufferGeometry {
  const hem = (y: number) => 0.06 * Math.min(1, Math.max(0, (0.75 - y) / 0.43));
  // a long coat, hunched at the shoulders, folded toward the hem
  return citizenLathe([[0.25, 0.32], [0.23, 0.55], [0.195, 0.85], [0.185, 1.05], [0.21, 1.22], [0.2, 1.33], [0.13, 1.41], [0.09, 1.44]], 10, 1.08, 0.82, 5, hem);
}

/**
 * A citizen's limbs (Stage 666): shins, shoes and arms, each an instance of one unit box, posed per
 * frame about its hip or shoulder. Until this stage a citizen was one rigid mesh sliding along the
 * pavement with a bob; now its legs stride and its arms swing against them. `side` is +1 on the
 * citizen's right; `swing` is how far this limb follows the stride (negative: against it).
 */
export const CITIZEN_LIMBS: readonly { kind: "shin" | "shoe" | "arm"; side: 1 | -1; size: [number, number, number]; centre: [number, number, number]; pivot: [number, number, number]; swing: number; tilt: number }[] = [
  { kind: "shin", side: 1, size: [0.1, 0.32, 0.11], centre: [0.085, 0.18, 0], pivot: [0.085, 0.34, 0], swing: 1, tilt: 0 },
  { kind: "shin", side: -1, size: [0.1, 0.32, 0.11], centre: [-0.085, 0.18, 0], pivot: [-0.085, 0.34, 0], swing: 1, tilt: 0 },
  { kind: "shoe", side: 1, size: [0.1, 0.06, 0.19], centre: [0.085, 0.03, 0.035], pivot: [0.085, 0.34, 0], swing: 1, tilt: 0 },
  { kind: "shoe", side: -1, size: [0.1, 0.06, 0.19], centre: [-0.085, 0.03, 0.035], pivot: [-0.085, 0.34, 0], swing: 1, tilt: 0 },
  { kind: "arm", side: 1, size: [0.085, 0.52, 0.09], centre: [0.235, 1.03, 0], pivot: [0.235, 1.29, 0], swing: -0.7, tilt: 0.08 },
  { kind: "arm", side: -1, size: [0.085, 0.52, 0.09], centre: [-0.235, 1.03, 0], pivot: [-0.235, 1.29, 0], swing: -0.7, tilt: -0.08 },
];
/** the stride's reach at the hip, radians */
export const CITIZEN_STRIDE = 0.42;

/**
 * The stride angle for a citizen's right leg at a time: on the same clock as the bob, so the body is
 * highest when the feet pass each other (the swing crosses zero where |sin| peaks). Idle: none.
 */
export function citizenSwing(time: number, speed: number, phase: number, idle: boolean): number {
  return idle ? 0 : CITIZEN_STRIDE * Math.cos(time * 6 * speed + phase);
}

/** Shoes, shins, and sleeves. Lease Row keeps the colours the crowd shipped with. */
export const STREET_LIMB = { shoe: 0x14110e, shin: 0x4a433c, cloth: 0xffffff } as const;

const DISTRICT_LIMB: Record<string, { shoe: number; shin: number; cloth: number }> = {
  deadletter_docks: { shoe: 0x101820, shin: 0x3a5560, cloth: 0xc5d8e0 },
  repo_depot: { shoe: 0x1c140c, shin: 0x5a4030, cloth: 0xe0c090 },
  night_market: { shoe: 0x180810, shin: 0x603040, cloth: 0xf0b0c8 },
  relay_heights: { shoe: 0x12161c, shin: 0x4a5560, cloth: 0xd8e4ee },
  ash_canal: { shoe: 0x0c1612, shin: 0x2e5040, cloth: 0xa8d0b8 },
  glass_mile: { shoe: 0x160c18, shin: 0x503060, cloth: 0xf0d8f4 },
  bone_market: { shoe: 0x1a120c, shin: 0x584030, cloth: 0xe0c8a8 },
  cold_vault: { shoe: 0x101418, shin: 0x3a4848, cloth: 0xc8e8e4 },
  neon_chapel: { shoe: 0x140818, shin: 0x482868, cloth: 0xe0b0f0 },
  slag_pit: { shoe: 0x1a0c08, shin: 0x583020, cloth: 0xf0a080 },
  wire_garden: { shoe: 0x0c140e, shin: 0x2a4830, cloth: 0xb8e8c0 },
  red_kiln: { shoe: 0x180a08, shin: 0x582820, cloth: 0xf0a098 },
  paper_wharf: { shoe: 0x121416, shin: 0x40484c, cloth: 0xd0d8dc },
  velvet_court: { shoe: 0x160810, shin: 0x502030, cloth: 0xf0a0b8 },
  rust_crown: { shoe: 0x18100a, shin: 0x584028, cloth: 0xe8c090 },
  salt_stairs: { shoe: 0x121418, shin: 0x404850, cloth: 0xe4e8ee },
  lamp_bazaar: { shoe: 0x180810, shin: 0x582838, cloth: 0xf8b0d0 },
  debt_orchard: { shoe: 0x12140c, shin: 0x3a4820, cloth: 0xd0e090 },
  black_relay: { shoe: 0x0c0e12, shin: 0x303840, cloth: 0xa8b0b8 },
};

export function limbRead(name: string | undefined): { shoe: number; shin: number; cloth: number } {
  return (name && DISTRICT_LIMB[name]) || STREET_LIMB;
}

/** Umbrella cloth. Lease Row keeps the dark canopy the crowd shipped with. */
export const STREET_BROLLY = 0x0e1218;

const DISTRICT_BROLLY: Record<string, number> = {
  deadletter_docks: 0x1a3040,
  repo_depot: 0x3a2810,
  night_market: 0x4a1830,
  relay_heights: 0x243040,
  ash_canal: 0x143028,
  glass_mile: 0x301838,
  bone_market: 0x3a2818,
  cold_vault: 0x1c3030,
  neon_chapel: 0x301848,
  slag_pit: 0x3a180c,
  wire_garden: 0x143020,
  red_kiln: 0x3a1410,
  paper_wharf: 0x2a3034,
  velvet_court: 0x401020,
  rust_crown: 0x3a2410,
  salt_stairs: 0x2a3038,
  lamp_bazaar: 0x481830,
  debt_orchard: 0x243018,
  black_relay: 0x181c22,
};

export function brollyRead(name: string | undefined): number {
  return (name && DISTRICT_BROLLY[name]) || STREET_BROLLY;
}

/** One instance colour on the limb mesh the crowd already draws. A room with no name keeps Lease Row. */
export function paintCitizenLimbs(mesh: THREE.InstancedMesh, citizens: number, place?: string): void {
  const limb = limbRead(place);
  const shoe = new THREE.Color(limb.shoe);
  const shin = new THREE.Color(limb.shin);
  const cloth = new THREE.Color(limb.cloth);
  const n = CITIZEN_LIMBS.length;
  for (let i = 0; i < citizens; i++) {
    for (let k = 0; k < n; k++) {
      const kind = CITIZEN_LIMBS[k]!.kind;
      mesh.setColorAt(i * n + k, kind === "shoe" ? shoe : kind === "shin" ? shin : cloth);
    }
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/** the hood with its face opening toward +z, and a dark plate where a face would be: the crowd's hood material */
export function citizenHoodGeometry(): THREE.BufferGeometry {
  const opening = 1.7;
  const shell = new THREE.SphereGeometry(0.15, 10, 6, Math.PI / 2 + opening / 2, Math.PI * 2 - opening, 0, Math.PI * 0.7);
  const p = shell.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    // elongate, pull the crown back (away from the face at +z), seat it on the shoulders
    p.setXYZ(i, p.getX(i), y * 1.15 + 1.53, p.getZ(i) * 1.1 - 0.07 * Math.max(0, y / 0.15) - 0.01);
  }
  shell.computeVertexNormals();
  // The face plate shares the hood mesh, so it cannot have its own material without another draw.
  // Vertex colour 0 blacks it after the cloak map; the shell stays 1 and looks as it did (Stage 737).
  const shellN = shell.toNonIndexed();
  shellN.setAttribute("color", new THREE.BufferAttribute(new Float32Array(shellN.getAttribute("position").count * 3).fill(1), 3));
  const faceSrc = new THREE.CircleGeometry(0.1, 8).applyMatrix4(T(0, 1.5, 0.02));
  const face = faceSrc.toNonIndexed();
  face.setAttribute("color", new THREE.BufferAttribute(new Float32Array(face.getAttribute("position").count * 3), 3));
  const out = mergeGeometries([shellN, face], false);
  shell.dispose();
  faceSrc.dispose();
  face.dispose();
  return out!;
}

const UP = new THREE.Vector3(0, 1, 0);

export class Crowd {
  readonly group = new THREE.Group();
  private peds: Ped[] = [];
  private body: THREE.InstancedMesh;
  /** every citizen's shins, shoes and arms, CITIZEN_LIMBS.length per citizen in that order; read by tests */
  readonly limbs: THREE.InstancedMesh;
  private lm = new THREE.Matrix4();
  private lr = new THREE.Matrix4();
  private hood: THREE.InstancedMesh;
  private lamp: THREE.InstancedMesh;
  private brolly: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private time = 0;

  constructor(loops: readonly WalkLoop[], count: number, seed = 11, place?: string) {
    const rnd = lcg(seed);
    const cast = crowdCast(place);
    const dark = new THREE.MeshStandardMaterial({ color: 0x0b0d13, roughness: 0.9, metalness: 0.05 });
    const hoodMat = new THREE.MeshStandardMaterial({ color: 0x090a0f, roughness: 1, vertexColors: true });
    // white, so a district's lamp is the instance colour and Lease Row stays amber
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const brollyMat = new THREE.MeshStandardMaterial({ color: brollyRead(place), roughness: 0.8, side: THREE.DoubleSide });
    bindPlate(dark, "tex_crowd_coat");
    bindPlate(hoodMat, "tex_cloak");
    bindPlate(brollyMat, "tex_brolly");
    bindPlate(lampMat, "tex_lamp");
    this.body = new THREE.InstancedMesh(citizenBodyGeometry(), dark, count);
    this.limbs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), dark, count * CITIZEN_LIMBS.length);
    paintCitizenLimbs(this.limbs, count, place);
    this.hood = new THREE.InstancedMesh(citizenHoodGeometry(), hoodMat, count);
    this.lamp = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.06, 0.04), lampMat, count);
    this.brolly = new THREE.InstancedMesh(new THREE.ConeGeometry(0.75, 0.25, 8, 1, true), brollyMat, count);
    for (const mesh of [this.body, this.limbs, this.hood, this.lamp, this.brolly]) {
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    // heights from their own stream, so the crowd's loops, speeds and umbrellas are the ones they were
    const rh = lcg(seed + 101);
    const lamp = new THREE.Color(cast.lamp);
    for (let i = 0; i < count; i++) {
      const loop = loops[Math.floor(rnd() * loops.length)]!;
      const ped: Ped = {
        loop,
        t: rnd() * perimeter(loop),
        dir: rnd() < 0.5 ? 1 : -1,
        speed: cast.speed0 + rnd() * cast.speedSpan,
        bob: rnd() * 6.28,
        idle: rnd() < cast.idle,
        umbrella: rnd() < cast.umbrella,
        h: cast.h0 + rh() * cast.hSpan,
        bulk: cast.bulk,
        x: 0,
        z: 0,
        yaw: 0,
      };
      this.peds.push(ped);
      const coat = new THREE.Color(cast.coat).multiplyScalar(0.78 + rnd() * 0.22);
      this.body.setColorAt(i, coat);
      this.hood.setColorAt(i, coat);
      this.lamp.setColorAt(i, lamp);
    }
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    if (this.hood.instanceColor) this.hood.instanceColor.needsUpdate = true;
    if (this.lamp.instanceColor) this.lamp.instanceColor.needsUpdate = true;
    this.update(0);
  }

  get count(): number {
    return this.peds.length;
  }

  /** A citizen's state, for tests: whether it stands still, and where it is facing. */
  pedInfo(i: number): { idle: boolean; speed: number; bob: number; yaw: number; x: number; z: number } {
    const p = this.peds[i]!;
    return { idle: p.idle, speed: p.speed, bob: p.bob, yaw: p.yaw, x: p.x, z: p.z };
  }

  /** Positions for probes (and later, for the campaign's Threat Rating). */
  sample(n = 8): { x: number; z: number }[] {
    return this.peds.slice(0, n).map((p) => ({ x: p.x, z: p.z }));
  }

  update(dt: number): void {
    this.time += dt;
    for (let i = 0; i < this.peds.length; i++) {
      const ped = this.peds[i]!;
      if (!ped.idle) ped.t += ped.dir * ped.speed * dt;
      const o = onLoop(ped.loop, ped.t);
      ped.x = o.x;
      ped.z = o.z;
      ped.yaw = ped.dir > 0 ? o.yaw : o.yaw + Math.PI;
      const bob = ped.idle ? 0 : Math.abs(Math.sin(this.time * 6 * ped.speed + ped.bob)) * 0.04;
      this.q.setFromAxisAngle(UP, ped.yaw);
      // body and hood share one feet-at-the-origin frame and the citizen's own height
      this.sc.set(ped.h * ped.bulk, ped.h, ped.h * ped.bulk);
      this.p.set(o.x, bob, o.z);
      this.m.compose(this.p, this.q, this.sc);
      this.body.setMatrixAt(i, this.m);
      this.hood.setMatrixAt(i, this.m);
      // the limbs: each about its hip or shoulder, in the citizen's own frame, then placed with it
      const swing = citizenSwing(this.time, ped.speed, ped.bob, ped.idle);
      for (let k = 0; k < CITIZEN_LIMBS.length; k++) {
        const L = CITIZEN_LIMBS[k]!;
        const a = swing * L.swing * L.side;
        this.lm.makeTranslation(L.pivot[0], L.pivot[1], L.pivot[2]);
        this.lm.multiply(this.lr.makeRotationX(a));
        this.lm.multiply(this.lr.makeTranslation(L.centre[0] - L.pivot[0], L.centre[1] - L.pivot[1], L.centre[2] - L.pivot[2]));
        if (L.tilt) this.lm.multiply(this.lr.makeRotationZ(L.tilt));
        this.lm.multiply(this.lr.makeScale(L.size[0], L.size[1], L.size[2]));
        this.lm.premultiply(this.m);
        this.limbs.setMatrixAt(i * CITIZEN_LIMBS.length + k, this.lm);
      }
      // lease light on the chest, on the coat's surface, facing the way they walk
      this.sc.set(1, 1, 1);
      this.p.set(o.x + Math.sin(ped.yaw) * 0.19 * ped.h, 1.12 * ped.h + bob, o.z + Math.cos(ped.yaw) * 0.19 * ped.h);
      this.m.compose(this.p, this.q, this.sc);
      this.lamp.setMatrixAt(i, this.m);
      this.p.set(o.x, ped.umbrella ? 2.0 * ped.h + bob : -5, o.z);
      this.m.compose(this.p, this.q, this.sc);
      this.brolly.setMatrixAt(i, this.m);
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.limbs.instanceMatrix.needsUpdate = true;
    this.hood.instanceMatrix.needsUpdate = true;
    this.lamp.instanceMatrix.needsUpdate = true;
    this.brolly.instanceMatrix.needsUpdate = true;
  }
}

/** The monorail: a lit car passing along the beam over the walkway street, both directions on a period. */
// ---- the monorail car (Stage 674) ----
//
// Until this stage a car was a 14 m box with a box of windows on it, centred at 8.6 m: the rail
// beam (9.0-9.3 m) ran straight through its upper body. A car now rides ON the beam, the way the
// posts and the walkway beneath it demand (a car hung under the beam would pass at head height over
// the 4.6 m walkway): two bogies on the running surface, a lofted hull with raked noses and a flat
// windscreen, window panes down both sides, a roof pod. Built along +x from the running surface up.
// The same five meshes and materials as before, so a car costs no call it did not.

/** the running surface is the car's floor: the cross-members at the posts stand 0.1 m proud of the beam */
export const TRAM = { length: 14, width: 2.6, height: 2.6, lift: 0.35, bogie: 0.35 } as const;

type Station = { x: number; w: number; h: number; dy: number };
/** a rounded-rectangle ring, `segs` points per quarter corner, in the y-z plane */
function tramRing(w: number, h: number, r: number, segs: number): [number, number][] {
  const pts: [number, number][] = [];
  const cx = w / 2 - r, cy = h / 2 - r;
  const corners: [number, number, number][] = [[cx, cy, 0], [-cx, cy, Math.PI / 2], [-cx, -cy, Math.PI], [cx, -cy, (3 * Math.PI) / 2]];
  for (const [ox, oy, a0] of corners) for (let k = 0; k <= segs; k++) {
    const a = a0 + (k / segs) * (Math.PI / 2);
    pts.push([ox + Math.cos(a) * r, oy + Math.sin(a) * r]);
  }
  return pts; // [z, y]
}
/** connect rings at each station into a closed hull, capped at both ends */
function loft(stations: Station[], yc: number): THREE.BufferGeometry {
  const base = tramRing(1, 1, 0.12, 3);
  const pos: number[] = [];
  const uv: number[] = [];
  const x0 = stations[0]!.x, span = stations[stations.length - 1]!.x - x0;
  // u runs nose to nose, v round the section: the hull's plate wraps it the way it wrapped the box
  const ring = (s: Station) => base.map(([z, y], k) => [s.x, yc + s.dy + y * s.h, z * s.w, (s.x - x0) / span, k / base.length] as number[]);
  const rings = stations.map(ring);
  const tri = (a: number[], b: number[], c: number[]) => {
    pos.push(a[0]!, a[1]!, a[2]!, b[0]!, b[1]!, b[2]!, c[0]!, c[1]!, c[2]!);
    uv.push(a[3]!, a[4]!, b[3]!, b[4]!, c[3]!, c[4]!);
  };
  for (let i = 0; i + 1 < rings.length; i++) {
    const A = rings[i]!, B = rings[i + 1]!;
    for (let k = 0; k < A.length; k++) {
      const k1 = (k + 1) % A.length;
      tri(A[k]!, B[k]!, A[k1]!);
      tri(A[k1]!, B[k]!, B[k1]!);
    }
  }
  for (const [R, flip] of [[rings[0]!, true], [rings[rings.length - 1]!, false]] as const) {
    const c = R.reduce((m, p) => [m[0]! + p[0]! / R.length, m[1]! + p[1]! / R.length, m[2]! + p[2]! / R.length, m[3]! + p[3]! / R.length, 0.5], [0, 0, 0, 0, 0.5]);
    for (let k = 0; k < R.length; k++) flip ? tri(c, R[k]!, R[(k + 1) % R.length]!) : tri(c, R[(k + 1) % R.length]!, R[k]!);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
const tb = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
const tmerge = (parts: THREE.BufferGeometry[]) => {
  const out = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false)!;
  for (const p of parts) p.dispose();
  return out;
};

let tramCache: { shell: THREE.BufferGeometry; hull: THREE.BufferGeometry; windows: THREE.BufferGeometry; strip: THREE.BufferGeometry; lampsFront: THREE.BufferGeometry; lampsBack: THREE.BufferGeometry } | null = null;
/** one car's geometry, shared by every car: floor on the running surface at y 0, noses at x = ±7 */
export function tramGeometry() {
  if (tramCache) return tramCache;
  const { length, width, height, lift } = TRAM;
  const half = length / 2;
  const yc = lift + height / 2;
  const body = half - 0.8;
  // the raked noses: the full section, then a lower, narrower one at the tip
  const nose = (sx: number): Station => ({ x: sx * half, w: width * 0.85, h: height * 0.55, dy: -height * 0.21 });
  const hull = loft([nose(-1), { x: -body, w: width, h: height, dy: 0 }, { x: body, w: width, h: height, dy: 0 }, nose(1)], yc);
  const shell = markShared(hull.clone());
  const parts = [hull];
  // two bogies straddling nothing: they sit on the running surface, inside the beam's 2 m
  for (const bx of [-4.6, 4.6]) parts.push(tb(2.4, TRAM.bogie, 1.8, bx, TRAM.bogie / 2, 0));
  // the roof pod
  parts.push(tb(4.2, 0.26, 1.3, 0, lift + height + 0.13, 0));
  // the windscreens: on the raked upper face of each nose, a hair proud of it
  const top = yc + height / 2;
  const tipTop = yc - height * 0.21 + (height * 0.55) / 2;
  const windows: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const run = half - body, drop = top - tipTop;
    const n = new THREE.Vector2(drop, run).normalize(); // outward (x, y) of the raked face
    const at = (s: number, z: number) => [sx * (body + run * s + n.x * 0.02), top - drop * s + n.y * 0.02, z];
    const a = at(0.14, -0.78), b = at(0.14, 0.78), c = at(0.78, 0.78), d = at(0.78, -0.78);
    const g = new THREE.BufferGeometry();
    const quad = sx > 0 ? [...a, ...c, ...b, ...a, ...d, ...c] : [...a, ...b, ...c, ...a, ...c, ...d];
    g.setAttribute("position", new THREE.Float32BufferAttribute(quad, 3));
    // the glass plate across the screen, corner to corner
    const [ua, ub, uc, ud] = [[0, 1], [1, 1], [1, 0], [0, 0]];
    g.setAttribute("uv", new THREE.Float32BufferAttribute(sx > 0 ? [...ua!, ...uc!, ...ub!, ...ua!, ...ud!, ...uc!] : [...ua!, ...ub!, ...uc!, ...ua!, ...uc!, ...ud!], 2));
    g.computeVertexNormals();
    windows.push(g);
  }
  // window panes down both sides, pillars between
  for (const sz of [-1, 1]) for (let k = 0; k < 8; k++) windows.push(tb(1.12, 0.78, 0.02, -5.25 + k * 1.5, yc + 0.45, sz * (width / 2 + 0.012)));
  // the magenta line along the skirt
  const strip = [-1, 1].map((sz) => tb(length - 1.8, 0.08, 0.02, 0, lift + 0.22, sz * (width / 2 + 0.012)));
  // lamps: a pair low on each nose face
  const tip = yc - height * 0.21 - (height * 0.55) / 2;
  const lamps = (sx: number) => tmerge([-1, 1].map((sz) => tb(0.05, 0.16, 0.36, sx * (half + 0.03), tip + 0.32, sz * 0.62)));
  tramCache = { shell, hull: markShared(tmerge(parts)), windows: markShared(tmerge(windows)), strip: markShared(tmerge(strip)), lampsFront: markShared(lamps(1)), lampsBack: markShared(lamps(-1)) };
  return tramCache;
}

/** Skirt stripe and window glass. Heads stay warm and tails stay red. Lease Row keeps the old car. */
export type TramLivery = { strip: number; glass: number };

const LEASE_LIVERY: TramLivery = { strip: PALETTE.magenta, glass: 0xbfefff };

const DISTRICT_LIVERY: Record<string, TramLivery> = {
  deadletter_docks: { strip: 0x35f2ff, glass: 0x1a6a88 },
  repo_depot: { strip: 0xffb02e, glass: 0xffe0a0 },
  night_market: { strip: 0xff6ec8, glass: 0xffc0e0 },
  relay_heights: { strip: 0xd5dde6, glass: 0x8aa0c0 },
  ash_canal: { strip: 0x3dffa8, glass: 0x146048 },
  glass_mile: { strip: 0xffe8ff, glass: 0xc8a0e0 },
  bone_market: { strip: 0xffd090, glass: 0xc8a070 },
  cold_vault: { strip: 0xa8fff0, glass: 0x4a8890 },
  neon_chapel: { strip: 0xc070ff, glass: 0x6a30c0 },
  slag_pit: { strip: 0xff6820, glass: 0xa03010 },
  wire_garden: { strip: 0x70ffb0, glass: 0x1a8048 },
  red_kiln: { strip: 0xff5040, glass: 0x801810 },
  paper_wharf: { strip: 0xc8d8ea, glass: 0x607080 },
  velvet_court: { strip: 0xff4078, glass: 0x801030 },
  rust_crown: { strip: 0xffb050, glass: 0x8a5018 },
  salt_stairs: { strip: 0xe8f0ff, glass: 0x90a0c0 },
  lamp_bazaar: { strip: 0xff88cc, glass: 0xc04070 },
  debt_orchard: { strip: 0xc8f060, glass: 0x508020 },
  black_relay: { strip: 0x6880a0, glass: 0x202830 },
};

export function tramLivery(name: string | undefined): TramLivery {
  return (name && DISTRICT_LIVERY[name]) || LEASE_LIVERY;
}

/** Monorail body colour. Lease Row keeps the hull the car shipped with. Heads stay warm and tails stay red. */
export const STREET_HULL = 0x141a24;

const DISTRICT_HULL: Record<string, number> = {
  deadletter_docks: 0x1a3040,
  repo_depot: 0x2a2418,
  night_market: 0x301820,
  relay_heights: 0x243038,
  ash_canal: 0x142820,
  glass_mile: 0x281828,
  bone_market: 0x2a2018,
  cold_vault: 0x182828,
  neon_chapel: 0x241430,
  slag_pit: 0x281410,
  wire_garden: 0x142818,
  red_kiln: 0x30140e,
  paper_wharf: 0x202428,
  velvet_court: 0x301018,
  rust_crown: 0x281c10,
  salt_stairs: 0x202830,
  lamp_bazaar: 0x381428,
  debt_orchard: 0x1c2410,
  black_relay: 0x141820,
};

export function tramHull(name: string | undefined): number {
  return (name && DISTRICT_HULL[name]) || STREET_HULL;
}

export class Tram {
  readonly group = new THREE.Group();
  private cars: { mesh: THREE.Group; dir: 1 | -1; phase: number }[] = [];
  private time = 0;
  /** true on the frame a car is within `near` of the listener (audio cue) */
  passing = false;
  private lastPassing = false;
  /** The car the file is sitting in, drawn on the sim seat. Null keeps the city clock. */
  hold: { dir: 1 | -1; x: number; y: number; z: number } | null = null;
  constructor(private line: TramLine, name?: string) {
    const livery = tramLivery(name);
    for (const dir of [1, -1] as const) {
      const g = new THREE.Group();
      const hullMat = new THREE.MeshStandardMaterial({ color: tramHull(name), roughness: 0.4, metalness: 0.6 });
      bindPlate(hullMat, "tex_monorail");
      const geo = tramGeometry();
      const body = new THREE.Mesh(geo.hull, hullMat);
      body.name = "tram:hull";
      g.add(body);
      const windowMat = new THREE.MeshBasicMaterial({ color: livery.glass });
      bindPlate(windowMat, "tex_glass");
      g.add(new THREE.Mesh(geo.windows, windowMat));
      const railStripMat = new THREE.MeshBasicMaterial({ color: livery.strip });
      bindPlate(railStripMat, "tex_billboard_mg");
      g.add(new THREE.Mesh(geo.strip, railStripMat));
      const headMat = new THREE.MeshBasicMaterial({ color: 0xfff3d0 });
      bindPlate(headMat, "tex_lamp");
      // the head lamps lead: at +x for a car running +x, at -x for one running back
      g.add(new THREE.Mesh(dir > 0 ? geo.lampsFront : geo.lampsBack, headMat));
      const tailMat = new THREE.MeshBasicMaterial({ color: PALETTE.red });
      bindPlate(tailMat, "tex_lamp");
      g.add(new THREE.Mesh(dir > 0 ? geo.lampsBack : geo.lampsFront, tailMat));
      // the street under the beam is what this lights
      const light = new THREE.PointLight(livery.glass, 6, 18, 1.8);
      light.position.y = -1.6;
      g.add(light);
      // a car is built along +x; on a z line turn +x to +z (a quarter turn the other way pointed a car
      // running +z backwards, head lamps trailing, until Stage 674)
      if (line.axis === "z") g.rotation.y = -Math.PI / 2;
      this.group.add(g);
      this.cars.push({ mesh: g, dir, phase: dir > 0 ? 0 : line.period / 2 });
    }
    this.update(0, new THREE.Vector3());
  }

  /** Distance from the listener to the nearest visible car (Infinity when none is on the line). */
  distanceTo(listener: { x: number; y: number; z: number }): number {
    let d = Infinity;
    for (const c of this.cars) if (c.mesh.visible) d = Math.min(d, c.mesh.position.distanceTo(listener as THREE.Vector3));
    return d;
  }

  /** true while a car is within earshot (the cue fires on the rising edge) */
  get near(): boolean {
    return this.lastPassing;
  }

  /** Position of the first car along its axis (probes). */
  get position(): number {
    const c = this.cars[0]!;
    return this.line.axis === "x" ? c.mesh.position.x : c.mesh.position.z;
  }

  update(dt: number, listener: THREE.Vector3): void {
    this.time += dt;
    const L = this.line.to - this.line.from;
    const speed = TRAM_SPEED;
    let near = false;
    for (const c of this.cars) {
      const t = ((this.time + c.phase) % this.line.period) * speed;
      const visible = t < L;
      c.mesh.visible = visible;
      const s = c.dir > 0 ? this.line.from + t : this.line.to - t;
      if (this.line.axis === "x") c.mesh.position.set(s, this.line.y, this.line.at);
      else c.mesh.position.set(this.line.at, this.line.y, s);
      if (visible && c.mesh.position.distanceTo(listener) < 40) near = true;
    }
    this.passing = near && !this.lastPassing;
    this.lastPassing = near;
    const held = this.hold;
    if (held) {
      const car = this.cars.find((c) => c.dir === held.dir);
      if (car) {
        car.mesh.visible = true;
        car.mesh.position.set(held.x, held.y, held.z);
      }
    }
  }
}

/** Pale street steam. Lease Row and the indoor rooms keep it. */
export const STREET_STEAM: readonly [number, number, number] = [0.62, 0.72, 0.8];

const DISTRICT_STEAM: Record<string, readonly [number, number, number]> = {
  deadletter_docks: [0.45, 0.7, 0.85],
  repo_depot: [0.85, 0.7, 0.4],
  night_market: [0.9, 0.5, 0.7],
  relay_heights: [0.8, 0.88, 0.95],
  ash_canal: [0.35, 0.75, 0.55],
  glass_mile: [0.9, 0.8, 0.95],
  bone_market: [0.8, 0.65, 0.45],
  cold_vault: [0.7, 0.9, 0.92],
  neon_chapel: [0.7, 0.45, 0.9],
  slag_pit: [0.9, 0.4, 0.25],
  wire_garden: [0.45, 0.85, 0.55],
  red_kiln: [0.9, 0.4, 0.35],
  paper_wharf: [0.7, 0.75, 0.78],
  velvet_court: [0.85, 0.35, 0.5],
  rust_crown: [0.85, 0.55, 0.3],
  salt_stairs: [0.82, 0.86, 0.92],
  lamp_bazaar: [0.95, 0.55, 0.75],
  debt_orchard: [0.7, 0.85, 0.4],
  black_relay: [0.4, 0.45, 0.55],
};

export function steamTint(name: string | undefined): readonly [number, number, number] {
  return (name && DISTRICT_STEAM[name]) || STREET_STEAM;
}

/** Steam from the grates: additive points rising and fading, one cloud per vent. */
export class Steam {
  readonly object: THREE.Points;
  private mat: THREE.ShaderMaterial;
  constructor(vents: readonly { x: number; y: number; z: number }[], per = 28, seed = 3, name?: string) {
    const rnd = lcg(seed);
    const n = vents.length * per;
    const pos = new Float32Array(n * 3);
    const info = new Float32Array(n * 3); // phase, drift x, drift z
    for (let v = 0; v < vents.length; v++) {
      for (let i = 0; i < per; i++) {
        const k = v * per + i;
        pos[k * 3] = vents[v]!.x + (rnd() - 0.5) * 0.6;
        pos[k * 3 + 1] = vents[v]!.y;
        pos[k * 3 + 2] = vents[v]!.z + (rnd() - 0.5) * 0.6;
        info[k * 3] = rnd();
        info[k * 3 + 1] = (rnd() - 0.5) * 0.8;
        info[k * 3 + 2] = (rnd() - 0.5) * 0.8;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("info", new THREE.BufferAttribute(info, 3));
    const tint = steamTint(name);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uTint: { value: new THREE.Color(tint[0], tint[1], tint[2]) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        uniform float uTime; attribute vec3 info; varying float vA;
        void main() {
          float life = fract(uTime * 0.28 + info.x);
          vec3 p = position + vec3(info.y * life * 2.5, life * 3.2, info.z * life * 2.5);
          vA = (1.0 - life) * smoothstep(0.0, 0.15, life);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (18.0 + life * 60.0) * (30.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uTint; varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.1, d) * vA * 0.16;
          gl_FragColor = vec4(uTint, a);
        }`,
    });
    this.object = new THREE.Points(geo, this.mat);
    this.object.frustumCulled = false;
  }
  update(time: number): void {
    this.mat.uniforms.uTime!.value = time;
  }
}

/** Cyan, magenta, gold. Lease Row and the indoor rooms keep them. */
export const STREET_INK: readonly [string, string, string] = ["#35f2ff", "#ff3ec9", "#ffe34a"];

const DISTRICT_INK: Record<string, readonly [string, string, string]> = {
  deadletter_docks: ["#1a9ec4", "#d24aa8", "#e8d06a"],
  repo_depot: ["#3ad4b8", "#ff6a55", "#ffb02e"],
  night_market: ["#3affc8", "#ff2aa0", "#ffee66"],
  relay_heights: ["#9ad4ff", "#c090e8", "#f4f0c8"],
  ash_canal: ["#2ad49a", "#c850b8", "#c8e070"],
  glass_mile: ["#b8f6ff", "#ff9ae0", "#fff0d0"],
  bone_market: ["#7ad8c4", "#e08870", "#ffd090"],
  cold_vault: ["#a8fff4", "#8890ff", "#e4f0c0"],
  neon_chapel: ["#48d8ff", "#c040ff", "#ffe070"],
  slag_pit: ["#20c8b0", "#ff4060", "#ff8020"],
  wire_garden: ["#48f090", "#ff48c8", "#c8ff48"],
  red_kiln: ["#40d8d0", "#ff3040", "#ffb040"],
  paper_wharf: ["#8ec0d8", "#c890b0", "#e0d4a8"],
  velvet_court: ["#30c8e0", "#ff2068", "#ffc860"],
  rust_crown: ["#48b8a0", "#e05830", "#f0a040"],
  salt_stairs: ["#c8e8f4", "#e0b0d0", "#f2efe0"],
  lamp_bazaar: ["#58e0ff", "#ff68c0", "#ffe058"],
  debt_orchard: ["#68e070", "#d86898", "#b8d848"],
  black_relay: ["#1a7088", "#802050", "#908028"],
};

export function adInk(name: string | undefined): readonly [string, string, string] {
  return (name && DISTRICT_INK[name]) || STREET_INK;
}

/** Holographic ad tickers: VANTAGE copy scrolling on translucent panels that cycle colour. */
export class HoloAds {
  readonly group = new THREE.Group();
  private panels: { mesh: THREE.Mesh; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; mat: THREE.MeshBasicMaterial; offset: number; line: number }[] = [];
  private readonly district?: string;
  private acc = 0;
  private lastRedraw = 0;
  /** ticker redraws so far (probes) */
  redraws = 0;
  /** frames fed to the throttle so far, and a ring of their frame times (probes) */
  fed = 0;
  static readonly RING = 600;
  private readonly ring = new Float64Array(HoloAds.RING);
  static readonly COPY = ["LEASE RENEWAL IS AUTOMATIC", "COMPLY · COMPLY · COMPLY", "VANTAGE INTEGRITY SYSTEMS", "YOUR FUTURE HAS BEEN PRICED", "STABILITY IS A SERVICE", "REPORT UNLISTED FILES", "SLEEP IS COLLATERAL", "THE KERNEL SEES THE CITY WHOLE"];
  constructor(ads: readonly { x: number; y: number; z: number; rotY: number; w: number; h: number }[], district?: string) {
    this.district = district;
    ads.forEach((a, i) => {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 128;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(a.w, a.h), mat);
      mesh.position.set(a.x, a.y, a.z);
      mesh.rotation.y = a.rotY;
      this.group.add(mesh);
      this.panels.push({ mesh, canvas, tex, mat, offset: i * 137, line: i % HoloAds.COPY.length });
    });
    this.redraw(0);
  }
  private redraw(time: number): void {
    const ink = adInk(this.district);
    for (const p of this.panels) {
      const g = p.canvas.getContext("2d")!;
      const hue = (time * 12 + p.offset) % 360;
      const fg = hue < 120 ? ink[0] : hue < 240 ? ink[1] : ink[2];
      g.clearRect(0, 0, 512, 128);
      g.fillStyle = "rgba(6,10,18,0.55)";
      g.fillRect(0, 0, 512, 128);
      g.strokeStyle = fg;
      g.lineWidth = 3;
      g.strokeRect(3, 3, 506, 122);
      g.fillStyle = fg;
      g.font = "bold 44px 'Courier New', monospace";
      g.textBaseline = "middle";
      const copy = adCopy(this.district);
      const text = copy[p.line % copy.length]! + "   ▸   ";
      const w = g.measureText(text).width;
      const x = 512 - ((time * 70 + p.offset) % (w + 512));
      g.fillText(text, x, 64);
      g.fillText(text, x + w, 64);
      // scanlines
      g.fillStyle = "rgba(0,0,0,0.25)";
      for (let y = 0; y < 128; y += 4) g.fillRect(0, y, 512, 1);
      if (((time + p.offset) % 9) < 0.15) g.fillRect(0, 0, 512, 128); // a dropout frame
      p.tex.needsUpdate = true;
    }
  }
  /** the throttle's accumulator (probes) */
  get carry(): number {
    return this.acc;
  }
  /** the last `n` frame times fed to the throttle, oldest first (probes) */
  recent(n: number): number[] {
    const count = Math.min(n, this.fed, HoloAds.RING);
    const out: number[] = [];
    for (let i = this.fed - count; i < this.fed; i++) out.push(this.ring[i % HoloAds.RING]!);
    return out;
  }
  update(dt: number, time: number): void {
    this.ring[this.fed % HoloAds.RING] = dt;
    this.fed++;
    const step = tickerStep(this.acc, dt);
    this.acc = step.acc;
    if (!step.redraw) return;
    this.redraws++;
    this.redraw(time);
    const copy = adCopy(this.district);
    for (const p of this.panels) if (Math.floor(time / 11 + p.offset) !== Math.floor(this.lastRedraw / 11 + p.offset)) p.line = (p.line + 1) % copy.length;
    this.lastRedraw = time;
  }
}

/** Ticker lines. Lease Row keeps the eight the street already scrolled. */
const DISTRICT_COPY: Record<string, readonly string[]> = {
  deadletter_docks: ["THE TIDE FILES ITS OWN LEASE", "CARGO SLEEPS ON THE PIER", "UNLISTED HULLS ARE TOWED", "THE WATER KEEPS THE RECEIPT", "DOCK LIGHTS ARE NOT A WELCOME", "REPORT A BOAT WITH NO NAME", "THE SLIP CLOSES WHEN IT SWELLS", "VANTAGE COUNTS THE BARGES"],
  repo_depot: ["IMPOUND IS A KIND OF SLEEP", "THE YARD KEEPS WHAT YOU PARKED", "UNLISTED RIGS ARE LIFTED", "A HOOK IS NOT A RECEIPT", "THE CRANE DOES NOT HURRY", "REPORT A LOT WITH NO TAG", "STORAGE IS BILLED IN DAYS", "VANTAGE OWNS THE UNCLAIMED"],
  night_market: ["STALL RENT IS DUE AT DUSK", "THE AWNING IS NOT A ROOF", "UNLISTED GOODS ARE PRICED", "HOT OIL IS NOT A WELCOME", "THE ROW CLOSES WHEN IT SAYS", "REPORT A STALL WITH NO LAMP", "SLEEP IS SOLD BY THE BOWL", "THE MARKET SEES THE HAND"],
  relay_heights: ["THE MAST IS NOT A LOOKOUT", "CABLE RENT IS ALREADY DUE", "UNLISTED SIGNALS ARE CUT", "THE LEDGE IS NOT A SEAT", "THE SPAN CLOSES IN WEATHER", "REPORT A DISH WITH NO NAME", "HEIGHT IS BILLED BY THE NIGHT", "VANTAGE HEARS THE RELAY"],
  ash_canal: ["THE CUT KEEPS ITS OWN TIDE", "BARGES PAY TO SIT STILL", "UNLISTED POLLS ARE FINED", "BLACK WATER IS NOT A ROAD", "THE LOCK CLOSES AT PRICE", "REPORT A HULL WITH NO LAMP", "ASH SETTLES ON THE LEASE", "VANTAGE MEASURES THE CANAL"],
  glass_mile: ["THE SHOWROOM DOES NOT BLINK", "GLASS RENT IS PAID IN VIEW", "UNLISTED FACES ARE TAPED", "A WINDOW IS NOT A DOOR", "THE MILE CLOSES UPWARD", "REPORT A PANE WITH NO TAG", "REFLECTION IS A SERVICE", "VANTAGE POLISHES THE STREET"],
  bone_market: ["THE CLINIC DOES NOT NAME IT", "STALLS SELL WHAT WAS LEFT", "UNLISTED CURES ARE SEIZED", "DUST IS NOT A COVER", "THE LANE CLOSES AT PAIN", "REPORT A TABLE WITH NO LIST", "WHAT YOU BUY STAYS BOUGHT", "VANTAGE WEIGHS THE BONE"],
  cold_vault: ["THE LOCKER DOES NOT THAW", "COLD IS RENTED BY THE HOUR", "UNLISTED CRATES ARE FROZEN", "A DOOR IS NOT A PROMISE", "THE VAULT CLOSES ITSELF", "REPORT A BOX WITH NO FROST", "SILENCE IS THE TARIFF", "VANTAGE KEEPS THE COLD"],
  neon_chapel: ["THE NAVE IS NOT A SHELTER", "A PRAYER IS ITEMISED", "UNLISTED VOWS ARE VOID", "VIOLET IS NOT FORGIVENESS", "THE COURT CLOSES AT AMEN", "REPORT A PEW WITH NO NAME", "LIGHT IS BILLED IN CROSSES", "VANTAGE HEARS THE CHAPEL"],
  slag_pit: ["THE PIT KEEPS WHAT FELL IN", "HEAT IS NOT A DISCOUNT", "UNLISTED LOADS ARE DUMPED", "A CRANE IS NOT A RESCUE", "THE LOT CLOSES IN GLOW", "REPORT A DRUM WITH NO MARK", "SLAG IS WEIGHED TWICE", "VANTAGE OWNS THE SPOIL"],
  wire_garden: ["THE CABLE GREW A ROOF", "GREEN IS STILL A LEASE", "UNLISTED LOOMS ARE CUT", "A VINE IS NOT A FENCE", "THE ALLEY CLOSES IN GROWTH", "REPORT A SPOOL WITH NO TAG", "SHADE IS RENTED BY THE STEP", "VANTAGE PRUNES THE WIRE"],
  red_kiln: ["THE KILN DOES NOT COOL", "HEAT RENT IS ALREADY DUE", "UNLISTED FIRING IS SEIZED", "A STACK IS NOT A CHIMNEY", "THE YARD CLOSES IN GLARE", "REPORT A BRICK WITH NO STAMP", "ASH IS PART OF THE BILL", "VANTAGE FEEDS THE KILN"],
  paper_wharf: ["BALES PAY TO STAY DRY", "THE SHED IS NOT A HOUSE", "UNLISTED QUIRES ARE PULPED", "GREY WATER KEEPS A COPY", "THE WHARF CLOSES IN RAIN", "REPORT A REAM WITH NO SEAL", "PAPER IS HEAVIER WET", "VANTAGE FILES THE WHARF"],
  velvet_court: ["THE CLOTH IS NOT A WALL", "DARK IS SOLD BY THE YARD", "UNLISTED GUESTS ARE KEPT", "A CURTAIN IS NOT A DOOR", "THE COURT CLOSES SOFTLY", "REPORT A ROOM WITH NO LAMP", "QUIET HAS A SURCHARGE", "VANTAGE PARTS THE VEIL"],
  rust_crown: ["THE STACK STILL HOLDS A LEASE", "RUST IS NOT A VACANCY", "UNLISTED CLIMBS ARE FINED", "A CROWN IS NOT A VIEW", "THE RUNG CLOSES IN WIND", "REPORT A PLATE WITH NO BOLT", "HEIGHT RUSTS ON THE BILL", "VANTAGE COUNTS THE CROWN"],
  salt_stairs: ["THE STEP IS SALTED DOWN", "RAIN DOES NOT WASH THE FEE", "UNLISTED CLIMBS ARE TICKED", "A STAIR IS NOT A STREET", "THE FLIGHT CLOSES IN WHITE", "REPORT A TREAD WITH NO GRIT", "SALT IS PART OF THE RENT", "VANTAGE KEEPS THE STAIRS"],
  lamp_bazaar: ["LAMPS ARE SOLD ALREADY LIT", "THE LOW ROOF TAKES A CUT", "UNLISTED BULBS ARE DARK", "A GLOW IS NOT A GUIDE", "THE BAZAAR CLOSES BRIGHT", "REPORT A LAMP WITH NO SHADE", "LIGHT IS PRICED PER FLAME", "VANTAGE STOCKS THE BAZAAR"],
  debt_orchard: ["THE TREES ARE ON A LEASE", "FRUIT IS COUNTED NOT EATEN", "UNLISTED ROWS ARE FELLED", "A LEAF IS NOT A SHADE", "THE ORCHARD CLOSES GOLD", "REPORT A TREE WITH NO TAG", "GROWTH IS BILLED IN SEASONS", "VANTAGE PRUNES THE DEBT"],
  black_relay: ["THE DARK MAST STILL TRANSMITS", "SILENCE IS NOT OFFLINE", "UNLISTED BEAMS ARE BENT", "A SHADOW IS NOT COVER", "THE RELAY CLOSES BLACK", "REPORT A TOWER WITH NO LIGHT", "NIGHT IS THE FULL FARE", "VANTAGE HEARS THE DARK"],
};

export function adCopy(name: string | undefined): readonly string[] {
  return (name && DISTRICT_COPY[name]) || HoloAds.COPY;
}

/** The airship's panel and keel, and the blinker on the tall slabs. Lease Row keeps the old marks. */
export type SkyMark = {
  panel: number;
  keel: number;
  blink: readonly [number, number, number];
};

const LEASE_SKY: SkyMark = { panel: PALETTE.magenta, keel: PALETTE.cyan, blink: [1, 0.1, 0.18] };

const DISTRICT_SKY: Record<string, SkyMark> = {
  deadletter_docks: { panel: 0x1a6a88, keel: 0x9fdfff, blink: [0.4, 0.75, 1] },
  repo_depot: { panel: 0xffb02e, keel: 0xffe34a, blink: [1, 0.72, 0.2] },
  night_market: { panel: 0xff6ec8, keel: 0xc02060, blink: [1, 0.35, 0.6] },
  relay_heights: { panel: 0xd5dde6, keel: 0x8aa0b8, blink: [0.75, 0.88, 1] },
  ash_canal: { panel: 0x1d8a62, keel: 0x3dffa8, blink: [0.25, 0.9, 0.55] },
  glass_mile: { panel: 0xffe8ff, keel: 0xc8a0e0, blink: [0.95, 0.8, 1] },
  bone_market: { panel: 0xffd090, keel: 0xc8a070, blink: [1, 0.78, 0.45] },
  cold_vault: { panel: 0xa8fff0, keel: 0x4a8890, blink: [0.6, 1, 0.92] },
  neon_chapel: { panel: 0xc070ff, keel: 0x6a30c0, blink: [0.7, 0.35, 1] },
  slag_pit: { panel: 0xff6820, keel: 0xa03010, blink: [1, 0.32, 0.1] },
  wire_garden: { panel: 0x70ffb0, keel: 0x1a8048, blink: [0.35, 1, 0.55] },
  red_kiln: { panel: 0xff5040, keel: 0x801810, blink: [1, 0.22, 0.18] },
  paper_wharf: { panel: 0xc8d8ea, keel: 0x607080, blink: [0.7, 0.78, 0.85] },
  velvet_court: { panel: 0xff4078, keel: 0x801030, blink: [1, 0.15, 0.4] },
  rust_crown: { panel: 0xffb050, keel: 0x8a5018, blink: [1, 0.55, 0.2] },
  salt_stairs: { panel: 0xe8f0ff, keel: 0x90a0c0, blink: [0.85, 0.9, 1] },
  lamp_bazaar: { panel: 0xff88cc, keel: 0xc04070, blink: [1, 0.45, 0.75] },
  debt_orchard: { panel: 0xc8f060, keel: 0x508020, blink: [0.75, 1, 0.3] },
  black_relay: { panel: 0x6880a0, keel: 0x202830, blink: [0.35, 0.42, 0.55] },
};

export function skyMark(name: string | undefined): SkyMark {
  return (name && DISTRICT_SKY[name]) || LEASE_SKY;
}

/** How fast the slab blinkers cycle, in hertz. Lease Row keeps the rate the skyline shipped with. */
export const STREET_BLINK = 0.5;

const DISTRICT_BLINK: Record<string, number> = {
  deadletter_docks: 0.18,
  repo_depot: 0.72,
  night_market: 1.35,
  relay_heights: 0.96,
  ash_canal: 0.22,
  glass_mile: 1.55,
  bone_market: 0.41,
  cold_vault: 0.27,
  neon_chapel: 0.33,
  slag_pit: 0.84,
  wire_garden: 0.63,
  red_kiln: 0.58,
  paper_wharf: 0.24,
  velvet_court: 0.37,
  rust_crown: 0.69,
  salt_stairs: 1.12,
  lamp_bazaar: 1.48,
  debt_orchard: 0.46,
  black_relay: 0.15,
};

export function skyBlink(name: string | undefined): number {
  return (name && DISTRICT_BLINK[name]) || STREET_BLINK;
}

/** How the airship circles and bobs. Lease Row keeps the drift the skyline shipped with. */
export const STREET_SHIP = { orbit: 0.012, bob: 0.2 } as const;

const DISTRICT_SHIP: Record<string, { orbit: number; bob: number }> = {
  deadletter_docks: { orbit: 0.006, bob: 0.08 },
  repo_depot: { orbit: 0.015, bob: 0.28 },
  night_market: { orbit: 0.022, bob: 0.46 },
  relay_heights: { orbit: 0.018, bob: 0.11 },
  ash_canal: { orbit: 0.007, bob: 0.09 },
  glass_mile: { orbit: 0.026, bob: 0.16 },
  bone_market: { orbit: 0.01, bob: 0.24 },
  cold_vault: { orbit: 0.008, bob: 0.06 },
  neon_chapel: { orbit: 0.011, bob: 0.14 },
  slag_pit: { orbit: 0.014, bob: 0.32 },
  wire_garden: { orbit: 0.016, bob: 0.21 },
  red_kiln: { orbit: 0.013, bob: 0.36 },
  paper_wharf: { orbit: 0.009, bob: 0.1 },
  velvet_court: { orbit: 0.01, bob: 0.18 },
  rust_crown: { orbit: 0.017, bob: 0.26 },
  salt_stairs: { orbit: 0.02, bob: 0.13 },
  lamp_bazaar: { orbit: 0.019, bob: 0.42 },
  debt_orchard: { orbit: 0.011, bob: 0.19 },
  black_relay: { orbit: 0.024, bob: 0.07 },
};

export function shipPace(name: string | undefined): { orbit: number; bob: number } {
  return (name && DISTRICT_SHIP[name]) || STREET_SHIP;
}

/** The lamp on the airship's nose. Lease Row keeps the red the skyline shipped with. */
export const STREET_NOSE = PALETTE.red;

const DISTRICT_NOSE: Record<string, number> = {
  deadletter_docks: 0x35d0ff,
  repo_depot: 0xffb020,
  night_market: 0xff48b0,
  relay_heights: 0xd8e8ff,
  ash_canal: 0x30e090,
  glass_mile: 0xf0d0ff,
  bone_market: 0xffc070,
  cold_vault: 0x90fff0,
  neon_chapel: 0xc060ff,
  slag_pit: 0xff6020,
  wire_garden: 0x70ff90,
  red_kiln: 0xff4040,
  paper_wharf: 0xc0d0e0,
  velvet_court: 0xff3060,
  rust_crown: 0xffa040,
  salt_stairs: 0xe8f4ff,
  lamp_bazaar: 0xff70c0,
  debt_orchard: 0xc8e040,
  black_relay: 0x6080a0,
};

export function shipLamp(name: string | undefined): number {
  return (name && DISTRICT_NOSE[name]) || STREET_NOSE;
}

/** The airship's cloth. Lease Row keeps the dark hull the skyline shipped with. Nose stays red there. */
export const STREET_CLOTH = 0x0a0c12;

const DISTRICT_CLOTH: Record<string, number> = {
  deadletter_docks: 0x163040,
  repo_depot: 0x3a2a14,
  night_market: 0x3a1028,
  relay_heights: 0x2a3848,
  ash_canal: 0x102820,
  glass_mile: 0x2a1830,
  bone_market: 0x3a2818,
  cold_vault: 0x143038,
  neon_chapel: 0x281040,
  slag_pit: 0x3a1408,
  wire_garden: 0x143018,
  red_kiln: 0x3a100c,
  paper_wharf: 0x2a3038,
  velvet_court: 0x3a1020,
  rust_crown: 0x3a2410,
  salt_stairs: 0x2c3440,
  lamp_bazaar: 0x3a1428,
  debt_orchard: 0x243010,
  black_relay: 0x10141c,
};

export function shipCloth(name: string | undefined): number {
  return (name && DISTRICT_CLOTH[name]) || STREET_CLOTH;
}

/** Aircraft-warning blinkers on the tallest slabs and an airship drifting over the district. */
export class Sky {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private ship: THREE.Group;
  private shipAngle = 0;
  private readonly pace: { orbit: number; bob: number };
  /** blinkers on the skyline */
  readonly blinkers: number;
  constructor(skyline: THREE.Group, seed = 9, name?: string) {
    const rnd = lcg(seed);
    const tops: number[] = [];
    const phase: number[] = [];
    const slabs = (skyline.userData.slabs ?? []) as { x: number; z: number; top: number }[];
    for (const s of slabs) {
      if (s.top > 60 && rnd() < 0.6) {
        tops.push(s.x, s.top + 1.5, s.z);
        phase.push(rnd() * 6.28);
      }
    }
    this.blinkers = phase.length;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(tops, 3));
    geo.setAttribute("phase", new THREE.Float32BufferAttribute(phase, 1));
    const mark = skyMark(name);
    this.pace = shipPace(name);
    const blink = new THREE.Color(mark.blink[0], mark.blink[1], mark.blink[2]);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uBlink: { value: blink }, uRate: { value: skyBlink(name) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uTime; uniform float uRate; attribute float phase; varying float vOn; void main(){ vOn = step(0.92, fract(uTime * uRate + phase)); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = 9.0 * (120.0 / max(1.0, -mv.z)) + 2.0; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uBlink; varying float vOn; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(uBlink, vOn * smoothstep(0.5, 0.15, d)); }`,
    });
    const pts = new THREE.Points(geo, this.mat);
    pts.frustumCulled = false;
    this.group.add(pts);
    // airship: a dark hull, this district's panel and keel, drifting in a slow circle
    this.ship = new THREE.Group();
    const airMat = new THREE.MeshStandardMaterial({ color: shipCloth(name), roughness: 0.8 });
    bindPlate(airMat, "tex_airship");
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(9, 40, 4, 10), airMat);
    hull.rotation.z = Math.PI / 2;
    this.ship.add(hull);
    const panelMat = new THREE.MeshBasicMaterial({ color: mark.panel });
    bindPlate(panelMat, "tex_billboard_mg");
    const panel = new THREE.Mesh(new THREE.BoxGeometry(34, 8, 0.4), panelMat);
    panel.position.y = -10;
    this.ship.add(panel);
    const keelMat = new THREE.MeshBasicMaterial({ color: mark.keel });
    bindPlate(keelMat, "tex_billboard_cy");
    const strip = new THREE.Mesh(new THREE.BoxGeometry(34.4, 0.3, 0.6), keelMat);
    strip.position.y = -14.2;
    this.ship.add(strip);
    const noseMat = new THREE.MeshBasicMaterial({ color: shipLamp(name) });
    bindPlate(noseMat, "tex_lamp");
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 8), noseMat);
    nose.position.x = 29;
    this.ship.add(nose);
    this.group.add(this.ship);
    this.group.traverse((o) => o.layers.set(FAR_LAYER));
  }
  /** where the airship is (probes) */
  get shipPos(): { x: number; y: number; z: number } {
    return { x: this.ship.position.x, y: this.ship.position.y, z: this.ship.position.z };
  }
  update(dt: number, time: number): void {
    this.mat.uniforms.uTime!.value = time;
    this.shipAngle += dt * this.pace.orbit;
    const r = 210;
    this.ship.position.set(Math.cos(this.shipAngle) * r, 150 + Math.sin(time * this.pace.bob) * 3, Math.sin(this.shipAngle) * r - 60);
    this.ship.rotation.y = -this.shipAngle;
  }
}

/**
 * Sign flicker for one named place. Relay Heights keeps its thin shiver.
 * Eighteen districts each keep their own. Lease Row and the indoor rooms keep the breathe the signs already had.
 */
export const SIGN_FLICKER = "{ float b = 0.86 + 0.14 * sin(uTime * 2.3 + vFlick * 9.0); float drop = step(0.985, fract(sin(floor(uTime * 6.0) + vFlick * 31.7) * 43758.5)); gl_FragColor.rgb *= b * (1.0 - 0.7 * drop); }";
export const HEIGHTS_FLICKER = "{ float b = 0.96 + 0.04 * sin(uTime * 11.0 + vFlick * 9.0); float drop = step(0.72, fract(sin(floor(uTime * 18.0) + vFlick * 31.7) * 43758.5)); gl_FragColor.rgb *= b * (1.0 - 0.95 * drop); }";

/** One cast each. Not a new mesh: the same sign shader, a different breathe. */
const DISTRICT_FLICKER: Record<string, string> = {
  deadletter_docks: "{ float b = 0.74 + 0.26 * sin(uTime * 0.37 + vFlick * 2.1); float drop = step(0.996, fract(sin(floor(uTime * 0.8) + vFlick * 17.3) * 24631.9)); gl_FragColor.rgb *= b * (1.0 - 0.85 * drop); }",
  repo_depot: "{ float blink = step(0.48, fract(uTime * 2.6 + vFlick * 0.17)); gl_FragColor.rgb *= mix(0.22, 1.0, blink); gl_FragColor.r *= 1.0 + 0.18 * blink; gl_FragColor.b *= 1.0 - 0.12 * blink; }",
  night_market: "{ float b = 0.9 + 0.1 * sin(uTime * 21.0 + vFlick * 47.0); gl_FragColor.rgb *= b; }",
  ash_canal: "{ float tide = 0.5 + 0.5 * sin(uTime * 0.16 + vFlick * 1.1); gl_FragColor.rgb *= 0.58 + 0.34 * tide; }",
  glass_mile: "{ float glint = step(0.965, fract(sin(floor(uTime * 9.0) + vFlick * 53.0) * 173.4)); gl_FragColor.rgb *= 0.97 + 0.28 * glint; }",
  bone_market: "{ float st = step(0.82, fract(sin(floor(uTime * 5.5) + vFlick * 12.4) * 91.7)); float b = 0.66 + 0.08 * sin(uTime * 1.9 + vFlick * 4.0); gl_FragColor.rgb *= b * (1.0 - 0.45 * st); }",
  cold_vault: "{ float snap = step(0.88, fract(uTime * 0.33 + vFlick * 0.05)); gl_FragColor.rgb *= mix(1.0, 0.15, snap); gl_FragColor.b *= 1.0 + 0.1 * (1.0 - snap); }",
  neon_chapel: "{ float breath = 0.5 + 0.5 * sin(uTime * 0.28 + vFlick * 1.7); gl_FragColor.r *= 0.75 + 0.3 * breath; gl_FragColor.g *= 0.62 + 0.12 * breath; gl_FragColor.b *= 0.8 + 0.4 * breath; }",
  slag_pit: "{ float drop = step(0.58, fract(sin(floor(uTime * 8.4) + vFlick * 27.9) * 6151.3)); gl_FragColor.rgb *= 1.0 - 0.72 * drop; gl_FragColor.r *= 1.14; gl_FragColor.b *= 0.86; }",
  wire_garden: "{ float p = 0.5 + 0.5 * sin(uTime * 1.45 + vFlick * 6.2); gl_FragColor.g *= 0.7 + 0.55 * p; gl_FragColor.r *= 0.9 - 0.08 * p; gl_FragColor.b *= 0.88; }",
  red_kiln: "{ float throb = 0.5 + 0.5 * sin(uTime * 0.9 + vFlick * 3.3); gl_FragColor.rgb *= 0.72 + 0.28 * throb; gl_FragColor.r *= 1.0 + 0.22 * throb; gl_FragColor.b *= 0.8 - 0.1 * throb; }",
  paper_wharf: "{ float g = dot(gl_FragColor.rgb, vec3(0.3, 0.59, 0.11)); float k = 0.25 + 0.35 * (0.5 + 0.5 * sin(uTime * 0.19 + vFlick * 0.8)); gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(g * 0.85), k); }",
  velvet_court: "{ float b = 0.54 + 0.07 * sin(uTime * 0.64 + vFlick * 2.4); gl_FragColor.rgb *= b; }",
  rust_crown: "{ float flake = step(0.9, fract(sin(floor(uTime * 3.7) + vFlick * 22.2) * 318.6)); float flake2 = step(0.93, fract(sin(floor(uTime * 1.3) + vFlick * 8.8) * 720.2)); gl_FragColor.rgb *= 0.84 * (1.0 - 0.78 * flake) * (1.0 - 0.62 * flake2); }",
  salt_stairs: "{ float tick = step(0.975, fract(uTime * 7.5 + vFlick * 4.4)); gl_FragColor.rgb = mix(gl_FragColor.rgb * 0.93, vec3(1.0), tick); }",
  lamp_bazaar: "{ float pop = step(0.955, fract(sin(floor(uTime * 2.1) + vFlick * 15.6) * 440.8)); gl_FragColor.rgb *= 0.9 + 0.7 * pop; }",
  debt_orchard: "{ float sway = sin(uTime * 0.41 + vFlick * 1.2); gl_FragColor.r *= 0.9 + 0.16 * sway; gl_FragColor.g *= 0.82 + 0.1 * sway; gl_FragColor.b *= 0.7 + 0.04 * sway; }",
  black_relay: "{ float alive = step(0.992, fract(sin(floor(uTime * 0.55) + vFlick * 6.6) * 1289.4)); gl_FragColor.rgb *= 0.05 + 0.95 * alive; }",
};

export function signFlickerGlsl(name: string | undefined): string {
  if (name === "relay_heights") return HEIGHTS_FLICKER;
  return (name && DISTRICT_FLICKER[name]) || SIGN_FLICKER;
}

/** Sign flicker: the atlas material takes a time uniform; each sign quad carries a phase attribute. */
export function flickerMaterial(mat: THREE.MeshBasicMaterial, name?: string): { setTime: (t: number) => void } {
  const body = signFlickerGlsl(name);
  let uniforms: { uTime: { value: number } } | null = null;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    uniforms = shader.uniforms as unknown as { uTime: { value: number } };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute float flick; varying float vFlick;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvFlick = flick;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime; varying float vFlick;")
      .replace("#include <dithering_fragment>", `#include <dithering_fragment>\n${body}`);
  };
  mat.needsUpdate = true;
  return { setTime: (t) => { if (uniforms) uniforms.uTime.value = t; } };
}

/** Everything above, owned together. */
export class CityLife {
  readonly group = new THREE.Group();
  readonly crowd: Crowd | null;
  readonly tram: Tram | null;
  readonly steam: Steam | null;
  readonly ads: HoloAds | null;
  readonly sky: Sky;
  /**
   * Seconds of city time elapsed — the sum of the wall deltas the city was actually stepped with.
   *
   * The city runs on wall time, but it only advances when a frame is drawn, so on a slow machine
   * the crowd's speed measured against the wall is short by up to one frame. Probes that check
   * "citizens walk at a human pace" divide by this instead and get the same answer at 3 fps as at
   * 120 (Stage 33).
   */
  get clock(): number {
    return this.time;
  }
  private time = 0;
  constructor(level: LevelDef, skyline: THREE.Group) {
    this.crowd = level.walks?.length && level.pedestrians ? new Crowd(level.walks, level.pedestrians, (level.skylineSeed ?? 1) + 7, level.name) : null;
    if (this.crowd) {
      // Drawn once (Stage 696). The wet floor's mirror renders layer 0 a second time, and a citizen
      // is ~350 triangles and five instanced draws: in the mirror the crowd cost as much again as it
      // did on the street, for figures the floor blurs to dark smudges. Off layer 0 the mirror never
      // sees them, and the triangles it spent there pay for twice the citizens on LEASE ROW.
      this.crowd.group.traverse((o) => o.layers.set(FAR_LAYER));
      this.group.add(this.crowd.group);
    }
    this.tram = level.tram ? new Tram(level.tram, level.name) : null;
    if (this.tram) this.group.add(this.tram.group);
    this.steam = level.vents?.length ? new Steam(level.vents, 28, 3, level.name) : null;
    if (this.steam) this.group.add(this.steam.object);
    this.ads = level.ads?.length ? new HoloAds(level.ads, level.name) : null;
    if (this.ads) this.group.add(this.ads.group);
    this.sky = new Sky(skyline, (level.skylineSeed ?? 1) + 3, level.name);
    this.group.add(this.sky.group);
  }
  update(dt: number, listener: THREE.Vector3): void {
    this.time += dt;
    this.crowd?.update(dt);
    this.tram?.update(dt, listener);
    this.steam?.update(this.time);
    this.ads?.update(dt, this.time);
    this.sky.update(dt, this.time);
  }
}
