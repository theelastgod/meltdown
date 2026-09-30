# Stage 721 — ending the line eases the hood

Deacon at (1.6, −5), placed yaw 0.4, player at (4, 1). The waiting turn settles at the 0.9 rad cap. The line holds −2.76.

`holdFace(null)` then one `attend` at 1/60 s moves at most `1.6/60` rad off that line. It does not return to the cap.

Mutation: release deleted the hold and left the stored offset. The same step jumped 2.22 rad. `tests/faceshot.test.ts` failed once: expected 2.22 to be ≤ 0.027.

Restored.
