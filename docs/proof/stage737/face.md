# Stage 737 — the face stays black

The hood and the face plate are one mesh. The shell vertices are colour 1. The plate vertices are colour 0, and they sit above y 1.35. The hood material has `vertexColors: true`, on the crowd and on the wake cell, so the cloak map multiplies the plate to black.

Mutation: the crowd hood dropped `vertexColors`. `tests/character.test.ts` failed once: the source no longer matched the material line.

Restored.
