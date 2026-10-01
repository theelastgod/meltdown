# Stage 744 — boots

The boot shaft (cylinder at y 0.17) and the sole (box at y 0.0375) bake shade 0.22. The shin stays shade 1. The office ghost uses the same vertex colour.

Mutation: both boot `part` calls dropped `BOOT_SHADE`, so the shade defaulted to 1. `tests/character.test.ts` "the boots are darker than the cloak they stand under" failed once (`the boots wear the cloak: expected not > 20` at the boot count). The shade was put back.
