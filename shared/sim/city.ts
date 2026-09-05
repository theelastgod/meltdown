/**
 * Lethe proper: procedural city districts. One deterministic generator, three
 * district specs. A district is a 3×3 grid of building blocks split by
 * streets with sidewalks, alleys through some blocks, an elevated walkway,
 * storefronts, parked cars, rails, lamps, vending machines, dumpsters, a
 * metro kiosk — and the wake's five nodes at the plaza and intersections.
 * Everything the sim collides with is a Box; render-only dressing goes to
 * `decor`. The renderer reads tags; the sim reads nothing but boxes.
 */
import { v3, type Vec3 } from "../math/vec3";
import { box, type Box } from "./box";
import type { LevelDef, LightDef, SignDef, SpawnPoint, TrafficLane, DistrictCast } from "./level";

export interface DistrictSpec {
  id: string;
  displayName: string;
  cast: DistrictCast;
  seed: number;
  /** block kinds by grid cell, row-major (3×3); "plaza" is the wake's centre */
  blocks: BlockKind[];
  /** sign vocabulary in this district's voice */
  words: string[];
  /** neon colours the storefronts favour */
  signFg: string[];
  /** where the elevated walkway runs: the middle E–W street ("x") or N–S ("z") */
  walkway: "x" | "z";
  carDensity: number;
  mechs: number;
  wasps: number;
}

export type BlockKind = "tower" | "split" | "court" | "market" | "lot" | "plaza" | "yard" | "stack";

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const B = 24; // block size
const S = 9; // street width incl. sidewalks
const SW = 1.5; // sidewalk width
const CURB = 0.15;
const N = 3;
export const CITY_HALF = (N * B + (N + 1) * S) / 2; // 54

const COLORS = { cyan: "#35f2ff", magenta: "#ff3ec9", yellow: "#ffe34a", amber: "#ffb02e", green: "#37ff8b", violet: "#8f4dff" };

interface Ctx {
  spec: DistrictSpec;
  rnd: () => number;
  boxes: Box[];
  decor: Box[];
  signs: SignDef[];
  lights: LightDef[];
}

/** Block footprint in world space (buildings go inside; sidewalks ring it). */
function blockRect(bx: number, bz: number): { x0: number; z0: number; x1: number; z1: number } {
  const x0 = -CITY_HALF + S + bx * (B + S);
  const z0 = -CITY_HALF + S + bz * (B + S);
  return { x0, z0, x1: x0 + B, z1: z0 + B };
}

function addSign(c: Ctx, text: string, x: number, y: number, z: number, rotY: number, w: number, fgIn?: string): void {
  const fg = fgIn ?? c.spec.signFg[Math.floor(c.rnd() * c.spec.signFg.length)]!;
  const bgFor: Record<string, string> = { [COLORS.cyan]: "#07111a", [COLORS.magenta]: "#170714", [COLORS.yellow]: "#1a1206", [COLORS.amber]: "#160f04", [COLORS.green]: "#061a10", [COLORS.violet]: "#0f0718" };
  c.signs.push({ text, x, y, z, rotY, w, h: w >= 10 ? w / 3.2 : w / 4, fg, bg: bgFor[fg] ?? "#07111a", border: c.rnd() < 0.3 ? COLORS.yellow : fg });
}

