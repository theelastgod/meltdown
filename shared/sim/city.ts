import type { ClaimDef, ZoneDef } from "./run";
/**
 * Neo-China proper: procedural city districts. One deterministic generator, five
 * district specs. A district is a 3×3 (or 5×5) grid of building blocks split by
 * streets with sidewalks, alleys through some blocks, an elevated walkway,
 * storefronts, parked cars, rails, lamps, vending machines, dumpsters, a
 * metro kiosk — and the wake's five nodes at the plaza and intersections.
 * Everything the sim collides with is a Box; render-only dressing goes to
 * `decor`. The renderer reads tags; the sim reads nothing but boxes.
 *
 * The grid size is the spec's own (`grid`, Stage 692). Every size-derived value is computed from
 * the district's half-size, and a 3×3 district builds exactly the level it built before the grid
 * was a property: `tests/citysize.test.ts` holds a hash of each one taken on the old generator.
 * The plaza is always the centre block, and the wake's four outer nodes are always its corner
 * intersections, so a 5×5 district's nodes sit where a 3×3 district's do (±16.5) and a mission
 * keyed by node label plays the same in either.
 */
import { v3, type Vec3 } from "../math/vec3";
import { box, type Box } from "./box";
import type { LevelDef, LightDef, SignDef, ShopSpot, WildEdge, SpawnPoint, TrafficLane, DistrictCast, WalkLoop, StreetExit, AdPanel, TramLine } from "./level";

export interface DistrictSpec {
  id: string;
  displayName: string;
  cast: DistrictCast;
  seed: number;
  /** blocks per side (default 3). A 5×5 district is 174 m across to a 3×3's 108 m. */
  grid?: DistrictGrid;
  /** block kinds by grid cell, row-major (grid × grid); "plaza" is the wake's centre and sits in the centre cell */
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
  /** citizens on the sidewalks (render only) */
  pedestrians: number;
}

export type BlockKind = "tower" | "split" | "court" | "market" | "lot" | "plaza" | "yard" | "stack";

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export type DistrictGrid = 3 | 5;

const B = 24; // block size
const S = 9; // street width incl. sidewalks
const SW = 1.5; // sidewalk width
const CURB = 0.15;
/** half-size of a district `n` blocks across: n blocks and n + 1 streets */
const halfFor = (n: number): number => (n * B + (n + 1) * S) / 2;
/** A 3×3 district's half-size (54). Kept for what was written against the one size; new code asks `districtHalf`. */
export const CITY_HALF = halfFor(3);
/** The spec's grid, defaulted. */
export const districtGrid = (spec: Pick<DistrictSpec, "grid">): DistrictGrid => spec.grid ?? 3;
/** A district's half-size in metres: 54 for 3×3, 87 for 5×5. The level's `bounds` is this. */
export const districtHalf = (spec: Pick<DistrictSpec, "grid">): number => halfFor(districtGrid(spec));

const COLORS = { cyan: "#35f2ff", magenta: "#ff3ec9", yellow: "#ffe34a", amber: "#ffb02e", green: "#37ff8b", violet: "#8f4dff" };

interface Ctx {
  spec: DistrictSpec;
  rnd: () => number;
  boxes: Box[];
  decor: Box[];
  signs: SignDef[];
  lights: LightDef[];
  /** the district's half-size */
  H: number;
  /**
   * An outer-ring block of a 5×5 district is being built: dressed leaner (see `LEAN`). Never set in a
   * 3×3 district, whose every roll is the roll it always was.
   */
  lean: boolean;
}

/**
 * What an outer-ring block of a 5×5 district gives up. Every triangle of the dressing is drawn twice
 * (scene and the wet floor's mirror) and the merged batches are never culled, so the ring's sixteen
 * blocks dressed like the centre take LEASE ROW's frame to ~209k triangles against a 200k budget
 * (measured in `tests/citycost.test.ts`: dressing 61k, 721 boxes). The ring keeps its buildings,
 * storefronts, lamps and walks; it sheds the props in front of the shops, three parked cars in four,
 * the crossing rails and a market's rails, and hangs fewer awnings and shop signs (which also keeps
 * the district's signs inside the renderer's one atlas). The centre nine, where the wake is played,
 * are dressed in full.
 */
const LEAN = { awning: 0.3, sign: 0.25, cars: 0.25 } as const;

