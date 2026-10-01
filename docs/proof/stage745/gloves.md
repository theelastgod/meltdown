# Stage 745 — gloves

The glove box on each forearm bakes shade 0.48. The sleeve cylinder stays shade 1. The office ghost uses the same vertex colour.

Mutation: the glove `part` call dropped `GLOVE_SHADE`, so the shade defaulted to 1. `tests/character.test.ts` "the gloves are darker than the sleeves they hang from" failed once (`the gloves wear the cloak: expected 0 to be greater than 8`). The shade was put back.
