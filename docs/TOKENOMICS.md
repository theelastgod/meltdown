# MELTDOWN — $CAPITAL: the counter-ledger

**Launch chain.** BNB Smart Chain, chain id 56. The rehearsal is testnet 97. `$CAPITAL` is a fixed-cap BEP-20, 18 decimals, symbol CAPITAL, name `$CAPITAL`, no owner and no extra mint. Gas is BNB. No contract is posted, so the night has not sent any. Production `CHAIN_ID` stays `"0"`, `CHAIN_RPC` stays empty, and `CONTRACTS` stays `{}`. The player-facing books are in `shared/economy/primer.ts`.

**Solana display.** The Token-2022 mint `kLtXrN1jJ5YcCmVaGbgD1f65Jfej72xaSWG9fDPpump` (name Meltdown, symbol CAPITAL, 6 decimals) and treasury `3K6kZkUNmQ1CKLAnHMTkrEhmJQcZem6KD71ry6hTtaww` are a published balance. They are not the launch contract. A Solana address is not the EVM claim. Settlement refuses it and transfers nothing.

**Four books.** Scrip and Wakelight stay on the file and are not tokens. Chits are earned only where another player can take them; city jobs, street runs, and contracts pay zero chits. `$CAPITAL` is earned in The Run. From Depth 10 a banked claim is a unit in tonight's pot, at most 1 `$CAPITAL`. Below Depth 10 that bank pays Scrip. Chits follow the same gate. `$CAPITAL` never changes a stat. There is no wager and no stake.

**Status:** design spec, adopted. The contracts, the wallet link, vouchers, the market, and names run on the in-process EVM devnet (chain id 31911, name "MELTDOWN devnet", an ETH-like native coin). That devnet is the probe engine. It is not BNB. The launch chain stays dark until a capital address is published.
**Token:** `$CAPITAL`. The bytecode in `contracts/CAPITAL.sol` is the BEP-20. The play-to-earn loop is The Run: carry a claim to a gate. Die and it drops.
**Wallets:** WalletConnect, then MetaMask, on chains 56 and 97. Phantom can still connect and is told it is not the claim.
**Enforced today:** `shared/economy/` — no item that carries a token price or an on-chain binding may carry a stat.

> Review with a web3 legal/technical specialist before deployment. Nothing in
> this document is a promise of value, yield, or return.

---

## 1. The one rule

MELTDOWN's fairness doctrine already says PvP growth is breadth, budgeted
trades, and expression — never net stat gain. The token inherits that rule
and adds one of its own:

**$CAPITAL touches identity, ownership, creation, hosting, and competition. It
never touches a stat.** Not directly, not through a shortcut, not through a
key that opens a shortcut. The Fairness Lint fails the build if an item has
both a price and a mechanical field.

This is what makes the economy robust rather than extractive: the thing
players pay for is the thing VANTAGE tried to take from them — a name, a
file, a record that they were here. Power stays free and flat.

## 2. Three ledgers

| Ledger | Where | Transferable | Buys | Earned by |
| --- | --- | --- | --- | --- |
| **Scrip** | off-chain (D1) | never | Ledger Graph nodes, chips — *progression breadth* | matches, campaign |
| **Wakelight** | off-chain (D1) | never | CRT themes, alias slots, preset slots — *prestige cosmetics* | Rewrite (Depth-50 prestige) |
| **$CAPITAL** | on-chain, BNB Smart Chain (BEP-20), not posted | yes | see §3 | The Run at Depth 10; certificates in §4 |

Scrip and Wakelight are deliberately not on-chain and not purchasable.
Progression is the player writing their own file; selling that would make the
Ghostfile a receipt instead of a forgery. $CAPITAL is the only transferable value
and it lives entirely in the identity and community layer.

## 3. What $CAPITAL does (demand)

Every use below is a **sink** (burn), a **transfer** (player to player or
player to creator), or a **bond** (refundable). None is a wager and none
produces yield.