/** Block footprint in world space (buildings go inside; sidewalks ring it). */
function blockRect(H: number, bx: number, bz: number): { x0: number; z0: number; x1: number; z1: number } {
  const x0 = -H + S + bx * (B + S);
  const z0 = -H + S + bz * (B + S);
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
    if (c.rnd() < (c.lean ? LEAN.awning : 0.55)) {
      const depth = 1.1;
      const ax0 = alongX ? mid - w / 2 : Math.min(face, face + out * depth);
      const ax1 = alongX ? mid + w / 2 : Math.max(face, face + out * depth);
      const az0 = alongX ? Math.min(face, face + out * depth) : mid - w / 2;
      const az1 = alongX ? Math.max(face, face + out * depth) : mid + w / 2;
      c.decor.push(box(ax0, 2.9, az0, ax1, 3.05, az1, c.rnd() < 0.5 ? "awning_mg" : "awning_cy"));
    }
    if (c.rnd() < (c.lean ? LEAN.sign : 0.5)) {
      const word = c.spec.words[Math.floor(c.rnd() * c.spec.words.length)]!;
      addSign(c, word, sx + (alongX ? 0 : out * 0.03), 3.6, sz + (alongX ? out * 0.03 : 0), rotY, Math.min(w, 4.4));
    }
    // vending machine or a stall of crates in front, sometimes
    const r = c.rnd();
    if (c.lean) {
      // the outer ring's shop fronts stand bare: no machine, no crates
    } else if (r < 0.18) {
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
  const { x0, z0, x1, z1 } = blockRect(c.H, bx, bz);
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
      if (!c.lean) {
        rail(c, x0 + 2, z0 + B / 2 - 0.04, x0 + 10, z0 + B / 2 + 0.04);
        rail(c, x1 - 10, z0 + B / 2 - 0.04, x1 - 2, z0 + B / 2 + 0.04);
      }
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
      addSign(c, "METRO · NEO-CHINA TRANSIT", cx - 6, 3.6, z0 + 5.05, 0, 5.6, COLORS.green);
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
  const N = districtGrid(spec);
  const H = districtHalf(spec);
  if (spec.blocks.length !== N * N) throw new Error(`${spec.id}: ${spec.blocks.length} blocks for a ${N}×${N} grid`);
  const mid = (N - 1) / 2; // the centre cell: the plaza's
  if (spec.blocks[mid * N + mid] !== "plaza") throw new Error(`${spec.id}: the centre block is ${spec.blocks[mid * N + mid]}, not the plaza`);
  /** scale against a 3×3 district: exactly 1 for one, so its numbers are the ones it always had */
  const k = H / CITY_HALF;
  const c: Ctx = { spec, rnd: lcg(spec.seed), boxes: [], decor: [], signs: [], lights: [], H, lean: false };
  // ground slab (wide: the vista roads beyond the exits sit on it too) and the perimeter of tall facades.
  // The avenues either side of the plaza run out through the perimeter: a gate seals each, the city
  // continues beyond as a vista. In a 3×3 district those are its only two inner streets; a 5×5 district's
  // outer streets meet the perimeter street at a T under the facade (eight gates either way).
  const F = 30;
  // vista length beyond the facade: the slab's edge stays at ±254 m whatever the district's size
  // (170 m for a 3×3), well inside the ±327 m a position can be sent at (shared/net/protocol.ts)
  const V = 254 - H - F;
  // a vista's buildings and lamps every 22 m (18 m deep) in a 3×3 district. A 5×5 district's vistas start
  // 33 m further out, into the fog, and every triangle of them is drawn twice (the wet floor's mirror):
  // there they stand a block apart, 29 m deep, so the street still reads built-up for two thirds the cost
  const vStep = N === 3 ? 22 : B + S;
  const vDepth = vStep - 4;
  c.boxes.push(box(-H - F - V, -1, -H - F - V, H + F + V, 0, H + F + V, "floor"));
  // the plaza's corner intersections: -16.5 in a district of any size (the centre block is always at the origin)
  const I = blockRect(H, mid, mid).x0 - S / 2;
  const I0 = I; // the avenue either side of the plaza (-16.5)
  const streets = [I0, -I0];
  const gapHalf = S / 2;
  const facadeRuns = (lo: number, hi: number): [number, number][] => {
    const runs: [number, number][] = [];
    let a = lo;
    for (const sc of streets) {
      runs.push([a, sc - gapHalf]);
      a = sc + gapHalf;
    }
    runs.push([a, hi]);
    return runs;
  };
  for (const [a, b] of facadeRuns(-H - F, H + F)) {
    c.boxes.push(box(a, 0, -H - F, b, 36, -H, "facade"));
    c.boxes.push(box(a, 0, H, b, 36, H + F, "facade"));
  }
  for (const [a, b] of facadeRuns(-H, H)) {
    c.boxes.push(box(-H - F, 0, a, -H, 36, b, "facade"));
    c.boxes.push(box(H, 0, a, H + F, 36, b, "facade"));
  }
  const exits: StreetExit[] = [];
  const vistaLanes: TrafficLane[] = [];
  for (const sc of streets) {
    // gates at the facade line (chain-link, too tall to mantle), one per exit
    c.boxes.push(box(sc - gapHalf, 0, -H - 0.6, sc + gapHalf, 3.2, -H, "gate"));
    c.boxes.push(box(sc - gapHalf, 0, H, sc + gapHalf, 3.2, H + 0.6, "gate"));
    c.boxes.push(box(-H - 0.6, 0, sc - gapHalf, -H, 3.2, sc + gapHalf, "gate"));
    c.boxes.push(box(H, 0, sc - gapHalf, H + 0.6, 3.2, sc + gapHalf, "gate"));
    exits.push({ x: sc, z: -H, dir: "n" }, { x: sc, z: H, dir: "s" }, { x: -H, z: sc, dir: "w" }, { x: H, z: sc, dir: "e" });
    // the vista: road, sidewalks, receding buildings and lamps (decor: render only)
    for (const dir of ["n", "s"] as const) {
      const sgn = dir === "n" ? -1 : 1;
      const z0 = sgn * H;
      const z1 = sgn * (H + F + V);
      c.decor.push(box(sc - 3, -0.05, Math.min(z0, z1), sc + 3, 0.0, Math.max(z0, z1), "vista_road"));
      for (let d = 0; d < F + V; d += vStep) {
        const zz = z0 + sgn * d;
        const h = 22 + ((d * 7) % 30);
        if (d >= F) {
          c.decor.push(box(sc - gapHalf - 14, 0, Math.min(zz, zz + sgn * vDepth), sc - gapHalf, h, Math.max(zz, zz + sgn * vDepth), "vista_bldg"));
          c.decor.push(box(sc + gapHalf, 0, Math.min(zz, zz + sgn * vDepth), sc + gapHalf + 14, h + 8, Math.max(zz, zz + sgn * vDepth), "vista_bldg"));
        }
        c.decor.push(box(sc - gapHalf + 0.5, 0, zz - 0.15, sc - gapHalf + 0.8, 5.2, zz + 0.15, "vista_lamp"));
        c.decor.push(box(sc + gapHalf - 0.8, 0, zz - 0.15, sc + gapHalf - 0.5, 5.2, zz + 0.15, "vista_lamp"));
      }
      vistaLanes.push({ from: v3(sc - 1.5, 0.7, z0 + sgn * 4), to: v3(sc - 1.5, 0.7, z1), speed: 13, count: 5 }, { from: v3(sc + 1.5, 0.7, z1), to: v3(sc + 1.5, 0.7, z0 + sgn * 4), speed: 12, count: 5 });
    }
    for (const dir of ["w", "e"] as const) {
      const sgn = dir === "w" ? -1 : 1;
      const x0 = sgn * H;
      const x1 = sgn * (H + F + V);
      c.decor.push(box(Math.min(x0, x1), -0.05, sc - 3, Math.max(x0, x1), 0.0, sc + 3, "vista_road"));
      for (let d = 0; d < F + V; d += vStep) {
        const xx = x0 + sgn * d;
        const h = 22 + ((d * 11) % 30);
        if (d >= F) {
          c.decor.push(box(Math.min(xx, xx + sgn * vDepth), 0, sc - gapHalf - 14, Math.max(xx, xx + sgn * vDepth), h, sc - gapHalf, "vista_bldg"));
          c.decor.push(box(Math.min(xx, xx + sgn * vDepth), 0, sc + gapHalf, Math.max(xx, xx + sgn * vDepth), h + 8, sc + gapHalf + 14, "vista_bldg"));
        }
        c.decor.push(box(xx - 0.15, 0, sc - gapHalf + 0.5, xx + 0.15, 5.2, sc - gapHalf + 0.8, "vista_lamp"));
        c.decor.push(box(xx - 0.15, 0, sc + gapHalf - 0.8, xx + 0.15, 5.2, sc + gapHalf - 0.5, "vista_lamp"));
      }
      vistaLanes.push({ from: v3(x0 + sgn * 4, 0.7, sc - 1.5), to: v3(x1, 0.7, sc - 1.5), speed: 13, count: 5 }, { from: v3(x1, 0.7, sc + 1.5), to: v3(x0 + sgn * 4, 0.7, sc + 1.5), speed: 12, count: 5 });
    }
  }

  // sidewalks ring every block; curbs are step-height
  for (let bx = 0; bx < N; bx++) {
    for (let bz = 0; bz < N; bz++) {
      const { x0, z0, x1, z1 } = blockRect(H, bx, bz);
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

  // nodes: plaza centre + the plaza's four corner intersections
  const nodes = [
    { id: 1, label: "A", pos: v3(0, 0, 0), links: [2, 3, 4, 5] },
    { id: 2, label: "B", pos: v3(-I, 0, -I), links: [1, 3, 4] },
    { id: 3, label: "C", pos: v3(I, 0, -I), links: [1, 2, 5] },
    { id: 4, label: "D", pos: v3(-I, 0, I), links: [1, 2, 5] },
    { id: 5, label: "E", pos: v3(I, 0, I), links: [1, 3, 4] },
  ];

  // THE RUN: two safe zones at the ends of the walkway street, in the perimeter street; claims on the nodes and at the
  // street midpoints between them, worth more the farther they lie from a gate
  const gateA = spec.walkway === "x" ? v3(-H + S / 2, 0, -I) : v3(-I, 0, -H + S / 2);
  const gateB = spec.walkway === "x" ? v3(H - S / 2, 0, -I) : v3(-I, 0, H - S / 2);
  const zones: ZoneDef[] = [
    { kind: "safe", label: "WEST GATE", pos: gateA, radius: 6 },
    { kind: "safe", label: "EAST GATE", pos: gateB, radius: 6 },
  ];
  const claimSpots: Vec3[] = [...nodes.map((n) => n.pos), v3(0, 0, -I), v3(0, 0, I), v3(-I, 0, 0), v3(I, 0, 0), v3(-I, 0, -H + S / 2), v3(I, 0, H - S / 2)];
  // a 5×5 district has a second ring of streets (J = -49.5): claims at its midpoints, its corners and
  // where it crosses the avenues, so the larger ground carries claims in proportion (27 to 11)
  const J = N >= 5 ? blockRect(H, mid - 1, mid - 1).x0 - S / 2 : null;
  if (J !== null) {
    claimSpots.push(v3(0, 0, J), v3(0, 0, -J), v3(J, 0, 0), v3(-J, 0, 0));
    claimSpots.push(v3(J, 0, J), v3(-J, 0, J), v3(J, 0, -J), v3(-J, 0, -J));
    for (const a of [I, -I]) claimSpots.push(v3(a, 0, J), v3(a, 0, -J), v3(J, 0, a), v3(-J, 0, a));
  }
  // the value steps once per 14 m from a gate in a 3×3 district; the step grows with the district so a
  // larger one's values spread over its whole depth rather than capping a third of the way in
  const step = 14 * k;
  const claims: ClaimDef[] = claimSpots.map((p) => {
    const d = Math.min(Math.hypot(p.x - gateA.x, p.z - gateA.z), Math.hypot(p.x - gateB.x, p.z - gateB.z));
    return { pos: v3(p.x, 0, p.z), value: 1 + Math.min(4, Math.floor(d / step)) };
  }).filter((cl) => !zones.some((z) => Math.hypot(cl.pos.x - z.pos.x, cl.pos.z - z.pos.z) < z.radius + 2));

  // blocks (a 5×5 district's outer ring dressed lean; a 3×3 district has no ring)
  const outerRing = (bx: number, bz: number): boolean => N > 3 && (bx === 0 || bz === 0 || bx === N - 1 || bz === N - 1);
  for (let bz = 0; bz < N; bz++) {
    for (let bx = 0; bx < N; bx++) {
      c.lean = outerRing(bx, bz);
      block(c, bx, bz, spec.blocks[bz * N + bx]!, bx === mid && bz === mid ? nodes[0]!.pos : undefined);
    }
  }
  c.lean = false;

  // elevated walkway along the avenue south of the plaza (z = -I, 16.5, in a district of either size), from
  // perimeter street to perimeter street. Each end has a landing in the
  // perimeter street and a switchback stair descending along that street (so the street stays open beside it);
  // a spur drops into the plaza. Rails along both edges.
  const WY = 4.6;
  const WS = -I; // 16.5: the street centreline it follows
  const LX = H - S + 0.5; // where the landings start: 45.5 in a 3×3 district, 78.5 in a 5×5
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
      const { x0, z0, x1, z1 } = blockRect(H, bx, bz);
      lamp(c, x0 - SW + 0.4, z0 - SW + 0.4);
      lamp(c, x1 + SW - 0.4, z1 + SW - 0.4);
      // cars on the road just off the sidewalk (north and west curbs of each block)
      const lean = outerRing(bx, bz);
      const density = lean ? spec.carDensity * LEAN.cars : spec.carDensity;
      cars(c, x0, z0 - SW - 2.1, x1, z0 - SW - 0.2, true, density);
      cars(c, x0 - SW - 2.1, z0, x0 - SW - 0.2, z1, false, density);
      if (!lean && c.rnd() < 0.6) rail(c, x0 + 4, z1 + SW + 0.3, x0 + 9, z1 + SW + 0.38);
    }
  }
  // lamps along the perimeter streets
  for (let x = -H + 8; x < H; x += 16) {
    lamp(c, x, -H + 1.1);
    lamp(c, x, H - 1.1);
  }

  // city life: sidewalk loops the citizens walk, steam vents, holo ads, the monorail's beam and posts
  const walks: WalkLoop[] = [];
  for (let bx = 0; bx < N; bx++) {
    for (let bz = 0; bz < N; bz++) {
      const { x0, z0, x1, z1 } = blockRect(H, bx, bz);
      walks.push({ x0: x0 - SW / 2, z0: z0 - SW / 2, x1: x1 + SW / 2, z1: z1 + SW / 2 });
    }
  }
  walks.push({ x0: -H + SW / 2, z0: -H + SW / 2, x1: H - SW / 2, z1: H - SW / 2 });
  const vents = [v3(-I - 6, 0, I0 + 3), v3(I + 6, 0, -I0 - 3), v3(4, 0, -9), v3(-30, 0, 2), v3(30, 0, -2), v3(2, 0, 30)];
  const ads: AdPanel[] = [
    { x: 0, y: 6.4, z: 6.6, rotY: 0, w: 5, h: 1.6 }, // over the plaza pylon
    { x: -H - 0.2, y: 20, z: 30, rotY: Math.PI / 2, w: 14, h: 4 },
    { x: 34, y: 22, z: -H - 0.2, rotY: 0, w: 14, h: 4 },
  ];
  if (J !== null) {
    // the outer ring of streets steams too, at the road's edge of each (never on a centreline, where claims lie)
    vents.push(v3(J + 3, 0, 30), v3(-J - 3, 0, -30), v3(-66, 0, J + 3), v3(66, 0, -J - 3));
    // and the two facades without a panel get one, clear of the avenues and the monorail's portals
    ads.push({ x: H + 0.2, y: 21, z: -60, rotY: -Math.PI / 2, w: 14, h: 4 }, { x: -60, y: 20, z: H + 0.2, rotY: Math.PI, w: 14, h: 4 });
  }
  // y is the running surface the car's bogies sit on: the top of the posts' cross-members, which stand
  // 0.1 m proud of the 9.0-9.3 m beam (Stage 674; it was 8.6, the car's centre, with the beam through it)
  const tram: TramLine = spec.walkway === "x" ? { axis: "x", at: WS, y: 9.4, from: -H - F - 30, to: H + F + 30, period: 26 } : { axis: "z", at: WS, y: 9.4, from: -H - F - 30, to: H + F + 30, period: 26 };
  // posts every 24 m in a 3×3 district; a 5×5 district's posts stand one per block, on each block's
  // west sidewalk corner, so none lands in the road of a crossing avenue (24 m would put one at x = 18)
  const postStep = N === 3 ? 24 : B + S;
  for (let p = -H + S; p <= H - S; p += postStep) {
    if (spec.walkway === "x") {
      c.boxes.push(box(p - 0.2, 0, WS - 4.3, p + 0.2, 9.4, WS - 3.9, "post"));
      c.boxes.push(box(p - 0.2, 0, WS + 3.9, p + 0.2, 9.4, WS + 4.3, "post"));
      c.decor.push(box(p - 0.25, 9.0, WS - 4.3, p + 0.25, 9.4, WS + 4.3, "beam"));
    } else {
      c.boxes.push(box(WS - 4.3, 0, p - 0.2, WS - 3.9, 9.4, p + 0.2, "post"));
      c.boxes.push(box(WS + 3.9, 0, p - 0.2, WS + 4.3, 9.4, p + 0.2, "post"));
      c.decor.push(box(WS - 4.3, 9.0, p - 0.25, WS + 4.3, 9.4, p + 0.25, "beam"));
    }
  }
  if (spec.walkway === "x") c.decor.push(box(-H - F - 30, 9.0, WS - 1.0, H + F + 30, 9.3, WS + 1.0, "beam"));
  else c.decor.push(box(WS - 1.0, 9.0, -H - F - 30, WS + 1.0, 9.3, H + F + 30, "beam"));
  // the beam passes through the perimeter facades: notch them visually with a "portal" of neon (decor)
  c.decor.push(...(spec.walkway === "x" ? [box(-H - 0.3, 7.8, WS - 2.2, -H + 0.3, 10.4, WS + 2.2, "portal"), box(H - 0.3, 7.8, WS - 2.2, H + 0.3, 10.4, WS + 2.2, "portal")] : [box(WS - 2.2, 7.8, -H - 0.3, WS + 2.2, 10.4, -H + 0.3, "portal"), box(WS - 2.2, 7.8, H - 0.3, WS + 2.2, 10.4, H + 0.3, "portal")]));

  // big district signage on the perimeter facades
  const big = [`${spec.displayName}`, "VANTAGE INTEGRITY", "LEASE · RENEW · COMPLY", ...spec.words.slice(0, 3)];
  // four per side 26 m apart in a 3×3 district; in a larger one, one centred on each block column, so the
  // longer walls carry more and none hangs over an avenue's gate
  const signsPerSide = N === 3 ? 4 : N;
  for (let i = 0; i < signsPerSide; i++) {
    const t = big[i % big.length]!;
    const p = N === 3 ? -H + 16 + i * 26 : (blockRect(H, i, 0).x0 + blockRect(H, i, 0).x1) / 2;
    addSign(c, t, p, 9 + (i % 2) * 5, -H - 0.05, 0, 12, i % 2 ? COLORS.magenta : COLORS.cyan);
    addSign(c, big[(i + 2) % big.length]!, H + 0.05, 8 + (i % 2) * 6, p, -Math.PI / 2, 12, i % 2 ? COLORS.cyan : COLORS.magenta);
    addSign(c, big[(i + 3) % big.length]!, -p, 10 + (i % 2) * 4, H + 0.05, Math.PI, 12, i % 2 ? COLORS.cyan : COLORS.magenta);
    addSign(c, big[(i + 1) % big.length]!, -H - 0.05, 7 + (i % 2) * 7, -p, Math.PI / 2, 12, i % 2 ? COLORS.magenta : COLORS.cyan);
  }

  // LEASE ROW's warehouses are rooms (Stages 940 and 942). Done last so the roll that dressed the
  // district is the roll it always was; the 3×3 districts are not touched.
  const shop = openLeaseShop(c);
  const wild = openLeaseWild(c);
  const pawn = openLeasePawn(c);
  const yard = openLeaseYard(c);
  const night = openLeaseNight(c);
  const east = openLeaseEast(c);
  const cold = openDocksCold(c);
  const impound = openDepotImpound(c);
  const rack = openRelayRack(c);
  const span = openRelaySpan(c);
  const leech = openRelayLeech(c);
  const tie = openRelayTie(c);
  const luff = openRelayLuff(c);
  const batten = openRelayBatten(c);
  const ledge = openRelayLedge(c);
  const stay = openRelayStay(c);
  const shroud = openRelayShroud(c);
  const spar = openRelaySpar(c);
  const vane = openRelayVane(c);
  const halyard = openRelayHalyard(c);
  const mast = openRelayMast(c);
  const roach = openRelayRoach(c);
  const strut = openRelayStrut(c);
  const clew = openRelayClew(c);
  const spire = openRelaySpire(c);
  const tack = openRelayTack(c);
  const pylon = openRelayPylon(c);
  const lane = openNightLane(c);
  const awning = openNightAwning(c);
  const fringe = openNightFringe(c);
  const tarp = openNightTarp(c);
  const valance = openNightValance(c);
  const hem = openNightHem(c);
  const stall = openNightStall(c);
  const welt = openNightWelt(c);
  const gore = openNightGore(c);
  const hook = openNightHook(c);
  const seam = openNightSeam(c);
  const aisle = openNightAisle(c);
  const dart = openNightDart(c);
  const crate = openNightCrate(c);
  const gusset = openNightGusset(c);
  const booth = openNightBooth(c);
  const pleat = openNightPleat(c);
  const lantern = openNightLantern(c);
  const tuck = openNightTuck(c);
  const berth = openDocksBerth(c);
  const strake = openDocksStrake(c);
  const cleat = openDocksCleat(c);
  const gunwale = openDocksGunwale(c);
  const garboard = openDocksGarboard(c);
  const quay = openDocksQuay(c);
  const bulwark = openDocksBulwark(c);
  const bollard = openDocksBollard(c);
  const fairlead = openDocksFairlead(c);
  const slip = openDocksSlip(c);
  const stem = openDocksStem(c);
  const keel = openDocksKeel(c);
  const fender = openDocksFender(c);
  const hawse = openDocksHawse(c);
  const transom = openDocksTransom(c);
  const wharf = openDocksWharf(c);
  const painter = openDocksPainter(c);
  const bitt = openDocksBitt(c);
  const fluke = openDocksFluke(c);
  const apron = openDepotApron(c);
  const clevis = openDepotClevis(c);
  const ramp = openDepotRamp(c);
  const pawl = openDepotPawl(c);
  const jack = openDepotJack(c);
  const windlass = openDepotWindlass(c);
  const bay = openDepotBay(c);
  const chock = openDepotChock(c);
  const derrick = openDepotDerrick(c);
  const capstan = openDepotCapstan(c);
  const davit = openDepotDavit(c);
  const crest = openDepotCrest(c);
  const winch = openDepotWinch(c);
  const hoist = openDepotHoist(c);
  const dolly = openDepotDolly(c);
  const cradle = openDepotCradle(c);
  const bolster = openDepotBolster(c);
  const skid = openDepotSkid(c);

  // district rig: two big casts on opposite corners. Cyan and magenta carry the city everywhere; an amber
  // district gets its threat colour from the local VANTAGE lights (lots, towers, fences), never the rig.
  const key: LightDef["color"] = spec.cast === "cyan" ? "cyan" : "magenta";
  const alt: LightDef["color"] = spec.cast === "cyan" ? "magenta" : "cyan";
  c.lights.unshift({ x: 30 * k, y: 12, z: 30 * k, color: key, intensity: 80, range: 110 * k }, { x: -30 * k, y: 12, z: -30 * k, color: alt, intensity: 80, range: 110 * k });

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
  if (J !== null) {
    // a 5×5 district: every patrol flies the streets. The two corner loops above cut across the centre
    // row at z = 0, which in a 3×3 district is the plaza's row; here they are replaced by loops over the
    // outer ring of streets, one per quadrant, and the plaza ring and the avenue run are kept
    patrols.length = 0;
    patrols.push(
      [v3(-ring, 4, -ring), v3(I, 4.5, -ring), v3(I, 4.2, J), v3(-ring, 4, J)],
      [v3(ring, 4, ring), v3(-I, 4.5, ring), v3(-I, 4.2, -J), v3(ring, 4, -J)],
      [v3(-I, 6, I), v3(I, 6.5, I), v3(I, 6, -I), v3(-I, 6.5, -I)],
      [v3(-I, 5, -ring), v3(-I, 5.5, ring)],
      [v3(ring, 4, -ring), v3(-I, 4.5, -ring), v3(-I, 4.2, J), v3(ring, 4, J)],
      [v3(-ring, 4, ring), v3(I, 4.5, ring), v3(I, 4.2, -J), v3(-ring, 4, -J)],
      [v3(J, 5, -ring), v3(J, 5.5, ring)],
    );
  }
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
    traffic: [...traffic, ...vistaLanes],
    walks,
    pedestrians: spec.pedestrians,
    tram,
    vents,
    exits,
    ads,
    skylineSeed: spec.seed,
    spawns,
    dummies: [],
    killY: -20,
    wasps,
    mechs,
    nodes,
    zones,
    claims,
    ...(shop ? { shop } : {}),
    ...(wild ? { wild } : {}),
    ...(pawn ? { pawn } : {}),
    ...(yard ? { yard } : {}),
    ...(night ? { night } : {}),
    ...(east ? { east } : {}),
    ...(cold ? { cold } : {}),
    ...(impound ? { impound } : {}),
    ...(rack ? { rack } : {}),
    ...(lane ? { lane } : {}),
    ...(tarp ? { tarp } : {}),
    ...(valance ? { valance } : {}),
    ...(stall ? { stall } : {}),
    ...(hook ? { hook } : {}),
    ...(aisle ? { aisle } : {}),
    ...(dart ? { dart } : {}),
    ...(crate ? { crate } : {}),
    ...(gusset ? { gusset } : {}),
    ...(booth ? { booth } : {}),
    ...(pleat ? { pleat } : {}),
    ...(lantern ? { lantern } : {}),
    ...(tuck ? { tuck } : {}),
    ...(span ? { span } : {}),
    ...(tie ? { tie } : {}),
    ...(ledge ? { ledge } : {}),
    ...(stay ? { stay } : {}),
    ...(spar ? { spar } : {}),
    ...(mast ? { mast } : {}),
    ...(roach ? { roach } : {}),
    ...(strut ? { strut } : {}),
    ...(clew ? { clew } : {}),
    ...(spire ? { spire } : {}),
    ...(tack ? { tack } : {}),
    ...(pylon ? { pylon } : {}),
    ...(berth ? { berth } : {}),
    ...(strake ? { strake } : {}),
    ...(cleat ? { cleat } : {}),
    ...(gunwale ? { gunwale } : {}),
    ...(quay ? { quay } : {}),
    ...(bulwark ? { bulwark } : {}),
    ...(bollard ? { bollard } : {}),
    ...(fairlead ? { fairlead } : {}),
    ...(slip ? { slip } : {}),
    ...(keel ? { keel } : {}),
    ...(wharf ? { wharf } : {}),
    ...(painter ? { painter } : {}),
    ...(bitt ? { bitt } : {}),
    ...(fluke ? { fluke } : {}),
    ...(apron ? { apron } : {}),
    ...(clevis ? { clevis } : {}),
    ...(ramp ? { ramp } : {}),
    ...(jack ? { jack } : {}),
    ...(windlass ? { windlass } : {}),
    ...(pawl ? { pawl } : {}),
    ...(bay ? { bay } : {}),
    ...(chock ? { chock } : {}),
    ...(derrick ? { derrick } : {}),
    ...(capstan ? { capstan } : {}),
    ...(crest ? { crest } : {}),
    ...(hoist ? { hoist } : {}),
    ...(dolly ? { dolly } : {}),
    ...(cradle ? { cradle } : {}),
    ...(skid ? { skid } : {}),
    ...(fender ? { fender } : {}),
    ...(hawse ? { hawse } : {}),
    ...(stem ? { stem } : {}),
    ...(awning ? { awning } : {}),
    ...(fringe ? { fringe } : {}),
    ...(vane ? { vane } : {}),
    ...(halyard ? { halyard } : {}),
    ...(winch ? { winch } : {}),
    ...(bolster ? { bolster } : {}),
    ...(transom ? { transom } : {}),
    ...(hem ? { hem } : {}),
    ...(shroud ? { shroud } : {}),
    ...(welt ? { welt } : {}),
    ...(seam ? { seam } : {}),
    ...(luff ? { luff } : {}),
    ...(leech ? { leech } : {}),
    ...(davit ? { davit } : {}),
    ...(garboard ? { garboard } : {}),
    ...(gore ? { gore } : {}),
    ...(batten ? { batten } : {}),
  };
}

