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
| HEAD | Stage 1093 (the slab between REPO DEPOT's north bolster and the north crest opens onto a stopper). Stage 1092 (the slab between RELAY HEIGHTS' north halyard and the north spar opens onto a gasket). Stage 1091 (the slab between NIGHT MARKET's north fringe and the north lot opens onto a shirr). Stage 1090 (the slab between DEADLETTER DOCKS' north hawse and the north slip opens onto a nipper). Stage 1089 (the slab between REPO DEPOT's south davit and the south bay opens onto a gripes). Stage 1088 (the slab between RELAY HEIGHTS' south leech and the south span opens onto a foot). Stage 1087 (the slab between NIGHT MARKET's south seam and the south hook opens onto a smock). Stage 1086 (the slab between DEADLETTER DOCKS' south strake and the south pier opens onto a scupper). Stage 1085 (the slab between REPO DEPOT's east pawl and the east ramp opens onto a seizing). Stage 1084 (the slab between RELAY HEIGHTS' east roach and the east mast opens onto a lacing). Stage 1083 (the slab between NIGHT MARKET's east dart and the east aisle opens onto a gather). Stage 1082 (the slab between DEADLETTER DOCKS' east bulwark and the east quay opens onto a breast). Stage 1081 (the slab between REPO DEPOT's east windlass and the east jack opens onto a messenger). Stage 1080 (the slab between RELAY HEIGHTS' east clew and the east strut opens onto an earring). Stage 1079 (the slab between NIGHT MARKET's east gusset and the east crate opens onto a facing). Stage 1078 (the slab between DEADLETTER DOCKS' east fairlead and the east bollard opens onto a kedge). Stage 1077 (the slab between REPO DEPOT's west clevis and the west apron opens onto a norman). Stage 1076 (the slab between RELAY HEIGHTS' west tack and the west spire opens onto a sheet). Stage 1075 (the slab between NIGHT MARKET's west pleat and the west booth opens onto a yoke). Stage 1074 (the slab between REPO DEPOT's west becket and the west skid opens onto a lizard). Stage 1073 (the slab between RELAY HEIGHTS' west vang and the west pylon opens onto a jib). Stage 1072 (the slab between NIGHT MARKET's west tuck and the west lantern opens onto a bias). Stage 1071 (the slab between DEADLETTER DOCKS' west fluke and the west bitt opens onto a rode). Stage 1070 (the slab between REPO DEPOT's west whelp and the west apron opens onto a swifter). Stage 1069 (the slab between RELAY HEIGHTS' west brail and the west spire opens onto a bunt). Stage 1068 (the slab between NIGHT MARKET's west weft and the west booth opens onto a warp). Stage 1067 (the slab between DEADLETTER DOCKS' west bumkin and the west wharf opens onto a martingale). Stage 1066 (the south end of REPO DEPOT's west wall, past the apron, opens onto a whelp). Stage 1065 (the south end of RELAY HEIGHTS' west wall, past the spire, opens onto a brail). Stage 1064 (the south end of NIGHT MARKET's west wall, past the booth, opens onto a weft). Stage 1063 (the south end of DEADLETTER DOCKS' west wall, past the wharf, opens onto a bumkin). Stage 1062 (the slab between REPO DEPOT's west coak and the west skid opens onto a gammon). Stage 1061 (the slab between RELAY HEIGHTS' west topping and the west pylon opens onto a parrel). Stage 1060 (the slab between NIGHT MARKET's west piping and the west lantern opens onto a godet). Stage 1059 (the slab between DEADLETTER DOCKS' west cathead and the west bitt opens onto a futtock). Stage 1058 (the north end of REPO DEPOT's west wall, past the skid, opens onto a coak). Stage 1057 (the north end of RELAY HEIGHTS' west wall, past the pylon, opens onto a topping). Stage 1056 (the north end of NIGHT MARKET's west wall, past the lantern, opens onto a piping). Stage 1055 (the north end of DEADLETTER DOCKS' west wall, past the bitt, opens onto a cathead). Stage 1054 (the slab between REPO DEPOT's east fid and the east jack opens onto a kevel). Stage 1053 (the slab between RELAY HEIGHTS' east boom and the east strut opens onto a preventer). Stage 1052 (the slab between NIGHT MARKET's east binding and the east crate opens onto a selvage). Stage 1051 (the slab between DEADLETTER DOCKS' east knight and the east bollard opens onto a keelson). Stage 1050 (the south end of REPO DEPOT's east wall, past the jack, opens onto a fid). Stage 1049 (the south end of RELAY HEIGHTS' east wall, past the strut, opens onto a boom). Stage 1048 (the south end of NIGHT MARKET's east wall, past the crate, opens onto a binding). Stage 1047 (the south end of DEADLETTER DOCKS' east wall, past the bollard, opens onto a knight). Stage 1046 (the slab between REPO DEPOT's east shackle and the east ramp opens onto a swivel). Stage 1045 (the slab between RELAY HEIGHTS' east peak and the east mast opens onto a gaff). Stage 1044 (the slab between NIGHT MARKET's east placket and the east aisle opens onto a basting). Stage 1043 (the slab between DEADLETTER DOCKS' east bobstay and the east quay opens onto a throat). Stage 1042 (the north end of REPO DEPOT's east wall, past the ramp, opens onto a shackle). Stage 1041 (the north end of RELAY HEIGHTS' east wall, past the mast, opens onto a peak). Stage 1040 (the north end of NIGHT MARKET's east wall, past the aisle, opens onto a placket). Stage 1039 (the north end of DEADLETTER DOCKS' east wall, past the quay, opens onto a bobstay). Stage 1038 (the slab between REPO DEPOT's south gudgeon and the south bay opens onto a tiller). Stage 1037 (the slab between RELAY HEIGHTS' south outhaul and the south span opens onto a reef). Stage 1036 (the slab between NIGHT MARKET's south eyelet and the south hook opens onto a downhaul). Stage 1035 (the slab between DEADLETTER DOCKS' south pintle and the south pier opens onto a lanyard). Stage 1034 (the west end of REPO DEPOT's south wall, past the bay, opens onto a gudgeon). Stage 1033 (the west end of RELAY HEIGHTS' south wall, past the span, opens onto an outhaul). Stage 1032 (the west end of NIGHT MARKET's south wall, past the hook, opens onto an eyelet). Stage 1031 (the west end of DEADLETTER DOCKS' south wall, past the pier, opens onto a pintle). Stage 1030 (the slab between REPO DEPOT's north winch and the north crest opens onto a deadeye). Stage 1029 (the slab between RELAY HEIGHTS' north vane and the north spar opens onto a cringle). Stage 1028 (the slab between NIGHT MARKET's north awning and the north lot opens onto a grommet). Stage 1027 (the slab between DEADLETTER DOCKS' north stem and the north slip opens onto a thimble). Stage 1026 (the slab between REPO DEPOT's west skid and the north-west gate opens onto a becket). Stage 1025 (the slab between RELAY HEIGHTS' west pylon and the north-west gate opens onto a vang). Stage 1024 (the slab between NIGHT MARKET's west lantern and the north-west gate opens onto a tuck). Stage 1023 (the slab between DEADLETTER DOCKS' west bitt and the north-west gate opens onto a fluke). Stage 1022 (the slab between REPO DEPOT's west apron and the south-west gate opens onto a clevis). Stage 1021 (the slab between RELAY HEIGHTS' west spire and the south-west gate opens onto a tack). Stage 1020 (the slab between NIGHT MARKET's west booth and the south-west gate opens onto a pleat). Stage 1019 (the slab between DEADLETTER DOCKS' west wharf and the south-west gate opens onto a painter). Stage 1018 (the slab between REPO DEPOT's east ramp and the north-east gate opens onto a pawl). Stage 1017 (the slab between RELAY HEIGHTS' east mast and the north-east gate opens onto a roach). Stage 1016 (the slab between NIGHT MARKET's east aisle and the north-east gate opens onto a dart). Stage 1015 (the slab between DEADLETTER DOCKS' east quay and the north-east gate opens onto a bulwark). Stage 1014 (the slab between REPO DEPOT's east jack and the south-east gate opens onto a windlass). Stage 1013 (the slab between RELAY HEIGHTS' east strut and the south-east gate opens onto a clew). Stage 1012 (the slab between NIGHT MARKET's east crate and the south-east gate opens onto a gusset). Stage 1011 (the slab between DEADLETTER DOCKS' east bollard and the south-east gate opens onto a fairlead). Stage 1010 (the slab between REPO DEPOT's south derrick and the south chock opens onto a capstan). Stage 1009 (the slab between RELAY HEIGHTS' south luff and the south tie opens onto a batten). Stage 1008 (the slab between NIGHT MARKET's south welt and the south row opens onto a gore). Stage 1007 (the slab between DEADLETTER DOCKS' south gunwale and the south cleat opens onto a garboard). Stage 1006 (the slab between REPO DEPOT's south bay and the south-west gate opens onto a davit). Stage 1005 (the slab between RELAY HEIGHTS' south span and the south-west gate opens onto a leech). Stage 1004 (the slab between NIGHT MARKET's south hook and the south-west gate opens onto a seam). Stage 1003 (the slab between DEADLETTER DOCKS' south pier and the south-west gate opens onto a strake). Stage 1002 (the slab between REPO DEPOT's south chock and the south-east gate opens onto a derrick). Stage 1001 (the slab between RELAY HEIGHTS' south tie and the south-east gate opens onto a luff). Stage 1000 (the slab between NIGHT MARKET's south row and the south-east gate opens onto a welt). Stage 999 (the slab between DEADLETTER DOCKS' south cleat and the south-east gate opens onto a gunwale). Stage 998 (the slab between REPO DEPOT's north dolly and the hoist opens onto a cradle). Stage 997 (the slab between RELAY HEIGHTS' north stay and the ledge opens onto a shroud). Stage 996 (the slab between NIGHT MARKET's north valance and the tarp opens onto a hem). Stage 995 (the slab between DEADLETTER DOCKS' north fender and the keel opens onto a transom). Stage 994 (the slab between REPO DEPOT's north-west gate and the crest opens onto a bolster). Stage 993 (the slab between RELAY HEIGHTS' north-west gate and the spar opens onto a halyard). Stage 992 (the slab between NIGHT MARKET's north-west gate and the lane opens onto a fringe). Stage 991 (the slab between DEADLETTER DOCKS' north-west gate and the slip opens onto a hawse). Stage 990 (the slab between REPO DEPOT's north-east gate and the hoist opens onto a dolly). Stage 989 (the slab between RELAY HEIGHTS' north-east gate and the ledge opens onto a stay). Stage 988 (the slab between NIGHT MARKET's north-east gate and the tarp opens onto a valance). Stage 987 (the west end of REPO DEPOT's north wall, past the crest, opens onto a winch). Stage 986 (the west end of RELAY HEIGHTS' north wall, past the spar, opens onto a vane). Stage 985 (the west end of NIGHT MARKET's north wall, past the lane, opens onto an awning). Stage 984 (the west end of DEADLETTER DOCKS' north wall, past the slip, opens onto a stem). Stage 983 (the slab between DEADLETTER DOCKS' north-east gate and the keel opens onto a fender). Stage 982 (the north run of REPO DEPOT's west wall opens onto a skid). Stage 981 (the east run of REPO DEPOT's south wall opens onto a chock). Stage 980 (the east run of NIGHT MARKET's north wall opens onto a tarp). Stage 979 (the west run of RELAY HEIGHTS' north wall opens onto a spar). Stage 978 (the south wall of NIGHT MARKET opens onto a hook). Stage 977 (the south wall of RELAY HEIGHTS opens onto a tie). Stage 976 (the east wall of REPO DEPOT opens onto a jack). Stage 975 (the west wall of NIGHT MARKET opens onto a lantern). Stage 974 (the east wall of RELAY HEIGHTS opens onto a strut). Stage 973 (the west wall of DEADLETTER DOCKS opens onto a bitt). Stage 972 (the north wall of REPO DEPOT opens onto a hoist). Stage 971 (the east wall of NIGHT MARKET opens onto a crate). Stage 970 (the west wall of RELAY HEIGHTS opens onto a pylon). Stage 969 (the east wall of DEADLETTER DOCKS opens onto a bollard). Stage 968 (the south wall of DEADLETTER DOCKS opens onto a cleat). Stage 967 opens the west wall of RELAY HEIGHTS onto a spire. Stage 966 opens the north wall of DEADLETTER DOCKS onto a keel. Stage 965 opens the east wall of RELAY HEIGHTS onto a mast. Stage 964 opens the west wall of NIGHT MARKET onto a booth. Stage 963 opens the east wall of NIGHT MARKET onto an aisle. Stage 962 opens the north wall of RELAY HEIGHTS onto a ledge. Stage 961 opens the west wall of DEADLETTER DOCKS onto a wharf. Stage 960 opens the north wall of REPO DEPOT onto a crest. Stage 959 opens the south wall of REPO DEPOT onto a bay. Stage 958 opens the south wall of RELAY HEIGHTS onto a span. Stage 957 opens the south wall of NIGHT MARKET onto a row. Stage 956 opens the north wall of DEADLETTER DOCKS onto a slip. Stage 955 opens the east wall of DEADLETTER DOCKS onto a quay. Stage 954 opens the east wall of REPO DEPOT onto a ramp. Stage 953 opens the west wall of REPO DEPOT onto an apron. Stage 952 opens the south-west wall of DEADLETTER DOCKS onto a pier. Stage 951 is the phone HUD. Stage 950 opens the north-west wall of NIGHT MARKET onto a lot. Stage 949 is the heights cold rack. Stage 948 is the artwork handoff. Stage 706 is already merged — do not apply the patch again. |
| Next stage number | **1094** |
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
