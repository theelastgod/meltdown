# Stage 739 — the slab at two fifths

`stone` is `mix(1.0, lum / albedoMean, 0.4)`. A texel at the plate's average still multiplies by 1. A darker joint pulls the bed toward 0.4 of that darkness, not all of it. The Stage 657 tone stays the majority of the bed.

Mutation: the mix was removed and the slab was applied in full. `tests/wetfloor.test.ts` failed once: the source no longer matched `mix(1.0, lum / albedoMean, 0.4)`.

Restored.
