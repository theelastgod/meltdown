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
  {
    id: "skin_phosphor_plate",
    kind: "texture",
    file: "skin_phosphor_plate.png",
    size: 256,
    bytes: 109719,
    sha256: "f88f2def9d350da6c0c25dd620506e948b440fd5c58e57eb69b44fe2d844f5b1",
    provenance: "generated (Higgsfield nano_banana_pro, 2026-09-11), conditioned by tools/asset-add.ts",
  },
  {
    id: "skin_kernel_plate",
    kind: "texture",
    file: "skin_kernel_plate.png",
    size: 256,
    bytes: 143472,
    sha256: "06cd6e038192cbe29b8e1f304395db61223fb5cb55ea8ce677c1eeaddd7038e3",
    provenance: "generated (Higgsfield nano_banana_pro, 2026-09-11), conditioned by tools/asset-add.ts",
  },
  {
    id: "skin_deadletter_plate",
    kind: "texture",
    file: "skin_deadletter_plate.png",
    size: 256,
    bytes: 137503,
    sha256: "d5cab717b2cc4e9abcd758457cf457c5c7ace38ce30bc8a47fad78d67376ccbf",
    provenance: "generated (Higgsfield nano_banana_pro, 2026-09-11), conditioned by tools/asset-add.ts",
  },
  {
    id: "skin_wake_plate",
    kind: "texture",
    file: "skin_wake_plate.png",
    size: 256,
    bytes: 135985,
    sha256: "dfff116291c119386ccd6eb6ba4141e43766fc29d4bfecaf3130fe7eafedc8bc",
    provenance: "generated (Higgsfield nano_banana_pro, 2026-09-20), conditioned by tools/asset-add.ts",
  },
  {
    id: "skin_clockeater_plate",
    kind: "texture",
    file: "skin_clockeater_plate.png",
    size: 256,
    bytes: 166486,
    sha256: "cc399891fba5b8ec5273f32499c4a76a874fcd2e194f7d6f63c0ad8d0dbc086b",
    provenance: "generated (Higgsfield nano_banana_pro, 2026-09-20), conditioned by tools/asset-add.ts",
  },
  {
    id: "skin_estate_plate",
    kind: "texture",
    file: "skin_estate_plate.png",
    size: 256,
    bytes: 141971,
    sha256: "b54fd4edf873084c5206bd9446e6d81b6d6153df4d9e84663cad5944ea64502c",
    provenance: "generated (Higgsfield nano_banana_pro, 2026-09-20), conditioned by tools/asset-add.ts",
  },
  {
    id: "skin_ledger_plate",
    kind: "texture",
    file: "skin_ledger_plate.png",
    size: 256,
    bytes: 166400,
    sha256: "b46e5b3866d77b13e7ce61b24dde59fe4f6142506ff74e2bc2c4085cdd237256",
    provenance: "generated (Higgsfield nano_banana_pro, 2026-09-20), conditioned by tools/asset-add.ts",
  },
  {
    id: "tex_wet_asphalt",
    kind: "texture",
    file: "tex_wet_asphalt.png",
    size: 256,
    bytes: 177683,
    sha256: "5786ab9e7ad0773457a93738c215a5c65fedbb486f84e6a59b23210a8a903e80",
    provenance: "generated (Higgsfield nano_banana_pro, 2026-09-20), conditioned by tools/asset-add.ts",
  },
  {
    id: "tex_neon_brick",
    kind: "texture",
    file: "tex_neon_brick.png",
    size: 512,
    bytes: 431908,
    sha256: "96acb50de75d2965b6fa3a7d807e3c9a730206321e7ce23dfa569e57318cc7e7",
    provenance: "generated (Higgsfield nano_banana_pro, 2026-09-20), conditioned by tools/asset-add.ts",
  },
  {
    id: "tex_vantage_hazard",
    kind: "texture",
    file: "tex_vantage_hazard.png",
    size: 256,
    bytes: 157842,
    sha256: "a2ed3942f6dc73460e7a7d3c09cc3a39fbb0be21216f0c3541eb6d2d4a5fe8ad",
    provenance: "generated (Higgsfield nano_banana_pro, 2026-09-20), conditioned by tools/asset-add.ts",
  },
  {
    id: "tex_white_office",
    kind: "texture",
    file: "tex_white_office.png",
    size: 512,
    bytes: 435594,
    sha256: "c3e192ea47dee7e2335987a683c826adc36d43505d7e21e17a79d679a5f9406c",
    provenance: "generated (Higgsfield nano_banana_pro, 2026-09-20), conditioned by tools/asset-add.ts",
  },
];

export const assetById = (id: string): AssetDef | undefined => ASSETS.find((a) => a.id === id);
export const assetUrl = (a: AssetDef): string => `/assets/${a.file}`;
export const totalAssetBytes = (): number => ASSETS.reduce((n, a) => n + a.bytes, 0);
