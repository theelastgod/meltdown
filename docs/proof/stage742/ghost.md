# Stage 742 — office ghost

`cloakGeometry(null)` carries a colour attribute. Every vertex with shade 0 has colour 0. `client/render/hub.ts` builds the ghost material with `vertexColors: true`.

Mutation: drop `vertexColors: true` from that material. `tests/character.test.ts` "the hood has a face opening, and what the opening shows is baked to black" failed once (the source no longer matched). The flag was put back.
