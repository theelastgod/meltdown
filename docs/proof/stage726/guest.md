# Stage 726 — the host's line does not film the guest

Player at (2, 1), yaw 0.4. `dialogueShot` with `youIsSelf: false` is null. The same call without the flag is a shot of you (`who: "you"`). A Deacon standing in the room is still filmed when the flag is false.

The guest's mirror calls `armCutscene(n.speaker, false)`. The host's own machine does not.

Mutation: "you" ignored the flag. `tests/faceshot.test.ts` failed once: expected `{ who: "you", lookX: 2, … }` to be null.

Restored.
