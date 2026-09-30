# Stage 738 — the gate is CRT

The curriculum stores "10 headshot kills". The file draws `gate.text.toUpperCase()`, so the panel says `GATE R5: 10 HEADSHOT KILLS`. The stored sentence is unchanged.

Mutation: the draw used `gate.text`. `tests/endgame.test.ts` failed once: the source no longer matched `toUpperCase()`.

Restored.
