/**
 * The monorail car rides on its beam (Stage 674).
 *
 * Until this stage a car was a box centred at 8.6 m with the 9.0-9.3 m beam running through its
 * upper body, and on a z-running line it drove backwards. These tests build the real `Tram` the
 * city life runs and read where its parts are in the world.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Tram, TRAM, tramGeometry } from "../client/render/life";
import { levelById } from "../shared/sim/level";
import type { TramLine } from "../shared/sim/level";

const DISTRICTS = ["lease_row", "deadletter_docks", "repo_depot"];

describe("the monorail car", () => {
  it("sits on its running surface: bogies on it, nothing below it", () => {
    const g = tramGeometry().hull;
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeCloseTo(0, 6);
    expect(g.boundingBox!.max.y).toBeGreaterThan(TRAM.lift + TRAM.height);
  });

  it("is solid from outside: every face of the hull points out of it", () => {
    // the lofted shell on its own: the bogies and the roof pod are boxes, and a box's top face points at nothing
    const g = tramGeometry().shell;
    const p = g.getAttribute("position");
    // the hull is convex in every cross-section, so a face that points out points away from the axis
    let inward = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      const n = b.clone().sub(a).cross(c.clone().sub(a));
      if (n.lengthSq() < 1e-12) continue;
      const mid = a.clone().add(b).add(c).divideScalar(3);
      // from the car's centre line (at the centroid's own x for the sides, the whole-car centre for the caps)
      const out = mid.clone().sub(new THREE.Vector3(Math.abs(n.x) > Math.hypot(n.y, n.z) ? 0 : mid.x, TRAM.lift + TRAM.height / 2, 0));
      if (n.dot(out) < 0) inward++;
    }
    expect(inward, "faces wound inward: the hull renders inside out").toBe(0);
  });

  it("every part carries texture coordinates: each of its materials is a plate, and a plate without them is one texel", () => {
    const tram = new Tram({ axis: "x", at: 0, y: 9.4, from: 0, to: 100, period: 26 });
    const meshes = tram.group.children.flatMap((c) => c.children).filter((m) => (m as THREE.Mesh).isMesh) as THREE.Mesh[];
    expect(meshes.length).toBeGreaterThanOrEqual(10);
    for (const m of meshes) {
      const uv = m.geometry.getAttribute("uv");
      expect(uv, `${m.name || "a car mesh"} has no uv`).toBeTruthy();
      expect(uv.count).toBe(m.geometry.getAttribute("position").count);
    }
  });

  it("passes clear of the beam, the posts and everything else in every district that has one", () => {
    let swept = 0;
    for (const id of DISTRICTS) {
      const lv = levelById(id);
      const line = lv.tram;
      if (!line) continue;
      const g = tramGeometry().hull;
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      const solids = [...lv.boxes, ...(lv.decor ?? [])];
      // inside the district's own bounds: at the perimeter the beam passes through the facades by design
      const edge = (lv.bounds ?? 60) - 10;
      const hits = new Set<string>();
      for (let s = -edge; s <= edge; s += 0.5) {
        const cx = line.axis === "x" ? s : line.at;
        const cz = line.axis === "x" ? line.at : s;
        const hx = line.axis === "x" ? bb.max.x : bb.max.z;
        const hz = line.axis === "x" ? bb.max.z : bb.max.x;
        const car = { x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz, y0: line.y + bb.min.y + 1e-3, y1: line.y + bb.max.y };
        for (const b of solids) {
          if (car.x0 < b.max.x && car.x1 > b.min.x && car.z0 < b.max.z && car.z1 > b.min.z && car.y0 < b.max.y && car.y1 > b.min.y) hits.add(`${b.tag ?? "box"} @ ${b.min.x.toFixed(1)},${b.min.y.toFixed(1)},${b.min.z.toFixed(1)}`);
        }
        swept++;
      }
      expect([...hits], `${id}: the car passes through`).toEqual([]);
    }
    expect(swept, "no district had a monorail to sweep").toBeGreaterThan(100);
  });

  it("drives head-lamps first on both axes", () => {
    for (const axis of ["x", "z"] as const) {
      const line: TramLine = { axis, at: 0, y: 9.4, from: -100, to: 100, period: 26 };
      const tram = new Tram(line);
      tram.update(1, new THREE.Vector3());
      const cars = tram.group.children as THREE.Group[];
      const before = cars.map((c) => c.position.clone());
      tram.update(0.2, new THREE.Vector3());
      cars.forEach((car, i) => {
        const moved = car.position.clone().sub(before[i]!);
        expect(moved.length(), `${axis} car ${i} did not move`).toBeGreaterThan(1);
        // the head lamps: the warm-white mesh
        const head = car.children.find((m) => (m as THREE.Mesh).material instanceof THREE.MeshBasicMaterial && ((m as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex() === 0xfff3d0) as THREE.Mesh;
        head.geometry.computeBoundingBox();
        car.updateWorldMatrix(true, true);
        const at = head.geometry.boundingBox!.getCenter(new THREE.Vector3()).applyMatrix4(head.matrixWorld).sub(car.position);
        expect(at.dot(moved), `${axis} car ${i} drives lamps-last`).toBeGreaterThan(0);
      });
    }
  });
});
