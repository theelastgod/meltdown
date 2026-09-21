# Handoff — picking up the stage loop

Written 2026-09-21, at Stage 197, for whoever works this next. It is deliberately not addressed to
a particular agent: everything here holds for anyone who picks the branch up.

Read this, then `docs/BACKLOG.md`, then the top three entries of `docs/STAGES.md`. That is about
twenty minutes and it is the whole job.

---

## 1. Where things stand

| | |
| --- | --- |
| Branch | `claude/meltdown-game-design-uovda4` — **work here, push here, nowhere else** |
| HEAD | Stage 197 on this branch (PAID prints two decimal places) |
| Next stage number | **198** |
| CI | `verify` runs #202–#208 (Stages 172–178) all green; 179 not yet watched on CI |
| Unit tests | ~1027 across 115 files, `npm test` |
| Probes | 23, 523 checks, ~35–40 min for the full sweep |
| Lints | four: `fairness`, `campaign`, `economy`, `assets` |
| Working tree | clean |

There is no pull request and none was asked for. Do not open one unless the owner asks.

Node 22. `npm ci` if `node_modules` is cold.

---

## 2. The method

This is the whole of it, and it is not negotiable — it is what makes the stage entries in
`docs/STAGES.md` worth anything.

1. **Look at real frames or real play** for something a player would notice. Not a lint you invented,
   not a refactor, not a "code smell". A thing that is wrong when someone plays the game.
2. **Verify it yourself before building anything.** Read the source. Then *measure* it — a real
   `World`, a real `Room`, a real browser page. The backlog entries are a starting point, not
   evidence. Two of them turned out sharper than written once measured, and one first measurement
   in Stage 168 was flatly wrong (a firmware had silently not been flashed because its id is
   namespaced).
3. **Build the missing thing.** The smallest change that fixes the actual cause.
4. **Guard it with a mutation-tested check.** Write the guard, then revert the fix and confirm the
   guard fails. **A mutation that passes is a hole to close**, not a result to accept.
5. **Verify on a still tree.** Full `npm test`, the four lints, the probe list in
   `.github/workflows/verify.yml`, then build and smoke (§4). **Do not edit source while a sweep is
   running** — the dev server hot-reloads the pages under the probes and you get three failures
   that look like findings and are not. That cost a rerun in Stage 172.
6. **One stage = one commit**, with a `docs/STAGES.md` entry inserted **above** the previous stage
   heading, `**Proof.**` filled from real measured numbers, and the mutation results written out.
7. **Push.** Only verified commits.

### The entry in `docs/STAGES.md`

Match the existing house style — read Stages 172–178 before writing one. What they have in common:

- the promise the code made, quoted from the code or its comment
- what it actually did, with **measured numbers**, usually as a small table or a block of output
- what changed, and *why that shape* rather than another
- **Proof.** — the vitest total, the sweep, build and smoke, all real
- the mutation list, each one named, each with what failed and how many
- anything tried and thrown away, and anything exposed but deliberately not fixed

Write plainly. No adjectives doing work the numbers should do.

### Commit messages

