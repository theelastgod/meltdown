# Stage 751 — collar

The neck roll of the hood bakes shade 0.68. The hood shell stays shade 1. The opening stays shade 0. The office ghost uses the same vertex colour.

Mutation: the collar `part` call dropped `COLLAR_SHADE`, so the shade defaulted to 1. `tests/character.test.ts` "the hood's collar is darker than the hood it sits under" failed once (`the collar wears the hood: expected 0 to be greater than 20`). The shade was put back.
