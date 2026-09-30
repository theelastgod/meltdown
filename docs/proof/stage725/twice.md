# Stage 725 — a plate line does not show the face twice

`thumbBeside("/portraits/deacon.jpg", "/portraits/deacon.jpg")` is null. `thumbBeside(null, "/portraits/deacon.jpg")` keeps the thumbnail, which is the body-shot case. No plate and no portrait stays null.

The host's terminal and the guest's mirror both pass the plate the cutscene just armed.

Mutation: the thumbnail always came back. `tests/faceplate.test.ts` failed once: expected `/portraits/deacon.jpg` to be null.

Restored.