### 3.1 The Ledger Market — player-to-player cosmetics
The in-game market for cosmetics settles only in $CAPITAL. Cosmetics are
ERC-1155 tokens: weapon wear skins (the deterministic wear seed is the only
RNG the game allows, and it is cosmetic), faction trims, glyph plates,
kill-stamp designs, CRT themes, moniker typefaces, Deadletter Office
furnishings. Every listing shows exactly what is sold. No loot boxes, no
blind packs, no paid randomness.

Protocol fee on every sale: **5%** = 2% burned, 2% treasury, 1% to the
original creator (studio or Forge creator, §3.5). Secondary royalties are
enforced on-chain through the market contract, which is the only venue the
game recognises for equipping.

### 3.2 The Name Registry — "the city learns your name"
At Depth 50 the Ghostfile's empty NAME field fills in. The player may write
that name to the chain as a **soulbound ERC-721 handle**. Fee in $CAPITAL,
100% burned, priced by length like a name service (3 characters cost more
than 12). Names are permanent, non-transferable, and releasable. Squatting
is structurally impossible: registering requires Depth 50, which is 55–75
hours of play, and one wallet holds one Ghostfile.

### 3.3 The Ghostfile and Attestation Stamps — the identity backbone
The Ghostfile itself is a **soulbound ERC-721** minted at wallet link. The
~120 Attestation Stamps (first slide-jump kill, first 3-node round, first
EMP double) are on-chain attestations issued under an EAS-style schema,
signed by the game server the moment they are earned. Gas is sponsored;
there is no fee. This costs the player nothing and is what gives the rest
of the economy weight: cosmetics attach to a record that cannot be bought,
and the record is readable by anyone.

### 3.4 Room Credits — hosting
Private rooms, custom Audit playlists, and community tournaments cost $CAPITAL
per room-hour, **100% burned**. This is the sink with a real cost basis
(Durable Object minutes) and it scales with the community rather than with
speculation. Public matchmaking is always free.

### 3.5 The Forge — creator economy
Players publish cosmetics made with in-game tools (wear patterns, CRT
themes, kill stamps, Audit mutator sets, Deadletter props). A listing
requires a **$CAPITAL bond**, refunded on approval and forfeited (burned) on a
terms-of-service rejection. Primary sale split: 70% creator, 20% treasury,
10% burned. Secondary: the 1% creator royalty in §3.1. Creators are members,
not vendors; the Forge is curated and the curation is the studio's, in
public.

### 3.6 Season Buyout
The seasonal cosmetic track ("Lease Buyout" in the fiction) is bought with
$CAPITAL, **100% burned**. Fiat purchases route through a $CAPITAL buy-and-burn so
that every dollar spent on cosmetics is a token sink.

### 3.8 THE RUN — play to earn (Stage 14)
The play-to-earn loop is an extraction run, not a wager. A district is a
**PvP zone** with $CAPITAL **claims** lying in it — units VANTAGE never
collected. A Blank who walks over one carries it. Carried claims drop where
the file falls, for anyone, and expire back into the city if nobody takes
them. Carrying them into a **safe zone** (the gates: no damage in, no damage
out, the markets) and standing still for two seconds **banks** them: the
room credits the file. On the devnet a direct payout can pay the ceiling
before the day ends, and it refuses a settled day. In production the night
posts one PrizeVault Merkle epoch (`kind: "run"`, 01:00 UTC) and the file
presses CLAIM. The rate is `min(1, pot / units)`. Nothing arrives at the gate.

Rules that keep it an emission and not a farm:

- The **Depth gate**: below Depth 10 the run pays Scrip (10 per unit), not
  $CAPITAL — a script has to play 8–10 hours of the wake before it can earn.
- The **day's cap**: 200 units a day per file; anything banked past it is
  recorded, not paid.
- **One wallet per Ghostfile, one Ghostfile per wallet** (§3.3): the cap is a
  cap per person.
- Claims **respawn on a timer** at fixed positions, so the map can be learned
  but not drained; deeper claims are worth more.
