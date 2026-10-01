# Stage 750 — belt

The waist band bakes shade 0.4. The coat above it stays shade 1. The buckle stays 0.62. The office ghost uses the same vertex colour.

Mutation: the belt `part` call dropped `BELT_SHADE`, so the shade defaulted to 1. `tests/character.test.ts` "the belt is darker than the coat it cinches" failed once (`the belt wears the coat: expected 0 to be greater than 20`). The shade was put back.
