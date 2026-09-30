# Stage 731 — a line keeps the alert in the bar

`alertOnCut(true)` is `{ top: 8, z: "6" }`. `alertOnCut(false)` is `{ top: 58, z: "" }`. The cutscene sets the alert from `alertOnCut(on)`, including `banner.style.zIndex = seat.z`, so the line paints the words in the bar instead of under it or on the face.

Mutation: a line still returned the home seat. `tests/faceplate.test.ts` failed once: expected `{ top: 8, z: "6" }`, received `{ top: 58, z: "" }`.

Restored.