/**
 * The north wall of LEASE ROW is a solid facade thirty metres thick. One opening, clear of the
 * gates, runs through it onto the slab that was already there. A fence above mantle height holds
 * the lot. The gates are not this opening.
 */
function openLeaseWild(c: Ctx): WildEdge | null {
  if (c.spec.id !== "lease_row" || districtGrid(c.spec) !== 5) return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x < -80 && b.max.x > -30);
  if (i < 0) throw new Error("lease row edge: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = -66;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 14;
  const x1 = midX + 14;
  const zFar = zOut - 16;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  c.boxes.push(box(midX - 8, 0, zFar + 4, midX - 6, 0.5, zFar + 6, "planter"));
  c.boxes.push(box(midX + 5, 0, zOut - 6, midX + 7, 0.9, zOut - 4, "crate"));
  addSign(c, "CITY LIMIT", midX, 2.7, inner + 0.06, 0, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 8),
    line: "PAST THE LEASE. THE STREET ENDS HERE.",
  };
}

/**
 * The south wall of LEASE ROW is the same solid facade. One opening, on the east run and clear of
 * the gates, runs through it onto a fenced lot. The north opening is not this one.
 */
function openLeaseYard(c: Ctx): WildEdge | null {
  if (c.spec.id !== "lease_row" || districtGrid(c.spec) !== 5) return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x < 30 && b.max.x > 100);
  if (i < 0) throw new Error("lease row yard: the south wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 66;
  const doorW = 3;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  // a lintel would be a third facade, and a third facade puts the frame over 190k. The cut runs the full height of the wall.
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  const zOut = wall.max.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut + 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut, dx0, yF, zOut + t, "fence"));
  c.boxes.push(box(dx1, 0, zOut, x1, yF, zOut + t, "fence"));
  c.boxes.push(box(x0, 0, zFar - t, x1, yF, zFar, "fence"));
  c.boxes.push(box(x0, 0, zOut, x0 + t, yF, zFar, "fence"));
  c.boxes.push(box(x1 - t, 0, zOut, x1, yF, zFar, "fence"));
  addSign(c, "SOUTH YARD", midX, 2.7, inner - 0.06, Math.PI, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner - 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut + 5),
    line: "SOUTH YARD. THE WALL IS BEHIND YOU.",
  };
}

/**
 * The north stack on DEADLETTER DOCKS is a solid warehouse. Its ground floor is a cold store:
 * metal walls, a hatch onto the south apron, a metal counter. Cash, no gun. The shell uses the
 * step metal the stairs already draw, so the district gains no material.
 */
function openDocksCold(c: Ctx): ShopSpot | null {
  return openWarehouse(c, "deadletter_docks", 1, 0, "COLD STORE", "COLD STORE · THE HATCH IS OPEN. CASH FOR THE MANIFEST. THE GUN STAYS AS IT IS.", "docks cold store", "cyan");
}

/** The south-east stack on REPO DEPOT is the impound counter. Cash for a release, no gun. */
function openDepotImpound(c: Ctx): ShopSpot | null {
  return openWarehouse(c, "repo_depot", 2, 2, "IMPOUND", "IMPOUND · THE COUNTER IS OPEN. CASH FOR THE RELEASE. THE GUN STAYS AS IT IS.", "depot impound", "amber");
}

/**
 * The north-west run of NIGHT MARKET's wall, clear of the two north gates, opens onto a fenced
 * lot. The fence is above a mantle. Nothing out there pays a gun.
 */
function openNightLane(c: Ctx): WildEdge | null {
  if (c.spec.id !== "night_market") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === -84 && b.max.x === -21);
  if (i < 0) throw new Error("night market lane: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = -40;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "OPEN AIR", midX, 2.7, inner + 0.06, 0, 4, COLORS.magenta);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "OPEN AIR. THE MARKET WALL IS BEHIND YOU.",
  };
}

/**
 * The west end of NIGHT MARKET's north wall, past the lane, is still a solid facade.
 * Three metres there open onto a fenced lot. The lane is not this opening. Nothing out there pays a gun.
 */
function openNightAwning(c: Ctx): WildEdge | null {
  if (c.spec.id !== "night_market") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === -84 && b.max.x === -41.5);
  if (i < 0) throw new Error("night market awning: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = -52;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "NORTH AWNING", midX, 2.7, inner + 0.06, 0, 4, COLORS.magenta);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "NORTH AWNING. THE MARKET WALL IS BEHIND YOU.",
  };
}

/**
 * The west run of NIGHT MARKET's north wall, between the north-west gate and the lane, is still
 * a solid facade. Three metres there open onto a fenced lot. The lane is not this opening.
 * Nothing out there pays a gun.
 */
function openNightFringe(c: Ctx): WildEdge | null {
  if (c.spec.id !== "night_market") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === -38.5 && b.max.x === -21);
  if (i < 0) throw new Error("night market fringe: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = -30;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "NORTH FRINGE", midX, 2.7, inner + 0.06, 0, 4, COLORS.magenta);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "NORTH FRINGE. THE MARKET WALL IS BEHIND YOU.",
  };
}

/**
 * The east run of NIGHT MARKET's north wall, clear of the two north gates, opens onto a fenced lot.
 * The fence is above a mantle. The open-air lane is not this opening. Nothing out there pays a gun.
 */
function openNightTarp(c: Ctx): WildEdge | null {
  if (c.spec.id !== "night_market") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 21 && b.max.x === 84);
  if (i < 0) throw new Error("night market tarp: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 52;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "NORTH TARP", midX, 2.7, inner + 0.06, 0, 4, COLORS.magenta);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "NORTH TARP. THE MARKET WALL IS BEHIND YOU.",
  };
}

/**
 * The east run of NIGHT MARKET's north wall, between the north-east gate and the tarp, is still
 * a solid facade. Three metres there open onto a fenced lot. The tarp is not this opening.
 * Nothing out there pays a gun.
 */
/**
 * The east run of NIGHT MARKET's north wall, between the valance and the tarp, is still a solid
 * facade. Three metres there open onto a fenced lot. The tarp is not this opening. The facade past
 * the tarp is the east wall's return, not a street. Nothing out there pays a gun.
 */
function openNightHem(c: Ctx): WildEdge | null {
  if (c.spec.id !== "night_market") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 31.5 && b.max.x === 50.5);
  if (i < 0) throw new Error("night market hem: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 41;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "NORTH HEM", midX, 2.7, inner + 0.06, 0, 4, COLORS.magenta);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "NORTH HEM. THE MARKET WALL IS BEHIND YOU.",
  };
}

function openNightValance(c: Ctx): WildEdge | null {
  if (c.spec.id !== "night_market") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 21 && b.max.x === 50.5);
  if (i < 0) throw new Error("night market valance: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 30;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "NORTH VALANCE", midX, 2.7, inner + 0.06, 0, 4, COLORS.magenta);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "NORTH VALANCE. THE MARKET WALL IS BEHIND YOU.",
  };
}

/**
 * The east run of RELAY HEIGHTS' south wall, clear of the two south gates, opens onto a fenced lot.
 * The fence is above a mantle. The west span is not this opening. Nothing out there pays a gun.
 */
function openRelayTie(c: Ctx): WildEdge | null {
  if (c.spec.id !== "relay_heights") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 21 && b.max.x === 84);
  if (i < 0) throw new Error("relay tie: the south wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 52;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.max.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut + 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut, dx0, yF, zOut + t, "fence"));
  c.boxes.push(box(dx1, 0, zOut, x1, yF, zOut + t, "fence"));
  c.boxes.push(box(x0, 0, zFar - t, x1, yF, zFar, "fence"));
  c.boxes.push(box(x0, 0, zOut, x0 + t, yF, zFar, "fence"));
  c.boxes.push(box(x1 - t, 0, zOut, x1, yF, zFar, "fence"));
  addSign(c, "SOUTH TIE", midX, 2.7, inner - 0.06, Math.PI, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner - 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut + 5),
    line: "SOUTH TIE. THE TOWER WALL IS BEHIND YOU.",
  };
}

/**
 * The east run of RELAY HEIGHTS' south wall, between the south-east gate and the tie, is still
 * a solid facade. Three metres there open onto a fenced lot. The tie is not this opening.
 * The facade past the tie is the east wall's return, not a street. Nothing out there pays a gun.
 */
function openRelayLuff(c: Ctx): WildEdge | null {
  if (c.spec.id !== "relay_heights") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 21 && b.max.x === 50.5);
  if (i < 0) throw new Error("relay luff: the south wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 30;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.max.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut + 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut, dx0, yF, zOut + t, "fence"));
  c.boxes.push(box(dx1, 0, zOut, x1, yF, zOut + t, "fence"));
  c.boxes.push(box(x0, 0, zFar - t, x1, yF, zFar, "fence"));
  c.boxes.push(box(x0, 0, zOut, x0 + t, yF, zFar, "fence"));
  c.boxes.push(box(x1 - t, 0, zOut, x1, yF, zFar, "fence"));
  addSign(c, "SOUTH LUFF", midX, 2.7, inner - 0.06, Math.PI, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner - 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut + 5),
    line: "SOUTH LUFF. THE TOWER WALL IS BEHIND YOU.",
  };
}

/**
 * The east run of RELAY HEIGHTS' south wall, between the south luff and the south tie, is still
 * a solid facade. Three metres there open onto a fenced lot. The luff and the tie are not this
 * opening. The facade past the tie is the east wall's return, not a street. Nothing out there pays a gun.
 */
function openRelayBatten(c: Ctx): WildEdge | null {
  if (c.spec.id !== "relay_heights") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 31.5 && b.max.x === 50.5);
  if (i < 0) throw new Error("relay batten: the south wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 41;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.max.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut + 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut, dx0, yF, zOut + t, "fence"));
  c.boxes.push(box(dx1, 0, zOut, x1, yF, zOut + t, "fence"));
  c.boxes.push(box(x0, 0, zFar - t, x1, yF, zFar, "fence"));
  c.boxes.push(box(x0, 0, zOut, x0 + t, yF, zFar, "fence"));
  c.boxes.push(box(x1 - t, 0, zOut, x1, yF, zFar, "fence"));
  addSign(c, "SOUTH BATTEN", midX, 2.7, inner - 0.06, Math.PI, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner - 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut + 5),
    line: "SOUTH BATTEN. THE TOWER WALL IS BEHIND YOU.",
  };
}

/**
 * The west run of RELAY HEIGHTS' south wall, clear of the two south gates, opens onto a fenced lot.
 * The fence is above a mantle. The cold rack is not this opening. Nothing out there pays a gun.
 */
function openRelaySpan(c: Ctx): WildEdge | null {
  if (c.spec.id !== "relay_heights") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === -84 && b.max.x === -21);
  if (i < 0) throw new Error("relay span: the south wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = -40;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.max.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut + 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut, dx0, yF, zOut + t, "fence"));
  c.boxes.push(box(dx1, 0, zOut, x1, yF, zOut + t, "fence"));
  c.boxes.push(box(x0, 0, zFar - t, x1, yF, zFar, "fence"));
  c.boxes.push(box(x0, 0, zOut, x0 + t, yF, zFar, "fence"));
  c.boxes.push(box(x1 - t, 0, zOut, x1, yF, zFar, "fence"));
  addSign(c, "SOUTH SPAN", midX, 2.7, inner - 0.06, Math.PI, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner - 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut + 5),
    line: "SOUTH SPAN. THE TOWER WALL IS BEHIND YOU.",
  };
}

/**
 * The west run of RELAY HEIGHTS' north wall, clear of the two north gates, opens onto a fenced lot.
 * The fence is above a mantle. The north ledge is not this opening. Nothing out there pays a gun.
 */
/**
 * The west run of RELAY HEIGHTS' south wall, between the south span and the south-west gate,
 * is still a solid facade. Three metres there open onto a fenced lot. The span is not this opening.
 * The facade past the span is the west wall's return, not a street. Nothing out there pays a gun.
 */
function openRelayLeech(c: Ctx): WildEdge | null {
  if (c.spec.id !== "relay_heights") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === -38.5 && b.max.x === -21);
  if (i < 0) throw new Error("relay leech: the south wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = -30;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.max.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut + 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut, dx0, yF, zOut + t, "fence"));
  c.boxes.push(box(dx1, 0, zOut, x1, yF, zOut + t, "fence"));
  c.boxes.push(box(x0, 0, zFar - t, x1, yF, zFar, "fence"));
  c.boxes.push(box(x0, 0, zOut, x0 + t, yF, zFar, "fence"));
  c.boxes.push(box(x1 - t, 0, zOut, x1, yF, zFar, "fence"));
  addSign(c, "SOUTH LEECH", midX, 2.7, inner - 0.06, Math.PI, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner - 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut + 5),
    line: "SOUTH LEECH. THE TOWER WALL IS BEHIND YOU.",
  };
}

function openRelaySpar(c: Ctx): WildEdge | null {
  if (c.spec.id !== "relay_heights") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === -84 && b.max.x === -21);
  if (i < 0) throw new Error("relay spar: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = -40;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "NORTH SPAR", midX, 2.7, inner + 0.06, 0, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "NORTH SPAR. THE TOWER WALL IS BEHIND YOU.",
  };
}

/**
 * The west end of RELAY HEIGHTS' north wall, past the spar, is still a solid facade.
 * Three metres there open onto a fenced lot. The spar is not this opening. Nothing out there pays a gun.
 */
function openRelayVane(c: Ctx): WildEdge | null {
  if (c.spec.id !== "relay_heights") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === -84 && b.max.x === -41.5);
  if (i < 0) throw new Error("relay vane: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = -52;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "NORTH VANE", midX, 2.7, inner + 0.06, 0, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "NORTH VANE. THE TOWER WALL IS BEHIND YOU.",
  };
}

/**
 * The west run of RELAY HEIGHTS' north wall, between the north-west gate and the spar, is still
 * a solid facade. Three metres there open onto a fenced lot. The spar is not this opening.
 * Nothing out there pays a gun.
 */
