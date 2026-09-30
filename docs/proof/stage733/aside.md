# Stage 733 — the lens steps off the hood

`FACE_HOOD` is 0.22 m. A stand shorter than that is inside the cloth. `lensBeside` is the remaining side of that circle, to the right of the look. A full 0.72 m stand steps nowhere.

The player is 0.25 m in front of the Deacon. `standOff` is 0.1375 m. The side-step is about 0.17 m. The lens is at least 0.22 m from the face, still short of the player, and off the centre line.

Mutation: `lensBeside` returned 0. `tests/faceshot.test.ts` failed once: expected 0 to be greater than 0.

Restored.