/** Ground floor of a building along one street-facing side: shutters, shop windows, awnings, a sign. */
function storefronts(c: Ctx, x0: number, z0: number, x1: number, z1: number, side: "n" | "s" | "e" | "w"): void {
  const alongX = side === "n" || side === "s";
  const len = alongX ? x1 - x0 : z1 - z0;
  const face = side === "n" ? z0 : side === "s" ? z1 : side === "w" ? x0 : x1;
  const out = side === "n" || side === "w" ? -1 : 1; // outward normal sign
  const rotY = side === "n" ? Math.PI : side === "s" ? 0 : side === "w" ? -Math.PI / 2 : Math.PI / 2;
  let p = 1.5;
  while (p + 4 <= len - 1) {
    const w = 3.2 + c.rnd() * 1.6;
    const mid = (alongX ? x0 : z0) + p + w / 2;
    const sx = alongX ? mid : face + out * 0.02;
    const sz = alongX ? face + out * 0.02 : mid;
    // awning (decor only) over about half the shops
    if (c.rnd() < 0.55) {
      const depth = 1.1;
      const ax0 = alongX ? mid - w / 2 : Math.min(face, face + out * depth);
      const ax1 = alongX ? mid + w / 2 : Math.max(face, face + out * depth);
      const az0 = alongX ? Math.min(face, face + out * depth) : mid - w / 2;
      const az1 = alongX ? Math.max(face, face + out * depth) : mid + w / 2;
      c.decor.push(box(ax0, 2.9, az0, ax1, 3.05, az1, c.rnd() < 0.5 ? "awning_mg" : "awning_cy"));
    }
    if (c.rnd() < 0.5) {
      const word = c.spec.words[Math.floor(c.rnd() * c.spec.words.length)]!;
      addSign(c, word, sx + (alongX ? 0 : out * 0.03), 3.6, sz + (alongX ? out * 0.03 : 0), rotY, Math.min(w, 4.4));
    }
    // vending machine or a stall of crates in front, sometimes
    const r = c.rnd();
    if (r < 0.18) {
      const vx = alongX ? mid + w / 2 - 0.6 : face + out * 0.55;
      const vz = alongX ? face + out * 0.55 : mid + w / 2 - 0.6;
      c.boxes.push(box(vx - 0.45, 0, vz - 0.45, vx + 0.45, 1.9, vz + 0.45, "vending"));
    } else if (r < 0.28) {
      const vx = alongX ? mid : face + out * 0.9;
      const vz = alongX ? face + out * 0.9 : mid;
      c.boxes.push(box(vx - 0.9, 0, vz - 0.7, vx + 0.9, 1.0, vz + 0.7, "crate"));
    }
    p += w + 0.6 + c.rnd() * 1.2;
  }
}

/** A building: base (ground floor, full footprint) + upper mass (set back), storefronts on street sides. */
function building(c: Ctx, x0: number, z0: number, x1: number, z1: number, height: number, sides: ("n" | "s" | "e" | "w")[], tagUpper = "building"): void {
  c.boxes.push(box(x0, 0, z0, x1, 4.2, z1, "base"));
  const inset = Math.min(1.2, (x1 - x0) * 0.1, (z1 - z0) * 0.1);
  c.boxes.push(box(x0 + inset, 4.2, z0 + inset, x1 - inset, height, z1 - inset, tagUpper));
  // a rooftop plant box on tall buildings
  if (height > 16 && c.rnd() < 0.7) {
    const w = 3 + c.rnd() * 4;
    const px = x0 + inset + 1 + c.rnd() * (x1 - x0 - 2 * inset - w - 2);
    const pz = z0 + inset + 1 + c.rnd() * (z1 - z0 - 2 * inset - w - 2);
    c.boxes.push(box(px, height, pz, px + w, height + 2 + c.rnd() * 2, pz + w, "plant"));
  }
  for (const s of sides) storefronts(c, x0, z0, x1, z1, s);
}

function fireEscape(c: Ctx, x: number, z: number, dir: 1 | -1, alongX: boolean, floors: number): void {
  // a zig-zag of step boxes climbing a wall: 0.38 m rises, mantle-free steps
  let y = 0;
  let p = 0;
  for (let f = 0; f < floors; f++) {
    for (let s = 0; s < 8; s++) {
      const q = p + s * 0.55 * dir;
      if (alongX) c.boxes.push(box(x + q, y, z - 0.45, x + q + 0.6, y + 0.38, z + 0.45, "step"));
      else c.boxes.push(box(x - 0.45, y, z + q, x + 0.45, y + 0.38, z + q + 0.6, "step"));
      y += 0.38;
    }
    // landing
    const L = p + 8 * 0.55 * dir;
    if (alongX) c.boxes.push(box(Math.min(x + L, x + L + 1.4 * dir), y - 0.1, z - 0.6, Math.max(x + L, x + L + 1.4 * dir), y + 0.05, z + 0.6, "landing"));
    else c.boxes.push(box(x - 0.6, y - 0.1, Math.min(z + L, z + L + 1.4 * dir), x + 0.6, y + 0.05, Math.max(z + L, z + L + 1.4 * dir), "landing"));
    dir = -dir as 1 | -1;
    p = L;
  }
}

