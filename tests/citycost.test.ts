/**
 * What a district costs to draw, measured on the real dressing code (Stage 692).
 *
 * `probe:city` holds a district's frame to ≤ 190 draw calls and ≤ 200k triangles in a browser. The
 * dressing is merged into one mesh per material, so its draw calls do not grow with the district,
 * but its triangles do, and none of it is ever frustum-culled: every merged batch's bounds cover the
 * district. The wet floor's mirror renders layer 0 a second time, and the dressing is on layer 0; the
 * skyline and, since Stage 696, the crowd are on the far layer and drawn once. So a frame is, to
 * within the actors in it (the Blank's body, wasps, mechs, the viewmodel):
 *
 *     2 × dressing + crowd + skyline
 *
 * which predicted the last recorded `probe:city` figures to within 3.3k (docs/STAGES.md, the body
 * stage: lease_row 164k measured / 161.3k here, repo_depot 139k / 135.7k, docks 114k / 111.1k). The
 * budget below leaves 10k of the 200k for the actors. This runs the same `dressLevel`, `Crowd` and
 * `buildSkyline` the renderer runs, with a canvas stub where the browser would draw textures.
 *
 * In the city (Stage 704) the dressing also carries the gates as doors: eight destination signs on
 * the sign atlas and their light in the neon batches, so the city's frame is the same model with a
 * slightly larger dressing, held to the same budget.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { DISTRICT_SPECS, districtById, generateDistrict, type DistrictSpec } from "../shared/sim/city";
import type { LevelDef } from "../shared/sim/level";

const noop = () => undefined;
const ctx2d = new Proxy({}, {
  get: (_t, k) => (k === "measureText" ? () => ({ width: 0 }) : k === "createLinearGradient" || k === "createRadialGradient" ? () => ({ addColorStop: noop }) : k === "getImageData" || k === "createImageData" ? () => ({ data: new Uint8ClampedArray(4) }) : noop),
  set: () => true,
});
const g = globalThis as unknown as { document?: unknown };
let hadDocument = false;
beforeAll(() => {
  hadDocument = "document" in g;
  // just enough of a document for the canvas textures; the asset loader finds no `createElementNS` and fails soft
  if (!hadDocument) g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }) };
});
afterAll(() => {
  if (!hadDocument) delete g.document;
});

const trianglesOf = (o: THREE.Object3D): number => {
  let t = 0;
  o.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry;
    const n = geo.index ? geo.index.count / 3 : geo.getAttribute("position").count / 3;
    t += n * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
  });
  return t;
};

/** every mesh the dressing adds is a draw call (twice with the mirror): the merged solids, the neon colours, the sign atlas */
const meshesOf = (o: THREE.Object3D): number => {
  let n = 0;
  o.traverse((m) => void ((m as THREE.Mesh).isMesh && n++));
  return n;
};

interface Cost { boxes: number; dressing: number; batches: number; meshes: number; crowd: number; skyline: number; frame: number }

/**
 * `city`: dress the district as the city does, its gates as doors (Stage 704), exactly as the renderer
 * does for a page that is `inCity`. Every other mode dresses it without.
 */
async function costOf(L: LevelDef, city = false): Promise<Cost> {
  const { cityDoors, dressLevel, buildSkyline } = await import("../client/render/city");
  const { Crowd } = await import("../client/render/life");
  const scene = new THREE.Scene();
  const { calls } = dressLevel(scene, L, undefined, cityDoors(L, city));
  const dressing = trianglesOf(scene);
  const skyline = trianglesOf(buildSkyline(new THREE.Scene(), L.skylineSeed ?? 42, (L.bounds ?? 32) + 44, L.district ?? "magenta"));
  const crowd = trianglesOf(new Crowd(L.walks!, L.pedestrians!, (L.skylineSeed ?? 1) + 7).group);
  return { boxes: L.boxes.length, dressing, batches: calls, meshes: meshesOf(scene), crowd, skyline, frame: 2 * dressing + crowd + skyline };
}

/** LEASE ROW as it was before Stage 692 */
const LEASE_ROW_3X3: DistrictSpec = { ...districtById("lease_row")!, grid: 3, blocks: ["tower", "split", "court", "market", "plaza", "split", "court", "tower", "market"], mechs: 1, wasps: 3, pedestrians: 110 };

describe("what a district costs to draw", () => {
  it("every district's frame fits the 200k-triangle budget with 10k left for the actors", async () => {
    for (const spec of DISTRICT_SPECS) {
      // the city's frame (its gates dressed as doors, Stage 704) and every other mode's
      for (const city of [false, true]) {
        const c = await costOf(generateDistrict(spec), city);
        expect(c.frame, `${spec.id}${city ? " (city)" : ""}: ${JSON.stringify(c)}`).toBeLessThanOrEqual(190_000);
      }
    }
  }, 30_000);

  it("the city's doors cost at most one batch and 2k triangles a district: the signs ride the atlas, the light rides the neon (Stage 704)", async () => {
    for (const spec of DISTRICT_SPECS) {
      const plain = await costOf(generateDistrict(spec));
      const city = await costOf(generateDistrict(spec), true);
      const what = `${spec.id}: ${JSON.stringify(city)} vs ${JSON.stringify(plain)}`;
      expect(city.meshes - plain.meshes, what).toBeLessThanOrEqual(1);
      expect(city.batches - plain.batches, what).toBeLessThanOrEqual(1);
      expect(city.dressing - plain.dressing, what).toBeLessThanOrEqual(2_000);
      // live, not vacuous: the doors are drawn (8 signs and their light), in the dressing the mirror draws again
      expect(city.dressing - plain.dressing, what).toBeGreaterThan(8 * 2);
      expect(city.frame - plain.frame, what).toBe(2 * (city.dressing - plain.dressing));
    }
  }, 30_000);

  it("the 5×5 LEASE ROW draws in no more batches than the 3×3 one did: its blocks bring no new material", async () => {
    const small = await costOf(generateDistrict(LEASE_ROW_3X3));
    const big = await costOf(generateDistrict(districtById("lease_row")!));
    expect(big.batches, `${JSON.stringify(big)} vs ${JSON.stringify(small)}`).toBeLessThanOrEqual(small.batches);
    // the measurement is live, not vacuous: the larger district does cost more triangles
    expect(big.dressing).toBeGreaterThan(small.dressing);
  }, 30_000);

  it("the crowd is drawn once: the wet floor's mirror (layer 0) sees none of it, the street camera sees all of it (Stage 696)", async () => {
    const { CityLife } = await import("../client/render/life");
    const { FAR_LAYER } = await import("../client/render/renderer");
    const life = new CityLife(generateDistrict(districtById("lease_row")!), new THREE.Group());
    const mirror = new THREE.Layers(); // a fresh camera's layers: 0 only, as the mirror camera's are
    const street = new THREE.Layers();
    street.enable(FAR_LAYER);
    const meshes: THREE.Object3D[] = [];
    life.crowd!.group.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o));
    expect(meshes.length).toBe(5);
    for (const m of meshes) {
      expect(m.layers.test(mirror), `${(m as THREE.Mesh).geometry.type} is in the mirror`).toBe(false);
      expect(m.layers.test(street)).toBe(true);
    }
    // and the model counts the crowd once, so 220 citizens cost what 110 drawn twice did
    expect(life.crowd!.count).toBe(220);
  }, 30_000);
});
