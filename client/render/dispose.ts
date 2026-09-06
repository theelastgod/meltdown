/**
 * Releasing what the renderer removes.
 *
 * Removing an `Object3D` from a scene does not free its GPU buffers. Three.js only releases them on
 * `geometry.dispose()` / `material.dispose()`, and nothing about the scene graph reminds you — so
 * the natural way to write the code (`scene.remove(x); map.delete(id)`) leaks a buffer every time.
 * The renderer did this in seven places: every grenade thrown, every wasp drone, every mech, every
 * gas cloud, every claim picked up, every player who left the match, and every wake flip ring.
 *
 * None of them was visible as a bug. A leaked buffer renders nothing and throws nothing; it just
 * accumulates until the tab is slow, which is the kind of fault that gets blamed on "browsers".
 *
 * So there is one helper, and `probe/stage21.ts` holds the resource count flat through a match to
 * make sure it is the one that gets used.
 *
 * ## Shared resources
 *
 * Some geometries and materials are deliberately shared across many objects — one octahedron for
 * every claim, one material per projectile kind. Disposing those with the first object that dies
 * would break every one after it. Mark them once with `markShared` at the point they are created,
 * and `release` walks past them.
 */
import * as THREE from "three";

type Disposable = { dispose(): void };
const SHARED = "__meltdownShared";

/** Mark a geometry, material or texture as owned by something other than the objects that use it. */
export function markShared<T extends { userData?: Record<string, unknown> }>(res: T): T {
  (res.userData ??= {})[SHARED] = true;
  return res;
}

/** Mark every value of a record of shared resources, which is how they are usually declared. */
export function markSharedAll<T extends Record<string, { userData?: Record<string, unknown> }>>(res: T): T {
  for (const v of Object.values(res)) markShared(v);
  return res;
}

const isShared = (res: { userData?: Record<string, unknown> } | null | undefined): boolean => !!res?.userData?.[SHARED];

function disposeMaterial(mat: THREE.Material): void {
  if (isShared(mat)) return;
  // a material's maps are its own unless they were marked shared; a shared atlas outlives it
  for (const v of Object.values(mat as unknown as Record<string, unknown>)) {
    if (v instanceof THREE.Texture && !isShared(v)) v.dispose();
  }
  mat.dispose();
}

/**
 * Remove `obj` from its parent and free everything it owns, all the way down its subtree.
 * Safe to call twice; safe on an object that was never added.
 */
export function release(obj: THREE.Object3D | null | undefined): void {
  if (!obj) return;
  obj.removeFromParent();
  obj.traverse((child) => {
    const mesh = child as Partial<THREE.Mesh> & { material?: THREE.Material | THREE.Material[]; geometry?: THREE.BufferGeometry };
    if (mesh.geometry && !isShared(mesh.geometry)) (mesh.geometry as unknown as Disposable).dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) for (const m of mat) disposeMaterial(m);
    else if (mat) disposeMaterial(mat);
  });
}

/** `release` for a whole map of entities, which is how every one of these is actually stored. */
export function releaseAll<K>(map: Map<K, { group?: THREE.Object3D; mesh?: THREE.Object3D } | THREE.Object3D>): void {
  for (const v of map.values()) release(v instanceof THREE.Object3D ? v : (v.group ?? v.mesh));
  map.clear();
}
