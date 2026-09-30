# Stage 728 — your own line stands you on the first frame

`bodyOnLine(0, "you")` and `bodyOnLine(0.1, "you")` are true. `bodyOnLine` of anyone else is false. The renderer calls `bodyOnLine(k, s.who)` and no longer gates the body on `k > 0.2`.

Mutation: the gate went back to `blending > 0.2`. `tests/faceshot.test.ts` failed once: expected false to be true at blend 0.

Restored.
