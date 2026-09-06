# MELTDOWN — security review of the money paths

**Scope.** The seven contracts in `contracts/` and the server code that signs for them
(`server/chain/`). Reviewed at commit `8fd0a42`, fixed in Stage 16. Every finding below has a
regression test in `tests/security.test.ts` that fails on the pre-fix code.

**Status.** This is an internal review, not an audit. It is written to be the document an external
auditor starts from: it says what was found, what was changed, what is deliberately trusted, and
what is still open. Nothing here has touched a public chain — the contracts run on the in-process
devnet (`server/chain/devnet.ts`) until Robinhood Chain's testnet parameters are published.

---

## 1. Findings and fixes

### 1.1 A zero signer would have validated every forged voucher — HIGH

`Vouchers._recover` answers `address(0)` for a malformed signature, and so does `ecrecover` itself
for a bad `v`. The check was `if (_recover(...) != signer) revert BadSigner()`. If `signer` were
ever the zero address, every garbage signature would have recovered to it and passed — minting
Ghostfiles, attesting stamps and registering names for free.

Reaching that state took operator error (`setSigner(address(0))`, or deploying with a zero signer),
so this was latent rather than live. It is also the single cheapest catastrophic bug in the file, and
the classic one.

**Fixed.** `_consume` rejects a zero recovery explicitly. `setSigner` and the constructor reject the
zero address. A `setSteward` was added so the steward role can be handed to a timelocked multisig
after deployment rather than living forever on the deployer key.

### 1.2 A prize epoch could pay out of another epoch's pot — HIGH

`PrizeVault.claim` verified the Merkle proof but never checked the epoch's own funding. All epochs
share one token balance. A root whose leaves sum to more than the epoch was funded with — an
off-chain tree bug, or a compromised poster key — would have paid out of whatever else the vault
held. The same gap let a claim land after `reclaim` had already swept the epoch to the treasury.

**Fixed.** `claim` reverts with `Overclaim` when `claimed + amount > total`. Each epoch is now a
ring-fenced pot: the worst a bad root can do is spend its own funding. Because `reclaim` sets
`claimed = total`, late claims hit the same guard.

The test is a real one: epoch 900 is funded with 10 and promises 300, while epoch 901 holds 500 in
the same vault. Removing the guard and re-running makes the test fail — the 300 comes out of 901.

### 1.3 One file could be linked to two wallets — MEDIUM

`Ghostfile.mint` enforced one token per wallet but not one wallet per file. The 1:1 rule the
tokenomics spec relies on (§3.3, and the per-account prize caps that follow from it) lived only in
the host's D1 index. A signer bug or a host compromise could have split one file across wallets,
which would have doubled every per-account cap downstream.

**Fixed.** `tokenOfFile` enforces it on chain; `burn` frees the file again, so a Rewrite still works.

### 1.4 Supply could be destroyed without being counted as burned — MEDIUM

`transfer(address(0), n)` moved tokens to the zero address, decrementing nobody's supply and
skipping the `burned` counter. The game prints a `NET DELTA` line from that counter and the
tokenomics doc makes burn-versus-emission the headline discipline (§4.4), so a silent leak would
have made the published number wrong.

**Fixed.** `_move` rejects the zero address. Supply now leaves only through `_burn`, which counts it.

### 1.5 Names are priced per byte but were not held to one byte per character — LOW

`priceOf` takes `bytes(name_).length`. A six-character name of two-byte Cyrillic is eighteen bytes
and would have priced as a twelve-plus name: 150 instead of 400. Only the game's own voucher stood
between that and a cheap short name, and the point of a voucher contract is not to need it.

**Fixed.** `register` rejects anything outside `A-Z 0-9 _ -`, the same set the host's `validName`
signs. Belt and braces, and cheap at 24 bytes maximum.

### 1.6 The market updated state after paying out — MEDIUM (defence in depth)

`LedgerMarket.buy` transferred tokens and handed over the goods before drawing the escrow down.
Neither `$CAPITAL` nor `Cosmetics` has a receiver callback today, so it was not exploitable. But
`safeTransferFrom` is an ERC-1155 name, and the standard's acceptance check is exactly the callback
that would make it exploitable — the day `Cosmetics` grows one, the same listing could be bought
twice in one transaction.

**Fixed.** Checks, effects, interactions: `L.amount` and `volume` move before any external call.

### 1.7 EIP-2612 permit was promised and missing — MEDIUM (correctness of the spec, and UX)

`docs/TOKENOMICS.md` §7 lists the token as "ERC-20 + permit". It had no permit, so every market buy
and every name registration cost the player two transactions and two gas payments.

**Fixed.** Standard EIP-2612 `permit`, `nonces` and `DOMAIN_SEPARATOR`, with the domain separator
computed per call so a chain fork cannot replay a permit, the malleable high-`s` half rejected, and
a zero recovery rejected as in 1.1. The relayer can now submit a player's signed allowance, so a
market buy can be sponsored end to end.

### 1.8 A client could outrun the sim clock — HIGH

