import * as THREE from "three";
import type { Box, LevelDef } from "@shared/sim/level";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { brickTexture, facadeTextures, hazardTexture, shutterTexture, signTexture } from "./textures";

export const PALETTE = {
  bg: 0x04050a,
  cyan: 0x35f2ff,
  magenta: 0xff3ec9,
  amber: 0xffb02e,
  yellow: 0xffe34a,
  violet: 0x8f4dff,
  green: 0x37ff8b,
  red: 0xff1a2e,
  orange: 0xe0561e,
} as const;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const basic = (color: number, opacity = 1): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });

/**
 * Neon batcher: every tube and strip is a translated box appended to one
 * geometry per colour, flushed as a single mesh. Hundreds of strips become a
 * handful of draw calls, which matters twice over with the floor mirror.
 */
export class NeonBatch {
  private parts = new Map<number, THREE.BufferGeometry[]>();
  constructor(private parent: THREE.Object3D) {}
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number): void {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    let list = this.parts.get(color);
    if (!list) this.parts.set(color, (list = []));
    list.push(g);
  }
  flush(): void {
    for (const [color, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (merged) this.parent.add(new THREE.Mesh(merged, basic(color)));
    }
    this.parts.clear();
  }
}

/** Thin emissive tube along the top perimeter of a box footprint. */
export function neonPerimeter(batch: NeonBatch, b: Box, color: number, y: number, t = 0.06): void {
  const sx = b.max.x - b.min.x;
  const sz = b.max.z - b.min.z;
  const cx = (b.min.x + b.max.x) / 2;
  const cz = (b.min.z + b.max.z) / 2;
  batch.box(sx + t, t, t, cx, y, b.min.z, color);
  batch.box(sx + t, t, t, cx, y, b.max.z, color);
  batch.box(t, t, sz + t, b.min.x, y, cz, color);
  batch.box(t, t, sz + t, b.max.x, y, cz, color);
}

function tube(batch: NeonBatch, x: number, y: number, z: number, len: number, axis: "x" | "z", color: number, t = 0.07): void {
  batch.box(axis === "x" ? len : t, t, axis === "z" ? len : t, x, y, z, color);
}

function sign(scene: THREE.Scene, text: string, fg: string, bg: string, border: string, w: number, h: number, x: number, y: number, z: number, rotY: number): void {
  const tex = signTexture(text, fg, bg, border, 128, Math.round((128 * h) / w));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  scene.add(m);
}