function openRelayHalyard(c: Ctx): WildEdge | null {
  if (c.spec.id !== "relay_heights") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === -38.5 && b.max.x === -21);
  if (i < 0) throw new Error("relay halyard: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = -30;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "NORTH HALYARD", midX, 2.7, inner + 0.06, 0, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "NORTH HALYARD. THE TOWER WALL IS BEHIND YOU.",
  };
}

/**
 * The east run of RELAY HEIGHTS' north wall, clear of the two north gates, opens onto a fenced lot.
 * The fence is above a mantle. The south span is not this opening. Nothing out there pays a gun.
 */
function openRelayLedge(c: Ctx): WildEdge | null {
  if (c.spec.id !== "relay_heights") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 21 && b.max.x === 84);
  if (i < 0) throw new Error("relay ledge: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 52;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "NORTH LEDGE", midX, 2.7, inner + 0.06, 0, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "NORTH LEDGE. THE TOWER WALL IS BEHIND YOU.",
  };
}

/**
 * The east run of RELAY HEIGHTS' north wall, between the north-east gate and the ledge, is still
 * a solid facade. Three metres there open onto a fenced lot. The ledge is not this opening.
 * Nothing out there pays a gun.
 */
/**
 * The east run of RELAY HEIGHTS' north wall, between the stay and the ledge, is still a solid
 * facade. Three metres there open onto a fenced lot. The ledge is not this opening. The facade past
 * the ledge is the east wall's return, not a street. Nothing out there pays a gun.
 */
function openRelayShroud(c: Ctx): WildEdge | null {
  if (c.spec.id !== "relay_heights") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 31.5 && b.max.x === 50.5);
  if (i < 0) throw new Error("relay shroud: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 41;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "NORTH SHROUD", midX, 2.7, inner + 0.06, 0, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "NORTH SHROUD. THE TOWER WALL IS BEHIND YOU.",
  };
}

function openRelayStay(c: Ctx): WildEdge | null {
  if (c.spec.id !== "relay_heights") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 21 && b.max.x === 50.5);
  if (i < 0) throw new Error("relay stay: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 30;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "NORTH STAY", midX, 2.7, inner + 0.06, 0, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "NORTH STAY. THE TOWER WALL IS BEHIND YOU.",
  };
}

/**
 * The west run of NIGHT MARKET's south wall, clear of the two south gates, opens onto a fenced lot.
 * The fence is above a mantle. The east row is not this opening. Nothing out there pays a gun.
 */
/**
 * The west run of NIGHT MARKET's south wall, between the south hook and the south-west gate,
 * is still a solid facade. Three metres there open onto a fenced lot. The hook is not this opening.
 * The facade past the hook is the west wall's return, not a street. Nothing out there pays a gun.
 */
function openNightSeam(c: Ctx): WildEdge | null {
  if (c.spec.id !== "night_market") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === -38.5 && b.max.x === -21);
  if (i < 0) throw new Error("night market seam: the south wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = -30;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.max.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut + 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut, dx0, yF, zOut + t, "fence"));
  c.boxes.push(box(dx1, 0, zOut, x1, yF, zOut + t, "fence"));
  c.boxes.push(box(x0, 0, zFar - t, x1, yF, zFar, "fence"));
  c.boxes.push(box(x0, 0, zOut, x0 + t, yF, zFar, "fence"));
  c.boxes.push(box(x1 - t, 0, zOut, x1, yF, zFar, "fence"));
  addSign(c, "SOUTH SEAM", midX, 2.7, inner - 0.06, Math.PI, 4, COLORS.magenta);
  return {
    street: v3(midX, 0, inner - 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut + 5),
    line: "SOUTH SEAM. THE MARKET WALL IS BEHIND YOU.",
  };
}

/**
 * The east run of NIGHT MARKET's south wall, between the south welt and the south row, is still
 * a solid facade. Three metres there open onto a fenced lot. The welt and the row are not this
 * opening. The facade past the row is the east wall's return, not a street. Nothing out there pays a gun.
 */
function openNightGore(c: Ctx): WildEdge | null {
  if (c.spec.id !== "night_market") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 31.5 && b.max.x === 50.5);
  if (i < 0) throw new Error("night market gore: the south wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 41;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.max.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut + 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut, dx0, yF, zOut + t, "fence"));
  c.boxes.push(box(dx1, 0, zOut, x1, yF, zOut + t, "fence"));
  c.boxes.push(box(x0, 0, zFar - t, x1, yF, zFar, "fence"));
  c.boxes.push(box(x0, 0, zOut, x0 + t, yF, zFar, "fence"));
  c.boxes.push(box(x1 - t, 0, zOut, x1, yF, zFar, "fence"));
  addSign(c, "SOUTH GORE", midX, 2.7, inner - 0.06, Math.PI, 4, COLORS.magenta);
  return {
    street: v3(midX, 0, inner - 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut + 5),
    line: "SOUTH GORE. THE MARKET WALL IS BEHIND YOU.",
  };
}

function openNightHook(c: Ctx): WildEdge | null {
  if (c.spec.id !== "night_market") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === -84 && b.max.x === -21);
  if (i < 0) throw new Error("night market hook: the south wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = -40;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.max.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut + 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut, dx0, yF, zOut + t, "fence"));
  c.boxes.push(box(dx1, 0, zOut, x1, yF, zOut + t, "fence"));
  c.boxes.push(box(x0, 0, zFar - t, x1, yF, zFar, "fence"));
  c.boxes.push(box(x0, 0, zOut, x0 + t, yF, zFar, "fence"));
  c.boxes.push(box(x1 - t, 0, zOut, x1, yF, zFar, "fence"));
  addSign(c, "SOUTH HOOK", midX, 2.7, inner - 0.06, Math.PI, 4, COLORS.magenta);
  return {
    street: v3(midX, 0, inner - 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut + 5),
    line: "SOUTH HOOK. THE MARKET WALL IS BEHIND YOU.",
  };
}

/**
 * The east run of NIGHT MARKET's south wall, clear of the two south gates, opens onto a fenced lot.
 * The fence is above a mantle. The north lot is not this opening. Nothing out there pays a gun.
 */
function openNightStall(c: Ctx): WildEdge | null {
  if (c.spec.id !== "night_market") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 21 && b.max.x === 84);
  if (i < 0) throw new Error("night market stall: the south wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 52;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.max.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut + 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut, dx0, yF, zOut + t, "fence"));
  c.boxes.push(box(dx1, 0, zOut, x1, yF, zOut + t, "fence"));
  c.boxes.push(box(x0, 0, zFar - t, x1, yF, zFar, "fence"));
  c.boxes.push(box(x0, 0, zOut, x0 + t, yF, zFar, "fence"));
  c.boxes.push(box(x1 - t, 0, zOut, x1, yF, zFar, "fence"));
  addSign(c, "SOUTH ROW", midX, 2.7, inner - 0.06, Math.PI, 4, COLORS.magenta);
  return {
    street: v3(midX, 0, inner - 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut + 5),
    line: "SOUTH ROW. THE MARKET WALL IS BEHIND YOU.",
  };
}

/**
 * The east run of NIGHT MARKET's south wall, between the south-east gate and the row, is still
 * a solid facade. Three metres there open onto a fenced lot. The row is not this opening.
 * The facade past the row is the east wall's return, not a street. Nothing out there pays a gun.
 */
function openNightWelt(c: Ctx): WildEdge | null {
  if (c.spec.id !== "night_market") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 21 && b.max.x === 50.5);
  if (i < 0) throw new Error("night market welt: the south wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 30;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.max.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut + 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut, dx0, yF, zOut + t, "fence"));
  c.boxes.push(box(dx1, 0, zOut, x1, yF, zOut + t, "fence"));
  c.boxes.push(box(x0, 0, zFar - t, x1, yF, zFar, "fence"));
  c.boxes.push(box(x0, 0, zOut, x0 + t, yF, zFar, "fence"));
  c.boxes.push(box(x1 - t, 0, zOut, x1, yF, zFar, "fence"));
  addSign(c, "SOUTH WELT", midX, 2.7, inner - 0.06, Math.PI, 4, COLORS.magenta);
  return {
    street: v3(midX, 0, inner - 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut + 5),
    line: "SOUTH WELT. THE MARKET WALL IS BEHIND YOU.",
  };
}

/**
 * The south-west run of DEADLETTER DOCKS' wall, clear of the two south gates, opens onto a fenced
 * lot. The fence is above a mantle. The cold store is not this opening. Nothing out there pays a gun.
 */
function openDocksBerth(c: Ctx): WildEdge | null {
  if (c.spec.id !== "deadletter_docks") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === -84 && b.max.x === -21);
  if (i < 0) throw new Error("docks berth: the south wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = -40;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.max.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut + 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut, dx0, yF, zOut + t, "fence"));
  c.boxes.push(box(dx1, 0, zOut, x1, yF, zOut + t, "fence"));
  c.boxes.push(box(x0, 0, zFar - t, x1, yF, zFar, "fence"));
  c.boxes.push(box(x0, 0, zOut, x0 + t, yF, zFar, "fence"));
  c.boxes.push(box(x1 - t, 0, zOut, x1, yF, zFar, "fence"));
  addSign(c, "SOUTH PIER", midX, 2.7, inner - 0.06, Math.PI, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner - 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut + 5),
    line: "SOUTH PIER. THE DOCK WALL IS BEHIND YOU.",
  };
}

/**
 * The west run of DEADLETTER DOCKS' south wall, between the south pier and the south-west gate,
 * is still a solid facade. Three metres there open onto a fenced lot. The pier is not this opening.
 * The facade past the pier is the west wall's return, not a street. Nothing out there pays a gun.
 */
function openDocksStrake(c: Ctx): WildEdge | null {
  if (c.spec.id !== "deadletter_docks") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === -38.5 && b.max.x === -21);
  if (i < 0) throw new Error("docks strake: the south wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = -30;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.max.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut + 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut, dx0, yF, zOut + t, "fence"));
  c.boxes.push(box(dx1, 0, zOut, x1, yF, zOut + t, "fence"));
  c.boxes.push(box(x0, 0, zFar - t, x1, yF, zFar, "fence"));
  c.boxes.push(box(x0, 0, zOut, x0 + t, yF, zFar, "fence"));
  c.boxes.push(box(x1 - t, 0, zOut, x1, yF, zFar, "fence"));
  addSign(c, "SOUTH STRAKE", midX, 2.7, inner - 0.06, Math.PI, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner - 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut + 5),
    line: "SOUTH STRAKE. THE DOCK WALL IS BEHIND YOU.",
  };
}

/**
 * The south run of NIGHT MARKET's east wall, clear of the two east gates, opens onto a fenced lot.
 * The fence is above a mantle. The north aisle is not this opening. Nothing out there pays a gun.
 */
function openNightCrate(c: Ctx): WildEdge | null {
  if (c.spec.id !== "night_market") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === 21 && b.max.z === 54);
  if (i < 0) throw new Error("night market crate: the east wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = 40;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.max.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut + 10;
  const t = 0.35;
  c.boxes.push(box(xOut, 0, z0, xOut + t, yF, dz0, "fence"));
  c.boxes.push(box(xOut, 0, dz1, xOut + t, yF, z1, "fence"));
  c.boxes.push(box(xFar - t, 0, z0, xFar, yF, z1, "fence"));
  c.boxes.push(box(xOut, 0, z0, xFar, yF, z0 + t, "fence"));
  c.boxes.push(box(xOut, 0, z1 - t, xFar, yF, z1, "fence"));
  addSign(c, "EAST CRATE", inner - 0.06, 2.7, midZ, -Math.PI / 2, 4, COLORS.magenta);
  return {
    street: v3(inner - 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut + 5, 0, midZ),
    line: "EAST CRATE. THE MARKET WALL IS BEHIND YOU.",
  };
}

/**
 * The south run of NIGHT MARKET's east wall, between the south-east gate and the crate, is still
 * a solid facade. Three metres there open onto a fenced lot. The crate is not this opening.
 * The facade past the crate is the south wall's return, not a street. Nothing out there pays a gun.
 */
function openNightGusset(c: Ctx): WildEdge | null {
  if (c.spec.id !== "night_market") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === 21 && b.max.z === 38.5);
  if (i < 0) throw new Error("night market gusset: the east wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = 30;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.max.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut + 10;
  const t = 0.35;
  c.boxes.push(box(xOut, 0, z0, xOut + t, yF, dz0, "fence"));
  c.boxes.push(box(xOut, 0, dz1, xOut + t, yF, z1, "fence"));
  c.boxes.push(box(xFar - t, 0, z0, xFar, yF, z1, "fence"));
  c.boxes.push(box(xOut, 0, z0, xFar, yF, z0 + t, "fence"));
  c.boxes.push(box(xOut, 0, z1 - t, xFar, yF, z1, "fence"));
  addSign(c, "EAST GUSSET", inner - 0.06, 2.7, midZ, -Math.PI / 2, 4, COLORS.magenta);
  return {
    street: v3(inner - 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut + 5, 0, midZ),
    line: "EAST GUSSET. THE MARKET WALL IS BEHIND YOU.",
  };
}

/**
 * The north run of NIGHT MARKET's east wall, between the aisle and the north-east gate, opens onto a fenced lot.
 * The fence is above a mantle. The aisle is not this opening. Nothing out there pays a gun.
 */
function openNightDart(c: Ctx): WildEdge | null {
  if (c.spec.id !== "night_market") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === -38.5 && b.max.z === -21);
  if (i < 0) throw new Error("night market dart: the east wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = -30;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.max.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut + 10;
  const t = 0.35;
  c.boxes.push(box(xOut, 0, z0, xOut + t, yF, dz0, "fence"));
  c.boxes.push(box(xOut, 0, dz1, xOut + t, yF, z1, "fence"));
  c.boxes.push(box(xFar - t, 0, z0, xFar, yF, z1, "fence"));
  c.boxes.push(box(xOut, 0, z0, xFar, yF, z0 + t, "fence"));
  c.boxes.push(box(xOut, 0, z1 - t, xFar, yF, z1, "fence"));
  addSign(c, "EAST DART", inner - 0.06, 2.7, midZ, -Math.PI / 2, 4, COLORS.magenta);
  return {
    street: v3(inner - 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut + 5, 0, midZ),
    line: "EAST DART. THE MARKET WALL IS BEHIND YOU.",
  };
}

/**
 * The north run of NIGHT MARKET's east wall, clear of the two east gates, opens onto a fenced lot.
 * The fence is above a mantle. The south row is not this opening. Nothing out there pays a gun.
 */
function openNightAisle(c: Ctx): WildEdge | null {
  if (c.spec.id !== "night_market") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === -54 && b.max.z === -21);
  if (i < 0) throw new Error("night market aisle: the east wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = -40;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.max.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut + 10;
  const t = 0.35;
  c.boxes.push(box(xOut, 0, z0, xOut + t, yF, dz0, "fence"));
  c.boxes.push(box(xOut, 0, dz1, xOut + t, yF, z1, "fence"));
  c.boxes.push(box(xFar - t, 0, z0, xFar, yF, z1, "fence"));
  c.boxes.push(box(xOut, 0, z0, xFar, yF, z0 + t, "fence"));
  c.boxes.push(box(xOut, 0, z1 - t, xFar, yF, z1, "fence"));
  addSign(c, "EAST AISLE", inner - 0.06, 2.7, midZ, -Math.PI / 2, 4, COLORS.magenta);
  return {
    street: v3(inner - 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut + 5, 0, midZ),
    line: "EAST AISLE. THE MARKET WALL IS BEHIND YOU.",
  };
}

/**
 * The south run of RELAY HEIGHTS' east wall, clear of the two east gates, opens onto a fenced lot.
 * The fence is above a mantle. The north mast is not this opening. Nothing out there pays a gun.
 */
