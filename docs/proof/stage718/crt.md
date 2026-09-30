# Stage 718 — the file's line pushes the terminal in

`terminalPush` is true only for speaker `terminal` with no body in the shot.

The HUD adds class `file` in that case. On a desk the terminal moves to `bottom: 18vh` and scales to 1.14. On a phone it scales to 1.06 and keeps the seat the pads already gave it.

A Deacon line, a you-line, and VANTAGE do not push. A terminal line that already has a camera shot does not either.

Mutation: `terminalPush` returned false. `tests/terminal.test.ts` failed once: expected false to be true.

Restored.