/** A run of 0.38 m treads whose TOP tread ends at (x, z) at height `toY`, descending away in `descend`. */
function stair(c: Ctx, x: number, z: number, descend: "+x" | "-x" | "+z" | "-z", toY: number, width = 3): void {
  const rise = 0.38;
  const tread = 0.7;
  const steps = Math.ceil(toY / rise);
  for (let s = 0; s < steps; s++) {
    const y1 = Math.min(toY, (s + 1) * rise);
    const far = tread * (steps - s); // distance of this tread's far edge from the top
    const near = far - tread;
    if (descend === "+x") c.boxes.push(box(x + near, 0, z - width / 2, x + far, y1, z + width / 2, "stair"));
    else if (descend === "-x") c.boxes.push(box(x - far, 0, z - width / 2, x - near, y1, z + width / 2, "stair"));
    else if (descend === "+z") c.boxes.push(box(x - width / 2, 0, z + near, x + width / 2, y1, z + far, "stair"));
    else c.boxes.push(box(x - width / 2, 0, z - far, x + width / 2, y1, z - near, "stair"));
  }
}

function cars(c: Ctx, x0: number, z0: number, x1: number, z1: number, alongX: boolean, density: number): void {
  // parked along the curb line of a street segment; boxes are the car bodies
  const len = alongX ? x1 - x0 : z1 - z0;
  let p = 2;
  while (p + 4.6 < len) {
    if (c.rnd() < density) {
      if (alongX) c.boxes.push(box(x0 + p, 0, z0, x0 + p + 4.4, 1.45, z0 + 1.9, "car"));
      else c.boxes.push(box(x0, 0, z0 + p, x0 + 1.9, 1.45, z0 + p + 4.4, "car"));
    }
    p += 5.4 + c.rnd() * 3;
  }
}

function lamp(c: Ctx, x: number, z: number): void {
  c.boxes.push(box(x - 0.12, 0, z - 0.12, x + 0.12, 5.2, z + 0.12, "lamp"));
}

/** Pedestrian rail: magenta rail with a cyan light bar (the clip's street motif). */
function rail(c: Ctx, x0: number, z0: number, x1: number, z1: number): void {
  c.boxes.push(box(x0, 0, z0, x1, 1.0, z1, "rail"));
}