- Nothing about the run touches a stat. Safe zones are geometry, not power.
- The client can spend $CAPITAL in the safe zones' markets (§3.1) or
  withdraw what it is owed to the wallet.

### 3.7 Testimony — governance without token-weighting
Deep Wake season parameters (which district is contested next, the Audit
mutator set) are put to **one-Ghostfile-one-vote**, gated at Depth 10. $CAPITAL
is not a vote. A proposal requires a $CAPITAL bond, refunded when the proposal
reaches quorum. Treasury spending is a studio decision published in a
quarterly reconciliation, not a DAO vote.

## 4. Where $CAPITAL comes from (supply)

### 4.1 Fixed supply
1,000,000,000 $CAPITAL, minted once, capped in the contract.

| Allocation | Share | Terms |
| --- | --- | --- |
| Play & compete emissions | 35% | 8-year schedule, decays 25% per year (§4.2) |
| Treasury: prize vault, liquidity, ops | 20% | on-chain, spend published quarterly |
| Creator & ecosystem fund | 15% | Forge grants, tooling, first-party content bounties |
| Team & advisors | 15% | 4-year vest, 1-year cliff |
| Investors | 10% | 3-year vest, 1-year cliff |
| Launch distribution | 5% | to Depth-10+ playtest accounts at mainnet, no sale |

### 4.2 Emission schedule
Year 1 ≈ 97M, then ×0.75 each year: 73M, 55M, 41M, 31M, 23M, 17M, 13M.
Emissions are paid only through the channels in §4.3. Unclaimed emissions
return to the treasury; they are never rolled forward.

### 4.3 Emission channels — competition, creation, prestige. Never grind.
Ordinary matches (the wake) pay Scrip and Depth. They never pay $CAPITAL.
THE RUN pays $CAPITAL, behind the Depth gate and the day's cap (§3.8), and
kills in it pay nothing — only banked claims do. There is no loop where a
script farms kills into a token.

| Channel | What earns | Cap / gate |
| --- | --- | --- |
| **THE RUN** | claims carried out of a PvP zone and banked at a safe zone (§3.8) | Depth ≥ 10, 200 **units** a day per file, one file per wallet; units settle against the day's pot (§4.5) |
| **Weekly Audits** | leaderboard placement on the server-seeded mutator playlist | Depth ≥ 10, clean anti-cheat record, prize curve to top 10%, one Ghostfile per wallet |
| **Deep Wake season end** | faction contribution (node flips, objective-weighted, same 40/35/25 weighting as Depth) | Depth ≥ 15, per-account cap, diminishing returns, same-party and per-pair velocity caps as all social earnings |
| **Rewrite certificate** | each Depth-50 prestige mints a certificate NFT and a fixed grant | naturally rate-limited to one per 55–75 h |
| **First-in-world stamps** | first account to earn a new seasonal stamp | one-off, small, announced in the killfeed |
| **Creator sales** | Forge primary and secondary | not an emission: player-to-creator transfer |

### 4.4 Balance target
Sinks must burn at least 60% of the month's emissions by month 12 and 100%
by month 24. The treasury tunes prices (buyout, names, room-hours) quarterly
against a public dashboard, in the game's own register: a **NET DELTA** line.

Month-12 flows at 50k monthly active players, 20% of them daily, half of
those past the Depth gate running and banking half the cap. These come out
of `shared/economy/model.ts`, which reads the same constants the game does,
so the table cannot quietly go stale:

| Flow | From | Built | $CAPITAL / month |
| --- | --- | --- | --- |
| Emissions | the schedule's daily pots, settled (§4.5) | yes | 6.48M out |
| Season buyout | 20% of MAU × 400, 100% burned | `SeasonBuyout.sol` | 4.0M burned |
| Name registry | 1,500 Depth-50 names × 500, 100% burned | `Names.sol` | 0.75M burned |
| Market fees | 10M volume × 2% burn | `LedgerMarket.sol` | 0.2M burned |
| Room credits | 20k room-hours × 5, 100% burned | `RoomCredits.sol` | 0.1M burned |
| **Net** | | | **5.05M burned ≈ 78% of emissions** |

