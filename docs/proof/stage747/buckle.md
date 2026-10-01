# Stage 747 — buckle

The belt clasp bakes shade 0.62. The belt lathe stays shade 1. The office ghost uses the same vertex colour.

Mutation: the buckle `part` call dropped `BUCKLE_SHADE`, so the shade defaulted to 1. `tests/character.test.ts` "the buckle is darker than the belt it closes" failed once (`the buckle wears the cloak: expected 0 to be greater than 8`). The shade was put back.
