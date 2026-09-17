/**
 * One mesh per material (Stage 60). The body itself moved to rig.ts in Stage 63 — a hooded cloak
 * on bones — and this helper stayed for the held weapons and the training dummies.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * One mesh per material (Stage 60). A body or a weapon is built from parts, and every part is a
 * draw call — the mirror-free rig cost eight where the first-person weapon cost five, and the city
 * budget was already within three calls of its line. The parts' local transforms are baked into
 * their geometry and the parts that share a material become one mesh; the materials themselves are
 * untouched, so a worn skin's tint and plate still reach the strip.
 */
export function mergeByMaterial(group: THREE.Object3D): void {
  const parts: THREE.Mesh[] = [];
  for (const o of group.children) if (o instanceof THREE.Mesh) parts.push(o);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const m of parts) {
    m.updateMatrix();
    const g = m.geometry.clone().applyMatrix4(m.matrix);
    const mat = m.material as THREE.Material;
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat)!.push(g);
    group.remove(m);
    m.geometry.dispose();
  }
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (merged) group.add(new THREE.Mesh(merged, mat));
  }
}
