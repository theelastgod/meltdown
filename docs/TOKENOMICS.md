# MELTDOWN — $CAPITAL: the counter-ledger

**Status:** design spec, adopted. Implemented in Stage 11b (see `docs/STAGES.md`): the contracts in `contracts/`, the wallet link, vouchers, market and names run against an in-process EVM devnet until Robinhood Chain's testnet parameters are published; the testnet is configuration (`wrangler.counter.toml`, `shared/economy/chain.ts`).
**Token:** $CAPITAL (ERC-20; the contract is named `$CAPITAL`, symbol CAPITAL). The play-to-earn extraction loop (THE RUN: PvP zones, safe zones, the markets) is Stage 14.
**Chain:** Robinhood Chain (Arbitrum Orbit L2, EVM). **Wallets:** WalletConnect via Reown AppKit.
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
| **$CAPITAL** | on-chain, Robinhood Chain | yes (ERC-20) | see §3 | competition, creation, prestige certificates (§4) |

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
room credits the file, the counter-ledger pays the wallet from the treasury's
emission schedule (§4.3) — on the devnet the relayer is the treasury; in
production the weekly PrizeVault Merkle root.

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
| **THE RUN** | claims carried out of a PvP zone and banked at a safe zone (§3.8) | Depth ≥ 10, 200 units a day per file, one file per wallet |
| **Weekly Audits** | leaderboard placement on the server-seeded mutator playlist | Depth ≥ 10, clean anti-cheat record, prize curve to top 10%, one Ghostfile per wallet |
| **Deep Wake season end** | faction contribution (node flips, objective-weighted, same 40/35/25 weighting as Depth) | Depth ≥ 15, per-account cap, diminishing returns, same-party and per-pair velocity caps as all social earnings |
| **Rewrite certificate** | each Depth-50 prestige mints a certificate NFT and a fixed grant | naturally rate-limited to one per 55–75 h |
| **First-in-world stamps** | first account to earn a new seasonal stamp | one-off, small, announced in the killfeed |
| **Creator sales** | Forge primary and secondary | not an emission: player-to-creator transfer |

### 4.4 Balance target
Sinks must burn at least 60% of the month's emissions by month 12 and 100%
by month 24. The treasury tunes prices (buyout, names, room-hours) quarterly
against a public dashboard, in the game's own register: a **NET DELTA** line.
Illustrative month-12 flows at 50k monthly active players:

| Flow | Illustrative | $CAPITAL / month |
| --- | --- | --- |
| Emissions | schedule | 8.0M out |
| Season buyout | 20% of MAU × 400 | 4.0M burned |
| Name registry | 1,500 Depth-50 names × 500 | 0.75M burned |
| Market fees | 10M volume × 2% burn | 0.2M burned |
| Room credits | 20k room-hours × 5 | 0.1M burned |
| Forge bonds and primary burns | | 0.15M burned |
| **Net** | | **5.2M burned ≈ 65% of emissions** |

The levers are the emission decay, the buyout price, and the name price. If
burn falls below target for two quarters the emission rate for the next year
is cut, not the other way round.

## 5. Robinhood Chain

Robinhood Chain is Robinhood's Layer 2 built on the Arbitrum Orbit stack:
EVM-compatible, Nitro execution, bridged from Ethereum. Every contract and
client path in this spec is plain Orbit EVM, so nothing depends on a
chain-specific feature. Chain ID, RPC, explorer, and bridge endpoints are
configuration values (`shared/economy/chain.ts`, filled from Robinhood's
developer documentation when mainnet parameters are final; the testnet
values go in first).

Why this chain and not a generic L2:

- **The audience is already there.** Robinhood's users hold a wallet and a
  fiat on-ramp in an app they already trust. The first wallet most MELTDOWN
  players link will be a Robinhood Wallet, over WalletConnect.
- **Low, predictable fees** make cosmetic trades, sponsored attestations,
  and per-hour room credits viable at game scale.
- **Regulated-adjacent posture.** A chain operated by a US broker-dealer
  sets a compliance expectation. The design below is written to survive
  that scrutiny: utility first, no yield, no wagers, no paid randomness.

## 6. Wallet link architecture (WalletConnect)

