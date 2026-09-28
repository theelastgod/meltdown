# Stage 706 integration — release verification pending

2026-09-28. The checkout was fast-forwarded from `4bf56b9` to `b7e73bf`, the
September 28 handoff on `claude/meltdown-game-design-uovda4`. The prepared patch
has been applied. **Do not apply it again.** Conflicts in `server/city-room.ts`
and `server/room.ts` were resolved by preserving presence, roster, and interest
methods together. The quiet-event and EMP development hooks remain present.

The integration is being published for GitHub verification, not marked deployed.
Keep the original patch until verification is complete. Cloudflare Pages still
reported production `4bf56b9` during this audit; do not deploy the stale pre-handoff build.

## Resumed verification, September 28

- Added and reproduced two regressions from the prepared patch: expired combat holds
  retained nine ordinary players, and high player IDs were classified as AI shots.
  Explicit forced-interest flags and server-side source provenance correct them.
- Final full serial run: **157 files / 1,784 assertions passed**, but three internal
  Vitest `onTaskUpdate` RPC timeouts caused exit 1. It is not a clean suite pass.
- Targeted review regressions: 14 passed, 22 skipped; both TypeScript projects passed.
- Printed idle bandwidth: 24 players, 17.888 unfiltered versus 7.051 KB/s filtered.
  Crowded firing: 9.554 KB/s. Noncity byte fingerprints passed.
- A single isolated browser boot joined and drew in 40.2 s. The full world probe then
  stalled loading BRAVO. A native Metal diagnostic with the same assertions stalled
  loading ALPHA. Both reported pending assets and no page error; neither reached gameplay.
  The Mac's system load was exceptionally high, so browser verification continues on CI.
- The probe now prewarms a genuinely unjoined late client before starting its event,
  and waits for the observer's actual street-run feed. These setup changes still need
  browser acceptance; do not describe them as a confirmed CI fix yet.
- GitHub at handoff `b7e73bf`: world and body probes failed; the other steps passed.
- Production builds must set `VITE_BUILD` explicitly. Without it PLAY follows the
  development host path instead of the configured campaign Worker.

The earlier results below remain historical evidence, not the latest status.

## Results observed locally

- Both TypeScript projects passed (`npm run typecheck`).
- All five lints passed: fairness (89 existing debts, no new/worse debt),
  campaign, economy, progression, and assets.
- Full serial unit run: **157 files / 1,781 assertions passed**, but four
  internal Vitest `onTaskUpdate` RPC timeouts made the command exit 1. This is
  not a clean full-suite pass. Command: `npm test -- --maxWorkers=1
  --testTimeout=60000`.
- Focused clean retry: **75/75** across interest, city presence, and world map.
  The initial parallel attempt had six five-second test timeouts; the clean
  retry used one worker and a 60-second test timeout, with assertions unchanged.
- Mutation: disabling the distance-rejection condition in `InterestSet.select`
  caused the real-room `a file out of range` test to fail. Restoring the condition
  restored the focused pass. The mutation is not left in the source.
- `probe:world` timed out at its first page's 90-second ready wait, before any
  gameplay checks. A second run with page-error logging failed at the same
  point and logged no page exception. These do not prove the cause of the
  startup failure.
- `probe:net` failed with `node host did not start`, before gameplay checks.
- `probe:harden` also failed with `node host did not start`, before gameplay
  checks. Neither host-start failure establishes a networking regression.

Logs are saved in `docs/proof/stage706/`. The original patch remains available.

The Stage 705 CI run `36377370959` failed only `probe:world`: the street-run
observer feed was empty, and the public event was absent for the late joiner.
All other steps passed. These pre-existing failures remain unresolved; the local
startup failures did not reproduce or explain them.

## Next steps

Inspect saved logs and diagnose the local startup
failure before changing gameplay. Run the handoff's three browser probes on the
merged tree and resolve any integration regressions. Complete the build and smoke
checks before shipping. Only then write the Stage 706 completion entry, remove
the original patch, commit and push the requested branch, and deploy the current
client and Workers. Do not claim the previous author's bandwidth measurements
as newly measured numbers; the budget assertions passed here, but raw rates
were not printed by the test harness.