Every accepted input is a full `stepPlayer` at `SIM_DT`. The room accepted up to
`MAX_INPUT_RATE_PER_SEC = 95` inputs a second against a 60 Hz sim, and drained up to six per tick.
A client whose send loop ran at 90 a second — comfortably inside the stated limit, drawing no
strike — therefore took 90 movement steps and 90 weapon steps per second of wall time against
everyone else's 60. That is a 50% speed and fire-rate advantage from nothing but a faster loop: no
modified physics, no impossible position, nothing the trace comparison would flag, because the
server itself is doing the extra stepping.

The headroom existed for a good reason. A client whose frame hitches sends a burst to catch up, and
clocks drift, so a cap at exactly 60 would punish honest players. But a *rate* cap cannot express
the invariant that matters, which is about totals: over any window, a client may spend no more sim
time than the sim has run.

**Fixed.** The drain is a token bucket denominated in ticks. Each client accrues one input credit
per tick and may bank up to `INPUT_BURST_CREDITS = 12` (200 ms) of them; the drain spends credits.
A hitching client still catches up out of its bank, and a flooder's surplus piles up in its queue
and is dropped there. The per-second cap stays as a coarse flood guard, but the bucket is the
invariant.

`tests/speedhack.test.ts` races an honest client against one sending 90 a second down the same
open ground. Pre-fix the cheat leads by 4.4 m over three seconds and the gap widens by 0.84 m every
second. Post-fix the lead is the one-off burst allowance and stops growing once the credits are
spent — which the test checks by sampling the gap at one, two and three seconds rather than only at
the end, because a bounded head start and a rate advantage look alike if you only measure once.

This was worth finding twice over: PvP outcomes now pay $CAPITAL through the Audit board and the
Deep Wake, so a movement advantage is not just an unfair match, it is a mint.

---

## 2. What is deliberately trusted

An auditor should know which of these are decisions rather than oversights.

| Trusted | Why, and what it costs if broken |
| --- | --- |
| The **game signer** key | It decides who gets a Ghostfile, a stamp and a name. A leak mints identity, not money: it cannot move tokens, post a prize root, or mint a cosmetic. Rotatable by the steward. |
| The **poster** key (PrizeVault) | It sets the roots and funds them. A leak can misdirect *the epochs it funds itself* and nothing more, since 1.2. |
| The **relayer** key | Sponsors gas. In the current devnet wiring it is also the treasury, which is wrong for mainnet — see §3. |
| The **minter** role (Cosmetics) | Can mint any id in any quantity. There is no supply cap; scarcity is a studio promise, not a contract one. If that promise matters, cap it per id at definition time. |
| `Cosmetics` and `$CAPITAL` as **callback-free** | The market's safety argument in 1.6 no longer depends on this, but the ERC-1155 acceptance check is still not implemented, so a contract that cannot handle 1155s can still receive one. |
| The **host** for game rules | Depth gates, the run's daily cap and the Audit playlists are server-side. The chain never checks them; a host compromise is a game-economy compromise. This is the right trade for a game, but it is the trade. |
| The client for **aim** | Yaw and pitch come from the client and are bounded but not judged. An aimbot is accepted by construction, as in every FPS; movement, fire rate and hit registration are not (§1.8). Detecting aim is a statistics problem for a later pass, not a protocol one. |

## 3. Open before mainnet

1. **Separate the treasury from the relayer.** They are the same address in the devnet boot. The
   relayer key lives in a Worker secret and signs constantly; the treasury holds the whole
   supply. A leak of a hot key should not be a leak of the treasury. The treasury should be a
   timelocked multisig, with the relayer holding gas and an allowance sized to a week of prizes.
2. **Hand the steward and poster roles to that multisig** after deployment (`setSteward`,
   `setPoster`), so no single key can rotate a signer.
3. **An external audit.** This review is one reader. The contracts are small and dependency-free,
   which should make an audit cheap.
4. **Sponsored claims through ERC-4337** rather than a relayer that submits transactions for
   players; the voucher shapes already suit it.
5. **A cap per cosmetic id**, if scarcity is ever to be a promise rather than a policy.
6. **Legal review** of the emission channels, as `docs/TOKENOMICS.md` §9 says.
7. **The emission schedule is now enforced in code**, not only published — see `docs/ECONOMY.md`.
   A day's emission is a PrizeVault epoch, so §1.2's per-epoch funding guard bounds it on chain as
   well as in the arithmetic. What is still trusted there is the *poster*: nothing on chain checks
   that a day's root was built from a real day's banking.

## 4. Running the review's tests

```sh
npx vitest run tests/security.test.ts    # 9 cases, all against a real EVM
npx vitest run tests/speedhack.test.ts   # 3 cases, against the real room and sim
```

The contract cases deploy the real bytecode to the in-process devnet and drive it with viem, so
they exercise signature recovery, reverts and token accounting for real rather than in a mock. The
room cases drive a real `Room` through the wire protocol with a clock that advances one sim tick per
step, because the thing under test is a rate and a fast loop would trip the wall-clock limiter
before reaching it.

Each was checked by mutation: revert the fix, and the case fails. A regression test that passes on
the broken code is not a regression test.
