# Handoff — MELTDOWN, for Astra

> Integration update, 2026-09-28: Stage 706's patch is already applied,
> with conflicts resolved and cap/shot-source regressions corrected. Read
> [the verification status](handoff/stage706-integration-status.md) before §6;
> do not apply the patch a second time. Browser release validation is pending.

Written 2026-09-28 at **Stage 705**, for Astra (the next agent on this branch). Everything here holds
for anyone who picks the branch up; the one Astra-specific item is §6, a finished piece of work that
exists only as a patch file and is yours to merge first.

Read order: this file (≈15 min) → the top five entries of `docs/STAGES.md` → `docs/BACKLOG.md` →
`docs/TOKENOMICS.md` §1 if you touch anything with a price on it.

---

## 1. Where things stand

| | |
| --- | --- |
| Repo / branch | `theelastgod/meltdown`, branch `claude/meltdown-game-design-uovda4` — **work here, push here, nowhere else** |
| HEAD | Stage 805 (the booth opens a name desk). Stage 804 opens contracts from its tab. Stage 706 is already merged — do not apply the patch again. |
| Next stage number | **806** |
| Unit tests | 1793 passed under load at Stage 720, with 6 city-path timeouts that pass alone. `tests/faceshot.test.ts` (17) green at Stage 735. |
| Probes | 24 Playwright probes in `.github/workflows/verify.yml`; `probe:world` is the city's |
| Lints | `fairness` (89 recorded debt, 0 new), `campaign`, `economy`, `progression`, `assets` — all clean |
| CI | Stage 699 green. 700–703 red on three causes all fixed in 704 (a vitest 5 s timeout, probe:mastery shooting the loading card mid-fade, probe:world racing the district). **704 and 705 were still running at handoff — check them first.** |
| Working tree | clean apart from this file and `docs/handoff/` |

There is no pull request and none was asked for. Do not open one unless the owner asks.
Node 22. `npm ci` if `node_modules` is cold. Chromium is preinstalled for Playwright.

---

## 2. What the owner has asked for (standing, verbatim)

These are the live requests. The last several stages were all in service of the first two.

1. "Expand the size of the world and the different things you can do in it"
2. "Make the opening menu with the different loading screens more intuitive — you should start with the
   campaign in a shared open world"
3. "Not an hourly check in — work progressively and continuously with no prompts"
4. "add $CAPITAL as P2E economy"
5. Standing mission from earlier: campaign, story, narrative progression, graphics, character
   progression, weapon unlocks; make character designs real; campaign art; Higgsfield may be used
   freely (`use_unlim:false`).

On (4): **$CAPITAL already exists as the P2E economy** — Stage 14 onward (THE RUN extraction loop:
PvP zones, safe zones, claims banked for $CAPITAL under daily caps and a Depth gate), with the
emission schedule, sinks, treasury/relayer split and Merkle prize vaults hardened through Stages
17–29. Read `docs/TOKENOMICS.md` and `docs/ECONOMY.md`. What is *not* yet done is surfacing it in
the shared city (§7 has the shape). The hard rule: **$CAPITAL never touches a stat**, and no
wagering or staking of any kind.

---

## 3. What the last stretch built (Stages 692–705)

The campaign now starts in a **shared open world, "the city"**: one persistent PvE co-op room per
district on the campaign host.

| Stage | What |
| --- | --- |
| 692 | The city: `/campaign/city-<district>` rooms, PvE (`World.pvp=false`), 24 files, contracts taken from anywhere |
| 693 | Menu is PLAY · CHARACTER · MODES · FILE · WALLET · SETTINGS; PLAY walks into the city; one loading card for every trip (`client/loading.ts`) |
| 694 | LEASE ROW is 5×5 (174 m); `DistrictSpec.grid` |
| 695 | probe:net root-caused (two measuring-too-early bugs) |
| 696 | Crowd drawn once (off the mirror layer); LEASE ROW 220 citizens for the same triangles |
| 697 | **Gates are doors** between districts (`shared/net/citygates.ts`, the districts tile) |
| 698 | Input-rate guard: silence earns catch-up credit (no kick after a blocked frame); flood kick times unchanged |
| 699 | **Public events** (HOLD / INTERCEPT / ESCORT, `shared/city/events.ts`), paid in XP+stamps; **arrival grace** (a loading file is not on the street) |
| 700 | probe:mastery waits for the loading card |
| 701 | **Five districts**: + NIGHT MARKET, RELAY HEIGHTS (with Higgsfield loading art in `public/districts/`) |
| 702 | Client keeps an Audit's sheet past the join file (GLASS week bug) |
| 703 | **Street runs**: 3 proved time-trial courses per district, server-timed, per-district boards (`shared/city/courses.ts`, `runs.ts`) |
| 704 | Gates **look** like doors (signs, light, map marks, 0 new draw calls); dev routes `quiet`/`emp`; CI fixes |
| 705 | **Presence feed** `GET /city` + in-game **WORLD MAP** + PLAY to the busiest district (`shared/city/presence.ts`, `client/worldmap.ts`) |

