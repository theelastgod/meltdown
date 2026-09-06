# MELTDOWN — does the token add up?

**Scope.** `docs/TOKENOMICS.md`'s emission schedule and burn discipline, checked against the
constants the game actually runs on. Reviewed at commit `0830010`, fixed in Stage 17. The
arithmetic below is not prose: it comes out of `shared/economy/model.ts`, which reads the same
constants the game does, and `tests/model.test.ts` fails the build when they drift apart.

**Status.** One finding, and it was the load-bearing one. This is a design review, not a legal or
accounting opinion; §9 of the tokenomics doc still wants both.

---

## 1. The finding: the schedule was not binding — HIGH

`docs/TOKENOMICS.md` §4.1 publishes an emission schedule: **97,000,000 $CAPITAL in year one**,
decaying 25% a year for eight years, 349,156,188 in total against a 350,000,000 allocation. That is
a promise about supply, and the whole burn discipline in §4.4 is stated as a ratio against it.

The game paid THE RUN a **fixed rate per unit banked** — `CAPITAL_PER_UNIT = 1`, one whole
$CAPITAL for one unit extracted, capped at `RUN_DAILY_CAP = 200` a file a day. So the year's
emission was:

```
runners × 200 × capUse × 365
```

which contains the player count and does not contain the schedule. The schedule is a constant. The
payout is linear in how well the game does. **They are not the same kind of quantity, and no choice
of rate makes them one.** A rate low enough to be solvent at a million players is not worth banking
for at ten thousand; a rate worth banking for at ten thousand is insolvent at a hundred thousand.

The numbers, from the tokenomics doc's own month-12 population (50,000 MAU, 20% daily, half of
those past the Depth-10 gate running, banking half the cap):

| | a month |
| --- | ---: |
| the year-one schedule allows | **8,083,333** |
| THE RUN would have paid | **15,208,333** |
| the weekly Audit pool | 4,345 |
| the Deep Wake season pool | 5,432 |

That is **1.9× the budget**, and the year-one allocation gone in **194 days**. It is not a rounding
error and it is not a slow leak: it is nearly double, at the numbers the doc itself chose. Push the
same 10,000 daily players to the full cap and it is **60,833,333 a month — 7.5×, and 48 days**. At
a genuinely successful million-MAU game it is **90×**.

Two details make the shape of the problem clear:

- **It is THE RUN alone.** The Audit and the Deep Wake pay *fixed pools per event* — 1,000 a week,
  5,000 a season — however many people are on the board. Together they are 9,777 a month, about
  0.06% of THE RUN. They were never the risk. They are also the model for the fix.
- **It gets worse with success.** Doubling the players doubles the emission exactly. Every good
  outcome for the game was a worse outcome for the token, which is precisely backwards.

The burn discipline hid this rather than catching it. §4.4 claimed sinks would burn 60% of
emissions by month 12; against the real emission the same sinks burn **33%**. The target was being
measured against an emission number nobody had computed.

### Why it was not caught

Everything about the constant is defensible in isolation. One unit, one token is a good rule for a
player to hold in their head. 200 a day is a sensible anti-bot cap. 97,000,000 a year is a sensible
schedule. The bug is in the *relationship*, and there was no artefact that held the two ends
together — the schedule lived in `shared/economy/manifest.ts`, the rate lived in `shared/sim/run.ts`,
and the sentence connecting them lived in a document. Documents do not fail builds.

## 2. The fix: a day is a pot, not a price

`shared/economy/settlement.ts`. The day's slice of the schedule is a **pot**, and every unit banked
that day draws a share of it:

```
rate = min(MAX_CAPITAL_PER_UNIT, pot / unitsBankedToday)
pot  = (year's schedule ÷ 365) × RUN_EMISSION_SHARE
```

Emission is therefore `min(pot, units × ceiling)`, which is `≤ pot` for every population, forever.
The quantity that scales with the player count is now the *denominator*.

Three things fall out of it that matter more than the invariant:

- **Nothing changes for players at today's scale.** The ceiling is still 1 $CAPITAL a unit, and
  below the crossover — around 2,126 daily runners, roughly **21,000 MAU** at the doc's assumptions
  — the pot never binds and the settled rate *is* the old fixed rate. The fix is invisible until it
  is needed, which is the only kind of economic change worth shipping into a live game.
