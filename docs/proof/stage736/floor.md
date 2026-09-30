# Stage 736 — the wet street is stone

`tex_plaza_slab` is 256×256. Decoded sRGB to linear, its mean luma (0.2126 R + 0.7152 G + 0.0722 B) is 0.0885. The shader divides by that, so a texel at the average multiplies the bed by 1. The Stage 657 tone `vec3(0.024, 0.029, 0.041)` is still the bed.

Until the file arrives the sampler is a 1×1 white and the mean uniform is 1, which is the same multiply. The slab and `SLAB_LUMA` are assigned together.

`tex_pavement` was the other candidate and was rejected: it is a picture of a lit street, horizon included, not a tile.

`probe:look` on drainage yard, street crop, with the 0.4 mix: dark 37.7%, luma 0.141, skyline luma 0.091, street 1.54× the skyline. Whole lane frame 66% dark, luma 0.109. The same crop at full strength was 52.9% dark at luma 0.142. Bounds are dark 8–60%, luma ≤ 0.145, split ≤ 1.62.

The sim-rate check read 11.7 and 12.7 Hz at 1.1 fps. Load average at the time was over 100. The look checks passed.

Mutation: deleted `base *= stone`. `tests/wetfloor.test.ts` failed once on that line. Restored.