function block(c: Ctx, bx: number, bz: number, kind: BlockKind, nodePos?: Vec3): void {
  const { x0, z0, x1, z1 } = blockRect(bx, bz);
  const r = c.rnd;
  const sides: ("n" | "s" | "e" | "w")[] = ["n", "s", "e", "w"];
  switch (kind) {
    case "tower": {
      building(c, x0 + 1, z0 + 1, x1 - 1, z1 - 1, 18 + r() * 18, sides);
      break;
    }
    case "split": {
      // two buildings with an alley between them, a dumpster and a fire escape inside
      const alongX = r() < 0.5;
      const gap = 3.2;
      if (alongX) {
        const m = z0 + B / 2;
        building(c, x0 + 1, z0 + 1, x1 - 1, m - gap / 2, 9 + r() * 12, ["n", "e", "w"]);
        building(c, x0 + 1, m + gap / 2, x1 - 1, z1 - 1, 9 + r() * 12, ["s", "e", "w"]);
        c.boxes.push(box(x0 + 6, 0, m - gap / 2 + 0.05, x0 + 7.8, 1.25, m - gap / 2 + 1.2, "dumpster"));
        fireEscape(c, x1 - 8, m + gap / 2 - 0.5, 1, true, 2);
        c.lights.push({ x: x0 + B / 2, y: 3.2, z: m, color: "amber", intensity: 6, range: 12 });
      } else {
        const m = x0 + B / 2;
        building(c, x0 + 1, z0 + 1, m - gap / 2, z1 - 1, 9 + r() * 12, ["n", "s", "w"]);
        building(c, m + gap / 2, z0 + 1, x1 - 1, z1 - 1, 9 + r() * 12, ["n", "s", "e"]);
        c.boxes.push(box(m - gap / 2 + 0.05, 0, z0 + 6, m - gap / 2 + 1.2, 1.25, z0 + 7.8, "dumpster"));
        fireEscape(c, m + gap / 2 - 0.5, z1 - 8, 1, false, 2);
        c.lights.push({ x: m, y: 3.2, z: z0 + B / 2, color: "amber", intensity: 6, range: 12 });
      }
      break;
    }
    case "court": {
      // low buildings ringing a courtyard with two entrances
      const t = 5.5; // ring thickness
      const h = 6 + r() * 4;
      building(c, x0 + 1, z0 + 1, x1 - 1, z0 + 1 + t, h, ["n"], "lowrise");
      building(c, x0 + 1, z1 - 1 - t, x1 - 1, z1 - 1, h, ["s"], "lowrise");
      // sides with a 3 m gap each
      building(c, x0 + 1, z0 + 1 + t, x0 + 1 + t, z0 + B / 2 - 1.5, h, ["w"], "lowrise");
      building(c, x0 + 1, z0 + B / 2 + 1.5, x0 + 1 + t, z1 - 1 - t, h, ["w"], "lowrise");
      building(c, x1 - 1 - t, z0 + 1 + t, x1 - 1, z0 + B / 2 - 1.5, h, ["e"], "lowrise");
      building(c, x1 - 1 - t, z0 + B / 2 + 1.5, x1 - 1, z1 - 1 - t, h, ["e"], "lowrise");
      // courtyard: planters, a stall, a light
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      c.boxes.push(box(cx - 4.5, 0, cz - 4.5, cx - 3.3, 0.5, cz - 3.3, "planter"));
      c.boxes.push(box(cx + 3.3, 0, cz + 3.3, cx + 4.5, 0.5, cz + 4.5, "planter"));
      c.boxes.push(box(cx + 2, 0, cz - 4.2, cx + 4.6, 2.5, cz - 2.2, "stall"));
      c.decor.push(box(cx + 1.6, 2.5, cz - 4.6, cx + 5, 2.65, cz - 1.8, "awning_cy"));
      c.lights.push({ x: cx, y: 3.5, z: cz, color: "cyan", intensity: 10, range: 16 });
      addSign(c, c.spec.words[Math.floor(r() * c.spec.words.length)]!, cx + 3.3, 3.1, cz - 4.62, Math.PI, 3.2, COLORS.yellow);
      break;
    }
    case "market": {
      // rows of stalls under awnings; open sightlines broken by canvas and crates
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 2; j++) {
          const sx = x0 + 3 + i * 7.5;
          const sz = z0 + 4 + j * 12;
          c.boxes.push(box(sx, 0, sz, sx + 2.6, 2.4, sz + 2.6, "stall"));
          c.decor.push(box(sx - 0.5, 2.4, sz - 0.5, sx + 3.1, 2.55, sz + 3.1, i % 2 ? "awning_mg" : "awning_cy"));
          if (r() < 0.6) c.boxes.push(box(sx + 3.2, 0, sz + 0.4, sx + 4.4, 0.9, sz + 1.6, "crate"));
          if (r() < 0.5) addSign(c, c.spec.words[Math.floor(r() * c.spec.words.length)]!, sx + 1.3, 3.0, sz + (j === 0 ? -0.55 : 3.15), j === 0 ? Math.PI : 0, 2.4);
        }
      }
      rail(c, x0 + 2, z0 + B / 2 - 0.04, x0 + 10, z0 + B / 2 + 0.04);
      rail(c, x1 - 10, z0 + B / 2 - 0.04, x1 - 2, z0 + B / 2 + 0.04);
      c.lights.push({ x: (x0 + x1) / 2, y: 3.8, z: (z0 + z1) / 2, color: "magenta", intensity: 14, range: 20 });
      break;
    }
    case "lot": {
      // VANTAGE impound lot: a fence with two gates, parked cars, a searchlight tower
      const f = 1.2;
      c.boxes.push(box(x0 + 1, 0, z0 + 1, x0 + B / 2 - 2, f, z0 + 1.1, "fence"));
      c.boxes.push(box(x0 + B / 2 + 2, 0, z0 + 1, x1 - 1, f, z0 + 1.1, "fence"));
      c.boxes.push(box(x0 + 1, 0, z1 - 1.1, x0 + B / 2 - 2, f, z1 - 1, "fence"));
      c.boxes.push(box(x0 + B / 2 + 2, 0, z1 - 1.1, x1 - 1, f, z1 - 1, "fence"));
      c.boxes.push(box(x0 + 1, 0, z0 + 1, x0 + 1.1, f, z1 - 1, "fence"));
      c.boxes.push(box(x1 - 1.1, 0, z0 + 1, x1 - 1, f, z1 - 1, "fence"));
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) if (r() < 0.75) c.boxes.push(box(x0 + 3 + i * 6.5, 0, z0 + 4 + j * 11, x0 + 3 + i * 6.5 + 1.9, 1.45, z0 + 4 + j * 11 + 4.4, "car"));
      c.boxes.push(box(x1 - 4, 0, z1 - 4, x1 - 3.2, 7, z1 - 3.2, "tower"));
      c.lights.push({ x: x1 - 3.6, y: 6.5, z: z1 - 3.6, color: "amber", intensity: 18, range: 26 });
      addSign(c, "VANTAGE IMPOUND", x0 + B / 2, 2.2, z0 + 0.95, Math.PI, 5, COLORS.amber);
      break;
    }
    case "yard": {
      // docks: container stacks and a crane
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 4; j++) {
          if (r() < 0.25) continue;
          const sx = x0 + 1.5 + i * 7.5;
          const sz = z0 + 1.5 + j * 5.6;
          c.boxes.push(box(sx, 0, sz, sx + 6, 2.6, sz + 2.4, "container"));
          if (r() < 0.45) c.boxes.push(box(sx, 2.6, sz, sx + 6, 5.2, sz + 2.4, "container"));
        }
      }
      c.boxes.push(box(x0 + 2, 0, z1 - 3, x0 + 2.8, 12, z1 - 2.2, "crane"));
      c.boxes.push(box(x1 - 2.8, 0, z1 - 3, x1 - 2, 12, z1 - 2.2, "crane"));
      c.boxes.push(box(x0 + 2, 11.2, z1 - 3, x1 - 2, 12, z1 - 2.2, "cranebeam"));
      c.lights.push({ x: (x0 + x1) / 2, y: 8, z: z1 - 2.6, color: "amber", intensity: 14, range: 24 });
      break;
    }
    case "stack": {
      // a warehouse with a loading dock (mantle-height platform) and a roof reachable by stair
      building(c, x0 + 1, z0 + 6, x1 - 1, z1 - 1, 7.5, ["s", "e", "w"], "lowrise");
      c.boxes.push(box(x0 + 3, 0, z0 + 1, x1 - 3, 1.2, z0 + 6, "dock"));
      stair(c, x0 + 3, z0 + 2.5, "-x", 1.2, 2.2);
      c.boxes.push(box(x0 + 4, 1.2, z0 + 2, x0 + 6, 2.2, z0 + 4, "crate"));
      c.boxes.push(box(x1 - 7, 1.2, z0 + 2, x1 - 5, 2.0, z0 + 4, "crate"));
      addSign(c, c.spec.words[Math.floor(r() * c.spec.words.length)]!, (x0 + x1) / 2, 5.2, z0 + 5.95, Math.PI, 6);
      c.lights.push({ x: (x0 + x1) / 2, y: 4, z: z0 + 3.5, color: "cyan", intensity: 10, range: 18 });
      break;
    }
    case "plaza": {
      // the wake's centre: an open square with a metro kiosk, planters, rails, and the node
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      c.boxes.push(box(cx - 9, 0, z0 + 1, cx - 3, 3.2, z0 + 5, "metro"));
      addSign(c, "METRO · LETHE TRANSIT", cx - 6, 3.6, z0 + 5.05, 0, 5.6, COLORS.green);
      c.boxes.push(box(cx + 4, 0, z0 + 1, cx + 5.2, 0.5, z0 + 6, "planter"));
      c.boxes.push(box(cx + 4, 0, z1 - 6, cx + 5.2, 0.5, z1 - 1, "planter"));
      c.boxes.push(box(x0 + 1, 0, cz - 0.6, x0 + 6, 0.5, cz + 0.6, "planter"));
      rail(c, cx - 7, z0 + 7, cx + 7, z0 + 7.08);
      c.boxes.push(box(cx - 1.2, 0, cz + 6, cx + 1.2, 4.6, cz + 6.6, "pylon"));
      c.lights.push({ x: cx, y: 5, z: cz, color: "cyan", intensity: 16, range: 26 });
      c.lights.push({ x: cx - 6, y: 3.4, z: z0 + 6, color: "green", intensity: 6, range: 10 });
      if (nodePos) {
        nodePos.x = cx;
        nodePos.z = cz;
      }
      break;
    }
  }
}