- **The early game does not become a giveaway.** Pro rata alone would pay a day's whole budget to
  whoever showed up: four hundred runners splitting 212,603 $CAPITAL is thousands a unit. The
  ceiling is what stops the mechanism running backwards at small numbers, and it is why the rule is
  a `min` of two things rather than either one.
- **The burn discipline starts working.** Against settled emissions the doc's own month-12 sinks
  burn **78%**, clearing the 60% target it set. Nothing about the sinks changed; they were being
  compared to a number that was wrong.

`RUN_EMISSION_SHARE = 0.8` is THE RUN's share of a day. The remaining 20% covers the fixed pools
(which need 0.06% of it) and is otherwise simply not minted — the schedule is a ceiling, and coming
in under it is the safe direction to miss.

### What the player sees

The room now banks **units**, not $CAPITAL, and says so; it never names a price, which also settles
a smaller inconsistency — `shared/sim/run.ts` opens by saying nothing in the sim reads a wallet,
and a token price is a wallet fact. The HUD reads `OWED 40 UNITS`, and the file panel says units
settle nightly at up to 1 $CAPITAL each. What a unit is worth is a property of the day, and the day
is not over.

### How it is paid

Through the machinery Stage 15 already built. A settlement is a **PrizeVault Merkle epoch** —
`kind: "run"`, one per day, ids based at 3,000,000 so a day, a week and a season can never collide
— posted by `POST /prizes/post {kind:"run", day}` on either host. That means a day's emission is
ring-fenced on chain by the vault's per-epoch funding guard (`docs/SECURITY.md` §1.2) as well as in
the arithmetic here: even a settlement bug cannot spend another day's pot.

The direct `payout` transfer stays as the devnet's convenience and prices at the ceiling. Because
two payment paths over the same units is exactly how double-spends happen, it now **refuses a day
that has been settled** and tells the file to claim the epoch instead. `tests/run.test.ts` holds it
to that, and fails when the guard is removed.

## 3. What stops it coming back

`npm run lint:economy` runs `emission-rate-within-schedule` alongside the existing allocation and
fee-split rules, in CI, on every commit:

1. A settlement handed far more demand than pot must never mint past the pot.
2. The modelled month at a **stress population** — a million MAU, a quarter of them daily, 60% of
   those running at 80% of the cap — must fit the year-one budget.

The stress population is the point of the rule. A constraint checked only at the numbers you hoped
for is not a constraint. Reintroducing a fixed rate fails both checks and six cases in
`tests/model.test.ts`, which was verified by making the change and watching them go red.

## 4. Still open

1. **A production index of who banked what.** The dev host reads it from its account map; the
   Worker is handed it in the request. Neither is a nightly job over a real player base — the
   counter-ledger needs a D1 table of daily banking and a cron trigger to settle it.
2. **Unclaimed epochs.** `PrizeVault.reclaim` sweeps them to the treasury, which is correct, but
   nothing calls it on a schedule, and reclaimed emission should arguably return to the pot rather
   than the treasury.
3. **The sinks are unbuilt.** Names and the market exist; the Forge, RoomCredits and SeasonBuyout
   contracts in `docs/TOKENOMICS.md` §7 do not. The 78% burn ratio in §2 assumes them. Until they
   ship, the honest number is the market and name fees alone.
4. **The ceiling is a game-design number, not a derived one.** 1 $CAPITAL a unit sets when
   dilution starts to be felt. It should be revisited against a real launch population, and it is
   the one constant here a designer should own rather than a model.
5. **`capUse` and `runnerShare` are guesses.** Every projection in §1 rests on them. They are the
   first thing to replace with telemetry, and the model takes them as parameters for exactly that
   reason.

## 5. Running it

```sh
npm run lint:economy                     # the rules, including the schedule
npx vitest run tests/model.test.ts       # 15 cases: the finding and the fix
npx tsx -e "import('./shared/economy/model.ts').then(m=>m.summarise().forEach(l=>console.log(l)))"
```