/** Dress the arena's collision boxes with the clip's kitbash vocabulary. */
export function dressArena(scene: THREE.Scene, level: LevelDef): void {
  const neon = new NeonBatch(scene);
  const brick = brickTexture(7);
  const brickDark = brickTexture(11, "#141a26", "#090b10");
  const hazard = hazardTexture();
  const shutter = shutterTexture();
  const concrete = new THREE.MeshStandardMaterial({ color: 0x1c2230, roughness: 0.7, metalness: 0.2 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x151b26, roughness: 0.45, metalness: 0.55 });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x3a2a12, roughness: 0.8, metalness: 0.05 });
  const barrelMat = new THREE.MeshStandardMaterial({ color: PALETTE.orange, roughness: 0.55, metalness: 0.2 });
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xff6a1e, roughness: 0.7 });
  const rnd = lcg(3);

  for (const b of level.boxes) {
    const sx = b.max.x - b.min.x;
    const sy = b.max.y - b.min.y;
    const sz = b.max.z - b.min.z;
    const cx = (b.min.x + b.max.x) / 2;
    const cy = (b.min.y + b.max.y) / 2;
    const cz = (b.min.z + b.max.z) / 2;
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    let mat: THREE.Material = concrete;
    switch (b.tag) {
      case "floor":
        continue; // the wet floor replaces it
      case "wall": {
        const t = brick.clone();
        t.needsUpdate = true;
        t.repeat.set(Math.max(sx, sz) / 3, sy / 3);
        mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0.05 });
        // cyan tube lights and shutters along the inner face
        const alongX = sx > sz;
        const len = alongX ? sx : sz;
        const inner = alongX ? (cz > 0 ? b.min.z - 0.08 : b.max.z + 0.08) : cx > 0 ? b.min.x - 0.08 : b.max.x + 0.08;
        for (let i = 4; i < len - 4; i += 8) {
          const p = (alongX ? b.min.x : b.min.z) + i;
          if (alongX) tube(neon, p, 3.2, inner, 3.2, "x", PALETTE.cyan);
          else tube(neon, inner, 3.2, p, 3.2, "z", PALETTE.cyan);
          if (rnd() < 0.5) {
            const sm = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.6), new THREE.MeshStandardMaterial({ map: shutter, roughness: 0.6, metalness: 0.4 }));
            if (alongX) {
              sm.position.set(p + 4, 1.3, inner);
              sm.rotation.y = cz > 0 ? Math.PI : 0;
            } else {
              sm.position.set(inner, 1.3, p + 4);
              sm.rotation.y = cx > 0 ? -Math.PI / 2 : Math.PI / 2;
            }
            scene.add(sm);
          }
        }
        break;
      }
      case "block":
      case "highwall":
      case "lowwall": {
        const t = brickDark.clone();
        t.needsUpdate = true;
        t.repeat.set(Math.max(sx, sz) / 3, Math.max(1, sy / 3));
        mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0.05 });
        neonPerimeter(neon, b, PALETTE.magenta, b.max.y + 0.03);
        break;
      }
      case "pillar":
        mat = concrete;
        neonPerimeter(neon, b, PALETTE.violet, b.max.y + 0.03);
        neon.box(0.07, sy - 0.6, 0.07, b.max.x + 0.05, cy, cz, PALETTE.violet);
        break;
      case "crate":
        mat = crateMat;
        neonPerimeter(neon, b, PALETTE.amber, b.max.y + 0.02, 0.04);
        break;
      case "curb":
      case "kerb": {
        const t = hazard.clone();
        t.needsUpdate = true;
        t.repeat.set(Math.max(sx, sz) / 1.5, 1);
        mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
        break;
      }
      case "deck":
      case "upperdeck":
      case "gantry":
      case "gantrystair":
        mat = metal;
        neonPerimeter(neon, b, PALETTE.cyan, b.max.y + 0.03);
        break;
      case "barrel": {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(sx / 2, sx / 2, sy, 10), barrelMat);
        m.position.set(cx, cy, cz);
        scene.add(m);
        for (const yy of [0.25, 0.65]) {
          const band = new THREE.Mesh(new THREE.CylinderGeometry(sx / 2 + 0.01, sx / 2 + 0.01, 0.06, 10), basic(0x2a1a10));
          band.position.set(cx, b.min.y + sy * yy, cz);
          scene.add(band);
        }
        continue;
      }
      case "cone": {
        const m = new THREE.Mesh(new THREE.ConeGeometry(sx / 2, sy, 8), coneMat);
        m.position.set(cx, cy, cz);
        scene.add(m);
        const band = new THREE.Mesh(new THREE.ConeGeometry(sx / 2 - 0.08, 0.12, 8), basic(0xffffff));
        band.position.set(cx, b.min.y + sy * 0.55, cz);
        scene.add(band);
        continue;
      }
      case "post":
        mat = metal;
        break;
      case "bar":
        mat = metal;
        tube(neon, cx, b.min.y - 0.06, cz, sx - 0.4, "x", PALETTE.cyan, 0.09);
        break;
      default:
        mat = concrete;
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, cy, cz);
    scene.add(mesh);
  }

  neon.flush();

  // Signage in the arena (the clip's stall and shop signs)
  sign(scene, "DEADLETTER", "#35f2ff", "#07111a", "#35f2ff", 6, 1.5, -22, 3.8, -13.9, 0);
  sign(scene, "REPO DEPOT", "#ff3ec9", "#170714", "#ff3ec9", 5, 1.25, -23, 1.9, 22.06, 0);
  sign(scene, "再租 RE-LEASE", "#ffe34a", "#1a1206", "#ffe34a", 4.4, 1.1, 18, 1.7, 15.06, 0);
  sign(scene, "VANTAGE", "#ffb02e", "#160f04", "#ffb02e", 5, 1.25, 31.9, 4.6, 0, -Math.PI / 2);
  sign(scene, "CHILL UNDER", "#35f2ff", "#07111a", "#ff3ec9", 3.6, 0.9, 0, 3.2, -31.9, 0);
  sign(scene, "LEASE-BREAKER", "#ff3ec9", "#170714", "#35f2ff", 4.2, 1.0, -31.9, 3.4, -4, Math.PI / 2);
}

