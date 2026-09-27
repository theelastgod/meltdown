/**
 * The mastery finish (Stage 675).
 *
 * Before this stage every rank of the mastery ladder paid a chip or a firmware and the cap, rank
 * 30, paid a twentieth chip: nothing on a mastered gun could be seen. Now a weapon at the cap is
 * drawn with inlay lines in its own tracer colour set into both flanks of its receiver. Cosmetic
 * only, merged into the strip so it costs no draw call, and tinted with the strip.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildViewmodel } from "../client/render/weapons";
import { mergeByMaterial } from "../client/render/body";
import { WEAPON_LIST } from "../shared/weapons/manifest";

const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute("position").count) / 3;
const meshes = (g: THREE.Group) => g.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];

describe("the mastery finish", () => {
  it("every weapon wears it at no draw-call cost: the same meshes, the strip carrying four inlay lines more", () => {
    for (const w of WEAPON_LIST) {
      const plain = buildViewmodel(w.id);
      const fin = buildViewmodel(w.id, true);
      expect(meshes(fin).length, `${w.name} gained a mesh`).toBe(meshes(plain).length);
      const host = meshes(fin).filter((m) => m.name === "strip+finish");
      expect(host.length, `${w.name} has no finish`).toBe(1);
      const i = meshes(fin).indexOf(host[0]!);
      expect(tris(host[0]!.geometry) - tris(meshes(plain)[i]!.geometry), `${w.name}`).toBe(4 * 12);
      // on the strip's own material, so the worn skin's tint and plate reach it
      expect(host[0]!.material).toBe(fin.userData.strip);
      expect(fin.userData.mastered).toBe(true);
      expect(plain.userData.mastered).toBe(false);
    }
  });

  it("survives the held model's merge: in the hand, a mastered gun keeps every strip triangle it had plus the finish", () => {
    for (const w of WEAPON_LIST) {
      const stripTris = (g: THREE.Group) => meshes(g).filter((m) => m.material === g.userData.strip).reduce((a, m) => a + tris(m.geometry), 0);
      const plain = buildViewmodel(w.id);
      const fin = buildViewmodel(w.id, true);
      const before = stripTris(fin);
      expect(before).toBe(stripTris(plain) + 4 * 12);
      // the renderer's own merge for the weapon in the hand
      mergeByMaterial(fin);
      expect(stripTris(fin), `${w.name}: the strip dropped out of the held model`).toBe(before);
    }
  });

  it("the inlays sit on the receiver's flanks, within its length and height: not inside it, not along the barrel, not in the air", () => {
    for (const w of WEAPON_LIST) {
      const fin = buildViewmodel(w.id, true);
      // the receiver, found here and not by the code under test: the largest part in the body material
      let box = new THREE.Box3();
      let vol = -1;
      for (const m of meshes(fin)) {
        if (m.material !== fin.userData.body) continue;
        m.geometry.computeBoundingBox();
        const b = m.geometry.boundingBox!.clone().translate(m.position);
        const v = b.getSize(new THREE.Vector3());
        if (v.x * v.y * v.z > vol) { vol = v.x * v.y * v.z; box = b; }
      }
      expect(vol, `${w.name} has no receiver`).toBeGreaterThan(0);
      const host = meshes(fin).find((m) => m.name === "strip+finish")!;
      const plainHost = meshes(buildViewmodel(w.id))[meshes(fin).indexOf(host)]!;
      const p = host.geometry.getAttribute("position");
      const n = p.count;
      // the inlay boxes are the vertices merged in after the strip's own
      let outside = 0;
      expect(n - plainHost.geometry.getAttribute("position").count).toBeGreaterThan(0);
      for (let k = plainHost.geometry.getAttribute("position").count; k < n; k++) {
        const x = p.getX(k) + host.position.x, y = p.getY(k) + host.position.y, z = p.getZ(k) + host.position.z;
        const gap = Math.abs(x - (box.min.x + box.max.x) / 2) - (box.max.x - box.min.x) / 2;
        if (gap < -0.0005 || gap > 0.006) outside++;
        if (y < box.min.y || y > box.max.y || z < box.min.z || z > box.max.z) outside++;
      }
      expect(outside, `${w.name}: an inlay is not on the flank`).toBe(0);
    }
  });
});
