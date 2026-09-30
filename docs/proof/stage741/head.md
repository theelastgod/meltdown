# Stage 741 — bare heads

Ida and Wern body geometries, and Ida's walker. Vertices with colour 0 sit above 1.5 m. Cloth vertices are colour 1. The Deacon's coat has no black vertices. Void counts stay 0 on the bare heads.

Mutation: both of Ida's head spheres painted 1 instead of 0. `tests/fixers.test.ts` "a bare head is black on the coat, and the coat stays cloth" failed once (`expected 0 to be greater than 30`). The paints were put back.
