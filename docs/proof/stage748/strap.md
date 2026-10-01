# Stage 748 — chest strap

The band across the chest bakes shade 0.78. The coat on the chest bone stays shade 1. The office ghost uses the same vertex colour.

Mutation: the strap `part` call dropped `STRAP_SHADE`, so the shade defaulted to 1. `tests/character.test.ts` "the chest strap is darker than the cloth it crosses" failed once (`the strap wears the cloak: expected 0 to be greater than 8`). The shade was put back.
