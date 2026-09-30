# Stage 732 — the lens stops short

The full stand is 0.72 m. `FACE_CLEAR` is 0.16 m. A body in the lens closer than 0.88 m pulls the stand to 55% of that gap.

The Deacon at the origin, yaw 0 (looking −Z). The player at z = −0.4 is 0.4 m in front. `lensGap` is 0.4. `standOff(0.4)` is 0.22, which is less than 0.4 and outside the hood. A player 2 m to the side is not in the lens, so the stand stays 0.72 m. No one in front stays 0.72 m.

Mutation: `standOff` returned 0.72 for a close gap. `tests/faceshot.test.ts` failed once: expected 0.72 to be less than 0.4.

Restored.