```
browser                           Cloudflare                       Robinhood Chain
─────────────────────             ──────────────────────           ──────────────────
Reown AppKit (WalletConnect v2)   Worker: /link/nonce              $CAPITAL        (ERC-20, capped, permit)
wagmi + viem, custom chain def    Worker: /link/verify  (SIWE)     Ghostfile   (soulbound ERC-721)
"COUNTER-LEDGER LINK" CRT panel   D1: wallet ↔ account (1:1)       Stamps      (EAS-style attestations)
claim UI: signs nothing but       Worker: EIP-712 voucher signer   Names       (soulbound ERC-721)
  SIWE + on-chain txs             Player DO: cosmetic cache        Cosmetics   (ERC-1155)
                                  PrizeVault: weekly Merkle roots  LedgerMarket, Forge, RoomCredits,
                                                                   SeasonBuyout, PrizeVault, Testimony
```

1. **Connect.** Reown AppKit modal skinned as CRT chrome. Connectors:
   WalletConnect (Robinhood Wallet, MetaMask, Rabby, Coinbase Wallet) and
   injected. The chain definition is the Robinhood Chain config.
2. **Link.** Sign-In With Ethereum (EIP-4361). The Worker issues a nonce
   from D1, the wallet signs, the Worker verifies with `viem`. One wallet
   per Ghostfile, one Ghostfile per wallet; relinking has a 30-day cooldown.
   The game never holds a key and never custodies a token.
3. **Mint the Ghostfile.** Soulbound, sponsored gas (ERC-4337 paymaster),
   so linking costs the player nothing.
4. **Vouchers.** Anything the game grants (a stamp, a Rewrite certificate,
   an Audit prize, a cosmetic drop) is an EIP-712 message signed by the
   Worker's key: `{account, item, amount, nonce, deadline}`. Contracts verify
   the signer; claims are pull-based. Prizes use a weekly Merkle root.
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
| `Forge` | custom | listing bond, 70/20/10 primary split, curation role |
| `RoomCredits` | custom | burn per room-hour; Worker reads the burn receipt |
| `SeasonBuyout` | custom | burn; emits the pass to the Ghostfile |
| `PrizeVault` | Merkle claims | weekly roots posted by the Worker; unclaimed after 90 days returns to treasury |
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
- **Platform:** browser-only, so no app-store token policy applies. Robinhood
  Chain's own developer terms apply and must be reviewed at integration.

## 10. Player-facing copy (front-facing, in-fiction)

> **COUNTER-LEDGER // $CAPITAL**
>
> VANTAGE priced you. This is the other book.
>
> $CAPITAL is what the city pays a Blank who did something it can verify: a
> placement in the weekly Audit, a district turned green at season's end, a
> file burned and rewritten. You cannot farm it. Matches pay Scrip; Scrip
> writes your file; the file is yours.
>
> $CAPITAL buys the things VANTAGE would have stamped over: how your rig looks,
> what your kill stamp reads, the furnishings of your safehouse, an hour of
> a room nobody else can enter. At Depth 50, it buys the one line the ledger
> never had for you. Your name. Written where they can't redact it.
>
> It does not buy damage. It does not buy armor. It does not buy a node.
> The Auditor checks. `NET DELTA: 0.000 — RECONCILED`.

## 11. Internal notes (backend)

- **Investor framing.** $CAPITAL is membership infrastructure for a competitive
  community, not a play-to-earn token: the Ghostfile is the durable asset,
  cosmetics and creator royalties are the recurring revenue, and the burn
  schedule is the discipline. Lead with active players and Forge creator
  count, never floor price.
- **What we will not do:** loot boxes, token-gated power, rented power,
  pay-to-skip progression, staking, wagers on match outcomes, token-weighted
  votes, admin mint.
- **Kill criteria.** If month-12 burn is below 40% of emissions, or if bot
  accounts exceed 2% of Audit payouts in any week, emissions pause and the
  channel is redesigned before they resume.
- **Sequence.** Testnet integration at Stage 11b with sponsored attestations
  and the Ghostfile only; the market, names, and emissions go live only
  after the anti-cheat and Audit systems have a full season of data.