/** Skyline of dark slabs with neon edges and sparse lit windows beyond the arena, and THE KERNEL on the horizon. */
export function buildSkyline(scene: THREE.Scene, seed = 42): THREE.Group {
  const group = new THREE.Group();
  scene.add(group);
  const neon = new NeonBatch(group);
  const rnd = lcg(seed);
  const facades = [facadeTextures(1), facadeTextures(2, 0.1), facadeTextures(3, 0.25)];
  const signs = ["LEASE", "VANTAGE", "保安", "NIGHT CO", "RE-LEASE", "ヴァンテージ", "SEC-9", "INTEGRITY"];
  for (let i = 0; i < 90; i++) {
    const ang = rnd() * Math.PI * 2;
    const dist = 48 + rnd() * 170;
    const x = Math.cos(ang) * dist;
    const z = Math.sin(ang) * dist;
    const w = 8 + rnd() * 18;
    const d = 8 + rnd() * 18;
    const h = 18 + rnd() * 70 + (dist > 120 ? 40 : 0);
    const f = facades[Math.floor(rnd() * facades.length)]!;
    const map = f.map.clone();
    const em = f.emissive.clone();
    map.needsUpdate = em.needsUpdate = true;
    map.repeat.set(w / 14, h / 28);
    em.repeat.set(w / 14, h / 28);
    const mat = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.8, metalness: 0.1 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, h / 2 - 1, z);
    group.add(m);
    const col = rnd() < 0.55 ? PALETTE.magenta : PALETTE.cyan;
    const box: Box = { min: { x: x - w / 2, y: 0, z: z - d / 2 }, max: { x: x + w / 2, y: h - 1, z: z + d / 2 } };
    neonPerimeter(neon, box, col, h - 1 + 0.05, 0.25);
    if (rnd() < 0.6) neonPerimeter(neon, box, rnd() < 0.5 ? col : PALETTE.cyan, (h - 1) * (0.35 + rnd() * 0.4), 0.2);
    if (rnd() < 0.35) {
      const text = signs[Math.floor(rnd() * signs.length)]!;
      const fg = rnd() < 0.5 ? "#ffe34a" : "#ff3ec9";
      const face = Math.atan2(-z, -x); // face the arena
      const sw = Math.min(w * 0.8, 14);
      const tex = signTexture(text, fg, "#0a0810", fg, 128, 32);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw / 4), new THREE.MeshBasicMaterial({ map: tex }));
      const off = Math.max(w, d) / 2 + 0.2;
      s.position.set(x + Math.cos(face) * off, h * (0.4 + rnd() * 0.4), z + Math.sin(face) * off);
      s.rotation.y = -face + Math.PI / 2;
      group.add(s);
    }
  }

  neon.flush();

  // THE KERNEL: blood-red data-center megastructure on the horizon, immune to fog so it always reads.
  const kernelMat = new THREE.MeshBasicMaterial({ color: 0x120307, fog: false });
  const kernel = new THREE.Mesh(new THREE.BoxGeometry(180, 260, 120), kernelMat);
  kernel.position.set(-60, 120, -420);
  group.add(kernel);
  const stripMat = new THREE.MeshBasicMaterial({ color: PALETTE.red, fog: false });
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.2, 250, 1.2), stripMat);
    s.position.set(-60 - 86 + i * 21.5, 120, -420 + 61);
    group.add(s);
  }
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(182, 1.2, 122), stripMat);
    s.position.set(-60, 20 + i * 44, -420);
    group.add(s);
  }
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(420, 200), new THREE.MeshBasicMaterial({ color: 0x3a0510, transparent: true, opacity: 0.5, fog: false }));
  halo.position.set(-60, 90, -482);
  group.add(halo);
  return group;
}
