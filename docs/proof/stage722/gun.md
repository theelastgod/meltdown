# Stage 722 — a line takes the gun off the lens

`gunOnLine(0, true)` and `gunOnLine(0.1, true)` hide the weapon. No shot leaves it up. The renderer calls `gunOnLine(k, this.faceShot !== null)` and no longer waits for `k > 0.35`.

Mutation: the hide waited until the blend passed 0.35. `tests/faceshot.test.ts` failed once: `gunOnLine(0, true)` was false.

Restored.
