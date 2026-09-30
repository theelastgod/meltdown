# Stage 736 — the wet street is stone

`tex_plaza_slab` is 256×256. Decoded sRGB to linear, its mean luma (0.2126 R + 0.7152 G + 0.0722 B) is 0.0885. The shader divides by that, so a texel at the average multiplies the bed by 1. The Stage 657 tone `vec3(0.024, 0.029, 0.041)` is still the bed.

Until the file arrives the sampler is a 1×1 white and the mean uniform is 1, which is the same multiply. The slab and `SLAB_LUMA` are assigned together.

`tex_pavement` was the other candidate and was rejected: it is a picture of a lit street, horizon included, not a tile.

Mutation: deleted `base *= stone`. `tests/wetfloor.test.ts` failed once on that line. Restored.