function openRelayStrut(c: Ctx): WildEdge | null {
  if (c.spec.id !== "relay_heights") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === 21 && b.max.z === 54);
  if (i < 0) throw new Error("relay strut: the east wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = 40;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.max.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut + 10;
  const t = 0.35;
  c.boxes.push(box(xOut, 0, z0, xOut + t, yF, dz0, "fence"));
  c.boxes.push(box(xOut, 0, dz1, xOut + t, yF, z1, "fence"));
  c.boxes.push(box(xFar - t, 0, z0, xFar, yF, z1, "fence"));
  c.boxes.push(box(xOut, 0, z0, xFar, yF, z0 + t, "fence"));
  c.boxes.push(box(xOut, 0, z1 - t, xFar, yF, z1, "fence"));
  addSign(c, "EAST STRUT", inner - 0.06, 2.7, midZ, -Math.PI / 2, 4, COLORS.cyan);
  return {
    street: v3(inner - 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut + 5, 0, midZ),
    line: "EAST STRUT. THE TOWER WALL IS BEHIND YOU.",
  };
}

/**
 * The south run of RELAY HEIGHTS' east wall, between the south-east gate and the strut, is still
 * a solid facade. Three metres there open onto a fenced lot. The strut is not this opening.
 * The facade past the strut is the south wall's return, not a street. Nothing out there pays a gun.
 */
function openRelayClew(c: Ctx): WildEdge | null {
  if (c.spec.id !== "relay_heights") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === 21 && b.max.z === 38.5);
  if (i < 0) throw new Error("relay clew: the east wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = 30;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.max.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut + 10;
  const t = 0.35;
  c.boxes.push(box(xOut, 0, z0, xOut + t, yF, dz0, "fence"));
  c.boxes.push(box(xOut, 0, dz1, xOut + t, yF, z1, "fence"));
  c.boxes.push(box(xFar - t, 0, z0, xFar, yF, z1, "fence"));
  c.boxes.push(box(xOut, 0, z0, xFar, yF, z0 + t, "fence"));
  c.boxes.push(box(xOut, 0, z1 - t, xFar, yF, z1, "fence"));
  addSign(c, "EAST CLEW", inner - 0.06, 2.7, midZ, -Math.PI / 2, 4, COLORS.cyan);
  return {
    street: v3(inner - 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut + 5, 0, midZ),
    line: "EAST CLEW. THE TOWER WALL IS BEHIND YOU.",
  };
}

/**
 * The north run of RELAY HEIGHTS' east wall, between the mast and the north-east gate, opens onto a fenced lot.
 * The fence is above a mantle. The mast is not this opening. Nothing out there pays a gun.
 */
function openRelayRoach(c: Ctx): WildEdge | null {
  if (c.spec.id !== "relay_heights") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === -38.5 && b.max.z === -21);
  if (i < 0) throw new Error("relay roach: the east wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = -30;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.max.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut + 10;
  const t = 0.35;
  c.boxes.push(box(xOut, 0, z0, xOut + t, yF, dz0, "fence"));
  c.boxes.push(box(xOut, 0, dz1, xOut + t, yF, z1, "fence"));
  c.boxes.push(box(xFar - t, 0, z0, xFar, yF, z1, "fence"));
  c.boxes.push(box(xOut, 0, z0, xFar, yF, z0 + t, "fence"));
  c.boxes.push(box(xOut, 0, z1 - t, xFar, yF, z1, "fence"));
  addSign(c, "EAST ROACH", inner - 0.06, 2.7, midZ, -Math.PI / 2, 4, COLORS.cyan);
  return {
    street: v3(inner - 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut + 5, 0, midZ),
    line: "EAST ROACH. THE TOWER WALL IS BEHIND YOU.",
  };
}

/**
 * The north run of RELAY HEIGHTS' east wall, clear of the two east gates, opens onto a fenced lot.
 * The fence is above a mantle. The north ledge is not this opening. Nothing out there pays a gun.
 */
function openRelayMast(c: Ctx): WildEdge | null {
  if (c.spec.id !== "relay_heights") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === -54 && b.max.z === -21);
  if (i < 0) throw new Error("relay mast: the east wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = -40;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.max.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut + 10;
  const t = 0.35;
  c.boxes.push(box(xOut, 0, z0, xOut + t, yF, dz0, "fence"));
  c.boxes.push(box(xOut, 0, dz1, xOut + t, yF, z1, "fence"));
  c.boxes.push(box(xFar - t, 0, z0, xFar, yF, z1, "fence"));
  c.boxes.push(box(xOut, 0, z0, xFar, yF, z0 + t, "fence"));
  c.boxes.push(box(xOut, 0, z1 - t, xFar, yF, z1, "fence"));
  addSign(c, "EAST MAST", inner - 0.06, 2.7, midZ, -Math.PI / 2, 4, COLORS.cyan);
  return {
    street: v3(inner - 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut + 5, 0, midZ),
    line: "EAST MAST. THE TOWER WALL IS BEHIND YOU.",
  };
}

/**
 * The north run of RELAY HEIGHTS' west wall, clear of the two west gates, opens onto a fenced lot.
 * The fence is above a mantle. The south spire is not this opening. Nothing out there pays a gun.
 */
function openRelayPylon(c: Ctx): WildEdge | null {
  if (c.spec.id !== "relay_heights") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === -54 && b.max.z === -21);
  if (i < 0) throw new Error("relay pylon: the west wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = -40;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.min.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut - 10;
  const t = 0.35;
  c.boxes.push(box(xOut - t, 0, z0, xOut, yF, dz0, "fence"));
  c.boxes.push(box(xOut - t, 0, dz1, xOut, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xFar + t, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xOut, yF, z0 + t, "fence"));
  c.boxes.push(box(xFar, 0, z1 - t, xOut, yF, z1, "fence"));
  addSign(c, "WEST PYLON", inner + 0.06, 2.7, midZ, Math.PI / 2, 4, COLORS.cyan);
  return {
    street: v3(inner + 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut - 5, 0, midZ),
    line: "WEST PYLON. THE TOWER WALL IS BEHIND YOU.",
  };
}

/**
 * The south run of RELAY HEIGHTS' west wall, clear of the two west gates, opens onto a fenced lot.
 * The fence is above a mantle. The east mast is not this opening. Nothing out there pays a gun.
 */
function openRelaySpire(c: Ctx): WildEdge | null {
  if (c.spec.id !== "relay_heights") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === 21 && b.max.z === 54);
  if (i < 0) throw new Error("relay spire: the west wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = 40;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.min.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut - 10;
  const t = 0.35;
  c.boxes.push(box(xOut - t, 0, z0, xOut, yF, dz0, "fence"));
  c.boxes.push(box(xOut - t, 0, dz1, xOut, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xFar + t, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xOut, yF, z0 + t, "fence"));
  c.boxes.push(box(xFar, 0, z1 - t, xOut, yF, z1, "fence"));
  addSign(c, "WEST SPIRE", inner + 0.06, 2.7, midZ, Math.PI / 2, 4, COLORS.cyan);
  return {
    street: v3(inner + 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut - 5, 0, midZ),
    line: "WEST SPIRE. THE TOWER WALL IS BEHIND YOU.",
  };
}

/**
 * The south run of RELAY HEIGHTS' west wall, between the spire and the south-west gate, opens onto a fenced lot.
 * The fence is above a mantle. The spire is not this opening. Nothing out there pays a gun.
 */
function openRelayTack(c: Ctx): WildEdge | null {
  if (c.spec.id !== "relay_heights") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === 21 && b.max.z === 38.5);
  if (i < 0) throw new Error("relay tack: the west wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = 30;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.min.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut - 10;
  const t = 0.35;
  c.boxes.push(box(xOut - t, 0, z0, xOut, yF, dz0, "fence"));
  c.boxes.push(box(xOut - t, 0, dz1, xOut, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xFar + t, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xOut, yF, z0 + t, "fence"));
  c.boxes.push(box(xFar, 0, z1 - t, xOut, yF, z1, "fence"));
  addSign(c, "WEST TACK", inner + 0.06, 2.7, midZ, Math.PI / 2, 4, COLORS.cyan);
  return {
    street: v3(inner + 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut - 5, 0, midZ),
    line: "WEST TACK. THE TOWER WALL IS BEHIND YOU.",
  };
}

/**
 * The north run of NIGHT MARKET's west wall, clear of the two west gates, opens onto a fenced lot.
 * The fence is above a mantle. The south booth is not this opening. Nothing out there pays a gun.
 */
function openNightLantern(c: Ctx): WildEdge | null {
  if (c.spec.id !== "night_market") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === -54 && b.max.z === -21);
  if (i < 0) throw new Error("night market lantern: the west wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = -40;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.min.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut - 10;
  const t = 0.35;
  c.boxes.push(box(xOut - t, 0, z0, xOut, yF, dz0, "fence"));
  c.boxes.push(box(xOut - t, 0, dz1, xOut, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xFar + t, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xOut, yF, z0 + t, "fence"));
  c.boxes.push(box(xFar, 0, z1 - t, xOut, yF, z1, "fence"));
  addSign(c, "WEST LANTERN", inner + 0.06, 2.7, midZ, Math.PI / 2, 4, COLORS.magenta);
  return {
    street: v3(inner + 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut - 5, 0, midZ),
    line: "WEST LANTERN. THE MARKET WALL IS BEHIND YOU.",
  };
}

/**
 * The north run of NIGHT MARKET's west wall, between the lantern and the north-west gate, opens onto a fenced lot.
 * The fence is above a mantle. The lantern is not this opening. Nothing out there pays a gun.
 */
function openNightTuck(c: Ctx): WildEdge | null {
  if (c.spec.id !== "night_market") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === -38.5 && b.max.z === -21);
  if (i < 0) throw new Error("night market tuck: the west wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = -30;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.min.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut - 10;
  const t = 0.35;
  c.boxes.push(box(xOut - t, 0, z0, xOut, yF, dz0, "fence"));
  c.boxes.push(box(xOut - t, 0, dz1, xOut, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xFar + t, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xOut, yF, z0 + t, "fence"));
  c.boxes.push(box(xFar, 0, z1 - t, xOut, yF, z1, "fence"));
  addSign(c, "WEST TUCK", inner + 0.06, 2.7, midZ, Math.PI / 2, 4, COLORS.magenta);
  return {
    street: v3(inner + 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut - 5, 0, midZ),
    line: "WEST TUCK. THE MARKET WALL IS BEHIND YOU.",
  };
}

/**
 * The south run of NIGHT MARKET's west wall, clear of the two west gates, opens onto a fenced lot.
 * The fence is above a mantle. The east aisle is not this opening. Nothing out there pays a gun.
 */
function openNightBooth(c: Ctx): WildEdge | null {
  if (c.spec.id !== "night_market") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === 21 && b.max.z === 54);
  if (i < 0) throw new Error("night market booth: the west wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = 40;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.min.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut - 10;
  const t = 0.35;
  c.boxes.push(box(xOut - t, 0, z0, xOut, yF, dz0, "fence"));
  c.boxes.push(box(xOut - t, 0, dz1, xOut, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xFar + t, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xOut, yF, z0 + t, "fence"));
  c.boxes.push(box(xFar, 0, z1 - t, xOut, yF, z1, "fence"));
  addSign(c, "WEST BOOTH", inner + 0.06, 2.7, midZ, Math.PI / 2, 4, COLORS.magenta);
  return {
    street: v3(inner + 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut - 5, 0, midZ),
    line: "WEST BOOTH. THE MARKET WALL IS BEHIND YOU.",
  };
}

/**
 * The south run of NIGHT MARKET's west wall, between the booth and the south-west gate, opens onto a fenced lot.
 * The fence is above a mantle. The booth is not this opening. Nothing out there pays a gun.
 */
function openNightPleat(c: Ctx): WildEdge | null {
  if (c.spec.id !== "night_market") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === 21 && b.max.z === 38.5);
  if (i < 0) throw new Error("night market pleat: the west wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = 30;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.min.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut - 10;
  const t = 0.35;
  c.boxes.push(box(xOut - t, 0, z0, xOut, yF, dz0, "fence"));
  c.boxes.push(box(xOut - t, 0, dz1, xOut, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xFar + t, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xOut, yF, z0 + t, "fence"));
  c.boxes.push(box(xFar, 0, z1 - t, xOut, yF, z1, "fence"));
  addSign(c, "WEST PLEAT", inner + 0.06, 2.7, midZ, Math.PI / 2, 4, COLORS.magenta);
  return {
    street: v3(inner + 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut - 5, 0, midZ),
    line: "WEST PLEAT. THE MARKET WALL IS BEHIND YOU.",
  };
}

/**
 * The west run of DEADLETTER DOCKS' north wall, clear of the two north gates, opens onto a fenced
 * lot. The fence is above a mantle. The east quay is not this opening. Nothing out there pays a gun.
 */
function openDocksSlip(c: Ctx): WildEdge | null {
  if (c.spec.id !== "deadletter_docks") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === -84 && b.max.x === -21);
  if (i < 0) throw new Error("docks slip: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = -40;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "NORTH SLIP", midX, 2.7, inner + 0.06, 0, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "NORTH SLIP. THE DOCK WALL IS BEHIND YOU.",
  };
}

/**
 * The west end of DEADLETTER DOCKS' north wall, past the slip, is still a solid facade.
 * Three metres there open onto a fenced lot. The slip is not this opening. Nothing out there pays a gun.
 */
function openDocksStem(c: Ctx): WildEdge | null {
  if (c.spec.id !== "deadletter_docks") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === -84 && b.max.x === -41.5);
  if (i < 0) throw new Error("docks stem: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = -52;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "NORTH STEM", midX, 2.7, inner + 0.06, 0, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "NORTH STEM. THE DOCK WALL IS BEHIND YOU.",
  };
}

/**
 * The east run of DEADLETTER DOCKS' north wall, between the north-east gate and the keel, is still
 * a solid facade. Three metres there open onto a fenced lot. The keel is not this opening.
 * Nothing out there pays a gun.
 */
function openDocksFender(c: Ctx): WildEdge | null {
  if (c.spec.id !== "deadletter_docks") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 21 && b.max.x === 50.5);
  if (i < 0) throw new Error("docks fender: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 30;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "NORTH FENDER", midX, 2.7, inner + 0.06, 0, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "NORTH FENDER. THE DOCK WALL IS BEHIND YOU.",
  };
}

/**
 * The west run of DEADLETTER DOCKS' north wall, between the north-west gate and the slip, is still
 * a solid facade. Three metres there open onto a fenced lot. The slip is not this opening.
 * Nothing out there pays a gun.
 */
/**
 * The east run of DEADLETTER DOCKS' north wall, between the fender and the keel, is still a solid
 * facade. Three metres there open onto a fenced lot. The keel is not this opening. The facade past
 * the keel is the east wall's return, not a street. Nothing out there pays a gun.
 */
function openDocksTransom(c: Ctx): WildEdge | null {
  if (c.spec.id !== "deadletter_docks") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 31.5 && b.max.x === 50.5);
  if (i < 0) throw new Error("docks transom: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 41;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "NORTH TRANSOM", midX, 2.7, inner + 0.06, 0, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "NORTH TRANSOM. THE DOCK WALL IS BEHIND YOU.",
  };
}

function openDocksHawse(c: Ctx): WildEdge | null {
  if (c.spec.id !== "deadletter_docks") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === -38.5 && b.max.x === -21);
  if (i < 0) throw new Error("docks hawse: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = -30;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "NORTH HAWSE", midX, 2.7, inner + 0.06, 0, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "NORTH HAWSE. THE DOCK WALL IS BEHIND YOU.",
  };
}

/**
 * The east run of DEADLETTER DOCKS' north wall, clear of the two north gates, opens onto a fenced lot.
 * The fence is above a mantle. The north slip is not this opening. Nothing out there pays a gun.
 */
