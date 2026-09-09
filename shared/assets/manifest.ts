/**
 * Declared art assets, and the rules that keep them out of the simulation (Stage 43).
 *
 * MELTDOWN shipped forty-two stages with no source art at all: every texture is a `CanvasTexture`
 * drawn at runtime, the audio is synthesised, and the geometry is Three.js primitives. That is why
 * the frame budget in Stages 21–22 could be measured so exactly, and it is why docs/ECONOMY.md §6.1
 * still counts the Forge — the creator-cosmetics sink — at zero: the blocker was never the pictures,
 * it was that there was nowhere to put one.
 *
 * This is that somewhere, and it is deliberately narrow.
 *
 * **An asset is a picture and a promise about its size.** `AssetDef` has no stat field, no damage,
 * no speed, no cooldown, and there is nowhere to add one that the fairness rules would not see. The
 * sim never imports this file — `tests/assets.test.ts` walks the static import graph and fails if it
 * ever does — so an asset cannot change what a shot does even by accident. It reaches the renderer
 * or it reaches nothing.
 *
 * **Every asset is optional.** The loader fails soft to `null` and each caller keeps its procedural
 * path, so the game runs exactly as it does today with the whole manifest deleted. An art pipeline
 * that can take the game down is worse than no art pipeline.
 *
 * **The budget is declared, not discovered.** Bytes and hash are in the manifest and `lint:assets`
 * checks them against the files on disk. A texture that quietly triples in size fails the build
 * rather than the frame budget.
 */

/** The one kind the renderer can use today. Adding a kind means adding a loader and a budget for it. */
export type AssetKind = "texture";

export interface AssetDef {
  id: string;
  kind: AssetKind;
  /** path under `public/assets`, served as `/assets/<file>` */
  file: string;
  /** square edge in pixels; power of two, because it is uploaded to the GPU as-is */
  size: number;
  /** bytes on disk — declared here so a silent bloat fails the lint, not the frame budget */
  bytes: number;
  /** sha256 of the file: what ships is what was reviewed */
  sha256: string;
  /** one line on where it came from, so a generated asset is never mistaken for a drawn one */
  provenance: string;
}

/**
 * Per-asset and total ceilings.
 *
 * A texture is uploaded uncompressed: a 512² RGBA costs about 1 MB of GPU memory whatever the PNG
 * on disk weighs, which is the number that matters on the phone build Stage 32 shipped. The disk
 * budget below is the download; `MAX_TEXTURE_EDGE` is what bounds the memory.
 */
export const MAX_ASSET_BYTES = 512 * 1024;
export const ASSET_BUDGET_BYTES = 4 * 1024 * 1024;
export const MAX_TEXTURE_EDGE = 1024;

export const ASSETS: readonly AssetDef[] = [
  {
    id: "skin_rust_plate",
    kind: "texture",
    file: "skin_rust_plate.png",
    size: 256,
    bytes: 165008,
    sha256: "770917fbef63d4baf123fdabe84d5908fdba2e0ca992c53da60d490a0454ffa4",
    provenance: "generated (Higgsfield nano_banana_pro, 2026-09-09), conditioned by tools/asset-add.ts",
  },
];

export const assetById = (id: string): AssetDef | undefined => ASSETS.find((a) => a.id === id);
export const assetUrl = (a: AssetDef): string => `/assets/${a.file}`;
export const totalAssetBytes = (): number => ASSETS.reduce((n, a) => n + a.bytes, 0);
