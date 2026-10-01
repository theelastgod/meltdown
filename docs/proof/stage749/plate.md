# Stage 749 — shoulder plate

Each shoulder plate bakes shade 0.55. The chest strap stays 0.78. A bare shoulder has no plate vertices. The office ghost uses the same vertex colour.

Mutation: both plate `part` calls dropped `PLATE_SHADE`, so the shade defaulted to 1. `tests/character.test.ts` "a shoulder plate is darker than the strap beside it" failed once (`the plates wear the cloak: expected 0 to be greater than 30`). Both shades were put back.