export function generateDistrict(spec: DistrictSpec): LevelDef {
  const c: Ctx = { spec, rnd: lcg(spec.seed), boxes: [], decor: [], signs: [], lights: [] };
  const H = CITY_HALF;
  // ground slab and the perimeter of tall facades (the city continues, you don't)
  c.boxes.push(box(-H - 20, -1, -H - 20, H + 20, 0, H + 20, "floor"));
  const F = 30;
  c.boxes.push(box(-H - F, 0, -H - F, H + F, 36, -H, "facade"));
  c.boxes.push(box(-H - F, 0, H, H + F, 36, H + F, "facade"));
  c.boxes.push(box(-H - F, 0, -H, -H, 36, H, "facade"));
  c.boxes.push(box(H, 0, -H, H + F, 36, H, "facade"));

  // sidewalks ring every block; curbs are step-height
  for (let bx = 0; bx < N; bx++) {
    for (let bz = 0; bz < N; bz++) {
      const { x0, z0, x1, z1 } = blockRect(bx, bz);
      c.boxes.push(box(x0 - SW, 0, z0 - SW, x1 + SW, CURB, z0, "sidewalk"));
      c.boxes.push(box(x0 - SW, 0, z1, x1 + SW, CURB, z1 + SW, "sidewalk"));
      c.boxes.push(box(x0 - SW, 0, z0, x0, CURB, z1, "sidewalk"));
      c.boxes.push(box(x1, 0, z0, x1 + SW, CURB, z1, "sidewalk"));
    }
  }
  // perimeter sidewalks along the facades
  c.boxes.push(box(-H, 0, -H, H, CURB, -H + SW, "sidewalk"));
  c.boxes.push(box(-H, 0, H - SW, H, CURB, H, "sidewalk"));
  c.boxes.push(box(-H, 0, -H, -H + SW, CURB, H, "sidewalk"));
  c.boxes.push(box(H - SW, 0, -H, H, CURB, H, "sidewalk"));

  // nodes: plaza centre + the four inner intersections
  const I = -H + S / 2 + (B + S); // first inner intersection coordinate (-16.5)
  const nodes = [
    { id: 1, label: "A", pos: v3(0, 0, 0), links: [2, 3, 4, 5] },
    { id: 2, label: "B", pos: v3(-I, 0, -I), links: [1, 3, 4] },
    { id: 3, label: "C", pos: v3(I, 0, -I), links: [1, 2, 5] },
    { id: 4, label: "D", pos: v3(-I, 0, I), links: [1, 2, 5] },
    { id: 5, label: "E", pos: v3(I, 0, I), links: [1, 3, 4] },
  ];

  // blocks
  for (let bz = 0; bz < N; bz++) for (let bx = 0; bx < N; bx++) block(c, bx, bz, spec.blocks[bz * N + bx]!, bx === 1 && bz === 1 ? nodes[0]!.pos : undefined);

  // elevated walkway along the street between block rows 1 and 2 (z = I). Each end has a landing in the
  // perimeter street and a switchback stair descending along that street (so the street stays open beside it);
  // a spur drops into the plaza. Rails along both edges.
  const WY = 4.6;
  const WS = -I; // 16.5: the street centreline it follows
  const LX = H - S + 0.5; // 45.5: where the landings start
  if (spec.walkway === "x") {
    c.boxes.push(box(-LX, WY - 0.3, WS - 1.6, LX, WY, WS + 1.6, "walkway"));
    c.boxes.push(box(-LX, WY, WS - 1.7, LX, WY + 1.0, WS - 1.6, "rail"));
    c.boxes.push(box(-LX, WY, WS + 1.6, LX, WY + 1.0, WS + 1.7, "rail"));
    for (const sgn of [1, -1] as const) {
      const lx0 = sgn > 0 ? LX : -LX - 3.2;
      c.boxes.push(box(lx0, WY - 0.3, WS - 1.6, lx0 + 3.2, WY, WS + 1.6, "landing"));
      stair(c, lx0 + 1.6, WS - 1.6, "-z", WY - 0.3, 3.2);
    }
    // spur into the plaza's south-west corner
    c.boxes.push(box(-10.6, WY - 0.3, WS - 4.5, -7.4, WY, WS - 1.6, "walkway"));
    stair(c, -9, WS - 4.5, "-z", WY - 0.3, 3.2);
    for (let x = -LX + 4; x < LX; x += 12) c.lights.push({ x, y: WY - 0.6, z: WS, color: "cyan", intensity: 5, range: 9 });
  } else {
    c.boxes.push(box(WS - 1.6, WY - 0.3, -LX, WS + 1.6, WY, LX, "walkway"));
    c.boxes.push(box(WS - 1.7, WY, -LX, WS - 1.6, WY + 1.0, LX, "rail"));
    c.boxes.push(box(WS + 1.6, WY, -LX, WS + 1.7, WY + 1.0, LX, "rail"));
    for (const sgn of [1, -1] as const) {
      const lz0 = sgn > 0 ? LX : -LX - 3.2;
      c.boxes.push(box(WS - 1.6, WY - 0.3, lz0, WS + 1.6, WY, lz0 + 3.2, "landing"));
      stair(c, WS - 1.6, lz0 + 1.6, "-x", WY - 0.3, 3.2);
    }
    c.boxes.push(box(WS - 4.5, WY - 0.3, -10.6, WS - 1.6, WY, -7.4, "walkway"));
    stair(c, WS - 4.5, -9, "-x", WY - 0.3, 3.2);
    for (let z = -LX + 4; z < LX; z += 12) c.lights.push({ x: WS, y: WY - 0.6, z, color: "cyan", intensity: 5, range: 9 });
  }

  // street furniture: lamps at block corners, parked cars along curbs, rails at crossings
  for (let bx = 0; bx < N; bx++) {
    for (let bz = 0; bz < N; bz++) {
      const { x0, z0, x1, z1 } = blockRect(bx, bz);
      lamp(c, x0 - SW + 0.4, z0 - SW + 0.4);
      lamp(c, x1 + SW - 0.4, z1 + SW - 0.4);
      // cars on the road just off the sidewalk (north and west curbs of each block)
      cars(c, x0, z0 - SW - 2.1, x1, z0 - SW - 0.2, true, spec.carDensity);
      cars(c, x0 - SW - 2.1, z0, x0 - SW - 0.2, z1, false, spec.carDensity);
      if (c.rnd() < 0.6) rail(c, x0 + 4, z1 + SW + 0.3, x0 + 9, z1 + SW + 0.38);
    }
  }
  // lamps along the perimeter streets
  for (let x = -H + 8; x < H; x += 16) {
    lamp(c, x, -H + 1.1);
    lamp(c, x, H - 1.1);
  }

  // big district signage on the perimeter facades
  const big = [`${spec.displayName}`, "VANTAGE INTEGRITY", "LEASE · RENEW · COMPLY", ...spec.words.slice(0, 3)];
  for (let i = 0; i < 4; i++) {
    const t = big[i]!;
    const p = -H + 16 + i * 26;
    addSign(c, t, p, 9 + (i % 2) * 5, -H - 0.05, 0, 12, i % 2 ? COLORS.magenta : COLORS.cyan);
    addSign(c, big[(i + 2) % big.length]!, H + 0.05, 8 + (i % 2) * 6, p, -Math.PI / 2, 12, i % 2 ? COLORS.cyan : COLORS.magenta);
    addSign(c, big[(i + 3) % big.length]!, -p, 10 + (i % 2) * 4, H + 0.05, Math.PI, 12, i % 2 ? COLORS.cyan : COLORS.magenta);
    addSign(c, big[(i + 1) % big.length]!, -H - 0.05, 7 + (i % 2) * 7, -p, Math.PI / 2, 12, i % 2 ? COLORS.magenta : COLORS.cyan);
  }

  // district rig: two big casts on opposite corners. Cyan and magenta carry the city everywhere; an amber
  // district gets its threat colour from the local VANTAGE lights (lots, towers, fences), never the rig.
  const key: LightDef["color"] = spec.cast === "cyan" ? "cyan" : "magenta";
  const alt: LightDef["color"] = spec.cast === "cyan" ? "magenta" : "cyan";
  c.lights.unshift({ x: 30, y: 12, z: 30, color: key, intensity: 80, range: 110 }, { x: -30, y: 12, z: -30, color: alt, intensity: 80, range: 110 });

  // spawns: mid-edge streets, then corners (rooms alternate cells through the list)
  const E = H - 4.5; // centreline of the perimeter streets
  const spawns: SpawnPoint[] = [
    { pos: v3(-I, 0, E), yaw: 0 }, // south street, facing north up the x=16.5 street
    { pos: v3(I, 0, -E), yaw: Math.PI },
    { pos: v3(-E, 0, I), yaw: -Math.PI / 2 }, // west street at z = -16.5 (the walkway stairs use z = +16.5)
    { pos: v3(E, 0, I), yaw: Math.PI / 2 },
    { pos: v3(-E, 0, E), yaw: -Math.PI / 4 },
    { pos: v3(E, 0, -E), yaw: (3 * Math.PI) / 4 },
    { pos: v3(E, 0, E), yaw: Math.PI / 4 },
    { pos: v3(-E, 0, -E), yaw: (-3 * Math.PI) / 4 },
  ];

  // VANTAGE: wasps over the streets, mechs on the ring avenue facing in
  const wasps: { waypoints: Vec3[] }[] = [];
  const ring = H - S / 2;
  const patrols: Vec3[][] = [
    [v3(-ring, 4, -ring), v3(-I, 4.5, -ring), v3(-I, 4.2, 0), v3(-ring, 4, 0)],
    [v3(ring, 4, ring), v3(I, 4.5, ring), v3(I, 4.2, 0), v3(ring, 4, 0)],
    [v3(-I, 6, I), v3(I, 6.5, I), v3(I, 6, -I), v3(-I, 6.5, -I)],
    [v3(-I, 5, -ring), v3(-I, 5.5, ring)],
  ];
  for (let i = 0; i < Math.min(spec.wasps, patrols.length); i++) wasps.push({ waypoints: patrols[i]! });
  const mechs: { path: Vec3[]; face?: number }[] = [];
  const mechPaths: { path: Vec3[]; face: number }[] = [
    { path: [v3(-H + 12, 0, -ring + 0.5), v3(H - 12, 0, -ring + 0.5)], face: 0 },
    { path: [v3(ring - 0.5, 0, -H + 12), v3(ring - 0.5, 0, H - 12)], face: -Math.PI / 2 },
    { path: [v3(H - 12, 0, ring - 0.5), v3(-H + 12, 0, ring - 0.5)], face: Math.PI },
  ];
  for (let i = 0; i < Math.min(spec.mechs, mechPaths.length); i++) mechs.push(mechPaths[i]!);

  // traffic beyond the facades: an elevated ring road, both directions
  const R = H + 26;
  const traffic: TrafficLane[] = [
    { from: v3(-R - 40, 14, -R), to: v3(R + 40, 14, -R), speed: 22, count: 14 },
    { from: v3(R + 40, 14, -R + 4), to: v3(-R - 40, 14, -R + 4), speed: 20, count: 14 },
    { from: v3(R, 14, -R - 40), to: v3(R, 14, R + 40), speed: 21, count: 12 },
    { from: v3(R + 4, 14, R + 40), to: v3(R + 4, 14, -R - 40), speed: 19, count: 12 },
    { from: v3(R + 40, 14, R), to: v3(-R - 40, 14, R), speed: 22, count: 12 },
    { from: v3(-R, 14, R + 40), to: v3(-R, 14, -R - 40), speed: 20, count: 12 },
  ];

  return {
    name: spec.id,
    displayName: spec.displayName,
    district: spec.cast,
    bounds: H,
    boxes: c.boxes,
    decor: c.decor,
    signs: c.signs,
    lights: c.lights,
    traffic,
    skylineSeed: spec.seed,
    spawns,
    dummies: [],
    killY: -20,
    wasps,
    mechs,
    nodes,
  };
}

