# Stage 743 — hair

Ida, Wern, and Ida's walker. Vertices above 1.78 m with colour 1 are the hair. The face sphere stays colour 0.

Mutation: both hair spheres painted 0. `tests/fixers.test.ts` "a bare head is black on the coat, and the coat stays cloth" failed once (`vessel hair is painted with the face: expected 0 to be greater than 8`). The hair was put back to colour 1.
