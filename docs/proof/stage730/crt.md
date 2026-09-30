# Stage 730 — a host who is not in the room still has a face

`hostPush("you", false, false)` is true. A filmed host, your own line, a fixer, and the terminal speaker are false. The campaign arms the cutscene with `hostPush(speaker, youIsSelf, shot !== null)` beside the terminal push.

Mutation: `hostPush` returned false. `tests/terminal.test.ts` failed once: expected false to be true.

Restored.