// ---------------------------------------------------------------------------
// The three launch districts

export const DISTRICT_SPECS: DistrictSpec[] = [
  {
    id: "lease_row",
    displayName: "LEASE ROW",
    cast: "magenta",
    seed: 1101,
    blocks: ["tower", "split", "court", "market", "plaza", "split", "court", "tower", "market"],
    words: ["RE-LEASE", "再租", "NIGHT CO", "PAWN", "NOODLE 24", "ヴァンテージ", "CHILL UNDER", "DEADLETTER", "LEASE-BREAKER", "SEC-9"],
    signFg: [COLORS.magenta, COLORS.cyan, COLORS.yellow],
    walkway: "x",
    carDensity: 0.45,
    mechs: 1,
    wasps: 3,
  },
  {
    id: "deadletter_docks",
    displayName: "DEADLETTER DOCKS",
    cast: "cyan",
    seed: 2202,
    blocks: ["yard", "stack", "split", "stack", "plaza", "yard", "market", "yard", "stack"],
    words: ["HARBOR AUTH", "CUSTOMS 保安", "COLD STORE", "DEADLETTER", "SALVAGE", "PIER 9", "BONDED", "MANIFEST"],
    signFg: [COLORS.cyan, COLORS.yellow, COLORS.magenta],
    walkway: "z",
    carDensity: 0.25,
    mechs: 2,
    wasps: 3,
  },
  {
    id: "repo_depot",
    displayName: "REPO DEPOT",
    cast: "amber",
    seed: 3303,
    blocks: ["lot", "tower", "lot", "split", "plaza", "split", "court", "lot", "stack"],
    words: ["VANTAGE", "IMPOUND", "INTEGRITY", "REPO DEPOT", "COMPLY", "LEASE DUE", "SEC-9", "AUDIT"],
    signFg: [COLORS.cyan, COLORS.magenta, COLORS.amber],
    walkway: "x",
    carDensity: 0.6,
    mechs: 3,
    wasps: 4,
  },
];

export const districtById = (id: string): DistrictSpec | undefined => DISTRICT_SPECS.find((d) => d.id === id);
