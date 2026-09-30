# Stage 719 — the speaker looks at the player

Player at (4, 1). Deacon placed at (1.6, −5) with yaw 0.4.

The shot yaw is `yawTo` from the Deacon to the player (−2.76), not 0.4. Wern does the same from (1.25, −7.25). Standing on the figure's own XZ keeps the placed yaw.

The renderer turns the visitor with `faceVisitor(s.yaw)` when the shot's look point is that figure, and sets Wern's `rotation.y` the same way. The other body in the room is left as it was stood.

Mutation: `yawAt` returned the placed yaw. `tests/faceshot.test.ts` failed once: expected 0.4 to be close to −2.76.

Restored.
