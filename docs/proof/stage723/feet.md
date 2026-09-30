# Stage 723 — your own line stands you on your feet

Feet at (3, 1, −2). `ownStand("you", false, feet)` and `ownStand("you", true, feet)` are those feet. `ownStand("other", …)` is null.

The renderer calls `ownStand(s.who, this.thirdPerson, …)` and sets `local.group.position` from it when the line is yours. First person had been hiding that group and leaving it unmoved.

Mutation: first person returned null. `tests/faceshot.test.ts` failed once: expected null to deeply equal `{ x: 3, y: 1, z: -2 }`.

Restored.
