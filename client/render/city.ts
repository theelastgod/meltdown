import * as THREE from "three";
import type { Box, LevelDef, SignDef, TrafficLane } from "@shared/sim/level";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { brickTexture, facadeTextures, hazardTexture, shutterTexture } from "./textures";

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

const basic = (color: number, opacity = 1): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });

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

/**
 * Mesh batcher: solid geometry keyed by material. A city of ~300 boxes and
 * ~15 materials becomes ~15 draw calls (×2 with the mirror) instead of 600.
 * Box UVs are scaled per face so brick and window grids stay in metres.
 */
export class MeshBatch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  constructor(private parent: THREE.Object3D) {}
  /** `uvMetres` = texture tile size in metres (0 = leave UVs alone). */
  box(b: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }, mat: THREE.Material, uvMetres = 0, uvMetresY = uvMetres): void {
    const sx = b.max.x - b.min.x;
    const sy = b.max.y - b.min.y;
    const sz = b.max.z - b.min.z;
    const g = new THREE.BoxGeometry(sx, sy, sz);
    if (uvMetres > 0) {
      const uv = g.getAttribute("uv") as THREE.BufferAttribute;
      // face order: +x -x +y -y +z -z, four verts each: (width, height) per face
      const dims: [number, number][] = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
      for (let f = 0; f < 6; f++) {
        const [w, h] = dims[f]!;
        for (let v = 0; v < 4; v++) {
          const i = f * 4 + v;
          uv.setXY(i, (uv.getX(i) * w) / uvMetres, (uv.getY(i) * h) / uvMetresY);
        }
      }
    }
    g.translate((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
    this.add(g, mat);
  }
  add(g: THREE.BufferGeometry, mat: THREE.Material): void {
    let list = this.parts.get(mat);
    if (!list) this.parts.set(mat, (list = []));
    list.push(g);
  }
  flush(): number {
    let n = 0;
    for (const [mat, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (merged) {
        this.parent.add(new THREE.Mesh(merged, mat));
        n++;
      }
    }
    this.parts.clear();
    return n;
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

/**
 * All of a level's signs on one atlas → one mesh. Text is pixel monospace in
 * the clip's register; every sign is a flat emissive quad.
 */
export class SignAtlas {
  private canvas = document.createElement("canvas");
  private g: CanvasRenderingContext2D;
  private cols = 8;
  private rows = 16;
  private cw = 256;
  private ch = 64;
  private n = 0;
  readonly geos: THREE.BufferGeometry[] = [];
  constructor() {
    this.canvas.width = this.cols * this.cw;
    this.canvas.height = this.rows * this.ch;
    this.g = this.canvas.getContext("2d")!;
    this.g.fillStyle = "#000";
    this.g.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
  add(s: SignDef): void {
    if (this.n >= this.cols * this.rows) return;
    const cx = (this.n % this.cols) * this.cw;
    const cy = Math.floor(this.n / this.cols) * this.ch;
    const g = this.g;
    g.fillStyle = s.bg;
    g.fillRect(cx, cy, this.cw, this.ch);
    g.strokeStyle = s.border;
    g.lineWidth = 3;
    g.strokeRect(cx + 2, cy + 2, this.cw - 4, this.ch - 4);
    g.fillStyle = s.fg;
    g.textAlign = "center";
    g.textBaseline = "middle";
    let px = Math.floor(this.ch * 0.52);
    g.font = `bold ${px}px "Courier New", monospace`;
    while (g.measureText(s.text).width > this.cw - 20 && px > 12) {
      px -= 2;
      g.font = `bold ${px}px "Courier New", monospace`;
    }
    g.fillText(s.text, cx + this.cw / 2, cy + this.ch / 2 + 2);
    // uv rect (flip y: canvas top is uv 1)
    const u0 = cx / this.canvas.width;
    const u1 = (cx + this.cw) / this.canvas.width;
    const v1 = 1 - cy / this.canvas.height;
    const v0 = 1 - (cy + this.ch) / this.canvas.height;
    const geo = new THREE.PlaneGeometry(s.w, s.h);
    geo.setAttribute("flick", new THREE.Float32BufferAttribute([this.n * 0.37, this.n * 0.37, this.n * 0.37, this.n * 0.37], 1));
    const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
    uv.setXY(0, u0, v1);
    uv.setXY(1, u1, v1);
    uv.setXY(2, u0, v0);
    uv.setXY(3, u1, v0);
    geo.rotateY(s.rotY);
    geo.translate(s.x, s.y, s.z);
    this.geos.push(geo);
    this.n++;
  }
  flush(parent: THREE.Object3D): THREE.MeshBasicMaterial | null {
    if (!this.geos.length) return null;
    const tex = new THREE.CanvasTexture(this.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    const merged = mergeGeometries(this.geos, false)!;
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    parent.add(new THREE.Mesh(merged, mat));
    return mat;
  }
}

/** Dress a level's collision boxes and decor with the clip's kitbash vocabulary. Returns the draw-call count it added and the sign material (for flicker). */
export function dressLevel(scene: THREE.Scene, level: LevelDef): { calls: number; signMat: THREE.MeshBasicMaterial | null } {
  const group = new THREE.Group();
  group.name = "dressing";
  scene.add(group);
  const neon = new NeonBatch(group);
  const batch = new MeshBatch(group);
  const seed = level.skylineSeed ?? 3;
  const rnd = lcg(seed);
  // Cyan and magenta carry every district (the bible's rule); an amber district adds amber as an accent on
  // a fifth of its strips — VANTAGE's colour is a threat you notice, never the wallpaper.
  const cast = level.district ?? "magenta";
  const castColor = cast === "cyan" ? PALETTE.cyan : PALETTE.magenta;
  const altColor = cast === "cyan" ? PALETTE.magenta : PALETTE.cyan;
  const accent = cast === "amber" ? PALETTE.amber : altColor;

  // ---- materials (shared: every material is one draw call after batching) ----
  const brick = brickTexture(7);
  const brickDark = brickTexture(11, "#141a26", "#090b10");
  const hazard = hazardTexture();
  const shutter = shutterTexture();
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  const M = {
    concrete: std({ color: 0x1c2230, roughness: 0.7, metalness: 0.2 }),
    sidewalk: std({ color: 0x2a3140, roughness: 0.85, metalness: 0.05 }),
    base: std({ color: 0x10141c, roughness: 0.8, metalness: 0.1 }),
    metal: std({ color: 0x151b26, roughness: 0.45, metalness: 0.55 }),
    crate: std({ color: 0x3a2a12, roughness: 0.8, metalness: 0.05 }),
    barrel: std({ color: PALETTE.orange, roughness: 0.55, metalness: 0.2 }),
    cone: std({ color: 0xff6a1e, roughness: 0.7 }),
    brick: std({ map: brick, roughness: 0.85, metalness: 0.05 }),
    brickDark: std({ map: brickDark, roughness: 0.85, metalness: 0.05 }),
    hazard: std({ map: hazard, roughness: 0.8 }),
    fenceMat: std({ map: shutterTexture("#101418"), roughness: 0.6, metalness: 0.5, transparent: true, opacity: 0.85 }),
    shutter: std({ map: shutter, roughness: 0.6, metalness: 0.4 }),
    car: std({ color: 0x0c1018, roughness: 0.35, metalness: 0.6 }),
    carAlt: std({ color: 0x1a1220, roughness: 0.35, metalness: 0.6 }),
    planter: std({ color: 0x20262e, roughness: 0.9 }),
    bush: std({ color: 0x0a2418, roughness: 1 }),
    dumpster: std({ color: 0x14241c, roughness: 0.8, metalness: 0.3 }),
    stall: std({ color: 0x2a1c10, roughness: 0.85 }),
    containerA: std({ map: shutterTexture("#3a1a10"), roughness: 0.7, metalness: 0.3 }),
    containerB: std({ map: shutterTexture("#0f2430"), roughness: 0.7, metalness: 0.3 }),
    containerC: std({ map: shutterTexture("#20242a"), roughness: 0.7, metalness: 0.3 }),
    vending: std({ color: 0x0e1a24, roughness: 0.5, metalness: 0.4 }),
    metro: std({ color: 0x18201c, roughness: 0.7, metalness: 0.2 }),
    glassDim: basic(0x0b2a33),
    awningMg: basic(0x5a1448),
    awningCy: basic(0x0e3f48),
    railMg: basic(0x8a1f6a),
    lampHead: basic(0xfff1c8),
    glow: basic(0x9ce8ff, 0.18),
    padStart: basic(0x0f3a22),
    padEnd: basic(0x3a0f2c),
    white: std({ color: 0xd9dde3, roughness: 0.92, metalness: 0.0 }),
    whiteDesk: std({ color: 0xe9e5dc, roughness: 0.6, metalness: 0.05 }),
    whiteRug: std({ color: 0xb9b3a6, roughness: 1 }),
    whiteFloor: std({ color: 0xcfd3d8, roughness: 0.35, metalness: 0.1 }),
    glassWall: new THREE.MeshBasicMaterial({ color: 0x9fd8e8, transparent: true, opacity: 0.3, depthWrite: false }),
    page: basic(0xfff6d5),
    shopA: basic(castColor, 0.42),
    shopB: basic(altColor, 0.42),
    shopC: basic(cast === "amber" ? PALETTE.amber : PALETTE.yellow, 0.22),
    tail: basic(PALETTE.red),
    head: basic(0xfff3d0),
  };
  for (const t of [brick, brickDark, hazard, shutter, M.fenceMat.map!, M.containerA.map!, M.containerB.map!, M.containerC.map!]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.needsUpdate = true;
  }
  const facades = [facadeTextures(seed + 1, 0.22), facadeTextures(seed + 2, 0.32), facadeTextures(seed + 3, 0.45)].map((f) => {
    f.map.wrapS = f.map.wrapT = f.emissive.wrapS = f.emissive.wrapT = THREE.RepeatWrapping;
    f.map.needsUpdate = f.emissive.needsUpdate = true;
    return std({ map: f.map, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: 1.5, roughness: 0.8, metalness: 0.1 });
  });
  const b3 = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => ({ min: { x: Math.min(x0, x1), y: Math.min(y0, y1), z: Math.min(z0, z1) }, max: { x: Math.max(x0, x1), y: Math.max(y0, y1), z: Math.max(z0, z1) } });

  let signsPlaced = 0;
  for (const b of level.boxes) {
    const sx = b.max.x - b.min.x;
    const sy = b.max.y - b.min.y;
    const sz = b.max.z - b.min.z;
    const cx = (b.min.x + b.max.x) / 2;
    const cy = (b.min.y + b.max.y) / 2;
    const cz = (b.min.z + b.max.z) / 2;
    switch (b.tag) {
      case "floor":
        break; // the wet floor replaces it
      case "wall":
      case "rangewall":
      case "lintel": {
        batch.box(b, M.brick, 3);
        // cyan tube lights and shutters along the inner face (the range)
        const alongX = sx > sz;
        const len = alongX ? sx : sz;
        const inner = alongX ? (cz > 0 ? b.min.z - 0.08 : b.max.z + 0.08) : cx > 0 ? b.min.x - 0.08 : b.max.x + 0.08;
        for (let i = 4; i < len - 4; i += 8) {
          const p = (alongX ? b.min.x : b.min.z) + i;
          if (alongX) tube(neon, p, 3.2, inner, 3.2, "x", PALETTE.cyan);
          else tube(neon, inner, 3.2, p, 3.2, "z", PALETTE.cyan);
          if (rnd() < 0.5) {
            const sm = new THREE.PlaneGeometry(3.4, 2.6);
            if (alongX) {
              sm.rotateY(cz > 0 ? Math.PI : 0);
              sm.translate(p + 4, 1.3, inner);
            } else {
              sm.rotateY(cx > 0 ? -Math.PI / 2 : Math.PI / 2);
              sm.translate(inner, 1.3, p + 4);
            }
            batch.add(sm, M.shutter);
          }
        }
        break;
      }
      case "facade": {
        // the city beyond the playable streets: window grids, ledge strips every few floors, a big neon edge at the top
        batch.box(b, facades[Math.floor(rnd() * facades.length)]!, 14, 28);
        neonPerimeter(neon, b, rnd() < 0.5 ? castColor : altColor, b.max.y + 0.05, 0.3);
        for (const y of [5.0, 13, 22, 30]) neonPerimeter(neon, b, y < 10 ? altColor : rnd() < 0.5 ? castColor : altColor, y, 0.12);
        break;
      }
      case "building":
      case "lowrise": {
        batch.box(b, facades[Math.floor(rnd() * facades.length)]!, 14, 28);
        const col = rnd() < 0.55 ? castColor : altColor;
        neonPerimeter(neon, b, rnd() < 0.2 ? accent : col, b.max.y + 0.04, 0.16);
        // a ledge strip every couple of floors: the clip's glowing-wireframe silhouette
        const band = 6.5 + rnd() * 3;
        for (let y = b.min.y + band; y < b.max.y - 2; y += band) if (rnd() < 0.7) neonPerimeter(neon, b, rnd() < 0.2 ? accent : rnd() < 0.6 ? col : altColor, y, 0.09);
        if (rnd() < 0.6) neon.box(0.1, sy - 0.5, 0.1, b.max.x + 0.06, cy, b.max.z + 0.06, altColor);
        if (rnd() < 0.4) neon.box(0.1, sy - 0.5, 0.1, b.min.x - 0.06, cy, b.min.z - 0.06, col);
        break;
      }
      case "base": {
        // ground floor: dark plinth, a lit strip under the first floor, shop windows as glow planes on street sides
        batch.box(b, M.base, 4);
        neonPerimeter(neon, b, rnd() < 0.5 ? castColor : altColor, b.max.y - 0.05, 0.08);
        for (const side of ["n", "s", "e", "w"] as const) {
          const alongX = side === "n" || side === "s";
          const len = alongX ? sx : sz;
          let p = 1.2;
          while (p + 3 <= len - 1) {
            const w = 2.4 + rnd() * 1.4;
            const mid = (alongX ? b.min.x : b.min.z) + p + w / 2;
            const face = side === "n" ? b.min.z - 0.03 : side === "s" ? b.max.z + 0.03 : side === "w" ? b.min.x - 0.03 : b.max.x + 0.03;
            const g = new THREE.PlaneGeometry(w, 2.0);
            g.rotateY(side === "n" ? Math.PI : side === "s" ? 0 : side === "w" ? -Math.PI / 2 : Math.PI / 2);
            if (alongX) g.translate(mid, 1.35, face);
            else g.translate(face, 1.35, mid);
            const r = rnd();
            batch.add(g, r < 0.35 ? M.shutter : r < 0.55 ? M.glassDim : r < 0.74 ? M.shopA : r < 0.92 ? M.shopB : M.shopC);
            p += w + 0.8 + rnd() * 1.5;
          }
        }
        break;
      }
      case "plant":
        batch.box(b, M.metal);
        neon.box(sx + 0.05, 0.06, 0.06, cx, b.max.y + 0.03, b.max.z, altColor);
        break;
      case "block":
      case "highwall":
      case "lowwall":
        batch.box(b, M.brickDark, 3);
        neonPerimeter(neon, b, PALETTE.magenta, b.max.y + 0.03);
        break;
      case "pillar":
      case "pylon":
        batch.box(b, M.concrete);
        neonPerimeter(neon, b, PALETTE.violet, b.max.y + 0.03);
        neon.box(0.07, sy - 0.6, 0.07, b.max.x + 0.05, cy, cz, PALETTE.violet);
        break;
      // the white office
      case "white_wall":
      case "white_floor":
      case "white_desk":
        batch.box(b, b.tag === "white_desk" ? M.whiteDesk : b.tag === "white_floor" ? M.whiteFloor : M.white, 4);
        break;
      case "glass_wall":
        batch.box(b, M.glassWall);
        break;
      // the Deadletter Office
      case "desk":
      case "chair":
      case "terminal":
        batch.box(b, M.metal, 2);
        if (b.tag === "terminal") batch.box(b3(b.min.x + 0.05, b.min.y + 0.15, b.max.z, b.max.x - 0.05, b.max.y - 0.05, b.max.z + 0.02), M.glassDim);
        break;
      case "cot":
        batch.box(b, M.stall, 2);
        break;
      case "locker":
        batch.box(b, M.containerC, 2);
        break;
      case "bench":
        batch.box(b, M.crate, 2);
        break;
      case "cover":
        batch.box(b, M.hazard, 1.5);
        break;
      case "pad_start":
      case "pad_end":
        batch.box(b, b.tag === "pad_start" ? M.padStart : M.padEnd);
        neonPerimeter(neon, b, b.tag === "pad_start" ? PALETTE.green : PALETTE.magenta, b.max.y + 0.03, 0.08);
        break;
      case "crate":
      case "stall":
        batch.box(b, b.tag === "stall" ? M.stall : M.crate, 2);
        neonPerimeter(neon, b, PALETTE.amber, b.max.y + 0.02, 0.04);
        if (b.tag === "stall") neon.box(sx * 0.7, 0.05, 0.05, cx, b.max.y - 0.3, b.min.z - 0.04, rnd() < 0.5 ? PALETTE.yellow : PALETTE.cyan);
        break;
      case "curb":
      case "kerb":
        batch.box(b, M.hazard, 1.5, 1);
        break;
      case "fence": {
        // impound chain-link: dark mesh panels between posts, an amber light strip along the top rail
        batch.box(b, M.fenceMat, 0.5, 0.5);
        const alongX = sx > sz;
        const len = alongX ? sx : sz;
        for (let p = 0; p <= len + 0.01; p += 3) {
          const px = alongX ? b.min.x + Math.min(p, len) : cx;
          const pz = alongX ? cz : b.min.z + Math.min(p, len);
          batch.box(b3(px - 0.06, b.min.y, pz - 0.06, px + 0.06, b.max.y + 0.15, pz + 0.06), M.metal);
        }
        neon.box(alongX ? sx : 0.05, 0.04, alongX ? 0.05 : sz, cx, b.max.y + 0.02, cz, PALETTE.amber);
        break;
      }
      case "sidewalk":
        batch.box(b, M.sidewalk, 2);
        break;
      case "deck":
      case "upperdeck":
      case "gantry":
      case "gantrystair":
      case "dock":
      case "landing":
      case "step":
        batch.box(b, M.metal);
        if (b.tag !== "step") neonPerimeter(neon, b, PALETTE.cyan, b.max.y + 0.03);
        break;
      case "stair":
        batch.box(b, M.metal);
        // nosing strip on each tread
        neon.box(sx > sz ? 0.05 : sx, 0.03, sz > sx ? 0.05 : sz, sx > sz ? b.max.x - 0.03 : cx, b.max.y + 0.015, sz > sx ? b.max.z - 0.03 : cz, PALETTE.cyan);
        break;
      case "walkway":
        batch.box(b, M.metal, 3);
        neonPerimeter(neon, b, castColor, b.min.y - 0.04, 0.12);
        neonPerimeter(neon, b, PALETTE.cyan, b.max.y + 0.02, 0.06);
        break;
      case "rail": {
        // the clip's pedestrian rail: magenta posts and top bar, a cyan light bar under it
        const alongX = sx > sz;
        const len = alongX ? sx : sz;
        batch.box(b3(alongX ? b.min.x : cx - 0.04, b.max.y - 0.08, alongX ? cz - 0.04 : b.min.z, alongX ? b.max.x : cx + 0.04, b.max.y, alongX ? cz + 0.04 : b.max.z), M.railMg);
        for (let p = 0; p <= len; p += Math.max(1.2, len / Math.max(1, Math.round(len / 1.5)))) {
          const px = alongX ? b.min.x + p : cx;
          const pz = alongX ? cz : b.min.z + p;
          batch.box(b3(px - 0.04, b.min.y, pz - 0.04, px + 0.04, b.max.y, pz + 0.04), M.railMg);
        }
        tube(neon, cx, b.min.y + sy * 0.55, cz, len, alongX ? "x" : "z", PALETTE.cyan, 0.05);
        break;
      }
      case "lamp": {
        batch.box(b, M.metal);
        // arm + head + a soft pool on the ground
        const head = b3(cx - 0.35, b.max.y - 0.25, cz - 0.18, cx + 0.35, b.max.y, cz + 0.18);
        batch.box(head, M.lampHead);
        const pool = new THREE.CircleGeometry(2.2, 12);
        pool.rotateX(-Math.PI / 2);
        pool.translate(cx, 0.03, cz);
        batch.add(pool, M.glow);
        break;
      }
      case "car": {
        const alongX = sx > sz;
        batch.box(b3(b.min.x, b.min.y + 0.25, b.min.z, b.max.x, b.min.y + 0.85, b.max.z), rnd() < 0.5 ? M.car : M.carAlt);
        // cabin
        batch.box(b3(alongX ? b.min.x + 1.1 : b.min.x + 0.15, b.min.y + 0.85, alongX ? b.min.z + 0.15 : b.min.z + 1.1, alongX ? b.max.x - 1.3 : b.max.x - 0.15, b.max.y, alongX ? b.max.z - 0.15 : b.max.z - 1.3), M.car);
        batch.box(b3(alongX ? b.min.x + 1.2 : b.min.x + 0.12, b.min.y + 0.9, alongX ? b.min.z + 0.12 : b.min.z + 1.2, alongX ? b.max.x - 1.4 : b.max.x - 0.12, b.max.y - 0.08, alongX ? b.max.z - 0.12 : b.max.z - 1.4), M.glassDim);
        // tail lights (red) and a dim head light strip
        const t = 0.06;
        if (alongX) {
          neon.box(t, 0.12, sz - 0.5, b.max.x + 0.02, b.min.y + 0.65, cz, PALETTE.red);
          batch.box(b3(b.min.x - 0.02, b.min.y + 0.6, b.min.z + 0.25, b.min.x + 0.02, b.min.y + 0.72, b.max.z - 0.25), M.head);
        } else {
          neon.box(sx - 0.5, 0.12, t, cx, b.min.y + 0.65, b.max.z + 0.02, PALETTE.red);
          batch.box(b3(b.min.x + 0.25, b.min.y + 0.6, b.min.z - 0.02, b.max.x - 0.25, b.min.y + 0.72, b.min.z + 0.02), M.head);
        }
        // wheels
        for (const [wx, wz] of alongX ? [[b.min.x + 0.8, b.min.z], [b.min.x + 0.8, b.max.z], [b.max.x - 0.8, b.min.z], [b.max.x - 0.8, b.max.z]] : [[b.min.x, b.min.z + 0.8], [b.max.x, b.min.z + 0.8], [b.min.x, b.max.z - 0.8], [b.max.x, b.max.z - 0.8]]) {
          const w = new THREE.CylinderGeometry(0.3, 0.3, 0.22, 8);
          w.rotateZ(alongX ? 0 : Math.PI / 2);
          w.rotateX(alongX ? Math.PI / 2 : 0);
          w.translate(wx!, b.min.y + 0.3, wz!);
          batch.add(w, M.metal);
        }
        break;
      }
      case "vending": {
        batch.box(b, M.vending);
        // lit front: a glowing panel and a coloured strip
        const front = new THREE.PlaneGeometry(sx * 0.8, sy * 0.55);
        front.translate(cx, cy + 0.15, b.max.z + 0.01);
        batch.add(front, M.glow);
        neon.box(sx * 0.9, 0.05, 0.05, cx, b.max.y - 0.12, b.max.z + 0.02, rnd() < 0.5 ? PALETTE.cyan : PALETTE.yellow);
        break;
      }
      case "dumpster":
        batch.box(b, M.dumpster, 1.2);
        break;
      case "planter":
        batch.box(b, M.planter);
        batch.box(b3(b.min.x + 0.1, b.max.y, b.min.z + 0.1, b.max.x - 0.1, b.max.y + 0.5, b.max.z - 0.1), M.bush);
        break;
      case "container": {
        const m = [M.containerA, M.containerB, M.containerC][Math.floor(rnd() * 3)]!;
        batch.box(b, m, 1.2, 2.6);
        if (rnd() < 0.5) neon.box(0.05, sy * 0.7, 0.05, b.min.x - 0.02, cy, b.min.z - 0.02, PALETTE.amber);
        break;
      }
      case "crane":
      case "tower":
        batch.box(b, M.metal);
        neon.box(0.08, sy, 0.08, b.max.x + 0.02, cy, b.max.z + 0.02, PALETTE.amber);
        if (b.tag === "tower") batch.box(b3(b.min.x - 0.3, b.max.y, b.min.z - 0.3, b.max.x + 0.3, b.max.y + 0.4, b.max.z + 0.3), M.lampHead);
        break;
      case "cranebeam":
        batch.box(b, M.metal);
        tube(neon, cx, b.min.y - 0.05, cz, sx, "x", PALETTE.amber, 0.1);
        break;
      case "metro": {
        // the clip's tunnel mouth: green light bars and a hex lock glyph over a dark door
        batch.box(b, M.metro, 2);
        neonPerimeter(neon, b, PALETTE.green, b.max.y + 0.03, 0.08);
        const door = new THREE.PlaneGeometry(2.4, 2.6);
        door.translate(cx, 1.3, b.max.z + 0.02);
        batch.add(door, basic(0x061a12));
        neon.box(2.6, 0.06, 0.06, cx, 2.7, b.max.z + 0.04, PALETTE.green);
        neon.box(0.06, 2.6, 0.06, cx - 1.3, 1.3, b.max.z + 0.04, PALETTE.green);
        neon.box(0.06, 2.6, 0.06, cx + 1.3, 1.3, b.max.z + 0.04, PALETTE.green);
        const hex = new THREE.RingGeometry(0.42, 0.5, 6);
        hex.translate(cx, 1.5, b.max.z + 0.05);
        batch.add(hex, basic(PALETTE.green));
        break;
      }
      case "barrel": {
        const m = new THREE.CylinderGeometry(sx / 2, sx / 2, sy, 10);
        m.translate(cx, cy, cz);
        batch.add(m, M.barrel);
        break;
      }
      case "cone": {
        const m = new THREE.ConeGeometry(sx / 2, sy, 8);
        m.translate(cx, cy, cz);
        batch.add(m, M.cone);
        break;
      }
      case "post":
        batch.box(b, M.metal);
        if (sy > 6) neon.box(0.06, sy - 1, 0.06, b.max.x + 0.02, cy, b.max.z + 0.02, PALETTE.cyan); // monorail posts carry a light line
        break;
      case "gate": {
        // chain-link gate sealing a street exit: mesh panel, posts, an amber light bar, a LEASE CHECKPOINT feel
        batch.box(b, M.fenceMat, 0.5, 0.5);
        const alongX = sx > sz;
        for (const p of [0, 0.5, 1]) {
          const px = alongX ? b.min.x + sx * p : cx;
          const pz = alongX ? cz : b.min.z + sz * p;
          batch.box(b3(px - 0.08, b.min.y, pz - 0.08, px + 0.08, b.max.y + 0.3, pz + 0.08), M.metal);
        }
        neon.box(alongX ? sx : 0.08, 0.08, alongX ? 0.08 : sz, cx, b.max.y + 0.2, cz, PALETTE.amber);
        break;
      }
      case "bar":
        batch.box(b, M.metal);
        tube(neon, cx, b.min.y - 0.06, cz, sx - 0.4, "x", PALETTE.cyan, 0.09);
        break;
      default:
        batch.box(b, M.concrete);
    }
  }
  for (const d of level.decor ?? []) {
    const dx = d.max.x - d.min.x;
    const dy = d.max.y - d.min.y;
    const dz = d.max.z - d.min.z;
    const dcx = (d.min.x + d.max.x) / 2;
    const dcz = (d.min.z + d.max.z) / 2;
    switch (d.tag) {
      case "ceiling":
        batch.box(d, M.base, 4);
        break;
      case "white_ceiling":
        batch.box(d, M.white, 4);
        break;
      case "white_rug":
        batch.box(d, M.whiteRug);
        break;
      case "directive_page":
        batch.box(d, M.page);
        break;
      case "strip_cy":
      case "strip_mg":
        neon.box(dx, d.max.y - d.min.y, d.max.z - d.min.z, dcx, (d.min.y + d.max.y) / 2, (d.min.z + d.max.z) / 2, d.tag === "strip_cy" ? PALETTE.cyan : PALETTE.magenta);
        break;
      case "target_wall":
        batch.box(d, M.hazard, 1.5);
        neonPerimeter(neon, d, PALETTE.amber, d.max.y + 0.04, 0.1);
        break;
      case "awning_mg":
      case "awning_cy":
        batch.box(d, d.tag === "awning_mg" ? M.awningMg : M.awningCy);
        neon.box(dx, 0.04, 0.04, dcx, d.min.y - 0.02, d.max.z, d.tag === "awning_mg" ? PALETTE.magenta : PALETTE.cyan);
        break;
      case "vista_road":
        batch.box(d, M.base);
        // lane line down the middle
        neon.box(dx > dz ? dx : 0.12, 0.02, dz > dx ? dz : 0.12, dcx, d.max.y + 0.01, dcz, 0x2a3a48);
        break;
      case "vista_bldg": {
        batch.box(d, facades[Math.floor(rnd() * facades.length)]!, 14, 28);
        neonPerimeter(neon, d, rnd() < 0.5 ? castColor : altColor, d.max.y + 0.05, 0.2);
        if (rnd() < 0.6) neonPerimeter(neon, d, altColor, d.min.y + dy * 0.45, 0.12);
        break;
      }
      case "vista_lamp":
        batch.box(d, M.metal);
        batch.box(b3(dcx - 0.3, d.max.y - 0.2, dcz - 0.15, dcx + 0.3, d.max.y, dcz + 0.15), M.lampHead);
        break;
      case "beam":
        batch.box(d, M.metal, 3);
        if (dx > 40 || dz > 40) neon.box(dx > dz ? dx : 0.06, 0.06, dz > dx ? dz : 0.06, dcx, d.min.y - 0.04, dcz, PALETTE.magenta);
        break;
      case "portal":
        neonPerimeter(neon, d, PALETTE.cyan, d.max.y, 0.14);
        neonPerimeter(neon, d, PALETTE.cyan, d.min.y, 0.14);
        break;
      default:
        batch.box(d, M.concrete);
    }
  }
  const signs = new SignAtlas();
  for (const s of level.signs ?? []) {
    signs.add(s);
    signsPlaced++;
  }
  const signMat = signs.flush(group);
  neon.flush();
  const calls = batch.flush();
  void signsPlaced;
  return { calls, signMat };
}

/** Skyline of dark slabs with neon edges and sparse lit windows beyond the playable area, and THE KERNEL on the horizon. */
export function buildSkyline(scene: THREE.Scene, seed = 42, inner = 48, cast: "magenta" | "cyan" | "amber" = "magenta"): THREE.Group {
  const group = new THREE.Group();
  scene.add(group);
  const neon = new NeonBatch(group);
  const batch = new MeshBatch(group);
  const rnd = lcg(seed);
  const facades = [facadeTextures(1), facadeTextures(2, 0.1), facadeTextures(3, 0.25)].map((f) => {
    f.map.wrapS = f.map.wrapT = f.emissive.wrapS = f.emissive.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.8, metalness: 0.1 });
  });
  const castColor = cast === "cyan" ? PALETTE.cyan : cast === "amber" ? PALETTE.amber : PALETTE.magenta;
  const signs = new SignAtlas();
  /** roof positions of every slab (the sky's warning blinkers sit on the tall ones) */
  const slabs: { x: number; z: number; top: number }[] = [];
  group.userData.slabs = slabs;
  const words = ["LEASE", "VANTAGE", "保安", "NIGHT CO", "RE-LEASE", "ヴァンテージ", "SEC-9", "INTEGRITY", "COMPLY", "RENEW"];
  for (let i = 0; i < 110; i++) {
    const ang = rnd() * Math.PI * 2;
    const dist = inner + rnd() * 190;
    const x = Math.cos(ang) * dist;
    const z = Math.sin(ang) * dist;
    const w = 8 + rnd() * 18;
    const d = 8 + rnd() * 18;
    const h = 18 + rnd() * 70 + (dist > inner + 80 ? 50 : 0);
    const box: Box = { min: { x: x - w / 2, y: -1, z: z - d / 2 }, max: { x: x + w / 2, y: h - 1, z: z + d / 2 } };
    slabs.push({ x, z, top: h - 1 });
    batch.box(box, facades[Math.floor(rnd() * facades.length)]!, 14, 28);
    const col = rnd() < 0.55 ? castColor : PALETTE.cyan;
    neonPerimeter(neon, box, col, h - 1 + 0.05, 0.25);
    if (rnd() < 0.6) neonPerimeter(neon, box, rnd() < 0.5 ? col : PALETTE.cyan, (h - 1) * (0.35 + rnd() * 0.4), 0.2);
    if (rnd() < 0.35) {
      const face = Math.atan2(-z, -x); // face the playable area
      const sw = Math.min(w * 0.8, 14);
      const off = Math.max(w, d) / 2 + 0.2;
      const fg = rnd() < 0.5 ? "#ffe34a" : "#ff3ec9";
      signs.add({ text: words[Math.floor(rnd() * words.length)]!, fg, bg: "#0a0810", border: fg, w: sw, h: sw / 4, x: x + Math.cos(face) * off, y: h * (0.4 + rnd() * 0.4), z: z + Math.sin(face) * off, rotY: -face + Math.PI / 2 });
    }
  }
  signs.flush(group);
  neon.flush();
  batch.flush();

  // THE KERNEL: blood-red data-center megastructure on the horizon, immune to fog so it always reads.
  const kernelMat = new THREE.MeshBasicMaterial({ color: 0x120307, fog: false });
  const kernel = new THREE.Mesh(new THREE.BoxGeometry(180, 260, 120), kernelMat);
  kernel.position.set(-60, 120, -420);
  group.add(kernel);
  const stripMat = new THREE.MeshBasicMaterial({ color: PALETTE.red, fog: false });
  const strips = new MeshBatch(group);
  for (let i = 0; i < 9; i++) {
    const g = new THREE.BoxGeometry(1.2, 250, 1.2);
    g.translate(-60 - 86 + i * 21.5, 120, -420 + 61);
    strips.add(g, stripMat);
  }
  for (let i = 0; i < 6; i++) {
    const g = new THREE.BoxGeometry(182, 1.2, 122);
    g.translate(-60, 20 + i * 44, -420);
    strips.add(g, stripMat);
  }
  strips.flush();
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(420, 200), new THREE.MeshBasicMaterial({ color: 0x3a0510, transparent: true, opacity: 0.5, fog: false }));
  halo.position.set(-60, 90, -482);
  group.add(halo);
  return group;
}

/**
 * Traffic beyond the facades: head- and tail-light streaks sliding along
 * elevated lanes. One LineSegments, positions updated on the CPU each frame.
 */
export class Traffic {
  readonly object: THREE.LineSegments;
  private cars: { lane: TrafficLane; t: number; len: number }[] = [];
  private pos: Float32Array;
  constructor(lanes: readonly TrafficLane[], seed = 5) {
    const rnd = lcg(seed);
    for (const lane of lanes) for (let i = 0; i < lane.count; i++) this.cars.push({ lane, t: rnd(), len: 3 + rnd() * 3 });
    const n = this.cars.length * 2; // two segments per car: head (warm) and tail (red)
    this.pos = new Float32Array(n * 2 * 3);
    const col = new Float32Array(n * 2 * 3);
    for (let i = 0; i < this.cars.length; i++) {
      const o = i * 12;
      // head segment: warm white; tail segment: red
      col.set([1, 0.93, 0.75, 1, 0.93, 0.75, 1, 0.1, 0.18, 1, 0.1, 0.18], o);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.object = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
    this.object.frustumCulled = false;
    this.update(0);
  }
  update(dt: number): void {
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i]!;
      const L = Math.hypot(c.lane.to.x - c.lane.from.x, c.lane.to.z - c.lane.from.z);
      c.t = (c.t + (dt * c.lane.speed) / L) % 1;
      const x = c.lane.from.x + (c.lane.to.x - c.lane.from.x) * c.t;
      const z = c.lane.from.z + (c.lane.to.z - c.lane.from.z) * c.t;
      const y = c.lane.from.y;
      const dx = ((c.lane.to.x - c.lane.from.x) / L) * c.len;
      const dz = ((c.lane.to.z - c.lane.from.z) / L) * c.len;
      const o = i * 12;
      // head at the front, tail lights 1.5 m behind and slightly lower
      this.pos.set([x, y, z, x + dx * 0.4, y, z + dz * 0.4, x - dx * 0.3, y - 0.2, z - dz * 0.3, x - dx, y - 0.2, z - dz], o);
    }
    (this.object.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  }
}
