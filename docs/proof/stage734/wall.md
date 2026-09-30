# Stage 734 — the lens steps away from the wall

A stand under 0.22 m steps aside by the rest of that circle. The right-hand point is the default. `lensSide` returns that distance when the right is open, the negative when only the right is blocked, and zero when both sides are in a solid or the stand already clears the hood.

The Deacon at the origin, the player 0.25 m in front. An open room puts the lens on the right (about +0.17 m). A solid on that side puts it on the left, still at least 0.22 m from the face. Both sides solid keeps the side component under 0.02 m.

`solidAt` is the room test: a point inside a box at that height. A point above the box is not a wall. The campaign passes the level boxes at the player's eye.

Mutation: `lensSide` kept the right step when the wall was there. `tests/faceshot.test.ts` failed once: expected 0.17 to be less than −0.1.

Restored.
