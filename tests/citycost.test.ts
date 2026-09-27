/**
 * What a district costs to draw, measured on the real dressing code (Stage 692).
 *
 * `probe:city` holds a district's frame to ≤ 190 draw calls and ≤ 200k triangles in a browser. The
 * dressing is merged into one mesh per material, so its draw calls do not grow with the district,
 * but its triangles do, and none of it is ever frustum-culled: every merged batch's bounds cover the
 * district. The wet floor's mirror renders layer 0 a second time, and the dressing and the crowd are
 * on layer 0; the skyline is on the far layer and drawn once. So a frame is, to within the actors in
 * it (the Blank's body, wasps, mechs, the viewmodel):
 *
 *     2 × (dressing + crowd) + skyline
 *
 * which predicted the last recorded `probe:city` figures to within 3.3k (docs/STAGES.md, the body
 * stage: lease_row 164k measured / 161.3k here, repo_depot 139k / 135.7k, docks 114k / 111.1k). The
 * budget below leaves 10k of the 200k for the actors. This runs the same `dressLevel`, `Crowd` and
 * `buildSkyline` the renderer runs, with a canvas stub where the browser would draw textures.
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

interface Cost { boxes: number; dressing: number; batches: number; crowd: number; skyline: number; frame: number }

async function costOf(L: LevelDef): Promise<Cost> {
  const { dressLevel, buildSkyline } = await import("../client/render/city");
  const { Crowd } = await import("../client/render/life");
  const scene = new THREE.Scene();
  const { calls } = dressLevel(scene, L);
  const dressing = trianglesOf(scene);
  const skyline = trianglesOf(buildSkyline(new THREE.Scene(), L.skylineSeed ?? 42, (L.bounds ?? 32) + 44, L.district ?? "magenta"));
  const crowd = trianglesOf(new Crowd(L.walks!, L.pedestrians!, (L.skylineSeed ?? 1) + 7).group);
  return { boxes: L.boxes.length, dressing, batches: calls, crowd, skyline, frame: 2 * (dressing + crowd) + skyline };
}

/** LEASE ROW as it was before Stage 692 */
const LEASE_ROW_3X3: DistrictSpec = { ...districtById("lease_row")!, grid: 3, blocks: ["tower", "split", "court", "market", "plaza", "split", "court", "tower", "market"], mechs: 1, wasps: 3, pedestrians: 110 };

describe("what a district costs to draw", () => {
  it("every district's frame fits the 200k-triangle budget with 10k left for the actors", async () => {
    for (const spec of DISTRICT_SPECS) {
      const c = await costOf(generateDistrict(spec));
      expect(c.frame, `${spec.id}: ${JSON.stringify(c)}`).toBeLessThanOrEqual(190_000);
    }
  }, 30_000);

  it("the 5×5 LEASE ROW draws in no more batches than the 3×3 one did: its blocks bring no new material", async () => {
    const small = await costOf(generateDistrict(LEASE_ROW_3X3));
    const big = await costOf(generateDistrict(districtById("lease_row")!));
    expect(big.batches, `${JSON.stringify(big)} vs ${JSON.stringify(small)}`).toBeLessThanOrEqual(small.batches);
    // the measurement is live, not vacuous: the larger district does cost more triangles
    expect(big.dressing).toBeGreaterThan(small.dressing);
  }, 30_000);
});
