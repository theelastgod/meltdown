# Stage 716 — a reply faces the other person

Player at the origin, gun yaw π (looking +Z). Deacon stands at (1.6, −5).

The reply's yaw is `yawTo` toward the Deacon (−0.31), not π. The lens sits `FACE_STAND` (0.72 m) along that yaw. A line with nobody else in the room still uses the gun yaw.

The two look points are 5.25 m apart. `faceCuts` is true across that gap, false for the same face, and false when a line opens or closes (`null`).

Mutation: the reply used `player.yaw`. `tests/faceshot.test.ts` failed once: expected π to be close to −0.31.

Mutation: `FACE_CUT_M` set to 100. The same test failed once: expected 5.25 to be greater than 100.

Restored. `FACE_CUT_M` is 0.5. The renderer sets `faceT = 1` when `faceCuts` is true, and the local body holds `s.yaw` on a you-shot.
