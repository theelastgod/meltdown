/**
 * A file's body as the city sees it (Stage 60): a hooded silhouette, a strip of faction trim, and
 * a hand that holds a weapon. Remote players have been drawn with this since Stage 2; the local
 * player is drawn with it too now that the camera stands behind them. Nothing mechanical lives
 * here — a body is a picture of a capsule the sim owns.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MOVE } from "../../shared/sim/constants";
import { PALETTE } from "./city";

export interface Body {
  group: THREE.Group;
  /** the cloak: its emissive takes the worn skin's tint */
  mat: THREE.MeshStandardMaterial;
  /** the trim strip: takes the tint outright */
  trim: THREE.MeshBasicMaterial;
  /** the hand: a socket at chest height on the right, turned with the aim's pitch; a weapon parents here */
  hand: THREE.Group;
}

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

export function buildBody(): Body {
  const group = new THREE.Group();
  // the cloak is near-black: a silhouette the strip-lights barely find, with the faintest cast of
  // the worn tint. Up close and under the rig lights a brighter emissive read as a lit pillar (Stage 60)
  const mat = new THREE.MeshStandardMaterial({ color: 0x05060a, emissive: PALETTE.cyan, emissiveIntensity: 0.025, roughness: 1 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(MOVE.capsuleRadius - 0.02, MOVE.standHeight - MOVE.capsuleRadius * 2, 4, 10), mat);
  body.position.y = MOVE.standHeight / 2;
  group.add(body);
  // the hood wears the cloak's material so the two are one mesh
  const hood = new THREE.Mesh(new THREE.ConeGeometry(MOVE.capsuleRadius + 0.06, 0.5, 8), mat);
  hood.position.y = MOVE.standHeight - 0.05;
  group.add(hood);
  const trim = new THREE.MeshBasicMaterial({ color: PALETTE.cyan });
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.05), trim);
  strip.position.set(MOVE.capsuleRadius - 0.02, 1.05, 0);
  group.add(strip);
  mergeByMaterial(group);
  const hand = new THREE.Group();
  // past the cloak's edge on the right, so the weapon shows from behind
  hand.position.set(0.36, 1.32, -0.2);
  group.add(hand);
  return { group, mat, trim, hand };
}