Every row of that table is a contract that exists. **The ratio may only ever
be quoted from built sinks**, and `shared/economy/sinks.ts` carries a `built`
flag per channel that the model reads to decide what counts — an earlier
draft of this table quoted 65% on a season buyout whose contract had never
been written, which was 79% of the burn it was claiming. The Forge (§7) is
still specified and unbuilt; it would add about 0.15M a month, and that
number is reported separately rather than folded in.

The levers are the emission decay, the buyout price, and the name price. If
burn falls below target for two quarters the emission rate for the next year
is cut, not the other way round. Prices are steward-settable on chain
(`setPrice`) so a quarterly retune does not need a redeploy; a purchase
passes the price it agreed to, so a retune cannot front-run one.

### 4.5 The daily settlement — why a unit is not a price
An earlier draft of this document paid THE RUN a fixed rate: one $CAPITAL per
unit banked. That made the year's emission `runners × 200 × capUse × 365`,
which contains the player count, against a schedule that does not — 1.9× the
year-one budget at the population in §4.4, and 90× at a million MAU. No choice
of rate fixes it, because the two sides are not the same kind of quantity.

So a day is a pot, not a price. The day's slice of the schedule is split pro
rata among the units banked that day, capped at one $CAPITAL a unit:

```
rate = min(1, (year's schedule ÷ 365 × 0.8) ÷ units banked today)
```

Below roughly 21,000 MAU the pot never binds and the rate is the old 1:1;
above it a unit dilutes. Emission is `≤ pot` at every population, forever.
A day is paid as a PrizeVault Merkle epoch, so the vault's per-epoch funding
guard ring-fences it on chain too. The full arithmetic, the sensitivities and
the open questions are in `docs/ECONOMY.md`; `npm run lint:economy` fails the
build if a rate ever escapes the schedule again.

## 5. BNB Smart Chain

The launch chain is BNB Smart Chain. Wallet parameters live in `shared/economy/bnb.ts`. That module publishes no contract address.

| | Mainnet | Testnet |
| --- | --- | --- |
| Chain id | 56 | 97 |
| Name | BNB Smart Chain | BNB Smart Chain Testnet |
| Gas | BNB | tBNB |
| Wallet RPC | `https://bsc-dataseed.bnbchain.org` | `https://data-seed-prebsc-1-s1.bnbchain.org:8545` |
| Explorer | `https://bscscan.com` | `https://testnet.bscscan.com` |

`$CAPITAL` on this chain is a BEP-20: the fixed-cap bytecode in `contracts/CAPITAL.sol`, 18 decimals, symbol CAPITAL, name `$CAPITAL`, no owner, no extra mint, EIP-2612 permit. The cap is 1e9. Testnet 97 is the rehearsal. Mainnet 56 is that same bytecode after a claim pays on testnet.

Production stays dark until a real capital address exists. `CHAIN_ID` stays `"0"`, `CHAIN_RPC` stays `""`, and `CONTRACTS` stays `"{}"`. A public dataseed is a wallet endpoint. It is not the counter Worker's RPC. The worker needs a private RPC, and the relayer key needs tBNB before it needs BNB. The treasury address must not be the relayer. Do not invent either address.

The in-process devnet stays chain id 31911, name "MELTDOWN devnet", with an ETH-like native coin. It is how probes move a claim through the night. It is not pointed at BSC.

`LAUNCH_DAY` stays 2026-09-17 (day index 20713) unless the owner changes it before the first deploy. The PrizeVault bytecode carries that date. `shared/economy/chain.ts` names the Solana clusters only.

WalletConnect optional chains are only 56 and 97. The project id is the build-time value `VITE_WALLETCONNECT_PROJECT_ID`, and it must be 32 hex. No id is stored in the repo. A build without one says `WALLETCONNECT HAS NO PROJECT ID ON THIS BUILD` and does not open another wallet instead.