function openDocksKeel(c: Ctx): WildEdge | null {
  if (c.spec.id !== "deadletter_docks") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 21 && b.max.x === 84);
  if (i < 0) throw new Error("docks keel: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 52;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "NORTH KEEL", midX, 2.7, inner + 0.06, 0, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "NORTH KEEL. THE DOCK WALL IS BEHIND YOU.",
  };
}

/**
 * The east run of DEADLETTER DOCKS' south wall, clear of the two south gates, opens onto a fenced lot.
 * The fence is above a mantle. The south pier is not this opening. Nothing out there pays a gun.
 */
function openDocksCleat(c: Ctx): WildEdge | null {
  if (c.spec.id !== "deadletter_docks") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 21 && b.max.x === 84);
  if (i < 0) throw new Error("docks cleat: the south wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 52;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.max.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut + 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut, dx0, yF, zOut + t, "fence"));
  c.boxes.push(box(dx1, 0, zOut, x1, yF, zOut + t, "fence"));
  c.boxes.push(box(x0, 0, zFar - t, x1, yF, zFar, "fence"));
  c.boxes.push(box(x0, 0, zOut, x0 + t, yF, zFar, "fence"));
  c.boxes.push(box(x1 - t, 0, zOut, x1, yF, zFar, "fence"));
  addSign(c, "SOUTH CLEAT", midX, 2.7, inner - 0.06, Math.PI, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner - 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut + 5),
    line: "SOUTH CLEAT. THE DOCK WALL IS BEHIND YOU.",
  };
}

/**
 * The east run of DEADLETTER DOCKS' south wall, between the south-east gate and the cleat, is still
 * a solid facade. Three metres there open onto a fenced lot. The cleat is not this opening.
 * The facade past the cleat is the east wall's return, not a street. Nothing out there pays a gun.
 */
function openDocksGunwale(c: Ctx): WildEdge | null {
  if (c.spec.id !== "deadletter_docks") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 21 && b.max.x === 50.5);
  if (i < 0) throw new Error("docks gunwale: the south wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 30;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.max.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut + 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut, dx0, yF, zOut + t, "fence"));
  c.boxes.push(box(dx1, 0, zOut, x1, yF, zOut + t, "fence"));
  c.boxes.push(box(x0, 0, zFar - t, x1, yF, zFar, "fence"));
  c.boxes.push(box(x0, 0, zOut, x0 + t, yF, zFar, "fence"));
  c.boxes.push(box(x1 - t, 0, zOut, x1, yF, zFar, "fence"));
  addSign(c, "SOUTH GUNWALE", midX, 2.7, inner - 0.06, Math.PI, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner - 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut + 5),
    line: "SOUTH GUNWALE. THE DOCK WALL IS BEHIND YOU.",
  };
}

/**
 * The east run of DEADLETTER DOCKS' south wall, between the south gunwale and the south cleat, is
 * still a solid facade. Three metres there open onto a fenced lot. The gunwale and the cleat are
 * not this opening. The facade past the cleat is the east wall's return, not a street. Nothing out
 * there pays a gun.
 */
function openDocksGarboard(c: Ctx): WildEdge | null {
  if (c.spec.id !== "deadletter_docks") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 31.5 && b.max.x === 50.5);
  if (i < 0) throw new Error("docks garboard: the south wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 41;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.max.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut + 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut, dx0, yF, zOut + t, "fence"));
  c.boxes.push(box(dx1, 0, zOut, x1, yF, zOut + t, "fence"));
  c.boxes.push(box(x0, 0, zFar - t, x1, yF, zFar, "fence"));
  c.boxes.push(box(x0, 0, zOut, x0 + t, yF, zFar, "fence"));
  c.boxes.push(box(x1 - t, 0, zOut, x1, yF, zFar, "fence"));
  addSign(c, "SOUTH GARBOARD", midX, 2.7, inner - 0.06, Math.PI, 4, COLORS.cyan);
  return {
    street: v3(midX, 0, inner - 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut + 5),
    line: "SOUTH GARBOARD. THE DOCK WALL IS BEHIND YOU.",
  };
}

/**
 * The south run of DEADLETTER DOCKS' east wall, clear of the two east gates, opens onto a fenced lot.
 * The fence is above a mantle. The north quay is not this opening. Nothing out there pays a gun.
 */
function openDocksBollard(c: Ctx): WildEdge | null {
  if (c.spec.id !== "deadletter_docks") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === 21 && b.max.z === 54);
  if (i < 0) throw new Error("docks bollard: the east wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = 40;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.max.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut + 10;
  const t = 0.35;
  c.boxes.push(box(xOut, 0, z0, xOut + t, yF, dz0, "fence"));
  c.boxes.push(box(xOut, 0, dz1, xOut + t, yF, z1, "fence"));
  c.boxes.push(box(xFar - t, 0, z0, xFar, yF, z1, "fence"));
  c.boxes.push(box(xOut, 0, z0, xFar, yF, z0 + t, "fence"));
  c.boxes.push(box(xOut, 0, z1 - t, xFar, yF, z1, "fence"));
  addSign(c, "EAST BOLLARD", inner - 0.06, 2.7, midZ, -Math.PI / 2, 4, COLORS.cyan);
  return {
    street: v3(inner - 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut + 5, 0, midZ),
    line: "EAST BOLLARD. THE DOCK WALL IS BEHIND YOU.",
  };
}

/**
 * The south run of DEADLETTER DOCKS' east wall, between the south-east gate and the bollard, is still
 * a solid facade. Three metres there open onto a fenced lot. The bollard is not this opening.
 * The facade past the bollard is the south wall's return, not a street. Nothing out there pays a gun.
 */
function openDocksFairlead(c: Ctx): WildEdge | null {
  if (c.spec.id !== "deadletter_docks") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === 21 && b.max.z === 38.5);
  if (i < 0) throw new Error("docks fairlead: the east wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = 30;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.max.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut + 10;
  const t = 0.35;
  c.boxes.push(box(xOut, 0, z0, xOut + t, yF, dz0, "fence"));
  c.boxes.push(box(xOut, 0, dz1, xOut + t, yF, z1, "fence"));
  c.boxes.push(box(xFar - t, 0, z0, xFar, yF, z1, "fence"));
  c.boxes.push(box(xOut, 0, z0, xFar, yF, z0 + t, "fence"));
  c.boxes.push(box(xOut, 0, z1 - t, xFar, yF, z1, "fence"));
  addSign(c, "EAST FAIRLEAD", inner - 0.06, 2.7, midZ, -Math.PI / 2, 4, COLORS.cyan);
  return {
    street: v3(inner - 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut + 5, 0, midZ),
    line: "EAST FAIRLEAD. THE DOCK WALL IS BEHIND YOU.",
  };
}

/**
 * The north run of DEADLETTER DOCKS' east wall, clear of the two east gates, opens onto a fenced lot.
 * The fence is above a mantle. The south pier is not this opening. Nothing out there pays a gun.
 */
function openDocksQuay(c: Ctx): WildEdge | null {
  if (c.spec.id !== "deadletter_docks") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === -54 && b.max.z === -21);
  if (i < 0) throw new Error("docks quay: the east wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = -40;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.max.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut + 10;
  const t = 0.35;
  c.boxes.push(box(xOut, 0, z0, xOut + t, yF, dz0, "fence"));
  c.boxes.push(box(xOut, 0, dz1, xOut + t, yF, z1, "fence"));
  c.boxes.push(box(xFar - t, 0, z0, xFar, yF, z1, "fence"));
  c.boxes.push(box(xOut, 0, z0, xFar, yF, z0 + t, "fence"));
  c.boxes.push(box(xOut, 0, z1 - t, xFar, yF, z1, "fence"));
  addSign(c, "EAST QUAY", inner - 0.06, 2.7, midZ, -Math.PI / 2, 4, COLORS.cyan);
  return {
    street: v3(inner - 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut + 5, 0, midZ),
    line: "EAST QUAY. THE DOCK WALL IS BEHIND YOU.",
  };
}

/**
 * The north run of DEADLETTER DOCKS' east wall, between the north-east gate and the quay, is still
 * a solid facade. Three metres there open onto a fenced lot. The quay is not this opening.
 * The facade past the quay is the north wall's return, not a street. Nothing out there pays a gun.
 */
function openDocksBulwark(c: Ctx): WildEdge | null {
  if (c.spec.id !== "deadletter_docks") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === -38.5 && b.max.z === -21);
  if (i < 0) throw new Error("docks bulwark: the east wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = -30;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.max.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut + 10;
  const t = 0.35;
  c.boxes.push(box(xOut, 0, z0, xOut + t, yF, dz0, "fence"));
  c.boxes.push(box(xOut, 0, dz1, xOut + t, yF, z1, "fence"));
  c.boxes.push(box(xFar - t, 0, z0, xFar, yF, z1, "fence"));
  c.boxes.push(box(xOut, 0, z0, xFar, yF, z0 + t, "fence"));
  c.boxes.push(box(xOut, 0, z1 - t, xFar, yF, z1, "fence"));
  addSign(c, "EAST BULWARK", inner - 0.06, 2.7, midZ, -Math.PI / 2, 4, COLORS.cyan);
  return {
    street: v3(inner - 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut + 5, 0, midZ),
    line: "EAST BULWARK. THE DOCK WALL IS BEHIND YOU.",
  };
}

/**
 * The north run of DEADLETTER DOCKS' west wall, clear of the two west gates, opens onto a fenced lot.
 * The fence is above a mantle. The south wharf is not this opening. Nothing out there pays a gun.
 */
function openDocksBitt(c: Ctx): WildEdge | null {
  if (c.spec.id !== "deadletter_docks") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === -54 && b.max.z === -21);
  if (i < 0) throw new Error("docks bitt: the west wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = -40;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.min.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut - 10;
  const t = 0.35;
  c.boxes.push(box(xOut - t, 0, z0, xOut, yF, dz0, "fence"));
  c.boxes.push(box(xOut - t, 0, dz1, xOut, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xFar + t, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xOut, yF, z0 + t, "fence"));
  c.boxes.push(box(xFar, 0, z1 - t, xOut, yF, z1, "fence"));
  addSign(c, "WEST BITT", inner + 0.06, 2.7, midZ, Math.PI / 2, 4, COLORS.cyan);
  return {
    street: v3(inner + 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut - 5, 0, midZ),
    line: "WEST BITT. THE DOCK WALL IS BEHIND YOU.",
  };
}

/**
 * The north run of DEADLETTER DOCKS' west wall, between the bitt and the north-west gate, opens onto a fenced lot.
 * The fence is above a mantle. The bitt is not this opening. Nothing out there pays a gun.
 */
function openDocksFluke(c: Ctx): WildEdge | null {
  if (c.spec.id !== "deadletter_docks") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === -38.5 && b.max.z === -21);
  if (i < 0) throw new Error("docks fluke: the west wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = -30;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.min.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut - 10;
  const t = 0.35;
  c.boxes.push(box(xOut - t, 0, z0, xOut, yF, dz0, "fence"));
  c.boxes.push(box(xOut - t, 0, dz1, xOut, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xFar + t, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xOut, yF, z0 + t, "fence"));
  c.boxes.push(box(xFar, 0, z1 - t, xOut, yF, z1, "fence"));
  addSign(c, "WEST FLUKE", inner + 0.06, 2.7, midZ, Math.PI / 2, 4, COLORS.cyan);
  return {
    street: v3(inner + 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut - 5, 0, midZ),
    line: "WEST FLUKE. THE DOCK WALL IS BEHIND YOU.",
  };
}

/**
 * The south run of DEADLETTER DOCKS' west wall, clear of the two west gates, opens onto a fenced lot.
 * The fence is above a mantle. The north slip is not this opening. Nothing out there pays a gun.
 */
function openDocksWharf(c: Ctx): WildEdge | null {
  if (c.spec.id !== "deadletter_docks") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === 21 && b.max.z === 54);
  if (i < 0) throw new Error("docks wharf: the west wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = 40;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.min.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut - 10;
  const t = 0.35;
  c.boxes.push(box(xOut - t, 0, z0, xOut, yF, dz0, "fence"));
  c.boxes.push(box(xOut - t, 0, dz1, xOut, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xFar + t, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xOut, yF, z0 + t, "fence"));
  c.boxes.push(box(xFar, 0, z1 - t, xOut, yF, z1, "fence"));
  addSign(c, "WEST WHARF", inner + 0.06, 2.7, midZ, Math.PI / 2, 4, COLORS.cyan);
  return {
    street: v3(inner + 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut - 5, 0, midZ),
    line: "WEST WHARF. THE DOCK WALL IS BEHIND YOU.",
  };
}

/**
 * The south run of DEADLETTER DOCKS' west wall, between the wharf and the south-west gate, opens onto a fenced lot.
 * The fence is above a mantle. The wharf is not this opening. Nothing out there pays a gun.
 */
function openDocksPainter(c: Ctx): WildEdge | null {
  if (c.spec.id !== "deadletter_docks") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === 21 && b.max.z === 38.5);
  if (i < 0) throw new Error("docks painter: the west wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = 30;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.min.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut - 10;
  const t = 0.35;
  c.boxes.push(box(xOut - t, 0, z0, xOut, yF, dz0, "fence"));
  c.boxes.push(box(xOut - t, 0, dz1, xOut, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xFar + t, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xOut, yF, z0 + t, "fence"));
  c.boxes.push(box(xFar, 0, z1 - t, xOut, yF, z1, "fence"));
  addSign(c, "WEST PAINTER", inner + 0.06, 2.7, midZ, Math.PI / 2, 4, COLORS.cyan);
  return {
    street: v3(inner + 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut - 5, 0, midZ),
    line: "WEST PAINTER. THE DOCK WALL IS BEHIND YOU.",
  };
}

/**
 * The north run of REPO DEPOT's west wall, clear of the two west gates, opens onto a fenced lot.
 * The fence is above a mantle. The south apron is not this opening. Nothing out there pays a gun.
 */
function openDepotSkid(c: Ctx): WildEdge | null {
  if (c.spec.id !== "repo_depot") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === -54 && b.max.z === -21);
  if (i < 0) throw new Error("depot skid: the west wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = -40;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.min.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut - 10;
  const t = 0.35;
  c.boxes.push(box(xOut - t, 0, z0, xOut, yF, dz0, "fence"));
  c.boxes.push(box(xOut - t, 0, dz1, xOut, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xFar + t, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xOut, yF, z0 + t, "fence"));
  c.boxes.push(box(xFar, 0, z1 - t, xOut, yF, z1, "fence"));
  addSign(c, "WEST SKID", inner + 0.06, 2.7, midZ, Math.PI / 2, 4, COLORS.amber);
  return {
    street: v3(inner + 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut - 5, 0, midZ),
    line: "WEST SKID. THE DEPOT WALL IS BEHIND YOU.",
  };
}

/**
 * The south run of REPO DEPOT's west wall, clear of the two west gates, opens onto a fenced lot.
 * The fence is above a mantle. The impound is not this opening. Nothing out there pays a gun.
 */
function openDepotApron(c: Ctx): WildEdge | null {
  if (c.spec.id !== "repo_depot") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === 21 && b.max.z === 54);
  if (i < 0) throw new Error("depot apron: the west wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = 40;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.min.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut - 10;
  const t = 0.35;
  c.boxes.push(box(xOut - t, 0, z0, xOut, yF, dz0, "fence"));
  c.boxes.push(box(xOut - t, 0, dz1, xOut, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xFar + t, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xOut, yF, z0 + t, "fence"));
  c.boxes.push(box(xFar, 0, z1 - t, xOut, yF, z1, "fence"));
  addSign(c, "WEST APRON", inner + 0.06, 2.7, midZ, Math.PI / 2, 4, COLORS.amber);
  return {
    street: v3(inner + 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut - 5, 0, midZ),
    line: "WEST APRON. THE DEPOT WALL IS BEHIND YOU.",
  };
}