### Map of the city code

| Concern | Where |
| --- | --- |
| District generator, specs, budgets | `shared/sim/city.ts` (`DISTRICT_SPECS`, `generateDistrict`, `districtHalf`) |
| City room (server) | `server/city-room.ts` (`createCityRoom`: hooks, events, runs, presence, dev hooks) |
| Generic room, snapshots, rate limits, arrival grace | `server/room.ts` |
| Hosts | `server/node-host.ts` (dev), `server/campaign-worker.ts` (Cloudflare DO) |
| Names, URLs, sockets | `shared/net/city.ts` (`CITY_DISTRICTS`, `cityPageUrl`, `inCity`) |
| Gates | `shared/net/citygates.ts` |
| Events / runs / rewards / presence | `shared/city/{events,courses,runs,reward,presence,worldmap}.ts` |
| Client city behaviour | `client/campaign.ts` (mode `"city"`), `client/cityevent.ts`, `client/cityrun.ts`, `client/worldmap.ts` |
| Loading card / menu | `client/loading.ts`, `client/menu.ts` (`playUrl`, `playInfo`) |
| Wire | `shared/net/protocol.ts` (`Msg.CityEvent = 20`, `Msg.CityRun = 21`, JSON; version unchanged at 11) |
| The city's probe | `probe/city.ts` → `npm run probe:world` (9 checks) |

---

## 4. The method (unchanged — it is what makes `docs/STAGES.md` worth reading)

1. **Look at real play** for something a player would notice.
2. **Verify it yourself** — read the source, then measure: a real `World`, a real `Room`, a real page.
3. **Build the smallest change** that fixes the cause.
4. **Guard it with a mutation-tested check**: write the guard, revert the fix, confirm the guard
   fails. A mutation that passes is a hole to close.
5. **Verify on a still tree**: typecheck, full `npm test`, the lints, the probes the change touches,
   one at a time. **Never edit source while a probe runs** (the dev server hot-reloads under it).
6. **One stage = one commit**, with a `docs/STAGES.md` entry inserted **above** the previous stage
   heading, proof from numbers you watched appear, mutations written out, proof images in
   `docs/proof/stageN/`.
7. **Push** (`git push -u origin claude/meltdown-game-design-uovda4`). Only verified commits.

Entry style: **The ask / The change / Verified / Open**, plain words, measured numbers, what you
tried and threw away. Commit messages describe defect → measurement → fix → mutations, and end with
your own attribution lines. **No model names anywhere else in the repository.**

---

## 5. Rules learned the hard way

**Never loosen a check.** If a test, lint, budget or probe assertion fails, the fix is in the code or
in the probe's *setup*, never in its threshold. Examples from this stretch:
- A per-course XP total over the street-run bound → lowered the XP, kept the bound (703).
- A rate-limit fix that let 96–110 inputs/s floods live 3× longer → rejected and redone so every
  flood rate is kicked at exactly the old tick (698).
- Byte-identical fingerprints for new districts were recorded **on the commit before the change**,
  in a scratch worktree, after confirming the old ones reproduced there (704).

**The city is hostile to probe bots.** A bot cannot shoot back. `probe:world` therefore:
- holds LEASE ROW's event schedule back: `POST /city/<d>/event {quiet: seconds}` (dev host only);
- grounds patrols for a timed run: `POST /city/<d>/emp {seconds ≤ 300}` (dev host only);
- re-walks after a death; samples a file's position only before its first death in a room;
- judges an objective line on files that are not racing (an armed run keeps its own line).