- Gas is BNB. The first button is WalletConnect, then MetaMask.
- The contracts are plain EVM. Nothing in them depends on a BNB-only precompile.
- The night pays at most 1 `$CAPITAL` a unit, out of that day's pot. A crowded day pays less. Nothing is sent at the gate.

## 6. Wallet link architecture (WalletConnect)

```
browser                           Cloudflare                       BNB Smart Chain
─────────────────────             ──────────────────────           ──────────────────
WalletConnect, then MetaMask      Worker: /link/nonce              $CAPITAL        (BEP-20, capped, permit)
viem, chain def in bnb.ts         Worker: /link/verify  (SIWE)     Ghostfile   (soulbound ERC-721)
WALLET // PLAY TO EARN            D1: wallet ↔ account (1:1)       Stamps      (EAS-style attestations)
claim UI: SIWE + on-chain txs     Worker: EIP-712 voucher signer   Names       (soulbound ERC-721)
                                  Player DO: cosmetic cache        Cosmetics   (ERC-1155)
                                  PrizeVault: the night's root     LedgerMarket, Forge, RoomCredits,
                                                                   SeasonBuyout, PrizeVault, Testimony
```

1. **Connect.** WalletConnect first, then MetaMask. The session chains are 56 and 97. The project id is `VITE_WALLETCONNECT_PROJECT_ID` at build time. Phantom may connect and is not the claim. While `CHAIN_ID` is 0, an EVM signature binds the address and transfers nothing.
2. **Link.** Sign-In With Ethereum (EIP-4361). The Worker issues a nonce
   from D1, the wallet signs, the Worker verifies with `viem`. One wallet
   per Ghostfile, one Ghostfile per wallet; relinking has a 30-day cooldown.
   The game never holds a key and never custodies a token.
3. **Mint the Ghostfile.** Soulbound, sponsored gas (ERC-4337 paymaster),
   so linking costs the player nothing.
4. **Vouchers.** Anything the game grants (a stamp, a Rewrite certificate,
   an Audit prize, a cosmetic drop) is an EIP-712 message signed by the
   Worker's key: `{account, item, amount, nonce, deadline}`. Contracts verify
   the signer; claims are pull-based. The Run posts a root each night. The Audit posts on Mondays.
5. **Trades** are player-signed transactions against the market contract.
   The player pays gas; the market fee is taken on-chain.
6. **PvP isolation.** The match Durable Object never imports the economy
   module. Cosmetic *IDs* enter the snapshot through the Player DO; nothing
   else does. The Stage 8 probe ("identity data leaks nothing mechanical")
   extends to wallet-linked state.
7. **Chain down, game up.** D1 caches cosmetic ownership; equipping never
   waits on a chain read. On-chain is the source of truth for transfers and
   a reconciliation job repairs the cache.

## 7. Contracts

| Contract | Standard | Notes |
| --- | --- | --- |
| `$CAPITAL` | ERC-20 + permit + burnable | fixed cap, no mint after genesis, no admin mint |
| `Ghostfile` | ERC-721, soulbound | one per wallet, burnable by holder (Rewrite keeps stamps and glyph age) |
| `Stamps` | EAS-style attestation schema | server-signed, revocable only for anti-cheat reversal |
| `Names` | ERC-721, soulbound | Depth-50 voucher required; length-priced; burn on register |
| `Cosmetics` | ERC-1155 | metadata carries the deterministic wear seed; no stats field exists |
| `LedgerMarket` | custom | fee split 2/2/1; only venue the game equips from |
| `Forge` | custom | **not built**: listing bond, 70/20/10 primary split, curation role. Needs a creator asset pipeline first; §4.4 does not count it. |
| `RoomCredits` | custom | built (Stage 19): 100% burn per room-hour, credits held on chain, spent by the host when a room opens |
| `SeasonBuyout` | custom | built (Stage 19): 100% burn, one pass per wallet per season; what it grants is off-chain cosmetics, so the pass is never resellable |
| `PrizeVault` | Merkle claims | built (Stage 15): weekly roots posted by the counter Worker's cron, sponsored claims, unclaimed after 90 days returns to treasury |
| `Testimony` | custom | 1 Ghostfile = 1 vote, Depth gate via voucher, proposal bond |