/**
 * The south run of REPO DEPOT's west wall, between the apron and the south-west gate, opens onto a fenced lot.
 * The fence is above a mantle. The apron is not this opening. Nothing out there pays a gun.
 */
function openDepotClevis(c: Ctx): WildEdge | null {
  if (c.spec.id !== "repo_depot") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === 21 && b.max.z === 38.5);
  if (i < 0) throw new Error("depot clevis: the west wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = 30;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.min.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut - 10;
  const t = 0.35;
  c.boxes.push(box(xOut - t, 0, z0, xOut, yF, dz0, "fence"));
  c.boxes.push(box(xOut - t, 0, dz1, xOut, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xFar + t, yF, z1, "fence"));
  c.boxes.push(box(xFar, 0, z0, xOut, yF, z0 + t, "fence"));
  c.boxes.push(box(xFar, 0, z1 - t, xOut, yF, z1, "fence"));
  addSign(c, "WEST CLEVIS", inner + 0.06, 2.7, midZ, Math.PI / 2, 4, COLORS.amber);
  return {
    street: v3(inner + 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut - 5, 0, midZ),
    line: "WEST CLEVIS. THE DEPOT WALL IS BEHIND YOU.",
  };
}

/**
 * The south run of REPO DEPOT's east wall, clear of the two east gates, opens onto a fenced lot.
 * The fence is above a mantle. The north ramp is not this opening. Nothing out there pays a gun.
 */
function openDepotJack(c: Ctx): WildEdge | null {
  if (c.spec.id !== "repo_depot") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === 21 && b.max.z === 54);
  if (i < 0) throw new Error("depot jack: the east wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = 40;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.max.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut + 10;
  const t = 0.35;
  c.boxes.push(box(xOut, 0, z0, xOut + t, yF, dz0, "fence"));
  c.boxes.push(box(xOut, 0, dz1, xOut + t, yF, z1, "fence"));
  c.boxes.push(box(xFar - t, 0, z0, xFar, yF, z1, "fence"));
  c.boxes.push(box(xOut, 0, z0, xFar, yF, z0 + t, "fence"));
  c.boxes.push(box(xOut, 0, z1 - t, xFar, yF, z1, "fence"));
  addSign(c, "EAST JACK", inner - 0.06, 2.7, midZ, -Math.PI / 2, 4, COLORS.amber);
  return {
    street: v3(inner - 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut + 5, 0, midZ),
    line: "EAST JACK. THE DEPOT WALL IS BEHIND YOU.",
  };
}

/**
 * The south run of REPO DEPOT's east wall, between the south-east gate and the jack, is still
 * a solid facade. Three metres there open onto a fenced lot. The jack is not this opening.
 * The facade past the jack is the south wall's return, not a street. Nothing out there pays a gun.
 */
function openDepotWindlass(c: Ctx): WildEdge | null {
  if (c.spec.id !== "repo_depot") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === 21 && b.max.z === 38.5);
  if (i < 0) throw new Error("depot windlass: the east wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = 30;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.max.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut + 10;
  const t = 0.35;
  c.boxes.push(box(xOut, 0, z0, xOut + t, yF, dz0, "fence"));
  c.boxes.push(box(xOut, 0, dz1, xOut + t, yF, z1, "fence"));
  c.boxes.push(box(xFar - t, 0, z0, xFar, yF, z1, "fence"));
  c.boxes.push(box(xOut, 0, z0, xFar, yF, z0 + t, "fence"));
  c.boxes.push(box(xOut, 0, z1 - t, xFar, yF, z1, "fence"));
  addSign(c, "EAST WINDLASS", inner - 0.06, 2.7, midZ, -Math.PI / 2, 4, COLORS.amber);
  return {
    street: v3(inner - 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut + 5, 0, midZ),
    line: "EAST WINDLASS. THE DEPOT WALL IS BEHIND YOU.",
  };
}

/**
 * The north run of REPO DEPOT's east wall, clear of the two east gates, opens onto a fenced lot.
 * The fence is above a mantle. The west apron is not this opening. Nothing out there pays a gun.
 */
function openDepotRamp(c: Ctx): WildEdge | null {
  if (c.spec.id !== "repo_depot") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === -54 && b.max.z === -21);
  if (i < 0) throw new Error("depot ramp: the east wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = -40;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.max.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut + 10;
  const t = 0.35;
  c.boxes.push(box(xOut, 0, z0, xOut + t, yF, dz0, "fence"));
  c.boxes.push(box(xOut, 0, dz1, xOut + t, yF, z1, "fence"));
  c.boxes.push(box(xFar - t, 0, z0, xFar, yF, z1, "fence"));
  c.boxes.push(box(xOut, 0, z0, xFar, yF, z0 + t, "fence"));
  c.boxes.push(box(xOut, 0, z1 - t, xFar, yF, z1, "fence"));
  addSign(c, "EAST RAMP", inner - 0.06, 2.7, midZ, -Math.PI / 2, 4, COLORS.amber);
  return {
    street: v3(inner - 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut + 5, 0, midZ),
    line: "EAST RAMP. THE DEPOT WALL IS BEHIND YOU.",
  };
}

/**
 * The north run of REPO DEPOT's east wall, between the ramp and the north-east gate, opens onto a fenced lot.
 * The fence is above a mantle. The ramp is not this opening. Nothing out there pays a gun.
 */
function openDepotPawl(c: Ctx): WildEdge | null {
  if (c.spec.id !== "repo_depot") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === -38.5 && b.max.z === -21);
  if (i < 0) throw new Error("depot pawl: the east wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midZ = -30;
  const doorW = 3;
  const doorH = 3.2;
  const dz0 = midZ - doorW / 2;
  const dz1 = midZ + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, wall.max.x, 36, dz0, "facade"));
  c.boxes.push(box(wall.min.x, 0, dz1, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(wall.min.x, doorH, dz0, wall.max.x, 36, dz1, "facade"));
  const xOut = wall.max.x;
  const yF = 2.2;
  const z0 = midZ - 8;
  const z1 = midZ + 8;
  const xFar = xOut + 10;
  const t = 0.35;
  c.boxes.push(box(xOut, 0, z0, xOut + t, yF, dz0, "fence"));
  c.boxes.push(box(xOut, 0, dz1, xOut + t, yF, z1, "fence"));
  c.boxes.push(box(xFar - t, 0, z0, xFar, yF, z1, "fence"));
  c.boxes.push(box(xOut, 0, z0, xFar, yF, z0 + t, "fence"));
  c.boxes.push(box(xOut, 0, z1 - t, xFar, yF, z1, "fence"));
  addSign(c, "EAST PAWL", inner - 0.06, 2.7, midZ, -Math.PI / 2, 4, COLORS.amber);
  return {
    street: v3(inner - 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut + 5, 0, midZ),
    line: "EAST PAWL. THE DEPOT WALL IS BEHIND YOU.",
  };
}

/**
 * The west run of REPO DEPOT's south wall, clear of the two south gates, opens onto a fenced lot.
 * The fence is above a mantle. The east ramp is not this opening. Nothing out there pays a gun.
 */
function openDepotBay(c: Ctx): WildEdge | null {
  if (c.spec.id !== "repo_depot") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === -84 && b.max.x === -21);
  if (i < 0) throw new Error("depot bay: the south wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = -40;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.max.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut + 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut, dx0, yF, zOut + t, "fence"));
  c.boxes.push(box(dx1, 0, zOut, x1, yF, zOut + t, "fence"));
  c.boxes.push(box(x0, 0, zFar - t, x1, yF, zFar, "fence"));
  c.boxes.push(box(x0, 0, zOut, x0 + t, yF, zFar, "fence"));
  c.boxes.push(box(x1 - t, 0, zOut, x1, yF, zFar, "fence"));
  addSign(c, "SOUTH BAY", midX, 2.7, inner - 0.06, Math.PI, 4, COLORS.amber);
  return {
    street: v3(midX, 0, inner - 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut + 5),
    line: "SOUTH BAY. THE DEPOT WALL IS BEHIND YOU.",
  };
}

/**
 * The east run of REPO DEPOT's south wall, clear of the two south gates, opens onto a fenced lot.
 * The fence is above a mantle. The south bay is not this opening. Nothing out there pays a gun.
 */
function openDepotChock(c: Ctx): WildEdge | null {
  if (c.spec.id !== "repo_depot") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 21 && b.max.x === 84);
  if (i < 0) throw new Error("depot chock: the south wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 52;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.max.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut + 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut, dx0, yF, zOut + t, "fence"));
  c.boxes.push(box(dx1, 0, zOut, x1, yF, zOut + t, "fence"));
  c.boxes.push(box(x0, 0, zFar - t, x1, yF, zFar, "fence"));
  c.boxes.push(box(x0, 0, zOut, x0 + t, yF, zFar, "fence"));
  c.boxes.push(box(x1 - t, 0, zOut, x1, yF, zFar, "fence"));
  addSign(c, "SOUTH CHOCK", midX, 2.7, inner - 0.06, Math.PI, 4, COLORS.amber);
  return {
    street: v3(midX, 0, inner - 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut + 5),
    line: "SOUTH CHOCK. THE DEPOT WALL IS BEHIND YOU.",
  };
}

/**
 * The east run of REPO DEPOT's south wall, between the south-east gate and the chock, is still
 * a solid facade. Three metres there open onto a fenced lot. The chock is not this opening.
 * The facade past the chock is the east wall's return, not a street. Nothing out there pays a gun.
 */
function openDepotDerrick(c: Ctx): WildEdge | null {
  if (c.spec.id !== "repo_depot") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 21 && b.max.x === 50.5);
  if (i < 0) throw new Error("depot derrick: the south wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 30;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.max.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut + 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut, dx0, yF, zOut + t, "fence"));
  c.boxes.push(box(dx1, 0, zOut, x1, yF, zOut + t, "fence"));
  c.boxes.push(box(x0, 0, zFar - t, x1, yF, zFar, "fence"));
  c.boxes.push(box(x0, 0, zOut, x0 + t, yF, zFar, "fence"));
  c.boxes.push(box(x1 - t, 0, zOut, x1, yF, zFar, "fence"));
  addSign(c, "SOUTH DERRICK", midX, 2.7, inner - 0.06, Math.PI, 4, COLORS.amber);
  return {
    street: v3(midX, 0, inner - 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut + 5),
    line: "SOUTH DERRICK. THE DEPOT WALL IS BEHIND YOU.",
  };
}

/**
 * The east run of REPO DEPOT's south wall, between the south derrick and the south chock, is still
 * a solid facade. Three metres there open onto a fenced lot. The derrick and the chock are not this
 * opening. The facade past the chock is the east wall's return, not a street. Nothing out there pays a gun.
 */
function openDepotCapstan(c: Ctx): WildEdge | null {
  if (c.spec.id !== "repo_depot") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 31.5 && b.max.x === 50.5);
  if (i < 0) throw new Error("depot capstan: the south wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 41;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.max.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut + 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut, dx0, yF, zOut + t, "fence"));
  c.boxes.push(box(dx1, 0, zOut, x1, yF, zOut + t, "fence"));
  c.boxes.push(box(x0, 0, zFar - t, x1, yF, zFar, "fence"));
  c.boxes.push(box(x0, 0, zOut, x0 + t, yF, zFar, "fence"));
  c.boxes.push(box(x1 - t, 0, zOut, x1, yF, zFar, "fence"));
  addSign(c, "SOUTH CAPSTAN", midX, 2.7, inner - 0.06, Math.PI, 4, COLORS.amber);
  return {
    street: v3(midX, 0, inner - 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut + 5),
    line: "SOUTH CAPSTAN. THE DEPOT WALL IS BEHIND YOU.",
  };
}

/**
 * The west run of REPO DEPOT's south wall, between the south bay and the south-west gate, is still
 * a solid facade. Three metres there open onto a fenced lot. The bay is not this opening.
 * The facade past the bay is the west wall's return, not a street. Nothing out there pays a gun.
 */
function openDepotDavit(c: Ctx): WildEdge | null {
  if (c.spec.id !== "repo_depot") return null;
  const inner = c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.min.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === -38.5 && b.max.x === -21);
  if (i < 0) throw new Error("depot davit: the south wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = -30;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.max.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut + 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut, dx0, yF, zOut + t, "fence"));
  c.boxes.push(box(dx1, 0, zOut, x1, yF, zOut + t, "fence"));
  c.boxes.push(box(x0, 0, zFar - t, x1, yF, zFar, "fence"));
  c.boxes.push(box(x0, 0, zOut, x0 + t, yF, zFar, "fence"));
  c.boxes.push(box(x1 - t, 0, zOut, x1, yF, zFar, "fence"));
  addSign(c, "SOUTH DAVIT", midX, 2.7, inner - 0.06, Math.PI, 4, COLORS.amber);
  return {
    street: v3(midX, 0, inner - 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut + 5),
    line: "SOUTH DAVIT. THE DEPOT WALL IS BEHIND YOU.",
  };
}

/**
 * The east run of REPO DEPOT's north wall, clear of the two north gates, opens onto a fenced lot.
 * The fence is above a mantle. The west crest is not this opening. Nothing out there pays a gun.
 */
function openDepotHoist(c: Ctx): WildEdge | null {
  if (c.spec.id !== "repo_depot") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 21 && b.max.x === 84);
  if (i < 0) throw new Error("depot hoist: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 52;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "NORTH HOIST", midX, 2.7, inner + 0.06, 0, 4, COLORS.amber);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "NORTH HOIST. THE DEPOT WALL IS BEHIND YOU.",
  };
}

/**
 * The east run of REPO DEPOT's north wall, between the dolly and the hoist, is still a solid
 * facade. Three metres there open onto a fenced lot. The dolly and the hoist are not this opening.
 * The facade past the hoist is the east wall's return, not a street. Nothing out there pays a gun.
 */
function openDepotCradle(c: Ctx): WildEdge | null {
  if (c.spec.id !== "repo_depot") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 31.5 && b.max.x === 50.5);
  if (i < 0) throw new Error("depot cradle: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 41;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "NORTH CRADLE", midX, 2.7, inner + 0.06, 0, 4, COLORS.amber);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "NORTH CRADLE. THE DEPOT WALL IS BEHIND YOU.",
  };
}

/**
 * The east run of REPO DEPOT's north wall, between the north-east gate and the hoist, is still
 * a solid facade. Three metres there open onto a fenced lot. The hoist is not this opening.
 * Nothing out there pays a gun.
 */
function openDepotDolly(c: Ctx): WildEdge | null {
  if (c.spec.id !== "repo_depot") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === 21 && b.max.x === 50.5);
  if (i < 0) throw new Error("depot dolly: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = 30;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "NORTH DOLLY", midX, 2.7, inner + 0.06, 0, 4, COLORS.amber);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "NORTH DOLLY. THE DEPOT WALL IS BEHIND YOU.",
  };
}

/**
 * The west run of REPO DEPOT's north wall, clear of the two north gates, opens onto a fenced lot.
 * The fence is above a mantle. The south bay is not this opening. Nothing out there pays a gun.
 */
function openDepotCrest(c: Ctx): WildEdge | null {
  if (c.spec.id !== "repo_depot") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === -84 && b.max.x === -21);
  if (i < 0) throw new Error("depot crest: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = -40;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "NORTH CREST", midX, 2.7, inner + 0.06, 0, 4, COLORS.amber);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "NORTH CREST. THE DEPOT WALL IS BEHIND YOU.",
  };
}

/**
 * The west end of REPO DEPOT's north wall, past the crest, is still a solid facade.
 * Three metres there open onto a fenced lot. The crest is not this opening. Nothing out there pays a gun.
 */
