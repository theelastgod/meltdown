# Stage 720 — the close-up keeps the face it aimed

Deacon at (1.6, −5), placed yaw 0.4. Player at (4, 1).

After three seconds of the waiting turn the figure sits at yaw 1.3 (the 0.9 rad cap). The line's yaw is −2.76. `holdFace` then one `attend` leaves the yaw at −2.76. The chest scale still changes on the next step, so the breath was not skipped. The wait-turn's stored offset is unchanged.

The renderer pins that hold on the office visitor and on Wern for the active shot, and clears it for anyone the shot is not on. `attend` runs later in the same frame.

Mutation: `attend` ignored `faceHold` and wrote the cap. `tests/faceshot.test.ts` failed once: expected 1.3 to be close to −2.76.

Restored.
