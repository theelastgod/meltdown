# Stage 729 — a guest films the host

With `youIsSelf` false and a host pose, `dialogueShot` looks at the host, `who` is `other`, and the yaw is toward the guest rather than the gun. With no host pose the same line is still null. `lineEye` uses the low eye under standing height. The renderer calls `faceRemote(s.lookX, s.lookZ, s.yaw)`. The campaign passes `host: youIsSelf ? null : this.hostBody()`.

Mutation: a mirrored "you" returned null even when the host was set. `tests/faceshot.test.ts` failed once: the shot was null.

Restored.