All contracts upgradeable only through a timelocked multisig; the $CAPITAL
token itself is not upgradeable. External audit before mainnet.

## 8. Enforcement in code (already on main)

`shared/economy/manifest.ts` defines the economy item shape and
`shared/economy/catalog.ts` builds the full manifest from the real game data
(`npm run lint:economy` runs it in CI). An item has a
`mechanical` block (costs and benefits — the Ghostfile's paired trades) and a
`market` block ($CAPITAL price, on-chain binding, tradability).
`shared/economy/lint.ts` fails on any of:

- an item with a `market` price or `onChain: true` that also has a
  `mechanical` block (paid power);
- a progression item (node, chip, keystone, firmware) that is on-chain or
  $CAPITAL-priced (paid progression);
- a Kernel Protocol (campaign-only power) that is priced, on-chain, or
  tradable — it is not even allowed to *exist* in the economy manifest;
- a purchasable cosmetic whose randomness is anything other than a wear seed.

Stage 6 folds this into the full Fairness Lint so CI rejects it the same way
it rejects a trade-less buff.

## 9. Legal and policy posture (for counsel)

- **Not a security by design:** no yield, no staking, no revenue share to
  holders, no buyback marketing, no token-weighted governance over treasury.
  Utility (§3) precedes any market. Counsel to confirm Howey and MiCA
  posture; an EU offer likely needs a utility-token whitepaper.
- **Not gambling:** no wagers, no paid randomness, no cash-out of
  randomized items, no player-funded prize pools. Audit prizes are treasury-
  funded and entry is free.
- **No custody:** the game never holds keys or tokens. AML/KYC obligations
  sit with wallets and venues, not the game; counsel to confirm for prize
  payouts above reporting thresholds (US 1099 for Audit winners).
- **Age gate:** wallet features are 18+. The game is fully playable without
  a wallet.
- **Platform:** browser-only, so no app-store token policy applies. BNB
  Smart Chain's developer terms apply and must be reviewed before the
  testnet rehearsal is pointed at a public RPC.

## 10. Player-facing copy (front-facing, in-fiction)

> **COUNTER-LEDGER // $CAPITAL**
>
> VANTAGE priced you. This is the other book.
>
> $CAPITAL is what The Run pays. Pick up a claim in the PvP streets, carry
> it to a safe gate, and stand still until it banks. Die on the way and it
> drops where you fell. From Depth 10 the bank is on your file at once. The
> night pays the linked wallet, at most 1 $CAPITAL, and a crowded day pays
> less. Nothing arrives at the gate. Matches still pay Scrip. The file is
> yours.
>
> $CAPITAL buys the things VANTAGE would have stamped over: how your rig looks,
> what your kill stamp reads, the furnishings of your safehouse, an hour of
> a room nobody else can enter. At Depth 50, it buys the one line the ledger
> never had for you. Your name. Written where they can't redact it.
>
> It does not buy damage. It does not buy armor. It does not buy a node.
> The Auditor checks. `NET DELTA: 0.000 — RECONCILED`.

## 11. Internal notes (backend)

- **Investor framing.** $CAPITAL is the play-to-earn token of The Run. It is
  not a wager, a stake, or a stat. The Ghostfile is the durable record,
  cosmetics are sinks, and the night's pot is the discipline. Lead with
  banked units and the day's rate, never a promise that a unit pays 1.
- **What we will not do:** loot boxes, token-gated power, rented power,
  pay-to-skip progression, staking, wagers on match outcomes, token-weighted
  votes, admin mint.
- **Kill criteria.** If month-12 burn is below 40% of emissions, or if bot
  accounts exceed 2% of Audit payouts in any week, emissions pause and the
  channel is redesigned before they resume.
- **Sequence.** Testnet integration at Stage 11b with sponsored attestations
  and the Ghostfile only; the market, names, and emissions go live only
  after the anti-cheat and Audit systems have a full season of data.