/**
 * The west run of REPO DEPOT's north wall, between the north-west gate and the crest, is still
 * a solid facade. Three metres there open onto a fenced lot. The crest is not this opening.
 * Nothing out there pays a gun.
 */
function openDepotBolster(c: Ctx): WildEdge | null {
  if (c.spec.id !== "repo_depot") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === -38.5 && b.max.x === -21);
  if (i < 0) throw new Error("depot bolster: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = -30;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "NORTH BOLSTER", midX, 2.7, inner + 0.06, 0, 4, COLORS.amber);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "NORTH BOLSTER. THE DEPOT WALL IS BEHIND YOU.",
  };
}

function openDepotWinch(c: Ctx): WildEdge | null {
  if (c.spec.id !== "repo_depot") return null;
  const inner = -c.H;
  const i = c.boxes.findIndex((b) => b.tag === "facade" && b.max.z === inner && b.min.y === 0 && b.max.y === 36 && b.min.x === -84 && b.max.x === -41.5);
  if (i < 0) throw new Error("depot winch: the north wall is not where the facade put it");
  const wall = c.boxes[i]!;
  c.boxes.splice(i, 1);
  const midX = -52;
  const doorW = 3;
  const doorH = 3.2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  c.boxes.push(box(wall.min.x, 0, wall.min.z, dx0, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx1, 0, wall.min.z, wall.max.x, 36, wall.max.z, "facade"));
  c.boxes.push(box(dx0, doorH, wall.min.z, dx1, 36, wall.max.z, "facade"));
  const zOut = wall.min.z;
  const yF = 2.2;
  const x0 = midX - 8;
  const x1 = midX + 8;
  const zFar = zOut - 10;
  const t = 0.35;
  c.boxes.push(box(x0, 0, zOut - t, dx0, yF, zOut, "fence"));
  c.boxes.push(box(dx1, 0, zOut - t, x1, yF, zOut, "fence"));
  c.boxes.push(box(x0, 0, zFar, x1, yF, zFar + t, "fence"));
  c.boxes.push(box(x0, 0, zFar, x0 + t, yF, zOut, "fence"));
  c.boxes.push(box(x1 - t, 0, zFar, x1, yF, zOut, "fence"));
  addSign(c, "NORTH WINCH", midX, 2.7, inner + 0.06, 0, 4, COLORS.amber);
  return {
    street: v3(midX, 0, inner + 2.2),
    passage: v3(midX, 0, (inner + zOut) / 2),
    outside: v3(midX, 0, zOut - 5),
    line: "NORTH WINCH. THE DEPOT WALL IS BEHIND YOU.",
  };
}

/** The east stack on RELAY HEIGHTS is the cold rack. Cash for the lease, no gun. */
function openRelayRack(c: Ctx): ShopSpot | null {
  return openWarehouse(c, "relay_heights", 2, 1, "COLD RACK", "COLD RACK · THE HATCH IS OPEN. CASH FOR THE LEASE. THE GUN STAYS AS IT IS.", "relay cold rack", "cyan");
}

/**
 * One warehouse ground floor becomes a room. The shell is the step metal the stairs already draw.
 */
function openWarehouse(c: Ctx, id: string, bx: number, bz: number, sign: string, line: string, what: string, light: "cyan" | "amber"): ShopSpot | null {
  if (c.spec.id !== id) return null;
  const { x0, z0, x1, z1 } = blockRect(c.H, bx, bz);
  const bx0 = x0 + 1;
  const bz0 = z0 + 6;
  const bx1 = x1 - 1;
  const bz1 = z1 - 1;
  const i = c.boxes.findIndex((b) => b.tag === "base" && b.min.x === bx0 && b.min.y === 0 && b.min.z === bz0 && b.max.x === bx1 && b.max.y === 4.2 && b.max.z === bz1);
  if (i < 0) throw new Error(`${what}: the warehouse floor is not where the stack put it`);
  c.boxes.splice(i, 1);
  const t = 0.45;
  const doorW = 2.4;
  const doorH = 2.4;
  const midX = (bx0 + bx1) / 2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  const wall = (ax: number, ay: number, az: number, bx2: number, by: number, bz2: number): void => {
    c.boxes.push(box(ax, ay, az, bx2, by, bz2, "step"));
  };
  wall(bx0, 0, bz0, bx1, 4.2, bz0 + t);
  wall(bx0, 0, bz0 + t, bx0 + t, 4.2, bz1);
  wall(bx1 - t, 0, bz0 + t, bx1, 4.2, bz1);
  wall(dx0, doorH, bz1 - t, dx1, 4.2, bz1);
  wall(dx1, 0, bz1 - t, bx1, 4.2, bz1);
  wall(bx0, 0, bz1 - t, dx0, 4.2, bz1);
  const mx0 = dx0 - 0.3;
  const mx1 = dx1 + 0.3;
  const mz1 = bz1 + 1.6;
  c.boxes = c.boxes.filter((b) => {
    if (b.tag !== "vending" && b.tag !== "crate" && b.tag !== "car" && b.tag !== "dumpster") return true;
    const hit = b.min.x < mx1 && b.max.x > mx0 && b.min.z < mz1 && b.max.z > bz1 - t && b.min.y < doorH;
    return !hit;
  });
  const cz = bz0 + t + 0.15;
  c.boxes.push(box(midX - 1.8, 0, cz + 0.7, midX + 1.8, 1.05, cz + 1.7, "step"));
  c.decor.push(box(bx0 + t, 3.5, bz0 + t, bx1 - t, 3.65, bz1 - t, "ceiling"));
  c.lights.push({ x: midX, y: 3.2, z: (bz0 + bz1) / 2, color: light, intensity: 8, range: 14 });
  addSign(c, sign, midX, 3.3, bz1 + 0.04, 0, 3.2, light === "amber" ? COLORS.amber : COLORS.cyan);
  const counter = v3(midX, 0, cz + 1.7 + 0.9);
  const inside = v3(midX, 0, (counter.z + (bz1 - t)) / 2);
  const mouth = v3(midX, 0, bz1 + 0.45);
  return { mouth, inside, counter, line };
}

/**
 * The stack at the north-west corner of LEASE ROW is a solid warehouse. Its ground floor becomes
 * four walls, a door onto the south apron, a counter, and a clerk. The floor under it is the
 * district's own slab, so the room is the street you were already on.
 */
function openLeaseShop(c: Ctx): ShopSpot | null {
  return openStackRoom(c, 0, 0, "NOODLE 24", "NOODLE 24 · THE CLERK IS IN. CASH FOR THE BOWL. THE GUN STAYS AS IT IS.", "lease row shop");
}

/**
 * The stack at the south-west corner is the same kind of warehouse. Its ground floor is a second
 * room, with the window on the south apron. It takes cash and changes no gun.
 */
function openLeasePawn(c: Ctx): ShopSpot | null {
  return openStackRoom(c, 0, 4, "PAWN", "PAWN · THE WINDOW IS OPEN. CASH FOR THE PIECE. THE GUN STAYS AS IT IS.", "lease row pawn");
}

/**
 * The east wall's north run is a solid facade. Three metres at its north end, clear of the gates,
 * are left open onto the slab. No new box: the city frame has no room for another facade or a fence.
 */
function openLeaseEast(c: Ctx): WildEdge | null {
  if (c.spec.id !== "lease_row" || districtGrid(c.spec) !== 5) return null;
  const inner = c.H;
  const wall = c.boxes.find((b) => b.tag === "facade" && b.min.x === inner && b.min.y === 0 && b.max.y === 36 && b.min.z === -inner && b.max.z < -20);
  if (!wall) throw new Error("lease row east: the east wall is not where the facade put it");
  const gap = 3;
  wall.min.z = -inner + gap;
  // the north sidewalk is 0.1 m proud and ends 1.5 m in from the corner, so the slot's centre is not walkable
  const midZ = -inner + gap - 0.5;
  const xOut = wall.max.x;
  addSign(c, "EAST LOT", inner - 0.06, 2.7, midZ, -Math.PI / 2, 4, COLORS.cyan);
  return {
    street: v3(inner - 2.2, 0, midZ),
    passage: v3((inner + xOut) / 2, 0, midZ),
    outside: v3(xOut + 4, 0, midZ),
    line: "EAST LOT. THE WALL IS BEHIND YOU.",
  };
}

/**
 * The south-east stack is the last solid warehouse. Its ground floor is a third room. Cash, no gun.
 * The shell is one jamb and a metal counter: a full base wall, and even a stall, put the city frame over 190k.
 */
function openLeaseNight(c: Ctx): ShopSpot | null {
  return openStackRoom(c, 4, 4, "NIGHT CO", "NIGHT CO · THE COUNTER IS OPEN. CASH FOR THE CUP. THE GUN STAYS AS IT IS.", "lease row night", "door");
}

/** One warehouse ground floor becomes a room. Stall and crate are already on the row's markets. */
function openStackRoom(c: Ctx, bx: number, bz: number, sign: string, line: string, what: string, shell: "full" | "door" = "full"): ShopSpot | null {
  if (c.spec.id !== "lease_row" || districtGrid(c.spec) !== 5) return null;
  const { x0, z0, x1, z1 } = blockRect(c.H, bx, bz);
  const bx0 = x0 + 1;
  const bz0 = z0 + 6;
  const bx1 = x1 - 1;
  const bz1 = z1 - 1;
  const i = c.boxes.findIndex((b) => b.tag === "base" && b.min.x === bx0 && b.min.y === 0 && b.min.z === bz0 && b.max.x === bx1 && b.max.y === 4.2 && b.max.z === bz1);
  if (i < 0) throw new Error(`${what}: the warehouse floor is not where the stack put it`);
  c.boxes.splice(i, 1);
  const t = 0.45;
  const doorW = 2.4;
  const doorH = 2.4;
  const midX = (bx0 + bx1) / 2;
  const dx0 = midX - doorW / 2;
  const dx1 = midX + doorW / 2;
  const wallTag = shell === "door" ? "step" : "base";
  const wall = (ax: number, ay: number, az: number, bx2: number, by: number, bz2: number): void => {
    c.boxes.push(box(ax, ay, az, bx2, by, bz2, wallTag));
  };
  if (shell === "full") {
    wall(bx0, 0, bz0, bx1, 4.2, bz0 + t);
    wall(bx0, 0, bz0 + t, bx0 + t, 4.2, bz1);
    wall(bx1 - t, 0, bz0 + t, bx1, 4.2, bz1);
    wall(dx0, doorH, bz1 - t, dx1, 4.2, bz1);
    wall(dx1, 0, bz1 - t, bx1, 4.2, bz1);
  }
  wall(bx0, 0, bz1 - t, dx0, 4.2, bz1);
  // a machine left in the doorway would seal the room the walls just opened
  const mx0 = dx0 - 0.3;
  const mx1 = dx1 + 0.3;
  const mz1 = bz1 + 1.6;
  c.boxes = c.boxes.filter((b) => {
    if (b.tag !== "vending" && b.tag !== "crate" && b.tag !== "car" && b.tag !== "dumpster") return true;
    const hit = b.min.x < mx1 && b.max.x > mx0 && b.min.z < mz1 && b.max.z > bz1 - t && b.min.y < doorH;
    return !hit;
  });
  const cz = bz0 + t + 0.15;
  if (shell === "full") {
    c.boxes.push(box(midX - 0.35, 0, cz, midX + 0.35, 1.75, cz + 0.55, "crate"));
    c.boxes.push(box(midX - 1.8, 0, cz + 0.7, midX + 1.8, 1.05, cz + 1.7, "stall"));
    c.decor.push(box(bx0 + t, 3.5, bz0 + t, bx1 - t, 3.65, bz1 - t, "ceiling"));
  } else {
    c.boxes.push(box(midX - 1.8, 0, cz + 0.7, midX + 1.8, 1.05, cz + 1.7, "step"));
  }
  c.lights.push({ x: midX, y: 3.2, z: (bz0 + bz1) / 2, color: "amber", intensity: 8, range: 14 });
  addSign(c, sign, midX, 3.3, bz1 + 0.04, 0, 3.2, COLORS.yellow);
  const counter = v3(midX, 0, cz + 1.7 + 0.9);
  const inside = v3(midX, 0, (counter.z + (bz1 - t)) / 2);
  const mouth = v3(midX, 0, bz1 + 0.45);
  return { mouth, inside, counter, line };
}

// ---------------------------------------------------------------------------
// The districts: the three launch districts, and the two Stage 701 added

export const DISTRICT_SPECS: DistrictSpec[] = [
  {
    id: "lease_row",
    displayName: "LEASE ROW",
    cast: "magenta",
    seed: 1101,
    grid: 5,
    // The centre nine are the 3×3 LEASE ROW's own nine, cell for cell, so every node, lattice post and
    // route a contract knows is on the same kind of block it always was; the ring around them is new.
    blocks: [
      "stack", "split", "tower", "market", "lot",
      "split", "tower", "split", "court", "tower",
      "court", "market", "plaza", "split", "court",
      "tower", "court", "tower", "market", "split",
      "stack", "market", "split", "court", "stack",
    ],
    words: ["RE-LEASE", "再租", "NIGHT CO", "PAWN", "NOODLE 24", "ヴァンテージ", "CHILL UNDER", "DEADLETTER", "LEASE-BREAKER", "SEC-9"],
    signFg: [COLORS.magenta, COLORS.cyan, COLORS.yellow],
    walkway: "x",
    carDensity: 0.45,
    mechs: 2,
    wasps: 5,
    // Twice the old nine blocks' crowd, not the ~300 the area would carry at the same density. Every
    // citizen is ~350 triangles; since Stage 696 the crowd is drawn once (the wet floor's mirror no
    // longer sees it), so 220 cost what 110 did when they were drawn twice, and the frame measures what
    // it did (tests/citycost.test.ts). 300 would put the model over the 190k it allows.
    pedestrians: 220,
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
    pedestrians: 55,
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
    pedestrians: 70,
  },
  // Stage 701: two more districts, so the city's gates do not loop back to the same three streets.
  // Each reuses a cast the renderer already dresses (the art bible keeps the city cyan and magenta,
  // amber for VANTAGE), and each is told apart by its blocks, its crowd, its traffic and its patrols.
  {
    // the street market under the awnings: stalls and courtyards, the fewest parked cars, the
    // thickest crowd of any 3×3 district, one mech
    id: "night_market",
    displayName: "NIGHT MARKET",
    cast: "magenta",
    seed: 4404,
    blocks: ["market", "court", "market", "court", "plaza", "market", "split", "market", "court"],
    words: ["夜市", "NOODLE 24", "CHIP DOCTOR", "KARAOKE", "PAWN", "BLACK CLINIC", "FRESH RAM", "NIGHT CO", "DEADLETTER"],
    signFg: [COLORS.magenta, COLORS.yellow, COLORS.cyan],
    walkway: "z",
    carDensity: 0.15,
    mechs: 1,
    wasps: 3,
    pedestrians: 100,
  },
  {
    // the relay towers: tall stacks of leased compute, a warehouse and two alleys, the thinnest crowd
    // in the city, every wasp route of a 3×3 district flown
    id: "relay_heights",
    displayName: "RELAY HEIGHTS",
    cast: "cyan",
    seed: 5505,
    blocks: ["tower", "tower", "split", "tower", "plaza", "stack", "split", "tower", "tower"],
    words: ["RELAY 7", "COLD RACK", "UPLINK", "中继", "LEASED CYCLES", "SEC-9", "COMPLY", "LATENCY"],
    signFg: [COLORS.cyan, COLORS.magenta, COLORS.yellow],
    walkway: "x",
    carDensity: 0.4,
    mechs: 2,
    wasps: 4,
    pedestrians: 40,
  },
];

export const districtById = (id: string): DistrictSpec | undefined => DISTRICT_SPECS.find((d) => d.id === id);