Body describes the defect, the measurement, the fix, the mutations. End with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CGtSP1FDJirbYNjg3UdwRf
```

Replace those two lines with your own attribution. Do not put a model name anywhere else in the
repository — not in code comments, not in stage entries.

---

## 3. Rules learned the hard way

Each of these cost a stage or a false start.

**On guards**

- A mutation that passes is a hole. Stage 159 had two guards where either alone sufficed; the fix
  was to find the case that separates them. Stage 164's first guard passed 5/5 with the fix
  reverted, because the bot's slide held high speed for thirty ticks — the luck had to be taken out
  by putting a whole sprint inside one `advance()` call.
- A check that passes under its own mutation is measuring the wrong moment.
- A check that fails one run in twenty is not a guard. Two such are already recorded in
  `docs/BACKLOG.md` under *Process and gates*.
- A test defending a guess fails the wrong mutations (Stage 158).
- **An existing green check may be checking the wrong half.** This is the single most productive
  pattern in this repo. Stage 171: a chip lint compared total weight and the two sides weighed the
  same *because they cancelled*. Stage 174: a test called `endingsFor`, which measures the filter
  and never the selection. Stage 176: the probe asserted the grants landed on the list the defect
  wrote to. Stage 173: CI ran the fairness lint with `--quick`, which duels three of eight weapons
  and misses all 89 violations. When you fix something, **check what was supposed to have caught
  it, and fix that too.**
- It is fine and correct for a mutation to be caught by only one of two layers, when that layer is
  the one that owns it (Stage 161). Stage 178 is the clean example: `jumpBuffer` left out fails only
  the test that plays; `airTime` left out fails only the structural walk.
- A rule can be *unwired* from the thing CI runs while every test still passes, because the tests
  call it by name. This was a real hole in both Stage 175 and Stage 176. Add a check that the rule
  fires through the entry point CI actually invokes.
- A ratchet cannot police its own record. Stage 173's debt file is guarded by tests that check each
  recorded magnitude against the percentage in its own detail line, and that percentage against the
  two times printed beside it.

**On the simulation**

- Watch for the Stage 156/164 family: work folded inside the drawn-frame branch in
  `client/game.ts`, past `if (!render || !this.drawing) return;`, that belongs to every frame.
  Anything *sampled* there rather than counted is lost on a slow machine.
- Watch for the Stage 167/168/178 family: one life's state with two definitions, the shorter one in
  a respawn or revive. `reviveWasp`, `reviveMech`, `armFromKit`, `reviveMotion` are the fixes; the
  guard is a field-for-field comparison of a revived entity against a fresh one.
- `advance(n)` is a pure synchronous tick loop that draws nothing — the tool for taking timing luck
  out of a probe.
- `poseBody` clamps its ease step at `Math.min(rawDt, 1/30)`, so a fixed frame count means the same
  thing at any frame rate.
- `rigReport().out` is a **live reference**; `bones` are value snapshots.

**On probes**

- No named arrow helpers, named function expressions, or arrow values assigned to object properties
  inside `page.evaluate` — esbuild's keep-names injects a `__name` the page does not have.
- Unique variable names across a whole probe file.
- A third concurrently-open renderer page times out on `ready`. Give an extra page the browser to
  itself, or close one first.
- A probe log buffers until the run ends: block on `[script done]`, do not poll.
- Read boxes, not hit-tests. Wait for the frame where a thing is drawn, not for a stopwatch.
- A picture's claim is read from the drawn frame, never from a state string.

**On the shell**

- **Never** `pkill -f` / `pgrep -f` with a pattern that matches your own command line. It kills your
  own shell (exit 144). This happened in Stage 177 *after* the rule was already written down.
- Kill by PID, and kill the **process**, not the `npx` wrapper in front of it. A `vite preview`
  leaked this way and served a stale `dist/` on port 5299 for two stages, silently invalidating four
  measurements in a row.
- Quote heredocs that carry code.
- Save mutation-restore copies **after** applying the stage's edits, and restore with `cp`.
- `git status` should say `??`, not `M`, for a file you meant to create.
- Do not `git stash` across long waits. A worker restart mid-stash nearly lost a stage; copying the
  files to the scratchpad is safer.

---

## 4. Verifying

```bash
npm run typecheck
npm test                       # read the TOTAL, not just "passed"
npm run lint:fairness          # ~18 s, full 366 builds — see §7
npm run lint:campaign
npm run lint:economy
npm run lint:assets
# then the 23 probes in .github/workflows/verify.yml order, ~35–40 min
npm run build && npm run smoke
```

`npm run verify` chains all of it, but running the probes from a small script that logs
`PASS/FAIL name checks/total` per probe is far easier to read and lets you keep working while it
runs. One probe per line, appended as each finishes.

**Smoke reads 6/7 locally and that is the sandbox, not the build.** `.env.production` is present and
gitignored, so a local `vite build` bakes in the live `meltdown-*.workers.dev` hosts; headless
Chromium reaches one at boot through the sandbox's TLS-inspecting proxy and refuses the re-signed
certificate. Move `.env.production` aside, rebuild, and smoke is 7/7 — that is what CI does. Put it
back and rebuild afterwards.

`probe:run` had a spell of failing in-sequence around Stages 166–171 and passing standalone; it has
now passed in sequence six sweeps running. If it fails, run it alone before concluding anything.

---

## 5. The week's work

`docs/BACKLOG.md` has **0 open findings**. The recorded sweep is closed (Stages 168–195).
New defects still follow the same method.

| | Area | Shipped |
| --- | --- | --- |
| Mon | sim-core | Stage 179 (`fromSlideJump`) |
| Tue | campaign | Stages 180–181 |
| Wed | netcode / campaign | Stages 182–184 |
| Thu | economy / copy | Stages 185–190 |
| Fri | audio-render / probes | Stages 191–195 |

---

## 6. Stage 198 is next

Stage 197 prints PAID to two places. Next is whatever a player would notice that is not
already in STAGES.md.

---

## 7. Decisions that are the owner's, not yours

**The 89 fairness violations.** `npm run lint:fairness` reports 89 `ttk-deviation` violations, all on
`stack_smg` and `clockeater`. They are real and dose-responsive: a −6% spread node moves the SMG's
40 m kill by −6.7%, −10% by −7.7%, +19% by +19.2%, +29% by +30.8% — on a weapon whose manifest says
its falloff ends at 28 m. Whether a ledger node may make an SMG viable at 40 m is a **balance**
decision. Stage 173 did not make it. Instead `shared/fairness/debt.ts` records all 89 with a stable
key and the magnitude at recording, and the lint now fails on anything **new** or **worse**.

So: you may fix any of them, and the lint will report them cleared. **Do not add to the file, and do
not loosen the rule.** If a change of yours adds a violation, that is your change to fix, not a line
to record. `npm run lint:fairness -- --record` exists and regenerating it is a deliberate act whose
diff is the thing to review.

**`stack_smg:choke` now duplicates `stack_smg:compensator`.** Stage 171 fixed two chips that netted
exactly zero, and the honest consequence is that the rank-9 muzzle chip is now identical to the
rank-6 one. No derivation produces a distinct trade there; it needs a different template for that
weapon, which is authoring. It is written up at the foot of Stage 171 and belongs with the other
owner decisions in `docs/PLAN.md`.

**The Cloudflare deploy is blocked**, not forgotten. Every `wrangler` invocation was refused by this
sandbox's permission classifier, including read-only listing, and no workaround was attempted.
`dist/` is built and carries the production hosts. It needs either a Bash permission rule for
`npx wrangler` or the owner running the four commands in `docs/DEPLOY.md` §2–3.

---

## 8. Constraints that hold regardless

- No wagering or staking mechanics of any kind.
- Rewrite rewards are cosmetic — never power.
- Kernel Protocols stay quarantined from PvP.
- The PvP match bundle must never reach `shared/economy` or `server/chain`.
  `tests/quarantine.test.ts` and `tests/counter.test.ts` enforce it, and they caught a mid-stage
  mistake in Stage 176 within seconds. Trust them.
- `.github/workflows/verify.yml` steps carry `if: ${{ !cancelled() }}` — keep it when editing.
- `npm run verify`'s script string and the workflow must agree. `tests/verify.test.ts` (Stage 30)
  checks that every check the project claims is a step CI runs; it caught exactly that drift in
  Stage 173.

---

## 9. What good looks like

At the end of a stage, someone should be able to read the `docs/STAGES.md` entry alone and know:
what was wrong, how you know, what you changed, why that shape, what would break if someone undid
it, and what you chose not to do.

If a stage's proof section contains a number you did not personally watch appear, it is not proof.
If the mutation list is short because the mutations passed, the guard is not finished.

Report what actually happened. If a sweep went 22/23, say so, say which one, and say what you did
about it — both times that happened here it turned out to be a marginal threshold in someone else's
probe, and both are now written down in the backlog instead of being quietly re-run until green.