**Probes and CPU.** Probes run on SwiftShader and are timing-sensitive. Running vitest-heavy work
(agents' mutation runs) beside a probe produced a whole batch of false failures. Run probes alone.

**Shell.**
- Never `pkill -f`/`pgrep -f` a pattern matching your own command line. Kill by PID.
- Stopping a background shell may leave its node/chromium children alive on the probe ports —
  check `ss -ltnp` / `ps` and kill by PID before the next run.
- Write python edit scripts to files; never create a file with a shell heredoc without checking it
  does not exist.
- Never run vitest with `--root /`.
- `git cherry-pick` state can be lost across a container restart; if `--continue` fails, **do not
  `--amend`** (that folded Stage 699 into 698 once) — `git reset --soft <parent>` and commit.

**Probes (code).** No named arrow helpers inside `page.evaluate` (esbuild keep-names injects
`__name`). Unique variable names across a probe file. A picture's claim is read from the drawn
frame. A SwiftShader screenshot takes seconds: pause the page's sim (`setRealtime(false)`) around a
shot taken mid-action.

**Parallel worktree agents** (if your harness has them): each starts with
`ln -s /home/user/meltdown/node_modules node_modules`, runs no probes, doesn't push or edit STAGES,
and returns a draft entry; the parent cherry-picks, renumbers stage references on the lines that
commit added only, runs the probes, writes STAGES, amends, pushes.

---

## 6. First job: merge Stage 706 (interest management) — already built

`docs/handoff/stage706-interest-management.patch` is a finished, unit-tested commit (`ec58224`,
built on Stage 704) that lived only in a local worktree:

> Interest management for **city rooms only** (`shared/net/interest.ts`): other files within 72 m
> (kept to 82 m), at most 8 nearest; machines/charges/smoke on the same radius; anything hunting,
> hurting or hit by the client from anywhere (3 s hold); a public event's machines from 120 m and to
> its participants from anywhere; the feed always. The city sends its roster (`Msg.CityRoster`) so
> the file count still knows the whole room. Match/run/every non-city room is **byte-identical on the
> wire** (hashes in `tests/interest.test.ts`). 24 files over LEASE ROW: **17.9 → 7.1 KB/s per
> client**; crowded and firing 20.9 → 9.6.

To merge:
```bash
git apply --3way docs/handoff/stage706-interest-management.patch
# conflicts in server/city-room.ts and server/room.ts, against Stage 705's presence code
# (presenceSeats / presence()) and Stage 704's dev hooks (quietEvents / empDistrict): keep both sides
npm run typecheck && npm test
npm run probe:world && npm run probe:net && npm run probe:harden   # one at a time
```
- Check `probe:world`'s first check still sees 2 players and each file on the other's screen
  (they spawn close — inside 72 m — but verify), and that the Stage 705 feed still counts
  the whole room (the roster should make it so).
- Suggested new probe check: two files walk > 90 m apart in LEASE ROW; each stops receiving the
  other's position, the HUD count still says 2, and walking back re-shows them at the new position
  (no stale lerp).
- Write the STAGES entry (**Stage 706 — the city tells each client what is near it**), delete
  `docs/handoff/`, commit, push.

---

## 7. What to build next (in priority order)

1. **Watch CI for 704/705.** The runner is slower than this sandbox. The known CI-only failure was
   probe:world's event check (a late joiner arriving after the HOLD ended) — fixed in 704 by having
   CHARLIE join before ALPHA reaches the ring; confirm it.
2. **$CAPITAL in the shared world** — Stage 714 did the reachability. The plaza metro booth is the desk: Tab opens the existing market (a sink), a one-second hold enters THE RUN of that district, and the WORLD MAP offers ENTER THE RUN. City events and street runs still pay XP and stamps only. Do **not** add a $CAPITAL faucet to PvE. `npm run lint:economy` must stay clean. What is still open is a name-change kiosk that is not the whole Ledger Market panel.
3. **More to do in the city**: an interact key (needs `Btn`/`ACTION_MASK` widened — check the
   protocol fingerprint tests), vendors/fixers standing in the streets, district-specific event
   kinds, co-op run relays.
4. **Bigger world**: more districts (3×3 fits the frame budget easily; 5×5 LEASE ROW sits at 181 of
   190 draw calls), now that interest management bounds bandwidth.
5. **Menu**: PLAY already goes to the busiest district; the MODES screen could show live counts
   from `GET /city`.

---

## 8. Verifying

```bash
npm run typecheck
npm test                     # read the total
npm run lint:fairness && npm run lint:campaign && npm run lint:economy && npm run lint:progression && npm run lint:assets
npm run probe:world          # the city; ~6 min
# plus whichever of the 24 probes (verify.yml order) your change touches, one at a time
npm run build && npm run smoke
```
`smoke` reads 6/7 in this sandbox: the production build fetches the deployed counter worker and the
sandbox proxy's TLS is refused. It is 7/7 on CI.

---

## 9. Decisions that are the owner's, not yours

- **The 89 fairness violations** (`stack_smg`, `clockeater`) are recorded debt in
  `shared/fairness/debt.ts`. You may fix them; never add to the file or loosen the rule.
- **Cloudflare/Higgsfield credentials** live only in a session scratchpad, never in the repo. No
  WalletConnect keys in the repo.
- Deploys: `docs/DEPLOY.md`.

## 10. Constraints that hold regardless

- No wagering or staking mechanics of any kind.
- Rewrite rewards are cosmetic — never power. $CAPITAL never touches a stat.
- Kernel Protocols stay quarantined from PvP.
- The PvP bundle/worker never imports `shared/economy`, `server/chain` or `shared/campaign`
  (`tests/quarantine.test.ts`). City code lives in `shared/city/` and match rooms never reach it.
- A file id is a bearer credential: publish display names only (the presence feed's redaction is
  the pattern).
- `.github/workflows/verify.yml` steps carry `if: ${{ !cancelled() }}`; `tests/verify.test.ts`
  checks the workflow and `npm run verify` agree.

## 11. What good looks like

Someone reading one `docs/STAGES.md` entry alone should know what was wrong, how you know, what you
changed, why that shape, what breaks if it is undone, and what you chose not to do. If a proof
section has a number you did not watch appear, it is not proof. Report what actually happened —
including a probe that went 8/9 and why.
