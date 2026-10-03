# Stage 948 onward — asset production record

Source: `docs/ASSET-HANDOFF.md`, Stage 947 (`ee2d9a6`). Started 2026-10-02. Built-in image generation; one independent source per asset. Existing generated provenance is retained as requested by the handoff; this record documents replacement authorship and conditioning.

## Checklist

- [x] 16 named priority environment textures: four plaza, three road/kerb, four wall, three facade, two tread.
- [x] Seven useful new tiles, one in each permitted short family: crate, car, cone, barrel, chain, awningAlt, officewall. Capacity is a ceiling, not a requirement to fill all slots with redundant variations.
- [x] All eight district arrival illustrations.
- [x] All five speaker portraits and both coat textures.
- [x] Shared weapon body, dark parts, Directive core, Wasp and mech hulls.

Existing mission/gig/ending/kit pictures and icons are inventory in the handoff, not missing bindings. Verify their presence rather than generating unreferenced replacements. No videos, meshes, sign PNGs or new undrawn plates. Keep the wet-floor mix and awning deal unchanged. Preserve unrelated `probe/city.ts` and `docs/proof/release-708/`.

Each completed group will record file hashes, full prompts, source paths, conditioning, asset lint and relevant checks. Do not mark completion based on generation alone.

## Completed integration and verification

All 43 generated images are installed: 23 replacement textures, seven new textures in permitted short pools, eight district cards, and five portraits. Individual records contain full prompts, final hashes, source paths and conditioning. Existing mission/gig/ending/kit/icon inventory is complete. All new tiles are bound; the 66 undrawn plates remain unchanged.

Asset lint passes: 339 assets, 47,477.6 KiB of 65,536 KiB, zero violations. All 75 targeted tests across six files pass. Client/server type checks pass. All 43 images decode. Cards are exactly 960×411 and 75,092–135,879 bytes, below the existing 150,000-byte ceiling. Chain transparency is 81.8%.

In-game look probe: 17/19 checks passed, clean browser console, three captured frames. Failures: street luma 0.142 exceeds its existing bound (baseline CI was 0.145); software-rendered simulation 13 ticks/s at 1.8 fps. No test bounds were weakened. This does not certify production performance.

Wet-floor blend remains 0.4; only measured slab luma normalization changed. Primary awning pool, long pools, geometry, and financial configuration unchanged.

## Corrected initial failures

The brick exceeded 512 KiB at 512×512; conditioning to 256×256 fixed it. Combined crop/resize produced 410px-tall cards; separate operations produce 411px. JPEG quality 85 exceeded the card budget; quality 75 passes.

## Release limitation

Baseline CI fails look, campaign, world, ship, mobile and tps (baseline-release.md). Production remains unchanged while these checks are unresolved. This artwork set is complete and integrated, but the whole game is not release-certified.

Production build: passed. Vite reports its existing large-chunk advisory. No production upload was performed.
