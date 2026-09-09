/**
 * The asset loader (Stage 43).
 *
 * Three properties, in order of how much they matter:
 *
 * 1. **It fails soft.** A missing file, a 404, a decode error, a browser with no WebGL — every one
 *    of them returns `null`, and every caller keeps the `CanvasTexture` it drew before this file
 *    existed. The game has run for forty-two stages with no art at all; an art pipeline that can
 *    take it down would be a downgrade.
 * 2. **It is renderer-only.** Nothing here is reachable from `shared/sim` or `server/room`, and
 *    `tests/assets.test.ts` walks the import graph to keep it that way. A texture cannot change
 *    what a shot does.
 * 3. **It loads once.** The cache is keyed by asset id and holds the in-flight promise, not just
 *    the result, so two callers asking during startup share one request.
 */
import * as THREE from "three";
import { assetById, assetUrl, type AssetDef } from "../../shared/assets/manifest";

const cache = new Map<string, Promise<THREE.Texture | null>>();

/** Counts for the frame probe and for anyone asking why memory moved. */
export const assetStats = { requested: 0, loaded: 0, failed: 0 };

function load(def: AssetDef): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      assetUrl(def),
      (tex) => {
        // colour maps are authored in sRGB; the renderer works in linear
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 1;
        tex.needsUpdate = true;
        assetStats.loaded++;
        resolve(tex);
      },
      undefined,
      () => {
        assetStats.failed++;
        resolve(null);
      },
    );
  });
}

/**
 * The texture for an id, or `null` if there is not one — which is not an error and never throws.
 * An unknown id is the same answer as a failed download on purpose: the caller's fallback is the
 * same either way, and a renderer that throws on a typo in a cosmetic is a renderer that crashes
 * in front of a player.
 */
export function texture(id: string): Promise<THREE.Texture | null> {
  const hit = cache.get(id);
  if (hit) return hit;
  const def = assetById(id);
  assetStats.requested++;
  const p = def && def.kind === "texture" ? load(def) : Promise.resolve(null);
  cache.set(id, p);
  return p;
}

/** Drop everything: used by tests and by a district change that wants the memory back. */
export function disposeAssets(): void {
  for (const p of cache.values()) void p.then((t) => t?.dispose());
  cache.clear();
  assetStats.requested = assetStats.loaded = assetStats.failed = 0;
}
