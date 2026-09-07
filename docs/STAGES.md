# MELTDOWN — Stage plan and status

One stage per session / PR. A stage is done only when `npm run verify`
(typecheck + unit tests + headless probe) is green and proof artifacts are in
`docs/proof/stage<N>/`.

| # | Stage | Status | Proof |
| --- | --- | --- | --- |
| 1 | Grey-box FPS core (solo) | **done** | `docs/proof/stage1/` |
| 2 | Netcode early: DO rooms, prediction/reconciliation/interp/lag-comp, 8 players, latency/loss bars | **done** | `docs/proof/stage2/` |
| 3 | The look: lighting rig, neon, GPU rain, wet reflections, fog, post chain, district casts | **done** (pulled ahead of 2 at the owner's request) | `docs/proof/stage3/` |
| 4 | Arsenal: weapons 1–6 + alt-fires + grenades, recoil seeds, reload cancels, VANTAGE AI | **done** | `docs/proof/stage4/` |
| 5 | The wake: hex nodes, flip/contest/spread, KERNEL timer | **done** | `docs/proof/stage5/` |
| 6 | Ghostfile foundation: manifest, Fairness Lint, spawn validation, Depth/XP, currencies, crafting | **done** | `docs/proof/stage6/` |
| 7 | Ledger Graph (48 nodes / 3 rings), chips + sockets + firmwares, challenge-gated mastery, attestation stamps, ledger shop | **done** | `docs/proof/stage7/` |
| 8 | Identity & rituals: glyphs, monikers, Debts, dossier flash, tiered kill audio, Ledger Entry receipt, Chapter rites, Deadletter Office + range ghosts | **done** | `docs/proof/stage8/` |
| 9 | Neo-China proper: three districts, THE KERNEL horizon, district select, render budget | **done** (pulled ahead at the owner's request: "the game needs to feel and be like it's in a city") | `docs/proof/stage9/` |
| 9b | City life: crowds, monorail, street vistas through sealed gates, ad tickers, sign flicker, steam, skyline blinkers, airship, soundscape + VANTAGE PA | **done** (the owner repeated the note; the district is now inhabited, not just built) | `docs/proof/stage9b/` |
| 10 | Campaign: three houses and their fixers, 7 missions + 12 gigs on a data-driven runtime, CRT testimony dialogue, Threat Rating, Kernel Protocols behind the PvP wall, weapons 7–8, endings, solo + co-op | **done** | `docs/proof/stage10/` |
| 11 | Endgame loops: daily contracts, weekly Audit playlists with per-week leaderboards, the Deep Wake seasonal district graph, Rewrite prestige + the Wakelight shop (themes, alias and preset slots — never a stat) | **done** | `docs/proof/stage11/` |
| 11b | The Counter-Ledger: $CAPITAL on Robinhood Chain, SIWE wallet link, soulbound Ghostfile + stamp attestations through game-signed vouchers, the Ledger Market, names at Depth 50, an in-process EVM devnet until the testnet parameters land (`docs/TOKENOMICS.md`) | **done** (devnet; testnet is configuration) | `docs/proof/stage11b/` |
| 12 | Opening crawl: cyan monospace on black, typed-then-held paragraphs, scanline flicker, glitch tears, ~34 s, skippable after the first view, hard cut to silence, the MELTDOWN title; original copy until the owner's text lands | **done** | `docs/proof/stage12/` |
| 13 | Polish & ship: the CRT menu flow with the two title cards, settings applied live and kept, the audio pass (buses, UI cues, the card sting, the low-health pulse), Cloudflare Pages + Workers deploy, the smoke test in CI | **done** (deploy is a workflow gated on the Cloudflare secrets) | `docs/proof/stage13/` |
| 14 | THE RUN — $CAPITAL play-to-earn: the token renamed WAKE → CAPITAL, PvP zones with claims, safe zones (no damage in or out, the markets, banking), the day's cap and the Depth gate, the treasury payout to the wallet | **done** (devnet; testnet is configuration) | `docs/proof/stage14/` |
| 15 | Hardening: the PrizeVault (Merkle epochs for Audit placements and Deep Wake contributions, sponsored claims, 90-day reclaim), matchmaking shards, the safe-zone market kiosk, a per-file rate limit on the counter-ledger, the flaky probe waits | **done** | `docs/proof/stage15/` |
| 16 | Security review of the money paths: eight findings across the contracts and the room, two of them fund-safety and one a live speed hack, each fixed and pinned by a mutation-checked regression test (`docs/SECURITY.md`) | **done** | `tests/security.test.ts`, `tests/speedhack.test.ts` |

## Stage 1 — Grey-box FPS core

**Goal.** A solo, browser-playable first-person sandbox with the movement and
gunfeel foundations the whole game is built on, simulated at a fixed
timestep independent of render rate, and provable headlessly.

**Acceptance (all verified by `npm run probe`):**

- Pointer-lock controller; capsule collision against the level; step-ups.
- Movement tech from match one: sprint, jump (buffer + coyote), slide
  (momentum-preserving, boosted entry, decays, exits keep velocity),
  slide-jump (keeps the full horizontal vector), mantle (ledges 0.45–1.7 m).
- Air control can never manufacture speed; ground momentum decays and never
  grows; top speed is bounded by the slide cap.
- Hitscan with head/body/leg zones; cyan tracer; zone-pitched hit audio;
  kill confirm as a CRT stamp flash + receipt-printer thunk.
- Lease-Breaker stub kills in 0.6–1.0 s at perfect accuracy (7 body hits at
  500 rpm = 0.72 s nominal; measured 0.80–0.90 s from the first hit).
- Fixed 60 Hz simulation decoupled from render (probe: ~60 ticks/s while
  SwiftShader renders at ~28 fps).
- Determinism: replaying the same input plan on a fresh page reproduces the
  same world hash. This is the basis for Stage 2 prediction/reconciliation.

**Architecture set here and kept for every later stage:**

- `shared/` is pure TypeScript with no DOM or Three.js dependency. The
  Cloudflare Worker (Stage 2) imports it unchanged.
- `World.step(inputs)` is the only way time advances. No `Math.random`, no
  wall clock, no per-frame logic in the sim.
- Events are drained by the presentation layer (audio, VFX, HUD); the sim
  never calls into it.
- `window.__game` exposes state, deterministic `advance(n)`, and a scripted
  `Bot` so every later stage's probe is a plan, not a replay of mouse input.

## Stage 11 — Endgame loops

**Goal.** Reasons to come back that are all made of matches: three DAILY
CONTRACTS a day scored from the file's own lifetime counters, a weekly
AUDIT playlist (rules, sheet mutators, gravity) with a per-week
leaderboard, the DEEP WAKE — a 28-day seasonal district graph that only
settled rounds can move — and REWRITE, the prestige at Depth 50 that burns
the file and pays Wakelight, which buys CRT themes, alias slots and preset
slots and nothing that touches a stat. No wagering, no staking, nothing to
buy that helps you shoot.

**Files.**
- `shared/endgame/clock.ts` — the UTC day / week / season index, the
  season week, a seeded LCG and `pickDistinct()` so every host offers the
  same three contracts and the same playlist on the same day.
- `shared/endgame/contracts.ts` — an 18-contract pool, `contractsFor(day)`
  picks three; `dailyOf()` snapshots the counters at the day's start so
  progress is the delta since then; `claimContract()` pays Scrip and
  Wakelight once and refuses with the progress otherwise.
- `shared/endgame/audits.ts` — eight playlists (PELLET WEEK, GLASS, LONG
  LEASE, NO KEYSTONE, RING ONE, LOW LEASE, HEAVY AIR, STACK & PHAGE) each
  made of a weapon allow-list, a `noKeystone` / `ringOnly` rule, a sheet
  mutator (the same `setLoadout` extra the campaign uses) and a gravity
  multiplier; `auditErrors()` refuses a banned loadout with the rule;
  `leaderboard()` keeps the best score per file.
- `shared/endgame/season.ts` — three districts × nodes A–E, each held by
  a house (ESTATE / CLOCKEATERS / CELLS / unaligned); `applyRound()` adds
  the round's flips as pressure toward the flipping files' houses (+1 on
  every held node for the winning cell's houses); a node turns at pressure
  6 when the challenger strictly out-presses the holder (the holder
  defends a tie); `rollSeason()` writes the closing log from the real data
  and resets pressure, holdings carry over; `seasonView()` is the MAP tab.
- `shared/endgame/rewrite.ts` — `rewrite()` at Depth 50 resets XP, Depth,
  Scrip, Salvage, attested nodes, loadout, mastery and Debts, keeps stamps,
  counters, moniker, chapters, cosmetics and campaign, and pays 500
  Wakelight; four themes with palettes, two alias slots and four preset
  slots bought in order; `setTheme` / `savePreset` / `setAlias`.
- `shared/sim/player.ts`, `shared/sim/world.ts` — `gravityMult` threaded
  into `stepPlayer()` so an Audit's gravity runs identically on the room
  and the predicting client.
- `shared/net/protocol.ts` (v8) — the Welcome carries a `mode` string
  (`audit:<id>:<week>`); the client re-applies the same sheet and gravity.
- `server/endgame.ts` (`EndgameStore`, memory), `server/endgame-do.ts`
  (the `Endgame` Durable Object: `/audit?week=`, `/season`),
  `server/room.ts` (`audit` + `endgame` options: refuse at admit, sheet at
  join, scores + flips pushed at settlement, `audit` / `seasonLast` in
  stats), `server/node-host.ts` + `server/worker.ts` + `server/player-do.ts`
  (`GET /endgame`, `/file/:id/daily`, `POST /file/:id/claim|rewrite|cosmetic`,
  the `?audit=1` room), `wrangler.toml` (ENDGAME binding, migration v3).
- `client/file.ts` (the ENDGAME section: contracts with CLAIM, the Audit
  and its board, JOIN THE AUDIT, the Rewrite box, the shop, presets,
  aliases), `client/game.ts` (Audit join, mode parse, the HUD line),
  `client/hud/hud.ts` (`setTheme()` swaps the palette variables;
  `setSeason()` draws the Deep Wake on the MAP tab), `client/main.ts` hooks.
- `tests/endgame.test.ts` (6), `probe/stage11.ts`.

**Design decisions.**
- Contracts read the file's counters, so nothing new is tracked and a
  contract can never be farmed against a private tally; the day base is a
  snapshot the file itself carries.
- An Audit is a room option, not a game mode: the same room, the same
  settlement, one extra refusal at the door and one extra push at the end.
  A playlist that bans the lease-breaker still lets a Depth-1 file in only
  if it can hold a listed weapon at all — weapon-depth stays the first rule.
- The Deep Wake is moved by flips attributed to houses through the
  campaign's faction choice; unaligned files push nothing, so a house has to
  be chosen in the story before a file can move the map.
- Rewrite keeps the counters and the stamps because the glyph's age and the
  attestations are the file's history; everything that is power resets.
  Wakelight is the only currency Rewrite pays and the shop takes, and
  every item in it is a palette, a name or a slot.

**Acceptance (`npm run probe:endgame`, 13/13; `npm test`, 139 tests):**
the host serves today's three contracts, the week's playlist and an empty
season; the FILE panel shows the contracts with delta progress, the Audit,
Rewrite and the shop; a contract cannot be claimed before it is done; the
playlist's mutators reach the sheet and gravity; the Welcome names the
playlist and the client runs the same gravity (×0.6) and shield the room
runs; a settled Audit round lands both files on the week's board (best per
file) and on each file's record; ALPHA's one real flip at B pushes +1 CELLS
pressure on LEASE ROW B and writes the season line; the MAP tab shows the
season, holders, pressure leaders and the last lines; REWRITE at Depth 50
takes the file to Depth 1 / XP 0 / Scrip 0 with the 12 stamps intact and
500 Wakelight paid; a second Rewrite waits for Depth 50; Wakelight buys
AMBER and the HUD's `--cy` becomes `#ffd27a`; preset slot 3 is refused
before slot 2, a preset saves and loads back, an alias slot takes a name;
no page errors.

## Stage 11b — The Counter-Ledger

**Goal.** $CAPITAL (ERC-20 on Robinhood Chain) and the wallet link, built so the
token touches identity, ownership, creation, hosting and competition, and
never a stat. Spec: `docs/TOKENOMICS.md`. Every contract and client path is
plain Orbit EVM; the chain id, RPC and addresses are configuration. Until
Robinhood publishes the testnet parameters the hosts run the same contracts
on an in-process EVM devnet, so everything below is exercised for real —
signatures, reverts, fee splits — without a network.

**What shipped.**
- `contracts/` — six Solidity contracts, no framework: `CAPITAL` (fixed cap
  minted once to the treasury, burnable, no admin mint), `Ghostfile`
  (soulbound ERC-721, one per wallet, minted against a game voucher, every
  transfer path reverts, holder-burnable), `Stamps` (EAS-style attestations:
  server-signed `{wallet, fileId, stampId}`, steward-revocable for anti-cheat),
  `Names` (soulbound handle at Depth 50, $CAPITAL fee burned, priced by length
  3 → 2000 … 12+ → 150), `Cosmetics` (ERC-1155 with a creator and a wear
  seed per id; no stats field exists), `LedgerMarket` (exact listings, 5%
  fee: 2% burned, 2% treasury, 1% creator, on chain). `Vouchers.sol` is the
  EIP-712 base: signer address, per-wallet single-use nonces, deadlines.
  `npm run contracts:build` compiles with solc-js into
  `contracts/out/artifacts.json` (committed: ABIs + bytecode).
- `server/chain/devnet.ts` — an Orbit-compatible devnet in process: a real
  EVM (ethereumjs, Cancun) behind the JSON-RPC subset viem needs, one block
  per transaction, a faucet, and an outage switch for the chain-down drill.
  `server/chain/deploy.ts` + `deploy-cli.ts` deploy to it or to a real RPC.
- `server/chain/signer.ts` — the game signer: EIP-712 vouchers for the
  link, each stamp and the name; the key never leaves the host.
- `server/chain/ledger.ts` — `CounterLedger`: SIWE link (statement, chain,
  domain, expiry, nonce, signature), the 1:1 bind, the sponsored Ghostfile
  mint (the relayer pays), stamp attestations (bounded per call), the name
  voucher (Depth 50), the market view, the treasury line, and `reconcile()`
  that reads the chain into the file's cache ($CAPITAL, Ghostfile, name, the
  rig from the skin balances). Every chain call fails soft with a reason.
- `server/chain/wallets.ts` (memory) and `wallets-d1.ts` (D1 `wallet`,
  `siwe_nonce`; `server/schema.sql` + `schema.ts` mirror).
- `server/counter-worker.ts` + `wrangler.counter.toml` — a third Worker,
  like the campaign's: the PvP bundle carries no economy module and no
  chain client. Node host: `/chain` (JSON-RPC), `/chain/faucet`,
  `/chain/outage`, `/counter`, `/link/nonce`, `/link/verify`,
  `/file/:id/counter` (`wear` is cache-only; `reconcile` / `stamps` /
  `name` go to the chain).
- `shared/economy/catalog.ts` — the full manifest in the lint's shape
  (every node, keystone, chip, firmware, Wakelight theme, the four on-chain
  skins, the registry, room credits, the buyout, the Rewrite certificate);
  `SKINS` carry a token id, a price, a wear seed and a tint — nothing else.
  `npm run lint:economy` runs the one rule over it in CI.
- `shared/economy/counter.ts` — the counter record helpers (`wearSkin`,
  `counterView`, the SIWE statement, the voucher domains/types, name fees);
  `shared/economy/endpoint.ts` — the request both hosts share.
- `shared/progression/account.ts` — `counter` (plain data: address, Ghostfile
  id, stamps on chain, name, rig cache, worn token, $CAPITAL display string).
- `shared/identity/identity.ts` — the tag grows a fifth segment only when a
  skin is worn: `seed.chapter.moniker.debt[.skin]`; `skin` is a token id.
  The renderer maps it onto the catalog's tint (remote emissive + trim, the
  local viewmodel strips). Nothing in the sim reads it.
- `client/counter.ts` — the panel's wallet: an injected EIP-1193 provider
  (Robinhood Wallet over WalletConnect, MetaMask, Rabby) or, headless, a
  viem local account from `?wallet=<key>`; SIWE through the host; the
  player's own transactions (approve + buy, approve + register) straight
  to the chain's RPC. `client/file.ts` — the COUNTER-LEDGER // $CAPITAL section
  of the FILE panel: link, Ghostfile, stamps on chain, $CAPITAL, the name field
  at Depth 50, the rig with WEAR, the Ledger Market, the treasury's NET
  DELTA line. `client/main.ts` hooks: `counter`, `link`, `buySkin`,
  `wearSkin`, `registerName`, `reconcile`.
- `tests/counter.test.ts` (6), `probe/stage11b.ts`.

**Design decisions.**
- Vouchers, not admin calls: the Ghostfile, every stamp and the name are
  EIP-712 messages the game signs and anyone may submit. The relayer
  sponsors the Ghostfile and the stamps (the wallet holds no ETH and never
  pays); trades and the name burn are the player's own transactions, as
  the spec has them. ERC-4337 sponsorship is the production path for the
  same vouchers; the devnet has a faucet for the player's own gas.
- The tag carries a token id, never a name, a price or a colour. The
  catalog that turns the id into a tint is client-side; a snapshot with a
  skin in it is one integer longer than one without.
- Chain down, game up: `wear` reads the cache the last reconcile wrote,
  the room reads only `counter.worn`, and settlement never touches the
  chain. The drill in the probe flips the devnet dead, links, reconciles,
  wears, joins, settles, and flips it back.
- The SIWE statement is fixed and the host refuses any other: the link
  signs nothing else, and a replayed message is a stale nonce.
- A Depth-1 file that links gets a Ghostfile and its stamps but no name
  voucher and (on the devnet) no launch grant; the registry and the grant
  are gated on Depth, which is play.
- Two regressions caught by the full sweep and fixed here: the Stage 6
  probe's smuggled `protocols` field is stripped at PvP join by design
  since Stage 10 (the probe now smuggles a field the manifest never knew),
  and the CLOCKEATER's BUMP STOCK crossed the TTK band (a burst pistol's
  fire rate is quantised by the burst cadence: +2% was a whole burst gap,
  −10% TTK at every range), so on that weapon the fire-rate benefit becomes
  a reload benefit of the same weight — the same move the SMG's spread
  chips made in Stage 7.

**Acceptance (`npm run probe:counter`, 11/11; `npm run lint:economy`, 241
items / 0 violations; `npm test`, 145 tests):** the host runs the devnet
with the six contracts deployed, $CAPITAL at its cap and every skin listed; the
panel links a wallet over SIWE, the host binds it 1:1 and mints Ghostfile #1
to the wallet with the wallet's ETH balance staying 0; the token cannot be
transferred and a second file cannot bind the same wallet; the buy burns
exactly 2% on chain, the 1155 balance is 1, reconcile puts token 1 on the
rig, WEAR sets it and the viewmodel takes `#d86a2a`; in the next match the
other client sees ALPHA with a five-segment tag ending `.1` and BRAVO with
four, and the remote record carries no name, price or colour; the round's
stamps attest on chain (count readable by anyone); THE_AUDITOR registers
for 250 $CAPITAL burned; a Depth-1 file gets no voucher; with the chain dead,
reconcile and a new link say CHAIN UNREACHABLE while wear, the join with
the worn skin, the round and the settlement work, and reconcile succeeds
again once it is back; the full manifest lints clean and a priced item
with a stat fails; the unit test walks the PvP bundle's import graph and
finds no `shared/economy`, `server/chain` or `viem`; no page errors.

## Stage 12 — The opening crawl

**Goal.** Cyan monospace on black. One paragraph at a time, typed then held.
Scanlines flickering over it. A glitch tear between paragraphs. About 35
seconds. Skippable after the first view. A hard cut to silence, then the
MELTDOWN title. The owner's OPENING_TEXT is rendered verbatim when it is
supplied; until then an original crawl in the brief's register ships:
clinical compressed history read as a runaway process, paragraphs
shortening, ending on a single isolated line announcing something arriving
from the future.

**Files.**
- `client/crawl-text.ts` — `OPENING_TEXT` (null until supplied; rendered
  verbatim, never edited) and `DEFAULT_CRAWL`, seven original paragraphs,
  280 → 205 → 169 → 137 → 90 → 70 → 57 characters, the last a single line.
- `client/crawl-schedule.ts` — the crawl as a pure schedule: type at 60
  characters a second, hold for 0.9 s + 8 ms a character, a 0.35 s tear
  between paragraphs, a 1.6 s cut, then the title; `crawlAt(t)` gives the
  phase, the paragraph, the characters visible, the tears so far;
  `crawlShape()` checks the register (shortening, isolated last line).
- `client/crawl.ts` — the overlay above everything: the typed text with a
  block cursor, two ghost layers, the scanline pass (a repeating gradient
  flickering at 9 Hz with a slow roll), the tear (three layers sliced into
  random bands and pushed apart, the ghosts tinted magenta and cyan, the
  body jolting), the cut (text gone, hum stopped dead), the title (MELTDOWN
  in the terminal type with a chromatic shadow, snapping in over three
  steps), the CLICK TO $CAPITAL prompt; the click hands the gesture to the game
  (audio resume + pointer lock). `?crawl=1` forces it, `?crawl=0` never,
  headless probes skip it by default, `?crawlspeed=k` runs it k× faster.
- `client/audio.ts` — `crawlHum` (a low sawtooth under the text, stopped
  without a fade at the cut), `crawlTick` (a dry key every two characters),
  `tear` (a torn-noise burst and a pitch drop).
- `client/hud/hud.css` — the crawl block; `client/main.ts` — the boot and
  the `crawl` / `crawlSkip` / `crawlFinish` hooks.
- `tests/crawl.test.ts` (2), `probe/stage12.ts`.

**Design decisions.**
- The crawl is a schedule, not a set of timers, so it can be run at speed
  in a probe, sampled on its own clock (frames under SwiftShader are slow),
  and asserted at 1× in a unit test: 34.1 s from the first keystroke to
  the title.
- Not skippable on the first view, as the brief has it; the second view
  shows `[SPACE] SKIP` and SPACE / ESC / ENTER jump to the cut, never past
  it — the silence and the title are always seen.
- The copy quotes nothing: it is written for this fiction (the lease on
  attention, VANTAGE as collections, THE KERNEL filing its last report a
  year ahead, the Blanks as a clerical error that became a schedule).
  Everything is uppercase and unquoted; the test enforces the shape.

**Acceptance (`npm run probe:crawl`, 10/10; `npm test`, 147 tests):** the
crawl runs 34.9 s at 1× and the copy shortens to one isolated line; the
text is `rgb(53, 242, 255)` monospace on `rgb(0, 0, 0)` under a
`crawl-flicker` scanline pass at z-index 1000; the first paragraph's
character count rises monotonically to 280 and holds there; on the first
view SPACE does nothing; a tear frame shows three bands pushed apart with
both ghost layers lit, and six tears for seven paragraphs; after the cut
the text is hidden, the hum is off and MELTDOWN is up with the view now
recorded; the title's click removes the overlay with the game ready
underneath; on the second view the hint shows, SPACE lands in the cut
(silent, no text) and the title follows; `?headless=1` alone boots straight
into the game; no page errors.

## Stage 13 — Polish & ship

**Goal.** The CRT menu flow with the title cards "Every mind in Neo-China is
leased." / "You woke free.", settings, a full audio pass, deploy to
Cloudflare Pages + Workers, and a smoke test in CI.

**Files.**
- `client/menu.ts` — the flow after the crawl's title (or straight away):
  the two title cards, each on its own clock so a slow frame cannot skip
  one, then the menu — $CAPITAL (a district, then the public room on the
  configured host), CAMPAIGN (the desk at the Deadletter Office), THE
  OFFICE (the hub), THE RANGE (the yard, offline), FILE (the Ghostfile
  panel), SETTINGS. ↑↓ move, ENTER selects, ← → adjust, ESC backs out.
  A choice is a URL that names the mode, like district travel. In play,
  losing pointer lock (ESC) opens the pause menu: RESUME / SETTINGS / FILE /
  QUIT TO MENU. `?menu=1` forces the flow, `?menu=0` never; deep links
  (a level, a room, a mission) and headless boots skip it; `?nonav=1`
  reports the URL a choice would load (the probe).
- `client/settings.ts` — mouse sensitivity, field of view, master / SFX /
  city-bed volumes, the CRT intensity, "opening crawl every visit"; clamped
  and rounded to their ranges on read, persisted in the browser, applied
  live: sensitivity is input, FOV and CRT are the renderer, volumes are the
  audio buses. Never the sim.
- `client/render/post.ts`, `client/render/renderer.ts` — `setCrt(k)` scales
  grain, aberration, scanlines and vignette (0 clean, 1 as shipped, 1.5
  heavy); `setFov`.
- `client/audio.ts` — the audio pass: a master → sfx bus for every cue with
  the city bed on its own bus under master; `setVolumes`; a duck when the
  tab is hidden; UI cues (move / select / back); the title-card sting; the
  low-health pulse that beats every 620 ms under 30 health until the
  shield is back. `client/game.ts` — settings applied at boot and live;
  the pulse in the frame; the lock-lost hook.
- `client/config.ts` — the hosts from `VITE_*` at build time (the three
  Workers, the public room), dev defaults to the Node host; the counter
  client uses `VITE_COUNTER_URL` when set.
- `probe/smoke.ts` (`npm run smoke`) — the built bundle served by
  `vite preview`: boots, joins a room on the host, the sim advances, a frame
  renders, the menu flow runs, no errors. What CI runs after `npm run build`
  and what the Pages deploy runs before publishing.
- `.github/workflows/deploy.yml` — Workers (match, campaign, counter) with
  wrangler, then the Pages build with the `VITE_*` variables, the smoke test,
  `wrangler pages deploy`; gated on the `CF_DEPLOY` variable and the
  Cloudflare secrets. `docs/DEPLOY.md` — the same by hand: D1, the secrets,
  the three deploys, the counter-ledger's contract deploy when the testnet
  parameters land. `.env.example`.
- `.github/workflows/verify.yml` — every stage probe, both lints, the build
  and the smoke test. `tests/settings.test.ts` (2), `probe/stage13.ts`.

**Design decisions.**
- Modes are URLs. The menu's choices reload the client with the query that
  describes the mode, the same way district travel already works, so every
  screen is a deep link a probe (or a friend) can open directly.
- The pause menu rides on pointer-lock loss, which is what ESC does in a
  browser; it stays out of the way when the FILE panel or the crawl has the
  screen.
- Settings never reach the sim: the deterministic step is shared with the
  server, so sensitivity, FOV, CRT and volumes are the only knobs.
- Deploy is a workflow, not a promise: it runs on `main` once the secrets
  are set and refuses to publish a build the smoke test did not pass.

**Acceptance (`npm run probe:ship`, 9/9; `npm run build && npm run smoke`,
3/3; `npm test`, 149 tests):** the two title cards appear in order over
black terminal chrome with the scanline pass, then the menu; the menu lists
the six entries with the file's identity line and ↓↑ move the cursor;
CAMPAIGN / THE OFFICE / THE RANGE resolve to the hub-desk, hub and yard
URLs, $CAPITAL lists the districts and a pick resolves to the public room on
the host; SETTINGS step sensitivity (1.05×) and FOV (85°), CRT 0 zeroes
grain and scanlines and 1.5 raises them, master 0.3 reaches the bus, and
the store holds all of it; a reload applies the saved settings; ESC in
play is the pause menu with RESUME / SETTINGS / FILE / QUIT TO MENU, ESC
resumes, QUIT is the menu's URL; the audio pass fires the card sting, the
UI cues and the low-health pulse under 30 health; deep links and headless
boots skip the flow; the smoke test on the production bundle joins a room,
advances the sim and shows the first title card; no page errors.

## Stage 14 — THE RUN: $CAPITAL, PvP zones, safe zones, the markets

**Goal.** The owner's direction after Stage 13: a play-to-earn and PvP
component tied to a cryptocurrency called $CAPITAL on Robinhood Chain, with
markets, PvP zones and safe zones. Two calls made here, both reversible:
$CAPITAL replaces WAKE as the one transferable token (the PvP mode "the
wake" keeps its name, which removes a collision), and play-to-earn is an
extraction loop rather than a wager — claims carried out of a PvP zone and
banked at a safe zone, behind the Depth gate and a daily cap so a script
cannot farm kills into a token.

**Files.**
- `contracts/CAPITAL.sol` (was `WAKE.sol`): the contract is named `$CAPITAL`
  (the owner's name for it; `$` is a legal Solidity identifier), token name
  `$CAPITAL`, symbol `CAPITAL`; the artifact key is `"$CAPITAL"`,
  `Names.sol`, `LedgerMarket.sol` (the interfaces), `contracts/out`
  rebuilt; `server/chain/*`, `shared/economy/*`, `client/counter.ts`,
  `client/file.ts`, the tests and probes, `docs/TOKENOMICS.md`, the README:
  the rename, field by field (`market.capital`, `counter.capital`,
  `contracts.capital`, `CAPITAL_KINDS`).
- `shared/sim/run.ts` — THE RUN as a deterministic sim module: claims (id,
  position, value, respawn timer; a drop lies where a file fell and
  expires), safe zones (circles), carrying (a pickup radius, a carry cap),
  the banking dwell (2 s standing in a safe zone), `dropCarried()` on death,
  `runView()` for the client. `shared/sim/level.ts` — `zones` and `claims`
  on a level; the yard has one gate and six claims; `shared/sim/city.ts`
  gives every district two gates at the ends of the walkway street and
  claims on the nodes and the street midpoints, worth more the farther
  from a gate. `shared/sim/world.ts` — `run` option (the wake is off in a
  run), the run stepped after the players, safe zones in `applyDamage`
  (nothing inside one takes damage, nothing inside one deals it), the death
  drop, four new sim events.
- `shared/net/protocol.ts` (v9) — `Msg.Run`: carried / banked / banking /
  the zone, today against the cap, owed, the claims and the zones.
- `server/room.ts` — `run` option, `mode()` → `run`; a bank credits the
  file: at Depth 10 the day's units against the 200 cap become $CAPITAL
  owed on `counter.run`, below it Scrip (10 a unit); the ledger line, the
  File message, the Run push on change and every half second; `stats.run`.
  Both hosts route `?mode=run`.
- `server/chain/ledger.ts` — `payout()`: what is owed goes from the treasury
  to the linked wallet (the devnet's relayer is the treasury; production
  posts a PrizeVault Merkle root); `shared/economy/endpoint.ts` — the
  `payout` op; the run's rules (`RUN_DEPTH`, `RUN_DAILY_CAP`,
  `RUN_SCRIP_PER_UNIT`, `CAPITAL_PER_UNIT`) live in `shared/sim/run.ts` so
  the match room never imports the economy module (the import-graph test
  holds); `shared/economy/counter.ts` re-exports them for the panel.
- `client/render/run.ts` — claims as amber octahedra (a drop burns magenta),
  safe zones as a cyan ring, a column of light and a label. `client/game.ts`
  — `?mode=run` offline on the same sim, the Run message online, the strip
  and the cues (a pickup, a bank). `client/hud/hud.ts` — the run strip
  (CARRYING / BANKED / TODAY / OWED, PVP ZONE or SAFE ZONE, the banking
  bar) and the cyan edge inside a safe zone. `client/menu.ts` — THE RUN
  entry (a district, then the run room). `client/file.ts` — THE RUN block
  in the counter-ledger section with WITHDRAW TO WALLET.
- `tests/run.test.ts` (4), `probe/stage14.ts`.

**Owner's namings (after the stage landed).** The city is **Neo-China**
(was Lethe) everywhere: the crawl, the title cards ("Every mind in Neo-China
is leased."), the district select, the transit signs, the docs; the default
public room is `neochina`. The token contract is named `$CAPITAL`.

**Design decisions.**
- The run pays the counter-ledger; the wake pays the file. A run has no
  rounds and no XP: banked units are the only thing it produces, and kills
  in it pay nothing — a kill only makes a drop.
- Safe zones are geometry in the shared sim, so the server and the
  predicting client agree on where damage stops; they are not a stat.
- The gate and the cap live in the room, not the client, and the payout is
  a separate, explicit chain write the player asks for.
- The token rename is a constant and a contract name; nothing on the wire
  changed for it.

**Acceptance (`npm run probe:run`, 9/9; `npm test`, 153 tests):** a run
room's Welcome says `run`, the wake is off, the client sees the gate and all
five claims and the strip reads PVP ZONE; walking over a claim carries it
(the strip, the room and the street agree); BRAVO kills ALPHA in the PvP
zone and the carried unit drops where ALPHA fell, burning magenta, with
ALPHA carrying nothing; BRAVO takes the drop, walks it into the gate (SAFE
ZONE on the strip, the cyan edge), stands the dwell and banks it — a
Depth-1 file is paid 10 Scrip, no $CAPITAL owed; ALPHA empties a magazine
at BRAVO inside the gate and BRAVO's health does not move; ALPHA links a
wallet, banks a respawned claim for 1 $CAPITAL owed (1/200 today) and
WITHDRAW moves exactly 1 $CAPITAL from the treasury to the wallet on chain;
the market is player to player — ALPHA buys RUST LEASE from the studio,
lists it for 60, a second wallet buys it, ALPHA nets 57, 1.2 burns, the
skin moves; offline `?mode=run` runs the same sim and the menu's THE RUN
entry resolves to the run room's URL; no page errors.

## Stage 15 — Hardening: prizes on chain, matchmaking, kiosks, limits

**Goal.** The production paths the tokenomics spec names but Stage 11b and
14 left on the relayer: the emission channels paid through a Merkle
PrizeVault, matchmaking for public rooms, a market kiosk in the safe zones,
a rate limit on the counter-ledger, and the three probe waits that flaked
under CPU load.

**Files.**
- `contracts/PrizeVault.sol` — one root per epoch, funded by the poster on
  post; `claim(epoch, account, amount, proof)` callable by anyone for the
  account in the leaf (the relayer sponsors it); a claimed bitmap; unclaimed
  returns to the treasury after 90 days. `server/chain/merkle.ts` — the same
  leaf (`keccak256(abi.encode(epoch, account, amount))`) and sorted-pair
  hashing, with proofs. `shared/economy/prizes.ts` — the maths: the Audit
  pays the top 10% of the board on a 1/rank curve (at least one), the
  season pays contributors by sqrt share of flips, capped at 20% of the
  pool. `shared/endgame/season.ts` — contributions per file, recorded by
  the room from Depth 15.
- `server/chain/ledger.ts` — `postEpoch()` (resolve wallets, merge leaves
  per wallet, fund the vault, set the root; files without a wallet are
  named as skipped), `prizes()` (every epoch with a leaf for the wallet,
  claimed or not, read from the chain), `claimPrize()` (relayer-submitted).
  `server/chain/prizes-store.ts` (memory) / `prizes-d1.ts` (D1
  `prize_epoch`). The Node host: `GET /prizes`, `POST /prizes/post` (the
  weekly job by hand); the counter Worker: the same job on a Monday cron,
  reading the boards from the PvP worker's Endgame DO.
- `shared/net/matchmaking.ts`, both hosts' `GET /match?district=&mode=`:
  the Node host walks its rooms for the first shard under 8 players; a
  Worker cannot enumerate rooms, so its shard is the ten-minute slot.
  `client/menu.ts` — a district pick asks the host and navigates to the
  answer, falling back to the default name.
- `client/render/run.ts` — the kiosk at each gate (a counter, an amber
  screen, a MARKET sign); `client/hud/hud.ts` — `[TAB] MARKET` inside a
  safe zone; `client/file.ts` / `client/game.ts` — Tab opens the panel on
  the market from a gate.
- The Node host and the counter Worker: 30 counter-ledger requests a minute
  per file, then 429 with the reason.
- `probe/stage8.ts`, `probe/stage11b.ts` — the dossier and outage waits are
  conditions, not fixed sleeps. `tests/prizes.test.ts` (3),
  `probe/stage15.ts`.

**Design decisions.**
- Prizes are pull-based and sponsored: the vault pays the wallet in the leaf
  whoever submits the claim, so the wallet never needs gas to be paid.
- A file without a wallet at posting time is skipped and named; its prize
  is not held. Linking before the week closes is part of the game.
- The rate limit is per file, not per IP: the thing being protected is the
  chain write a file can cause.

**Acceptance (`npm run probe:harden`, 7/7; `npm test`, 156 tests):** see the
probe's checks.

## Stage 16 — The money paths, read adversarially

**Goal.** Before spending on an external audit, read every contract and every server path that
signs for one, as an attacker would. Stage 14 tied $CAPITAL to PvP outcomes and Stage 15 put prize
money in a vault, so the cost of a bug stopped being a spoiled match and started being a mint.

**What was found.** Eight findings, written up in full in `docs/SECURITY.md`. The two that mattered
most:

- **A prize epoch could pay out of another epoch's pot.** `PrizeVault.claim` verified the Merkle
  proof but never checked the epoch's own funding, and every epoch shares one balance. A root whose
  leaves exceeded what funded it — an off-chain tree bug, a compromised poster — spent whatever else
  the vault held. Now each epoch is ring-fenced by `claimed + amount <= total`.
- **A client could outrun the sim clock.** Every input is a full `stepPlayer` at `SIM_DT`, and the
  room allowed 95 inputs a second against a 60 Hz sim. A send loop at 90 a second — legal, no strike,
  nothing for the trace comparison to flag, because the server itself does the extra stepping — moved
  and fired 50% faster than everyone else. The drain is now a token bucket denominated in ticks:
  one credit per tick, a 200 ms burst allowance so hitching clients still catch up, and a flooder's
  surplus dies in its own queue.

The rest: a zero signer would have validated every forged voucher (the classic `ecrecover` hole,
latent behind operator error); one file could be linked to two wallets on chain; supply could be
destroyed without being counted as burned, which would have made the published NET DELTA wrong; a
name priced per byte could be bought with multi-byte characters; the market updated state after
paying out; and the EIP-2612 permit the tokenomics doc promised did not exist, costing every player
a second transaction on every buy.

**Files.** `contracts/Vouchers.sol`, `CAPITAL.sol` (permit, `nonces`, `DOMAIN_SEPARATOR`),
`Ghostfile.sol` (`tokenOfFile`), `Names.sol` (ASCII), `LedgerMarket.sol` (checks-effects-interactions),
`PrizeVault.sol` (`Overclaim`); `server/room.ts` (the credit bucket, `throttled` in stats);
`docs/SECURITY.md`; `tests/security.test.ts` (9), `tests/speedhack.test.ts` (3).

**Design decisions.**
- **Every regression test was mutation-checked.** Revert the fix, re-run, watch it fail. A test that
  passes on the broken code proves nothing, and two of these did at first: the overclaim case was
  reverting on the vault's balance rather than on the guard until the numbers were chosen so the
  vault genuinely held the money, and the speed-hack case measured only the final gap, which cannot
  tell a bounded head start from a rate. It now samples the gap each second.
- **The invariant, not the symptom.** A rate cap cannot express "no client may spend more sim time
  than the sim has run" — that is a statement about totals. Hence a bucket denominated in ticks
  rather than a tighter number of inputs per second.
- **What stays trusted is written down.** Aim is client-authoritative, as in every FPS; the host
  owns the game rules; the minter role can mint without a cap. `docs/SECURITY.md` §2 lists these as
  decisions so an auditor does not spend time rediscovering them, and §3 lists what is still open —
  chiefly that the treasury and the relayer are the same key in the devnet wiring and must not be
  on mainnet.

**Acceptance (`npm test`, 168 tests):** the nine contract cases deploy the real bytecode to the
in-process EVM and drive it with viem — forged signatures, cross-epoch claims, double links, a
permit and its replay, the fee split. The three room cases race an honest client against a flooder
through the real wire protocol on a clock that advances one tick per step: pre-fix the cheat leads
by 4.4 m in three seconds and widens by 0.84 m a second; post-fix the lead is the burst allowance
and stops growing.

## Stage 17 — Does the token add up?

**Goal.** Stage 16 asked whether the money paths could be stolen from. This one asks whether they
add up at all: check `docs/TOKENOMICS.md`'s published emission schedule against the constants the
game actually pays out on.

**What was found.** They were not the same kind of quantity, and nothing in the build noticed.

The schedule promises 97,000,000 $CAPITAL in year one, decaying 25% a year, and the burn discipline
in §4.4 is stated as a ratio against it. THE RUN paid a fixed rate — `CAPITAL_PER_UNIT = 1`, one
token per unit banked, 200 units a file a day — so the year's emission was `runners × 200 × capUse ×
365`. That contains the player count. The schedule does not. At the tokenomics doc's own month-12
population it came to **15.2M a month against a budget of 8.08M — 1.9×, the year's allocation gone
in 194 days**. The same 10,000 daily players at the full cap: 7.5×, and 48 days. A million-MAU game:
90×. No choice of rate fixes that, because a rate low enough to be solvent at a million players is
not worth banking for at ten thousand.

It was the Audit and Deep Wake pools that showed the way out. They pay *fixed pools per event* —
1,000 a week, 5,000 a season, whatever the board size — so they never scaled, and together they are
0.06% of THE RUN. They were the right shape all along.

**The fix.** A day is a pot, not a price. The day's slice of the schedule is split pro rata among
the units banked that day, capped at one $CAPITAL a unit:
`rate = min(1, (schedule ÷ 365 × 0.8) ÷ unitsToday)`. Emission is `min(pot, units × ceiling)`,
which is `≤ pot` at every population, forever — the quantity that scales with the player count is
now the denominator.

**Files.** `shared/economy/model.ts` (the projection, from the real constants),
`shared/economy/settlement.ts` (the day's settlement), `shared/economy/lint.ts`
(`emission-rate-within-schedule`), `shared/sim/run.ts` (`CAPITAL_PER_UNIT` → `MAX_CAPITAL_PER_UNIT`,
a ceiling rather than a price), `server/room.ts` (banks units), `server/chain/prizes-store.ts`
(`EpochKind`, `EPOCH_BASE`), `server/chain/ledger.ts` (the `"run"` epoch, the double-pay guard),
`server/node-host.ts` and `server/counter-worker.ts` (the settle route), `client/hud/hud.ts` and
`client/file.ts` (units, not tokens); `docs/ECONOMY.md`, `docs/TOKENOMICS.md` §4.4–4.5;
`tests/model.test.ts` (16), `probe/stage17.ts`.

**Design decisions.**
- **Nothing changes for players at today's scale.** The ceiling is still 1 $CAPITAL a unit, and
  below the crossover — 212,603 units a day, about 2,126 runners or 21,000 MAU — the pot never
  binds and the settled rate *is* the old fixed rate. An economic change to a live game should be
  invisible until it is needed.
- **The ceiling is why the rule is a `min` of two things.** Pro rata alone runs backwards at small
  numbers: four hundred runners would split a whole day's budget, thousands of tokens a unit. The
  budget stops the giveaway at the top, the ceiling stops it at the bottom.
- **The room banks units and never names a price.** `shared/sim/run.ts` opens by saying nothing in
  the sim reads a wallet, and a token price is a wallet fact. The HUD reads `OWED 40 UNITS`; what a
  unit is worth is a property of the day, and the day is not over.
- **Paid through machinery that already exists.** A settlement is a PrizeVault Merkle epoch,
  `kind: "run"`, ids based at 3,000,000 so a day, a week and a season cannot collide — so the
  vault's per-epoch funding guard from Stage 16 ring-fences a day's emission on chain too. Because
  two payment paths over the same units is how double-spends happen, the direct devnet withdrawal
  now refuses a day that has been settled.
- **The probe found a bug the tests had not.** Printing a day at 250,000 files showed the whole pot
  minting to zero: `Math.floor` to whole tokens pays nothing to anyone whose day is worth less than
  one, which at that population is every player in the game. Settlement rounds to a millionth now.
  Whole tokens were a fiction of the model — the vault pays in wei.
- **A document cannot fail a build.** The schedule lived in one file, the rate in another, and the
  sentence connecting them in Markdown. `npm run lint:economy` now runs the check in CI against a
  *stress* population — a million MAU — because a constraint checked only at the numbers you hoped
  for is not a constraint.

**Acceptance (`npm test`, 185 tests; `npm run probe:economy`, 10 checks; `npm run probe:run`, 9/9):**
the model cases pin both halves — a fixed rate blows the budget at the doc's population, gets
linearly worse with success, and is THE RUN's doing alone; the settlement never mints past its pot
at 1, 10, 1,000 or 50,000 files, pays the old rate below the crossover, dilutes pro rata above it,
holds each file to the day's cap even when the room does not, and pays a sub-token day rather than
rounding it away. Six of them fail if the rate is fixed again, which was checked by doing it. The
run probe still banks, drops, kills, withdraws and trades end to end, now reading `OWED 1 UNITS`.

## Stage 18 — The settlement actually runs

**Goal.** Stage 17 shipped a settlement with no way to run it. The dev host enumerated its own
account map; the Worker made the caller hand it the day's banking. Neither is a nightly job over a
real player base, and a payout rule nothing executes is a document, not a mechanism.

**What was found on the way in.** `wrangler.counter.toml` declared a weekly cron trigger firing into
a Worker that only exported `fetch`. There was no `scheduled` handler at all — the Audit prize job
had never run, and would not have when the game launched.

**What was built.**

- **`run_day` in D1**, one row per file per day, written by the match Worker on every bank. The room
  takes an `onRunBank` callback rather than a store, because the room must not import the economy —
  it counts units and never names a price.
- **`server/chain/settle-run.ts`**, one function called by both the cron and
  `POST /prizes/post {kind:"run", day}`. A job that only ever runs unattended is a job nobody has
  watched work.
- **A `scheduled` handler** on the counter Worker, 01:00 UTC daily: THE RUN settles yesterday, the
  Audit posts on Mondays, the Deep Wake at a season boundary. Each is guarded against running a
  period twice, so a duplicated trigger costs nothing.

**Files.** `server/run-store.ts` (the interface and the memory store), `server/run-d1.ts`,
`server/chain/settle-run.ts`, `server/room.ts` (`onRunBank`), `server/worker.ts`,
`server/counter-worker.ts` (`scheduled`), `server/node-host.ts`, `server/chain/ledger.ts`
(`epoch`, the spend on payout), `server/chain/boot.ts`, `server/schema.sql` + `server/schema.ts`,
`wrangler.counter.toml`; `docs/ECONOMY.md` §4; `tests/settle.test.ts` (10),
`tests/quarantine.test.ts` (3 new), `probe/stage14.ts`.

**Design decisions.**
- **The order is the safety argument.** Refuse a settled day; settle; post the epoch; *then* spend
  the units. Clearing before posting loses a player's day if the post reverts, so clearing is
  best-effort after the commit and a file it fails on is reported as `stranded` rather than
  swallowed. A day with nothing banked is still marked settled, or the job retries an empty day for
  the rest of the game's life.
- **Two guards, not one.** A day is refused both by the store's own row and by the epoch already on
  chain, so a store restored from a backup that lost the row still cannot pay twice.
- **The probe design found a double-pay.** Writing the end-to-end check surfaced that a direct
  withdrawal did not remove the units from `run_day`, so the night would have paid for them again —
  the reverse of the order Stage 17 had guarded. `run_day` is now the single ledger of unpaid units
  and both paths spend from it. Tested in both orders; removing either guard fails a case.
- **A comment became a test.** `wrangler.counter.toml` said the counter is a separate script "so the
  PvP Durable Object bundle never carries an economy module or a chain client". Giving the match
  Worker a write on every bank is exactly the change that drags a chain client in behind it, so
  `tests/quarantine.test.ts` now walks the import graph from `server/worker.ts` and fails on viem,
  the ledger, or a `shared/economy` module — while asserting the banking store *is* reachable,
  because that is the point of the hook.

**Acceptance (`npm test`, 198 tests; `npm run probe:run`, 10/10):** the settlement cases run against
a real EVM — a day settled and claimed; the same day refused twice, and refused again from a store
that lost its row; a quiet day marked rather than retried; a file with no wallet named but its units
still counted in the split and still owed to it; only the units the settled day paid for spent, not
what a file banked afterwards; a day past its pot split pro rata; nothing spent when the post
reverts, and the day left for the next cron. The run probe banks, withdraws, banks again, settles
the day through the real host route, is refused a second settlement, and claims the epoch on chain.

## Stage 19 — The sinks, and a number that was allowed to be published

**Goal.** Stage 17 made the emission side real and Stage 18 made it run. This is the other half of
the discipline the whole token rests on — and it had the opposite problem. The burn side was being
*reported* without being built.

**What was found.** `docs/TOKENOMICS.md` §4.4 published a burn ratio of 65%. The season buyout was
**79% of the burn in that table**, and its contract had never been written. Room credits and the
Forge were the same. The headline number of the tokenomics document was a sum over things that did
not exist.

**What was built.** `SeasonBuyout.sol` and `RoomCredits.sol`, both 100% burned:

- **The Deep Wake pass** records that a wallet holds a season and nothing else. What it grants is a
  theme and two slots, defined off chain — deliberately, because a pass that minted a tradable token
  would turn the game's largest sink into a trading vehicle, and "no wagering or staking mechanics
  of any kind" is the first rule the brief states. There is no track to grind inside it and no tier
  to chase: it is bought, not played toward, and holding one changes no number the sim reads.
- **Room-hours** sell a server, not a stat: the buyer's own rules and invite list, the same weapons
  and the same sim. Credits live on chain so a host that loses its database cannot lose a player's
  hours, and the host is a named `spender` that draws them down — so a host key compromise wastes
  hours and can do nothing else.

**Files.** `contracts/Stewarded.sol`, `contracts/SeasonBuyout.sol`, `contracts/RoomCredits.sol`;
`shared/economy/sinks.ts` (the registry and the `built` flag), `shared/economy/catalog.ts` (what the
pass grants), `shared/economy/model.ts` (built vs specified), `shared/economy/counter.ts`,
`shared/progression/account.ts`; `server/chain/deploy.ts`, `server/chain/ledger.ts` (the reconcile
and the prices in `info()`); `client/counter.ts`, `client/main.ts`, `client/file.ts`;
`docs/TOKENOMICS.md` §4.4 and §7, `docs/ECONOMY.md` §5; `tests/sinks.test.ts` (13),
`probe/stage14.ts`, `probe/stage17.ts`.

**Design decisions.**
- **`built` is a claim about an artifact, not an opinion.** `shared/economy/sinks.ts` flags each
  channel, the model's `sinks.total` sums only the flagged ones, and everything else is reported
  separately as `specified`. A test asserts every `built: true` names a contract that compiles, so
  the flag cannot be set by wishing. With the buyout built the ratio is legitimately 78%; the
  unbuilt Forge would add 2.3 points and they are not folded in.
- **A purchase carries the price it agreed to.** §4.4 retunes prices quarterly, and prices are
  steward-settable so that does not need a redeploy — which means a retune could otherwise land
  between a player's `approve` and their `buy` and burn more than they meant. Both contracts take
  `expectedPrice` and revert on a mismatch.
- **One privileged surface, two calls.** `Stewarded` gives both sinks a steward that can set the
  price and hand the role on, and nothing else. An auditor can read the whole blast radius of a
  stolen steward key in twenty lines: it can make a sink cheaper or dearer. It cannot mint, move a
  player's tokens, or take a pass away.
- **The pass grants nothing tradable.** Off-chain cosmetics, so the biggest sink cannot become a
  market. The economy lint's existing `identity-is-cosmetic` and `no-paid-power` rules then do the
  rest, and a case proves it by giving a grant a stat and watching the lint reject it.
- **The player pays, not the game.** Like a market buy, both sinks are the player's own two
  transactions from their own wallet. The game never holds the money and never needs to.

**Acceptance (`npm test`, 211 tests; `npm run probe:economy`, 15 checks; `npm run probe:run`, 11/11):**
the contract cases run against a real EVM — the fee leaves the supply rather than moving to a
treasury, a season sells once and only the season asked for, a price retune mid-purchase reverts,
nobody but the steward moves the price or the role, room-hours credit and spend down, a spend by
anyone but the host reverts and so does one past the credit, and 1000 hours is the allowed edge
while 1001 is not. Each was mutation-checked. The run probe buys a pass and three room-hours from
the browser and watches `totalSupply` fall by exactly the fee.

## Stage 20 — Private rooms, and the rule that keeps the cheapest sink from being the largest mint

**Goal.** Stage 19 sold room-hours and nothing spent them. Spend them: a host route that opens a
room against a credit, an invite code that is the door, and the buyer's own rules inside.

**The rule that made this care rather than plumbing.** A room-hour costs 5 $CAPITAL. Inside a run
room a file may bank 200 units a day, worth about 86 $CAPITAL at the settled rate — and a private
room is one you control, with the claims where you want them and only your friends in it. Five in,
eighty-six out, repeatable, at roughly **seventeen to one**. Built naively, the economy's cheapest
sink would have been its largest mint.

So a private room mints nothing. THE RUN banks Scrip rather than units and nothing reaches the day's
settlement; no Audit placement is written; no flips reach the Deep Wake. Scrip and Depth still
accrue, because those are off chain and already earnable against bots in the offline sandbox —
nothing that reaches the chain does.

**Files.** `shared/net/private.ts` (the rules, the codes, `MINTLESS`), `server/room.ts` (the
`private` flag and the three refusals), `server/node-host.ts` (`POST /rooms/open`, `GET /rooms/<code>`,
the door on the WebSocket upgrade), `server/chain/ledger.ts` (`spendRoomHours`), `client/counter.ts`,
`client/main.ts`, `client/file.ts`, `client/game.ts` (the HUD line); `docs/ECONOMY.md` §5.1;
`tests/private.test.ts` (12), `probe/stage14.ts`.

**Design decisions.**
- **The room enforces it, not the host.** A host that forgot to pass `audit: null` must not be able
  to turn a paid room into a prize channel, so `Room` reads its own `private` flag and throws the
  Audit definition away. A case passes one in deliberately to prove it.
- **What a room-hour buys is a short list, on purpose.** District, mode, round length, warmup
  length, bot fill. Everything that decides a duel — weapon numbers, movement, hit registration,
  the Fairness Lint's whole surface — is not on it and never will be. A private room is a scrim,
  not a mod. A case asserts the shape of the list, so widening it is a deliberate act.
- **The credit is spent before the room exists.** The other order hands out a free room whenever
  the spend reverts, and the hours are a real burn.
- **The code is the access control, not a label on it.** The room name is derived from the code, so
  a room cannot be guessed into; the door refuses a join without it and refuses one whose hours ran
  out. The alphabet drops `0/O` and `1/I/L`, because a code that starts an argument when read aloud
  is a worse code, and 31⁸ ≈ 8.5×10¹¹ is space enough.
- **The client is told.** The Welcome's mode carries a `private:` prefix and the HUD says the room
  banks Scrip and never $CAPITAL, so nobody plays an hour before finding out.

**Acceptance (`npm test`, 223 tests; `npm run probe:run`, 12/12):** the mint cases run the same bank
and the same settlement through a private and a public room side by side — the private one owes
Scrip and reports nothing to the day, the public one owes 40 units and does; the private one is not
an Audit room even when handed one; and with a full round of flips in a real Deep Wake district the
private room writes neither board while the public one writes both. Each was mutation-checked, and
the first attempt at the board case was vacuous — it passed with the guard removed, because the
yard is not a Deep Wake district and the flips were being dropped before they reached it.

## Stage 21 — The frame budget, and what the renderer left behind

**Goal.** The project calls itself a AAA-quality browser FPS. Draw calls and triangles have been
budgeted since Stage 9; per-frame allocation and GPU resource lifetime never had been, and those are
what make a browser game hitch rather than merely render. Measure them.

**What the sim measured at.** Healthy, and worth writing down: a full 12-player room costs **429 µs
a tick** (2.6% of a core at 60 Hz), the client's own prediction **46 µs**, and **51 bytes** of
retained heap a tick. The first version of that measurement said 5.3 KB a tick and looked like a
serious leak — the harness had never called `drainEvents()`, which the room and the client both do
every tick, so it was measuring its own event backlog. A harness that does not do what the caller
does is measuring itself.

**What was found in the renderer.** Removing an `Object3D` from a scene does not free its GPU
buffers; three.js releases them only on `dispose()`, and nothing in the scene graph reminds you. So
the natural way to write it — `scene.remove(x); map.delete(id)` — leaks every time, and the
renderer did it in **eight** places: impact sparks, wake flip rings, projectiles, wasp drones,
mechs, gas clouds, run claims, and remote players. The worst two: a 600 RPM rifle hitting geometry
leaked ten buffers a second per shooter, and every player who ever joined left a 256×56 name-tag
texture behind when they left.

None of it was visible as a bug. A leaked buffer renders nothing and throws nothing; it accumulates
until the tab is slow, which gets blamed on browsers.

**Files.** `client/render/dispose.ts` (`release`, `markShared`), `client/render/vfx.ts` (the pools),
`client/render/renderer.ts`, `weapons.ts`, `wake.ts`, `run.ts`, `hub.ts`, `client/main.ts` (the
resource counters on the state hook); `docs/RENDER.md`; `probe/stage21.ts`.

**Design decisions.**
- **One helper, so there is one place to be right.** `release(obj)` walks the subtree and disposes
  what it owns. Eight sites call it. Shared resources — one octahedron for every claim, one
  material per projectile kind — are marked once where they are created, so the knowledge lives
  with the thing that is shared rather than with each of its users.
- **Tracers and sparks became pools, not corrected allocations.** Disposing properly would have
  fixed the leak and left the churn: a fresh geometry and material per shot, ten times a second per
  shooter. Now every tracer is two vertices in one `LineSegments` and every spark one instance of an
  `InstancedMesh` — one draw call each for all of them, six floats written per shot, and no leak
  possible because there is nothing to forget to dispose. Ring buffers of 64: the oldest effect is
  overwritten, which is the right failure for a visual effect and the wrong one for anything else.
- **The probe measures a rate, because the defect was a rate.** This took three attempts, and the
  trap was in the metric. `info.memory.geometries` counts what the renderer has *initialised*, so it
  rises whenever anything enters the frustum — warm-up, a camera turn, a pedestrian. Three versions
  asserted it was flat and each was wrong for a different reason. But the leak was **per shot**: N
  world hits left N geometries. So the probe measures growth per shot against an idle control in a
  static level, which is robust to a city that never stops moving. Pre-fix ≈ 1.0 per shot; now
  < 0.1.
- **The budget is on shape, not absolute time.** SwiftShader cannot tell you anything about a real
  GPU, so the frame check is that the worst frame in a window is within 4× the median — a GC pause
  is a spike whatever the renderer. Absolute frame time on real hardware is the honest gap, and
  `docs/RENDER.md` §5 says so.
- **That check found a second thing.** With the leak fixed it still failed under fire at 5.5×: one
  567 ms frame, on the first shot. The pools are hidden when empty, so their materials had never
  been rendered and the first shot compiled two shader programs mid-frame — a stutter at exactly
  the moment a duel starts. Compiling at startup took the worst frame under fire to 123 ms, 1.2×,
  the same as idle.

**Acceptance (`npm run probe:frame` 6/6; `npm run probe:look` 15/15; `npm run probe:city` 32/32;
`npm test` 223):** sixty-nine shots of sustained fire create **0.029 geometries per shot** where the
leak was about 1.0, and no textures at all; the effects add **zero** draw calls while in flight
where each used to cost one; and the worst frame is within 1.3× the median idle and 1.2× under
fire. The city's own draw-call budget is back inside its Stage 9 limits, because the pools are
hidden when empty rather than costing two calls in every idle frame.

## Stage 22 — Where the draw calls actually go (and a premise that was wrong)

**Goal.** Stage 21's write-up named instancing the crowd and the dressing as "the next real win",
on the strength of one `lease_row` reading of 182 calls against a 180 budget. Do it.

**What the measurement said instead.** Both halves of the premise were wrong.

- **The budget was not blown.** The 182 was Stage 21's own effect pools costing two draw calls in
  every idle frame, and hiding them when empty had already fixed it. `probe:city` passes 32/32.
- **Instancing is not the win.** The crowd is already four `InstancedMesh`es and the dressing is
  already batched into ~30 calls by `MeshBatch` and `NeonBatch`. There was nothing there to take.

**What it did find.** A new `renderBreakdown()` counts visible renderables per scene group, and the
gap between that and `info.render.calls` is the whole story: **about 94 visible objects produce
about 210 draw calls.** The wet floor is a `Reflector` — it renders the scene a second time from a
mirrored camera, so everything it can see costs two calls. The mirror is the largest single line in
the budget, larger than the dressing, the crowd and the skyline together.

The control for it already existed and nobody had written down what it was worth: `FAR_LAYER`. The
mirror camera sees only layer 0; the rain, skyline, sky and traffic are already on the far layer and
draw once. What stays reflected is what reads as *light*, because the reflection is smeared over
eleven vertical taps under a puddle mask — shape does not survive it, brightness does.

**Files.** `client/render/renderer.ts` (`breakdown()`, group names), `client/main.ts`
(`renderBreakdown` on the state hook), `client/render/city.ts` (the dressing group's name),
`client/render/wetfloor.ts` (what the mirror costs, and the layer that controls it);
`probe/stage9.ts` (the budget line now names its own composition); `docs/RENDER.md` §5.

**Design decisions.**
- **The diagnostic ships, the optimisation does not.** There was no optimisation to make. What was
  missing was the ability to answer "where did the calls go", so that is what got built: every
  budget line in `probe:city` now lists its visible objects by group, and a future failure explains
  itself instead of starting another investigation like this one.
- **`traverse` was the wrong tool, and it cost a wrong answer.** `Object3D.traverse` walks into
  hidden subtrees; the renderer does not. The first breakdown reported 51 objects under the camera —
  all eight stowed weapons' viewmodels, none of them drawn. `breakdown()` prunes at the first
  invisible ancestor.
- **A budget number belongs to a camera.** 210 calls from a free vantage is not a failure of a
  180-call budget measured from the probe's fixed one. Both numbers are now in `docs/RENDER.md` with
  that said plainly, because the next person to see 210 will otherwise open the same investigation.
- **The wrong claim was corrected where it was made.** `docs/RENDER.md` now says instancing is not
  the next win and why, rather than leaving a plausible-sounding sentence in a document for someone
  to act on.

**Acceptance (`npm run probe:city` 32/32; `npm run probe:frame` 6/6; `npm run probe:look` 15/15;
`npm test` 223):** every district is inside its draw-call and triangle budget, and each check now
reports the group composition behind its number.

## Stage 23 — The hot key is not the bank

**Goal.** `docs/SECURITY.md` §3 has had the same item at the top of it since Stage 16: the relayer
key signs on every sponsored transaction and lives in a Worker secret, and it also held the whole
$CAPITAL supply. A leak of a hot key was a leak of the treasury. Close it.

**What changed.** The treasury is its own address. The relayer holds no $CAPITAL at all — every
payment it makes (the launch grant, THE RUN's direct payout, funding a prize epoch) is a
`transferFrom` against a standing allowance, so it never takes custody and **the allowance is the
hard cap on a compromise**. The allowance is sized at a week of the emission schedule, which is the
sizing the security doc had already asked for.

The devnet is wired the same way rather than as a convenience shortcut. A production shape the
tests never exercise is a production shape nobody has run, so `DEV_KEYS.treasury` is a real separate
key and the whole suite now runs against the split.

**Files.** `server/chain/ledger.ts` (`treasuryAddress`, `relayerAllowance`, `payFromTreasury`, the
epoch draw), `server/chain/boot.ts` (the treasury key and its allowance), `server/chain/deploy.ts`
(deploy → configure → hand over); `docs/SECURITY.md` §3.1; `tests/security.test.ts` (4 new),
`tests/sinks.test.ts`.

**Design decisions.**
- **The property is a number, not a promise.** "The relayer is less trusted now" is not checkable.
  "A compromised relayer can move at most `allowance(treasury, relayer)`" is, and a case asks for
  the whole supply, for the allowance plus one, and for the allowance twice, and gets exactly the
  allowance once.
- **No custody, except where the contract forces it.** The grant and the payout pay the player
  directly out of the treasury. Only the prize epoch passes through the relayer, because
  `PrizeVault.post` pulls from `msg.sender` — one transaction, still bounded by the same allowance,
  and if the draw fails the epoch is refused whole rather than half-posted.
- **Roles follow deploy → configure → hand over.** The sinks are deployed with the deployer as
  steward so it can set the room-credit spender, then the steward goes to the treasury. That is the
  order a timelocked multisig forces on a real network, so it is the order the devnet uses.
- **The split made an existing test sharper.** With the seller, the creator and the treasury as one
  address, the market fee test could not tell the treasury's 2% from the seller's share; it asserted
  98% and would have passed on a contract that paid the treasury nothing. It now asserts each share
  separately.

**Acceptance (`npm test`, 227 tests):** the relayer's $CAPITAL balance is zero and the treasury's is
the whole supply; a compromised relayer is refused the supply, refused the allowance plus one,
allowed the allowance once, and refused again after; the ordinary payouts work and visibly draw the
allowance down while the relayer's balance stays at zero; and an oversized epoch is refused with a
reason naming the allowance, leaving the epoch id free for a correctly sized one. Reverting the
split fails six cases, which was checked by doing it.

## Stage 24 — Money the system knew about and nobody would collect

**Goal.** Three items on `docs/ECONOMY.md`'s open list were the same kind of thing: value the
system had recorded and had no path to hand over. Close them.

**The drift.** A file's `counter.run.owed` and its `run_day` row are written by different paths and
neither write can be made atomic with the other. Stage 18 logged both failures loudly and healed
neither. They fail in opposite directions:

- **Unrecorded** — the D1 write lost, so the file is owed units the banking table has never heard
  of. Nothing will pay them: the settlement reads the table, not the file. The player has the
  receipt in their own ledger and no money is coming.
- **Stranded** — the settlement posted the epoch and could not clear the file. The units are still
  owed *and* unpayable in both directions: the day is settled so the night will not pay them again,
  and the direct withdrawal refuses a settled day. The money is sitting in a claimable epoch while
  the file insists it is still waiting.

**The sweep.** `PrizeVault.reclaim` has existed since Stage 15 and nothing ever called it.

**Files.** `server/chain/reconcile-run.ts`, `server/chain/ledger.ts` (`reclaimEpoch`, `epochs`),
`server/chain/wallets.ts` and `wallets-d1.ts` (`accounts()`), `server/counter-worker.ts` (both jobs
on the nightly cron), `server/node-host.ts` (`{kind:"reconcile"}`, `{kind:"reclaim"}`),
`client/file.ts` (the panel said prizes were weekly; the run settles nightly);
`docs/ECONOMY.md` §5.2; `tests/settle.test.ts` (6 new).

**Design decisions.**
- **It walks the wallet index, not the banking table.** A file missing from the table is precisely
  the drift worth finding, so the table cannot be the list of files to check. Only a linked file can
  be owed $CAPITAL, so the wallet index is the complete set.
- **It is a separate job from the settlement, and runs before it.** A repair that runs inside the
  thing being repaired cannot be trusted to notice when that thing is what broke.
- **Report by default, repair on request.** The pass returns the same report either way and only
  writes under `fix`, so an operator can look before touching anything — and a test can assert that
  looking changes nothing.
- **The reclaim deadline lives in the contract, not the caller.** The cron walks the posted epochs
  and asks; asking early simply fails. The job does not have to be right about the date, which is
  the property that lets it run every night without a calendar.

**Acceptance (`npm test`, 233 tests):** an unrecorded day is found, reported without being changed,
then repaired — and the night pays the restored units; a stranded file is proved unpayable in both
directions first, then freed, and its epoch still pays; a day that agrees with itself reports
nothing; a linked file with no banking is walked and not reported; an epoch cannot be swept before
the vault's deadline and is still claimable after the attempt; and a never-posted epoch is refused.
Both guards were mutation-checked.

## Stage 25 — Can the campaign actually be finished?

**Goal.** Every other claim in this project now has an artifact behind it — the emission schedule,
the burn ratio, the draw-call budget, the treasury's blast radius. One did not: *the campaign
branches, and there are four endings.* Nothing verified it.

**Why it was worth checking.** The story graph is strings. Missions, gigs, variants and endings are
gated on testimony — `key = value` pairs written by dialogue choices in one file and read as gates
in three others. A single typo (`m4:vessel` against `m4:vessell`) closes a gate that nothing will
ever open, and the game still builds, still typechecks, still plays. The ending is simply
unreachable, and nobody finds out until a player doesn't find it.

**What it found.** The graph is sound: **zero errors**. Every ending is opened by testimony a choice
actually writes, every script node is reachable from its own start, every `requires.after` names a
real mission, the arc runs 1–7 with no gaps, and every dialogue objective names a script that
exists.

It did find three **notes**: `m1:lease`, `m5:lattice` and `m6:broadcast` are choices the player makes
that nothing reads. Three of the seven missions ask for a decision with no mechanical consequence.
That may well be characterisation — and in a narrative game it often should be — so it is reported
and not enforced.

**Files.** `shared/campaign/lint.ts`, `shared/campaign/cli.ts` (`npm run lint:campaign`, in
`verify`); `tests/campaign.test.ts` (6 new).

**Design decisions.**
- **Two severities, because one would do harm.** An unreachable ending is a broken game; a choice
  that changes nothing may be deliberate. Failing the build on both would push the next person to
  delete good writing to make a lint go quiet. Errors fail; notes print, with a line saying why they
  are only printed.
- **The lint is named after the mistake it catches, and a test proves it catches it.** Introducing
  the exact typo — `m4:vessell` in the Estate ending's gate — turns 0 errors into 2 and fails four
  cases. A reachability lint that has never seen an unreachable thing is a guess.
- **It reads the code's own back doors rather than pretending they do not exist.** Three testimony
  keys are read in TypeScript rather than through a gate (the two handler-survival rules, and the
  faction the hub lifts onto the save). They are listed explicitly, so the "nobody reads this" rule
  stays true instead of being loosened until it is useless.

**Acceptance (`npm run lint:campaign`, 0 errors / 3 notes; `npm test`, 239 tests):** 7 missions, 12
gigs, 10 scripts, 4 endings and 9 testimony keys, with every ending's gate traced back to a choice
that writes it, every script node reachable, and the arc contiguous.

## Stage 26 — The file id was a bearer credential, and the game published it

**Goal.** Stage 16 read the money paths adversarially and Stage 25 read the story graph. This is the
one nobody had read: the identity path.

**What was found.** A Ghostfile is named by an id the client claims, and nothing proved the claim.
`join` took the id off the wire and loaded that file; every `POST /file/<id>/…` route took it out of
a URL. The id was not secret either — `GET /prizes` named **every winning file with the amount it
won**, and `/stats` named every file in every live room.

So the attack was two requests: read the richest file off the prize board, then
`POST /file/<id>/rewrite`. A Rewrite resets a Depth-50 file to Depth 1, zeroes its Scrip and
salvage, and strips its Ledger Graph. Sixty hours of progression, destroyed by anyone who read a
leaderboard. The cheaper variants were nearly as bad: spend the victim's Scrip, refund their nodes,
burn their Wakelight, spend their $CAPITAL on a name, or eat the day's run cap so they could not
earn.

Nothing about it was exotic. It is the oldest mistake there is — an identifier used as a
credential, and then printed.

**Files.** `shared/progression/account.ts` (`newFileSecret`, `fileAuth`, `publicLabel`, the
`secret` field), `server/room.ts` (the join gate), `server/player-do.ts` and `server/node-host.ts`
(403 on every mutating route; the prize board labels rather than names), `shared/net/protocol.ts`
(the join carries a secret, tolerantly), `client/file.ts`, `client/counter.ts`,
`client/net/netclient.ts`, `client/game.ts`; `docs/SECURITY.md` §1.9;
`tests/fileauth.test.ts` (10).

**Design decisions.** Each of these is a trade, so each is stated rather than assumed:
- **A wrong secret is not a kick — it plays a guest.** The id is published, so a mismatch is at
  least as likely to be someone typing a friend's id as an attack. Kicking would turn a published
  id into a way to deny someone a game as well as a way to wreck their file.
- **Trust on first use.** A file made before secrets existed has none, and the first caller to
  present one adopts it. The alternative locks every existing player out of their own progression to
  defend against an attacker who would have had to arrive first.
- **Boards get a label, not an id.** `publicLabel` gives a stable, non-reversible `FILE-XXXXXXX`:
  enough to recognise your own row, useless for anything else. A prize board has to name its
  winners; it does not have to hand out credentials.
- **The read path is named, not fixed.** `GET /file/<id>` is still unauthenticated, so an id still
  discloses progression, the linked wallet and the ledger. That is disclosure rather than
  destruction, and gating it means threading the secret through every read in the client and every
  probe for a much smaller gain. `docs/SECURITY.md` §1.9 says so plainly rather than leaving it
  implied by the fix.

**Acceptance (`npm test`, 249 tests; `probe:run` 12/12; smoke 3/3):** the Rewrite payload still
works once past the door, which is the point — the damage is real. A join with the wrong secret,
and one with no secret, both play a guest and leave the file at Depth 50 with its own secret
intact, and neither is kicked. The owner's join still gets the owner's file. The secret survives a
stored-row round trip, adoption happens exactly once, and an anonymous file stays playable.
Removing the join check fails two cases.

## Stage 27 — A contract is closed by the room that ran it, not by asking

**Goal.** Stage 26 found a HIGH by reading a path nobody had read. Keep reading. The next unread
one was the campaign endpoint — the thing that writes what a player has done.

**What was found.** `campaignRequest` accepted `op: "complete"` from any client and closed the
contract. It checked the arc's own gates — threat, testimony, what comes after what — but never
that the mission had been played. Asking was enough.

A contract is not a story beat with no weight behind it. It pays Scrip, it pays XP — which is
Depth, which is the Ledger Graph — and two of them hand over the campaign weapons. All three follow
the player out of the campaign and into the wake, **where the Audit board pays $CAPITAL to the top
10%**. So the arc was a handful of POSTs from Depth 50 with both weapons, having played nothing,
and the prize for that was a better placement on a board that pays.

**Fixed.** The op is refused by default, and the refusal names who does close a contract: the room
that ran it. That path already existed and is the one real players take —
`server/campaign-room.ts` calls `completeContract` itself when the mission's objectives report
`complete`, for every player in the room. It is untouched, so gating the endpoint cannot break
anyone who is actually playing.

**Files.** `shared/campaign/endpoint.ts` (`CampaignOptions.trustCompletion`),
`server/node-host.ts` (the dev host passes it); `probe/stage10.ts` (holds a file secret);
`docs/SECURITY.md` §1.10 and §2; `tests/fileauth.test.ts` (5 new).

**Design decisions.**
- **The trust is a flag at the call site, not a comment.** The dev host needs to reach a late arc
  state without playing seven missions — the same affordance as its `/chain/faucet`. Making that a
  parameter means it is impossible to read the production path and not see that it does not have
  it. `docs/SECURITY.md` §2 now lists the Node host's dev affordances as a trusted thing, which
  they always were and were never written down.
- **The refusal explains the design.** "A contract is closed by the room that ran it, not by
  asking" tells the next reader where the real path is, rather than leaving them to find out that
  removing the guard breaks nothing they can see.
- **The room's path is asserted by a test, not assumed.** A case calls `completeContract` directly
  and shows it still closes the contract and still pays — because "the real path is unaffected" is
  the load-bearing claim of the whole fix.
- **Stage 26 had already broken the campaign probe, and only running it said so.** The probe drove
  the arc with bare `fetch` POSTs and page URLs that named a file but proved nothing, so the join
  gate turned it into a guest and three checks went red — a real consequence of the previous stage
  that its own tests could not see, because the tests call the functions and the probe drives the
  product. It now fixes one secret, sends it with every POST, and hands it to all eight pages as
  `?secret=`, which is exactly what a real client does with the one it generated. `npm run
  probe:campaign` is back to 20/20.

**Acceptance (`npm test`, 254 tests):** the whole arc — m1, m2, m3, and the white office — is
refused through the endpoint with nothing paid out for the asking; the hub's own ops still work and
wearing an unowned protocol still grants nothing; the dev flag is the only way through and is off
unless asked for; and the room's direct path still closes a contract and still pays. Removing the
guard fails three cases.

## Stage 28 — The credential was published by the thing it protected

**Goal.** Stage 27 ended by noting that Stage 26's join gate had broken the campaign probe, and that
only running it said so. That is a statement about *tests that cannot see routes*. Follow it.

**What was found.** Three things, one cause.

1. **`GET /file/<id>` returned the secret.** Stage 26 gave a file a secret so its id would be a name
   rather than a bearer credential, and stored it in the file. Every read path answers with the
   whole file, and that read is unauthenticated by design because a board has to be readable. So
   the credential was published by the thing it protected, and every gate Stage 26 built was one
   `curl` away from open. Verified against the running host, not reasoned about.

2. **Neither Worker checked the secret at all.** Stage 26 gated what it had in hand — the dev host
   and the PlayerFile Durable Object. The two Cloudflare Workers *are* production, and they loaded
   a file, applied a change and saved it without ever looking. That covered the campaign save, the
   permanent wallet link, and `POST /file/<id>/counter` — the money route, which banks the run and
   asks for signed vouchers.

3. **`POST /prizes/post` had no lock on it.** It runs the same settlement the cron runs, for a day
   the *caller* chooses, and a settled day is refused a second time by design. An anonymous POST
   naming today would mark today settled before anyone had finished banking, and every unit banked
   afterwards would be stranded for good.

**Fixed.** For (1), one rule instead of a checklist: the secret travels in on a request and never
travels out on a response — a client cannot need it back, because the only client that holds it is
the one that generated it. `publicFile()` is the single place that strips it. The Durable Object
grew a `/public` route beside its internal `/file` so a caller has to say which shape it wants; one
route serving both is how this happened. For (2), all four Worker routes now check. For (3), an
`x-admin-key` against an `ADMIN_KEY` secret, closed rather than open when no key is configured.

**Files.** `shared/progression/account.ts` (`publicFile`), `server/player-do.ts` (`/public`),
`server/worker.ts`, `server/campaign-worker.ts`, `server/counter-worker.ts`, `server/node-host.ts`,
`client/counter.ts`; `probe/stage11b.ts`; `tests/routes.test.ts` (new, 10),
`tests/counter.test.ts`; `docs/SECURITY.md` §1.11, §1.12, §2.

**Design decisions.**
- **A rule, not a list of call sites.** "Redact at these nine places" is a thing that decays on the
  tenth. "It goes in and never comes out" is checkable by reading one function and grepping for its
  name, and it is why the fix needed no client change at all: nothing was reading the secret back.
- **Two routes on the DO rather than one with a flag.** `/file` is the internal shape the room and
  the Workers need; `/public` is the shape that leaves the edge. A caller has to say which. The
  flag version would have the same bug waiting behind a default.
- **The dev host keeps its unlocked `/prizes/post`.** The probes drive it, it is not the production
  path, and `docs/SECURITY.md` §2 now lists the Node host's dev affordances as a trusted set rather
  than leaving each one to be discovered.

**What this says about the tests.** `tests/fileauth.test.ts` proved Stage 26's gates by calling
`fileAuth` and the DO's helpers, and it passed — with an ungated production route sitting beside it.
A test that calls the function cannot see a route that never calls the function.
`tests/routes.test.ts` goes in through `fetch`, against the real Worker handlers and the real
Durable Object, with only storage and D1 doubled. Removing any one of the five guards fails exactly
one case.

**And the probes nobody had re-run.** Stage 26 had quietly broken four of them, and one had been
red since long before that. Every one was found by running them, not by reading anything.

`npm run probe:endgame` 8/13 → **13/13**, `npm run probe:run` 11/12 → **12/12**,
`npm run probe:counter` 9/11 → **11/11**, `npm run probe:harden` 5/7 → **7/7**. Each drove a file
with bare POSTs and page URLs that named a file but proved nothing, so the join gate and the POST
gate turned them into guests. They now fix a secret and hand it to every request and every page, as
a real client does.

`probe:counter` also carried two failures of its own:

- `stamps on chain 0`: Stage 26 fallout, the same shape as the campaign probe's. The probe's POSTs
  carried no secret, so the stamp voucher was refused.
- `contracts === 7`: a bare count, wrong since **Stage 19** added the two sinks. Four stages of a
  red check nobody saw. It now names all nine, so the next contract either lands in that list on
  purpose or turns the check red.

Fixing the first surfaced a third: **"a Depth-1 file gets no name voucher" was passing on the wrong
refusal** — the file had no wallet, so the refusal never reached the Depth line, in the probe *and*
in `tests/counter.test.ts`, which asserted `/no wallet/` under a Depth-gate name. The Depth gate had
never been tested. It is now, against a linked file dropped below it; deleting the gate fails that
case.

`probe:harden` had two more. One was Stage 26's: the prize board publishes `publicLabel(id)` now
rather than the raw id, and the epoch-leaf assertion still compared against the id. The other was
**older than Stage 26 and had never once passed** — "the Deep Wake epoch pays the round's
contributor" reported `ALPHA flips 0` from Stage 15 onward. It was not a bug in the payout: the
probe gave ALPHA a 25-second round to walk across Lease Row to node B and hold it through a flip
(4 s for one Blank on a neutral node at `WAKE.baseFlipSeconds`), and 25 seconds was not enough. At
60 the epoch pays: `season lines sandbox-hard:1000`. The Deep Wake prize channel is now verified
end to end for the first time — a payout path that has existed since Stage 15 and was never once
seen to run.

**Acceptance:** `npm test` 264 (10 new); `npm run typecheck` clean over both configs;
`probe:endgame` 13/13, `probe:run` 12/12, `probe:counter` 11/11, `probe:harden` 7/7 — the last of
those better than it has ever been, since its Deep Wake check had never passed. The secret's absence
is verified against the running host, and each of the six guards is mutation-tested.

**Left open.** `probe:harden` prints `ALPHA flips 0` on a round the server credited a flip for, so
the *client's* `state().stats.flips` does not reflect what the room counted in a networked match.
The money is unaffected — the epoch is built from the room's own tally, which is what the check now
asserts on.

*(Corrected in Stage 29: this note said "the HUD is showing the player a zero for something they
did." It is not. Nothing in the client reads that counter — the one HUD reader of `stats` reads
`kills`, which the wire does reconcile — so the client's copy is internal state that only the probe
had ever looked at. The real problem was next door and worse: the game never showed the player that
number **anywhere**.)*

## Stage 29 — The client never sent the credential, and the receipt did not add up

**Goal.** Stage 28's own closing note claimed a HUD bug. Check it before anyone acts on it.

**What was found.** The note was wrong; checking it turned over three things that were not.

### The client never sent the credential — CRITICAL, and mine

Stage 26 gave every file a secret and gated the host's mutating routes. It gated them **from the
server side only**, and never checked the other end of the wire. Three of the client's own POSTs
did not carry the secret. From the moment a file adopts one — which is a player's first match, over
the WebSocket join — the host refused them:

| route | what it is | since |
|---|---|---|
| `/file/<id>/buy`, `/refund` | **every Ledger Graph purchase** — the whole progression spend | Stage 26 |
| `/file/<id>/ghost` | range ghosts, a Stage 8 feature, dead in production | Stage 26 |
| `/rooms/open` | not under `/file/`, so the sweep never reached it: **an id alone could burn another file's on-chain room-hours** | Stage 20 |

Reproduced against the running host, not reasoned about:

```
$ curl -X POST .../file/<id>/campaign -d '{"secret":"...","op":"state"}'   # the first match
$ curl -X POST .../file/<id>/buy      -d '{"node":"slipfile"}'             # what the client sent
{"ok":false,"reason":"NOT YOUR FILE: this file has a secret and the request did not carry it"}
```

I shipped that in Stage 26 and it survived Stages 27 and 28, both of which were *about* this
credential. Nothing saw it: the unit tests call `buyNode` directly rather than through a fetch, and
the probes that buy nodes never join a room first, so their files stay anonymous and the gate never
closes. `probe:identity` did fail — as a console error reading only `403 (Forbidden)`, with no route
on it, which is why three stages of looking straight at it missed it.

**Fixed.** All three POSTs carry the secret; `/rooms/open` checks it, and checks it *before* the
wallet lookup, because whether a file has a wallet linked is the file's own business and answering
that to a bare id is answering it to anyone.

**`tests/clientauth.test.ts` reads the client's source.** The defect was a missing field in an
object literal, and the cheapest true statement about a missing field is that it is missing. The
lint finds every `fetch(..., method: "POST")` in `client/`, and fails if one targets a route that
calls `fileAuth` without a `secret` in its body. Removing the secret from any of the three fails it.
A case also asserts the scan finds POSTs at all, so an empty pass is not a pass.

### The receipt did not add up

The receipt printed three lines:

```
MATCH 0001 · WOKE
OBJECTIVE 1145 · COMBAT 821 · SUPPORT 120
XP +2836 · SCRIP +340 · SALVAGE +7
```

1145 + 821 + 120 is 2086. The other **750 XP is `XP_UNITS.participation` and the win bonus**, both
real terms of `matchXp`, named nowhere. A player who read their own receipt watched several hundred
XP arrive from nothing. A receipt whose arithmetic does not close is not a receipt.

And it never said what the player *did*. `XP_WEIGHTS.flips` is 0.4 — objective play is the heaviest
single weight in Depth, which is the Ledger Graph, which is everything the file spends. The counts
behind it were computed at settlement, turned into XP and dropped. **The game scored you mostly on
a number it never showed you, anywhere.** Not in the HUD, not on the receipt, not in the file.

**Fixed.** Every line is a term, each pairs what you did with what it paid, and they sum:

```
MATCH 0001 · WOKE
3 FLIPS · 84 NODE SECONDS → OBJECTIVE 1145
5 CLOSED · 2 ASSISTS → COMBAT 821
10 SUPPORT → SUPPORT 120
PARTICIPATION 250 · WOKE THE DISTRICT 500
XP +2836 · SCRIP +340 · SALVAGE +7
DEPTH 1 → 2
```

### And the note itself was wrong

It said the client shows a zero for a flip the room credited. It does not: the only HUD reader of
`stats` reads `kills`, which `LocalAuth` reconciles. The client's `flips` is internal state that
nothing but a probe had ever read — the probe read it, got a zero, and a stage's write-up carried a
wrong diagnosis for it. Corrected in place, in the Stage 28 entry.

**Files.** `client/file.ts`, `client/counter.ts`, `server/node-host.ts` (the credential);
`shared/progression/account.ts` (`applyMatch`), `client/game.ts`, `shared/sim/player.ts`
(`PlayerStats`); `probe/stage8.ts`; `tests/clientauth.test.ts` (new, 4), `tests/receipt.test.ts`
(new, 11); `docs/STAGES.md` (the Stage 28 correction).

**Design decisions.**
- **The test parses the printed text.** Asking `matchXp` what it computed cannot see a receipt that
  fails to print it, and failing to print it *was* the defect — the same lesson as Stage 28's
  routes. So the cases read the lines back with a regex and check the parsed terms sum to the parsed
  total. Restoring the original bug fails six of them.
- **A bucket that paid nothing still prints its zero.** `0 FLIPS · 0 NODE SECONDS → OBJECTIVE 0` is
  noise right up until the player wonders why a match paid so little, and then it is the answer.
- **The win bonus is only a term when it was won**, so the sum closes in both cases rather than
  printing a zero for something that was never on offer.
- **The alert stopped reading by index.** `client/game.ts` showed `f.ledger[2]` — the totals line by
  position. The receipt grew three lines, and an index would have gone on working while showing the
  wrong one. It finds the line by its `XP +` prefix now.
- **`trophiesFromLedger` matches by prefix**, and the receipt now contributes three more lines to a
  ledger it reads. A case asserts only the `MATCH` line is still a trophy, so the Deadletter Office
  does not fill up with XP arithmetic.

**The trap, marked.** `PlayerStats` has thirteen counters and `LocalAuth` reconciles four. The other
nine are right only on whoever runs the authoritative sim — the server, in a room — and nothing in
the type said so, which is how Stage 28 read one and believed it. `PlayerStats` now marks the four,
and a case pins the set: adding a counter fails it, so the next person decides whether the client
may believe it rather than finding out later. Letting the client believe `flips` fails that case.

**A probe that says only "403".** `probe/stage8.ts` reported the refusal as
`Failed to load resource: 403 (Forbidden)` — the console message, which carries no URL. It now
listens on `response` and records `403 POST /file/sandbox-alpha/ghost`, which named the bug in one
run after three stages of not naming it. Cheap, and the reason this stage found anything at all.

**Acceptance:** `npm test` 279 (15 new); `npm run typecheck` clean over both configs;
`probe:identity` 17/17. Every guard is mutation-tested — the receipt invariants including
reinstating the original arithmetic gap, and each of the three client POSTs including reinstating
the shipped one.

## Stage 30 — The gate had been red for thirty-nine runs, and it skipped what it did not reach

**Goal.** Stages 26–29 each found that the previous stage's fix was incomplete somewhere its own
tests could not see, and each was found by *running* something rather than reading it. That is a
statement about a missing habit, and this project has a script for exactly that habit. Find out why
it never fired.

**What was found.** It fires on every push. It has failed **every one of its thirty-nine runs**.

```
run #39  Stage 29   failure   2m42s
run #38  Stage 28   failure
run #37  Stage 27   failure
…  all the way back
```

Two minutes forty-two is not long enough to run twenty-four checks, and it did not: the job dies at
step 10, `npm run probe:net`, and GitHub Actions **skips every remaining step** when one fails. So
steps 11–29 — eighteen probes, `npm run build` and `npm run smoke` — have never run on any commit
of this branch.

That is the whole explanation for the last four stages. `probe:endgame` at 8/13, `probe:counter` at
9/11, `probe:harden` at 5/7, `probe:identity` at 14/17, a contract count wrong since Stage 19, a
Deep Wake check that had never passed since Stage 15 — every one of those was sitting in a step CI
skipped, on a red run nobody opened because it had been red since before any of them.

I have also been reporting green per stage on the strength of the probes I ran by hand. Those runs
were real, and the subset was mine, not the project's.

**Fixed.**

- **One red step no longer decides what gets measured.** Every check step carries
  `if: ${{ !cancelled() }}`, so the run does all of it and fails at the end knowing everything. A
  failed step still fails the job; it just no longer hides the eighteen behind it.
- **The timeout was 15 minutes** for a run that cannot finish in 15 minutes even when green — the
  other half of why nobody looked. Now 90.
- **The workflow had drifted from `npm run verify`.** `lint:campaign` (Stage 25), `probe:economy`
  (Stage 17) and `probe:frame` (Stage 21) were each added to the script and never to the workflow,
  so three stages shipped a check that ran only when someone remembered it. All three are in now.
- **`tests/verify.test.ts` compares the two lists on every test run**, and asserts that no step is
  unguarded and that the timeout is realistic. The drift is invisible by construction — both files
  look complete on their own, and you only see the gap by putting them side by side, which nobody
  does. Now something does it every time. Dropping a check, removing a guard or restoring the
  15-minute timeout each fail a case.

**Files.** `.github/workflows/verify.yml`; `tests/verify.test.ts` (new, 5); `server/room.ts` (the
trace threshold); `docs/STAGES.md`.

**What `probe:net` is actually failing on — named, not fixed.** The step that has been holding the
gate shut since Stage 2 is real, and it is a netcode finding rather than a flaky probe:

```
FAIL  client-predicted movement identical to server  — max error ALPHA 1.02e-1 m / BRAVO 0.00e+0 m
FAIL  reconciliation corrections stay sub-centimetre — max ALPHA 87.50 mm, BRAVO 0.00 mm
```

Established so far:

- **It is a slow-client failure.** Locally it passes 11/11. Under four busy-loops saturating every
  core — a crude stand-in for a shared CI runner — it reproduces: 4.69e-3 m against a 1e-4 m
  threshold. So the trigger is the client being starved, not the netcode being wrong on a fast
  machine, which is why it has never been seen by hand.
- **On CI the error is exactly one simulation tick.** Across the seven logged samples the ratio of
  error to the player's velocity is constant at 16.45 ms, against a 16.67 ms tick — the client's
  predicted state for a given input sits one tick from the server's, and the apparent decay is only
  the player decelerating. Locally the error is sub-tick, so there may be two severities of the
  same cause.
- **It is whichever client is starved, not a particular one.** The first slow run had ALPHA at
  4.69e-3 m and BRAVO at exactly 0; the second had BRAVO at 5.25e-3 m and ALPHA at exactly 0. An
  earlier draft of this entry said the diverging client was the one taking corrections. The second
  run falsified that before it was committed, which is the only reason it is not in here as another
  wrong diagnosis.
- **Every logged sample has `batch` ≥ 2.** With the trace threshold lowered, every divergence the
  server recorded happened on a tick where it applied *several* of that client's inputs at once.
  None was logged at `batch: 1`.
- **The error survives the player stopping.** Two samples at `buttons: 0`, `vel: [0,0]` hold the
  same 1.7 mm offset with identical positions — so it is a residue left in the position, not a
  phase offset in motion. It shrinks with velocity while moving and then simply stays.

The leading candidate, from those three together: **the server advances its world by one tick per
`step()` no matter how many of a client's inputs it applies in it, while the client advances one
tick per input.** A burst of three inputs moves the player three steps and the world one. The
credit scheme bounds the total (`one credit per sim tick, so no client can spend more sim time than
the sim has run`), so this averages out and is not a speed exploit — but inside a burst the
player's motion and the world's clock come apart, and the same asymmetry would coarsen the pose
history that lag compensation rewinds through. That last part is not idle: the run that produced
this trace also dropped hit-reg to 20% with six clamped rewinds. Candidate, not conclusion.

I am not fixing it in this stage, and the reason is the point of the stage: I cannot yet explain it,
and a fix I cannot explain is a fix I cannot verify. What I have done is make the next run *say*
something — the server logged a trace only above 0.02 m, so a 5e-3 m failure printed the number and
never the trace, through thirty-nine runs. It now logs anything that would fail the check.

**Acceptance:** `npm test` 284 (5 new); `npm run typecheck` clean over both configs. The gate's
guards are mutation-tested. The next push is the first one whose CI run will report all twenty-nine
steps — including, honestly, the one that is still red.

## Stage 31 — A lost input is a step the player took and the server did not

**Goal.** Stage 30 opened the gate and named the step that had been holding it shut since Stage 2
without fixing it, because I could not explain it. Explain it.

**The candidate was wrong, and a twenty-line harness said so in a minute.** Stage 30's write-up
guessed that the server advancing its world one tick per `step()` — however many of a client's
inputs it applies in that tick — was pulling prediction apart. Two worlds, the same forty inputs,
one consuming them in batches of 1/2/3/5/8 and the other one per tick:

```
batch 1: delta 0.000e+0 m     batch 3: delta 0.000e+0 m     batch 8: delta 0.000e+0 m
```

Bit-identical. Batching is not it. The batch correlation in the trace was a symptom of a slow
client, not a cause. Writing the guess down and then testing it cost about as much as arguing about
it would have.

**What it actually is.** The next hypothesis took the same harness: give one world every input and
the other all but one.

```
dropped seq [15]      → residue 1.200e-1 m   (both at rest)
dropped seq [15,16]   → residue 2.400e-1 m   (both at rest)
```

Movement is a pure function of the inputs applied, so **an input lost in every redundant copy is a
movement step the client took and the server did not — and the difference is permanent.** It does
not decay, it does not wash out, and it is still exactly there when both sides have come to a dead
stop. 12 cm per lost input at sprint. That is the CI failure exactly: `max error ALPHA 1.02e-1 m`
is one lost input.

The room had a branch for this, and the branch was empty:

```ts
if (i.seq !== rec.lastSeq + 1 && rec.lastSeq !== 0) {
  // gap: the missing inputs were lost in all redundant copies; accept and let the trace flag it
}
```

The trace did flag it, for thirty-nine CI runs. What the player felt was reconciliation dragging
them back 12 cm — rubber-banding under loss, several times a second at the 5% the probe injects.

**Fixed.** The missing ticks are filled by repeating the last input the client actually sent, which
is the likeliest thing it was still doing: held keys are why input is heavily autocorrelated, and
it is what keeps prediction and the server in step through ordinary loss. Two bounds, because a
filled input is a guess made on a player's behalf:

- **A filler carries movement, stance and look — never a discrete action.** Fire, alt-fire, reload,
  grenades and weapon select are stripped, so a dropped packet can never hand out a shot nobody
  took. Jump is edge-triggered against `prevButtons`, so a held bit repeats as held.
- **At most four consecutive ticks (~67 ms).** Past that the client is not losing packets, it is
  gone, and a correction is the honest answer. Fillers queue like any other input, so the per-tick
  credit still bounds the sim time a client can spend.

A filler's `px` is `NaN`, and the trace check skips those samples — there is no client prediction
behind an input the client never sent, and scoring the server against its own invention would make
the check green by making it meaningless.

**Files.** `server/room.ts` (the fill, `MAX_GAP_FILL`, `GAP_FILL_BUTTONS`, `gapFilled` in `/stats`),
`probe/stage2.ts` (reports gaps filled); `tests/gapfill.test.ts` (new, 8).

**Acceptance, stated as it actually ran.** The load in these runs is four busy-loops on a shared
box, which is a stand-in for a CI runner and not a controlled variable, so the honest report is what
each run did rather than a single number.

| run | load | the trace check | rest |
|---|---|---|---|
| before | lighter | **FAIL** 4.69e-3 m | 10/11 |
| before | heavier | **FAIL** 5.25e-3 m | 10/11 |
| after | lighter | **PASS** | **11/11** |
| after | heavier | **PASS** 0.00e+0 m on both clients, 1334 samples, **5 gaps filled** | 9/11 |

The fourth row is the one that matters and the one that complicates the story. The check this stage
is about goes to *exactly zero* on both clients while the server fills five real gaps — that is the
fix working, and the probe prints the fill count so a green run cannot be green merely because no
packet happened to drop.

But under that heavier load two other checks fail, and one of them is new:
`reconciliation corrections stay sub-centimetre` at 58.89 mm. That is very likely the fill's own
cost, and it is worth stating plainly rather than burying: **when the player changes input during a
gap, the repeat is a wrong guess, and the client takes a correction for it.** That is the trade —
an occasional correction that converges in place of a permanent residue that does not — and it is
the right way round, but it is a trade and not a free win. The other failure (hit-reg at 22%, 55
clamped rewinds) is lag compensation running out of history under a machine that cannot keep 60 Hz,
which predates this change and belongs to whoever next opens the rewind buffer.

`npm test` 292 (8 new); typecheck clean over both configs.

Each of four mutations fails a case: not filling at all (the shipped behaviour, four failures),
letting a filler carry discrete actions, removing the bound, and letting a filler pretend to carry
a client prediction. One of the eight cases was vacuous when first written — it compared a run to
itself — and is now the one that actually demonstrates the premise.

## Stage 32 — Mobile

**Goal.** "There needs to be a mobile version." There was no touch handling anywhere in the client,
so on a phone the game was not awkward — it was **unplayable**: pointer lock does not exist there,
and without it nothing moved and nothing aimed.

**The controls.** `client/touch.ts`. The left thumb owns a floating stick that appears wherever it
lands, so it never has to find a spot it cannot see; the right thumb owns look-by-drag anywhere in
its half, so aiming is not confined to a pad. Seven pads sit on two arcs around where the right
thumb pivots — the two that are *held*, fire and alt, on the inner arc, the tapped ones outside it.

**The stick is digital, deliberately.** `InputFrame` is a button bitfield and the sim is a
deterministic function of those bits, shared by client and server. An analog axis would let a phone
move at speeds a keyboard cannot reach, in a game whose PvP pays $CAPITAL. So a thumb pushes the
same eight directions a keyboard does and pushing past the ring is the sprint key: **mobile gets a
different input device, not a different sim.** It feeds the same `InputController`, so the room
cannot tell which one sent a frame.

**The frame.** Stage 22 measured the wet floor's `Reflector` as the largest single line in the
draw-call budget — larger than the dressing, the crowd and the skyline together, because everything
it can see is drawn twice. It is also the effect that fakes best: the reflection is smeared through
eleven vertical taps under a puddle mask, so what a player reads is a wet sheen and the colour of
the light above it. Mobile gets `makeFlatWetFloor` — the sheen for one pass — and the post chain
drops from 0.6 of the canvas to 0.45. Measured on the probe's phone viewport: **53 draw calls**
against the desktop budget of 180.

**What the screenshot caught that the numbers did not.** The first touch build passed every check I
had written — pads on screen, none overlapping another, no page overflow — and was unusable. The
weapon rack, the grenade row, the tab dock and two lines of keyboard legend were all sitting
underneath the thumb pads, and the prompt told a phone player to press **WASD**. "Pads do not
overlap each other" was true and beside the point.

So there are two more checks, and they are the ones with teeth: **no HUD panel may sit underneath a
control** (naming the pairs, so a failure explains itself), and **the game may not tell a phone to
press a key**. Both failed on the build that had just passed everything else. Full-screen effect
layers — the glitch tear, the EMP flash, the scanlines — are excluded by covering ≥90% of the
viewport, because they cannot be "under" anything in a way a thumb cares about.

**Files.** `client/touch.ts` (new), `client/input.ts` (touch merges into the same controller),
`client/game.ts`, `client/main.ts`, `client/render/renderer.ts`, `client/render/wetfloor.ts`
(`makeFlatWetFloor`), `client/hud/hud.ts`, `client/hud/hud.css`, `index.html`
(`viewport-fit=cover`, no user scaling); `probe/stage32.ts` (new, 13); `package.json` and
`.github/workflows/verify.yml` (the gate runs it — `tests/verify.test.ts` would have failed if only
one of the two had it).

**Acceptance:** `npm run probe:mobile` 13/13 on an 844×390 phone viewport with a real touch context
— the Blank walks 10.4 m on a stick push and stops within 3 mm of releasing it, a 140 px drag turns
the view 0.45 rad, holding fire lands six shots, holding a tap-pad jumps exactly once, every control
is ≥46 px and clear of every other control and every panel, 53 draw calls. A desktop still gets the
mirror and no thumb controls. `npm test` 292; typecheck clean over both configs.

**Two design questions this raises, not answered here.** Both are economy decisions rather than
engineering ones, and both want an owner:

1. **Aim assist.** Mobile shooters normally have it. This one pays $CAPITAL to the top 10% of an
   Audit board, and `lint:fairness` exists precisely to keep advantages out of the sim. Shipping
   without it is the conservative default and is what this stage did; it also means a thumb plays
   against a mouse.
2. **Whether a phone and a desktop belong in the same PvP room.** Same question, sharper, because
   the answer changes matchmaking rather than the sim.

## Stage 33 — A screenshot is a claim

**Goal.** Two probes were red. `probe:mastery` timed out on CI and here; `probe:cityLife` was 13/16.
Neither had ever been visible before Stage 30 unblocked the gate. Chasing the first one turned up
something larger than either.

**The timeout.** `probe:mastery` died in `open()`, waiting on `window.__game.ready`. Instrumented,
the two rendered pages read:

```
[open ALPHA] ready in   933ms   (render=true, first rendered context)
[open RICH]  ready in 18812ms   (render=true, second — 20× ALPHA)
```

Same box, same size, same code path. `ready` is set the moment `window.__game` is assigned, so that
wait is not the game reaching a state — it is module execution plus `new Game()`, a **startup cost**
that scales with how busy the machine is and not with anything under test. Two 1280×720 SwiftShader
contexts on four cores was enough to cross a 30 s cap. ALPHA has taken its screenshot by then and is
only holding a room slot, so it is shrunk to 480×270 while RICH lives (18.8 s → 8.7 s, measured),
the cap is now generous on purpose, and a page that never comes up says so with its diagnostics
instead of throwing a bare `TimeoutError`. Every page's construction time goes into `stage7.json`,
so a slow box is visible rather than a mystery.

**What the diagnosis actually found.** Looking at `stage7-graph-after.png` to see where RICH had got
to, it was not a picture of the Ledger Graph. It was a full-screen cyan overlay reading NEO-CHINA.
FOUNDED AS A DRAINAGE CONCESSION, SOLD AS A CITY. So were `stage7-file.png` and
`stage7-graph-before.png`. So were **nine proof artifacts across four probes** — the file panel, both
graph shots, the two netcode engagement frames, the dossier flash, the receipt, the Chapter rite,
the Debt banner.

The opening crawl stands down for `?crawl=0` or `?headless`, and seven page-opening sites in the
probes passed neither. It had been sitting on top of every frame those probes shot since Stage 12.

The checks *beside* those screenshots all passed, and were right to: they read the DOM, and the DOM
was correct — the graph really did have 48 hexes and a green owned node. Only the picture was wrong,
because a picture was the one artifact in the project that nothing asserted anything about. The file
sizes had been saying it for months, if anyone had looked: 4.9 KB for a netcode frame against
800 KB for a district vista.

**`probe/shot.ts`.** Every proof screenshot goes through it now — 41 call sites across 16 probes — and it
proves the frame before it opens the shutter: nothing may cover the viewport (`#crawl`, `#menu`),
and the thing the filename promises has to be on screen. It returns its verdict
rather than throwing, so a bad artifact is one failed check among many instead of a stop that hides
everything after it — Stage 30's lesson. `stage7-graph-after.png` is now 48 hexes and a green
SLIPFILE node over the city; `stage6-file.png` went from 65 KB to 933 KB.

**And a lint under it,** `tests/probeshot.test.ts`: every page a probe opens declares what it wants
from the crawl, and no probe writes a screenshot outside the guard. Two exemptions, both principled
— `stage12` and `stage13` are the probes whose *subject* is an overlay.

**Two more the guard found on its first full run,** neither of them the crawl:
`stage8-dossier.png` and `stage8-rite.png` are transient cards — 1.2 s and a beat — and both were
being shot after their window had closed. The dossier was polled with an `evaluate` round trip every
60 ms and then given a further deliberate 450 ms "to let the reveal paint", which on a slow box
spends the whole hold before the shutter. Both now wait for the card *inside* the page, where a poll
costs nothing, and shoot on the same breath as the state read.

Worth recording: the first version of that lint only read URLs written inline in `.goto()`, and
`probe/stage2.ts` builds its URL into a `const` first. The lint passed it. The runtime guard caught
it on the next run — `stage2-alpha.png is a picture of #crawl, not of #hud .ammo` — which is the
right order for the two to fail in, but the lint should not have needed rescuing. It matches the URL
wherever it is written now.

**`probe:cityLife`.** Three rate-dependent checks, all of them measuring the box rather than the
game on a machine drawing ~3 frames a second.

The city runs on wall time but only advances on a drawn frame, so a crowd measured against a wall
stopwatch is short by up to one whole frame — enough to read a 0.86 m/s walk as 0.77 and fail a
0.8 m/s floor. `CityLife` exposes its own accumulated clock now and the crowd, the tram and the ad
tickers are measured against that: **the same answer at 3 fps as at 120**, rather than a looser
bound.

The monorail check was worse than rate-dependent, it was not testing its own claim. It primed a car
to 41.5 m and waited 700 ms of wall time for real frames to carry it inside earshot — where earshot
is 40 m, so the priming stopped *outside* the band and the check only ever worked because a fast
machine's frames finished the job. And a `+1` cue count after a wait says the whoosh fired; it says
nothing about *once, on the rising edge*, which is the actual claim in the name. It now steps the
crossing on the tram's own clock and asserts the latch directly: `passing` true on the step that
enters the radius, false on the next step while still inside. Reverting `passing = near && !lastPassing`
to `passing = near` fails it, and shows the whoosh machine-gunning (1 cue → 5).

**Files.** `probe/shot.ts` (new); `tests/probeshot.test.ts` (new, 3); `client/render/life.ts` and
`client/main.ts` (the city clock); `probe/stage7.ts` (the readiness cap, the ALPHA shrink,
diagnostics, startup times in the proof); `probe/stage9b.ts` (three checks rewritten); seven probes
gained `?crawl=0`; sixteen probes route their screenshots through the guard.

**Acceptance:** `probe:mastery` 23/23 (was a `TimeoutError`), `probe:cityLife` 19/19 (was 13/16),
`probe:net` 13/13, and every other probe green with its artifacts now checked. `npm test` 295
(3 new); typecheck clean over both configs. Both lint arms and the tram latch are mutation-tested.

## Stage 3 — The look

**Goal.** Make the game look like the place the reference clip was filmed:
near-black kitbash city, neon edge strips, rain, wet streets, fog, and a
full-screen CRT post pass, with the clip's terminal HUD.

**What shipped.**
- `client/render/post.ts`: bloom → anamorphic streak → tone map → CRT
  (film grain, chromatic aberration, scanlines, vignette, ritual stutter).
  Rendered at 0.6× and upscaled nearest-neighbour for the clip's pixel read.
- `client/render/rain.ts`: GPU line-streak rain wrapped around the camera.
- `client/render/wetfloor.ts`: planar mirror at 256×144, vertically smeared,
  puddle-masked, fresnel-weighted, with cyan lane lines. Rain and the far
  skyline live on a layer the mirror cannot see.
- `client/render/city.ts`: arena dressing by collision tag (brick walls with
  cyan tube lights and shutters, hazard kerbs, crates, barrels, cones, a
  light gantry, signage), a 90-slab skyline with sparse lit windows and
  neon parapets, and THE KERNEL on the horizon. All neon is batched into a
  few draw calls per colour.
- `client/render/renderer.ts`: district colour casts (magenta, cyan, amber)
  driving fog, ambient, and the two rig lights.
- `client/hud/`: 1-px green / magenta / cyan panels, status bars, mission
  strip, AREA MAP radar, comms log, prompt bar, tabbed ledger.

**Acceptance (`npm run probe:look`).** Three vantage points are measured
against statistics extracted from the clip's street-level frames
(`docs/proof/stage3/reference-stats.json`): near-black fraction, mean luma,
neon coverage, and cyan + magenta share of the lit neon. All within band.
The sim holds 60 Hz under the full chain (SwiftShader, 15 fps render).

**Not yet.** The 60 fps at 1080p on integrated GPU bar cannot be measured
in this headless environment; draw calls are already batched for it and it
is verified in Stage 9 on hardware.

## Stage 2 — Netcode

**Goal.** Feel is the product: authoritative rooms with client prediction,
server reconciliation, remote interpolation, lag-compensated hitscan, and
quantized delta snapshots, all proven under 150 ms RTT with 5% loss.

**What shipped.**
- `shared/net/protocol.ts`: versioned binary protocol. Inputs carry a
  sequence, view tick (for lag comp), and the client's predicted position
  (for the trace comparison); the last three inputs ride in every packet so
  single losses cost nothing. Snapshots carry the owner's exact state
  (float64, 15 Hz) and other players quantized to 1 cm / 1e-4 rad as deltas
  against the last acked snapshot.
- `server/room.ts`: transport-agnostic room. Inputs are applied strictly in
  sequence (several per tick after loss, none when starved) so the server
  simulation is bit-identical to the client's prediction. Pose history for
  rewinds capped at 200 ms. Validation: protocol version, finite angles,
  pitch range, button mask, sustained input rate, malformed frames; three
  strikes in five seconds kicks. Rejoin by token within 60 s restores the
  same player. `server/node-host.ts` (dev/probe) and `server/worker.ts`
  (Cloudflare Durable Object, `wrangler.toml`) drive the same class.
- `client/net/`: WebSocket transport with a seeded simulated link
  (latency, jitter, loss), `NetClient` (join, redundant input batches, delta
  decoding, RTT, server-clock estimate, remote interpolation 100 ms behind
  with brief velocity extrapolation). `Game` predicts the local player with
  `World.applyInput`, imports the authoritative state, and replays unacked
  inputs; other players render as hooded silhouettes from interpolation.
- Determinism fixes surfaced by the trace comparison: `Math.hypot` replaced
  by `sqrt` (not bit-identical across V8 builds), view angles quantized on
  the client before applying, a corpse could be hit and killed twice through
  the rewind.

**Acceptance (`npm run probe:net`, 11/11):** join < 5 s, server 60 Hz,
88% server-confirmed hits on a strafing target at 150 ms + 5% loss versus
11% with lag compensation disabled, client/server input-trace error 0.00 m,
reconciliation corrections 0.00 mm, no undecodable deltas, 5.6 KB/s down,
rejoin restores the same file and inputs flow again, cheater kicked.

**Not yet.** The Durable Object host was smoke-tested under `wrangler dev`
(join and welcome round-trip); the full probe runs against the Node host.
Deployment lands in Stage 13.

## Stage 4 — Arsenal

**Goal.** The moment-to-moment fun: six server-authoritative weapons with
one alt-fire each, three grenades, learnable seeded recoil, reload cancel at
the seat frame, TTK certified per weapon, and VANTAGE hunting the yard.

**What shipped.**
- `shared/weapons/manifest.ts`: every number for weapons 1–6 and the
  grenades (rpm, damage, zone multipliers, magazine, reload seat fraction,
  pellets, spread, range profile with falloff, recoil profile, alt-fire,
  projectile, melee). Read by client, server, and CI.
- `shared/sim/weapons.ts`: the weapon state machine. Recoil is 60% view
  kick (the camera moves, you pull it back) and 40% pattern climb (a
  deterministic aim offset you learn), plus per-magazine jitter from a
  seed derived from the room seed, player, and magazine count, so the
  server reproduces every shot direction exactly. Reload seats the magazine
  at 60–70% of the animation; firing after the seat cancels the tail,
  firing before it aborts with no ammo. Charge (rail), quickshot, choked
  slug, ADS, brace, sticky round, lunge, grenade cycling and throwing.
- `shared/sim/projectiles.ts`: launcher rounds and grenades with gravity,
  bounces, sticking, proximity arming, fuses; smoke clouds that block
  sight; EMP that blacks out HUDs and disables drones.
- `shared/sim/ai.ts`: wasp drones patrol, acquire on sight, hold distance
  and fire with seeded aim jitter, sag when EMP'd, respawn; the repo mech
  walks a path and sweeps a searchlight that locks, tracks, and fires a
  beam; smoke breaks the lock.
- `shared/sim/ttk.ts`: the harness. Perfect accuracy means the player
  compensates both the visible kick and the learned pattern.
- Client: six kitbash viewmodels with swap dips, ADS zoom, charge shake,
  per-weapon tracer colours and audio silhouettes, rail beams, explosions,
  smoke clouds, EMP blackout, stun wobble, drones and the mech with its
  cone of light, weapon rack and grenade selector in the HUD.

**TTK harness (perfect accuracy, body shots, 70 hp + 30 shield target, at
intended range; retuned in Stage 6 when shields and the fire-rate
accumulator landed):**

| Weapon | Range | Primary | Alt |
| --- | --- | --- | --- |
| Lease-Breaker | 20 m | 0.717 s (7 hits) | optic 0.717 s |
| Repo Hammer | 7 m | 0.850 s (2 shells) | slug 0.850 s |
| Stack SMG | 10 m | 0.733 s (12 hits) | brace 0.733 s |
| Longwave rail | 40 m | 0.917 s (1 shot) | quickshot 0.933 s (3) |
| Phage launcher | 10 m | 0.867 s (2) | sticky 0.883 s |
| Shock baton | 1.5 m | 0.917 s (3) | lunge 0.767 s (2) |

**Acceptance (`npm run probe:arsenal`, 12/12; `npm test`, 52 tests):** every
primary inside the band and no alt under it; same seed reproduces the shot
pattern and a different seed does not; reload seat and cancel semantics;
frag, smoke (breaks the mech's lock), EMP (disables wasps); wasps chase,
shoot, die and respawn; the mech locks and beams; baton chains; sticky arms
on proximity; the browser build fires and hits with all six, detonates
phage and frag, resolves smoke and EMP, and VANTAGE flags and shoots the
player. Determinism hash covers projectiles and AI.

**Design decisions surfaced by the probes.** A weapon swap resets the fire
cooldown (the 0.35 s swap delay is the cost; a quick-switch tech exists).
The lunge ends on contact. A corpse cannot be hit twice through the rewind.

## Stage 5 — The wake

**Goal.** The signature PvP mode. Hex city nodes sit on VANTAGE's model
(violet); Blanks standing on one pull it off (green). Two cells compete,
the wake spreads along the district graph, phage bursts speed it, the
KERNEL brakes it, and deathmatch becomes the warm-up.

**Rules (`shared/sim/wake.ts`).**
- Five nodes over the yard (A deck, B east pillars, C west block, D spawn
  lane, E east gantry), linked as a graph. Radius 4 m.
- A node has an owner (VANTAGE, cell one, cell two) and a hold in [0,1].
  One Blank flips a leased node in 4 s and reinforces it to full in another
  4 s. Extra Blanks add 50% each; every adjacent node the cell already
  holds adds 35% (the spread); a phage or sticky burst doubles the pull for
  4 s; the faction perk multiplies it (hook in place for Stage 8).
- Both cells on a node: contested, frozen, amber. Dead players do not count.
- Score: one point per held node per second, ten per kill on the other
  cell. Holding every node for 15 s is a FULL WAKE and ends the round.
- The KERNEL pulses every 75 s and drains the weakest held node by half;
  a hold that breaks returns to VANTAGE. Unoccupied nodes settle slowly.
- Match flow: warm-up (deathmatch, 20 s once both cells have a Blank),
  wake round (6 min), results (15 s), repeat. The offline sandbox starts in
  the round immediately.
- Rooms balance joiners into the smaller cell. Nodes, match header, and
  wake events travel as entities and fx over protocol v4.

**Presentation.** Hex pads on the floor with a neon ring, a fill that
lerps toward the puller's colour as the hold drains, a light column, dashed
graph links, the liberation ring on a flip (the same VFX the campaign uses
for a district), a strip of hexes under the mission title with the timer
and scores, and alerts for contests, KERNEL pulses, phases, and the FULL
WAKE.

**Acceptance (`npm run probe:wake`, 12/12; `npm test`, 63 tests):** a Blank
flips D and then A; the spread makes A faster (2.97 s next to held D vs
4.02 s alone); score accrues; a phage burst boosts B; the KERNEL pulses on
schedule; online, the room puts ALPHA and BRAVO in opposite cells, the
round starts once both are present, a node with both on it stays contested
and leased, and when BRAVO leaves ALPHA's cell takes it and scores. Node
entities and the match header reach the clients.

## Stage 6 — Ghostfile foundation

**Goal.** The progression spine, built so that power can never be bought:
one manifest that the client, the server, and CI all import; a Fairness
Lint that simulates every candidate build before it can ship; spawn-time
validation that refuses illegal loadouts instead of stripping them; Depth,
XP and the three currencies; deterministic crafting; and the Kernel
Protocol quarantine enforced by an import-graph test.

**Files.**
- `shared/manifest/stats.ts` — the StatSheet (21 tunables the sim reads:
  move, slide, ADS, mantle, health, shield, damage, headshot, fire rate,
  reload, spread, recoil, range, flip, drone detection, footsteps,
  grenades, throw) and the budget weights (`BUDGET_PER_PERCENT`).
- `shared/manifest/items.ts` — Ledger Graph nodes (ring 1 complete, ring 2
  partial; Stage 7 fills 48) and the three launch keystones, each a paired
  trade; `lintItemSchema` refuses trade-less items, non-reconciled nodes,
  keystones that over-*earn*, asymmetric links, forbidden stats, silly deltas.
- `shared/manifest/loadout.ts` — `validateLoadout` (≤7 attested, all owned,
  connected subgraph, one keystone linked to the attestation, Depth-gated
  weapons, unknown fields refused), `sheetFor`, `netDelta`.
- `shared/progression/` — `depth.ts` (Depth 1–50, XP curve
  `1100 + 950(d−1) + 8(d−1)²`, objective-weighted match XP 40/35/25),
  `currency.ts` (Scrip, Wakelight, salvage), `crafting.ts` (deterministic
  recipes: same inputs → same wear seed), `account.ts` (the Ghostfile:
  `applyMatch`, `buyNode`, `refundNode`, `craftFor`, ledger lines).
- `shared/fairness/lint.ts` + `cli.ts` — the Fairness Lint (below).
- `shared/campaign/kernelProtocols.ts` — the campaign-only power stub;
  `tests/quarantine.test.ts` walks the import graph and fails if anything
  under `shared/sim`, `shared/net`, `shared/manifest` or `server/` reaches it.
- `shared/sim/player.ts` — shields: 70 health + 30 shield, regen 15/s after
  4 s, damage soaks shield first, EMP zeroes it; `applySheet`; per-player
  match credit (`flips`, `nodeSeconds`, `support`).
- `shared/sim/wake.ts` — credits occupants (flips they stood on, seconds
  pulling, contest seconds as support); per-room warm-up/round length.
- `shared/net/protocol.ts` — v5: Join carries the file id and the raw
  loadout JSON; `File` message returns the admitted loadout on join and
  the ledger entry at results.
- `server/room.ts` — validates at join (kick `LOADOUT REJECTED: <rule>:
  <detail>`), applies the sheet at spawn, snapshots credit at round start,
  settles every file at results through the store.
- `server/accounts.ts` (store interface + memory store with dev seeding),
  `server/player-do.ts` (PlayerFile Durable Object: hot copy per account,
  write-through to D1), `server/schema.sql` (D1 `ghostfile` + append-only
  `ledger`), `wrangler.toml` (PLAYER_FILE binding, D1 binding).
- `client/file.ts` — the Ghostfile client: account id + loadout in
  localStorage (`?account=` / `?loadout=` override for probes), the FILE
  panel (Tab): Depth/XP/Scrip/Wakelight/salvage, weapon picks with Depth
  gates, attest toggles with each node's trade and budget weight, keystone
  pick, ledger, and the `NET DELTA: ±x.xxx — RECONCILED` stamp.

**The Fairness Lint** (`npm run lint:fairness [--quick] [--inject=…]`).
Not arithmetic: it runs the simulation. For every candidate build (each
node solo, every linked pair, growth chains, each keystone with its
attested neighbours, and three adversarial max-stacks) it duels the build
against the baseline Blank with every weapon at five range brackets
(3/8/15/25/40 m), attacker and defender both, and runs a mobility course
(sprint, slide, slide-jump, mantle). Rules: TTK within ±4% of baseline in
any bracket for nodes (keystones may be slower in either role, never
faster than −4%), no build faster than baseline in all five brackets, the
in-role baseline (a weapon out of its range) is exempt beyond 3 s, mobility
±5% (keystones ±12%). Injections prove the gate bites: `--inject=tradeless`
(a free +10% damage) fails on schema, TTK and beats-every-bracket;
`--inject=netpower` (reconciled on paper: +damage paid with footsteps) fails
on simulation alone. Quick mode runs in ~2 s; the full lint duels every
weapon at every bracket.

**Design decisions surfaced by the lint.**
- Effective health is flat: nodes may not touch `maxHealth`/`maxShield`
  (a −5 hp node made the rail a one-shot, a +5 made the hammer three).
- The fire-rate cooldown is an accumulator (remainder carried), so +2% fire
  rate is +2% and not a whole-tick cliff; swaps still reset it.
- Global offence (damage, head multiplier without a damage cost) fails
  "beats every bracket"; SPITE CLAUSE trades +12% headshot for −6% damage.
- Move-speed costs stack multiplicatively across attested nodes; the
  mobility course caught a −7% chain that read as −4% on paper.
- Keystones over-pay (DEBTLESS gives up the whole shield) and the FILE
  panel reads that as RECONCILED: only an overdraft is a flag.

**Acceptance (`npm run probe:file`, 18/18; `npm test`, 90 tests):** the
catalogue passes the lint and both injections fail it; at spawn, eight
attested nodes, a disconnected pair, an unowned node, and a smuggled
`protocols` field are each refused with the rule in the kick reason and
never enter the world; a legal attestation with DEBTLESS is admitted, the
server's admitted loadout matches the client's, and the sheet runs on
both sides (×1.092 move, ×1.375 slide, no shield); in a 24 s round ALPHA
flips D and holds it, results settle both files (ALPHA +1104 XP / +132
Scrip with 354 objective XP; BRAVO 250 participation XP), the store saves
twice, the client's ledger carries the MATCH / OBJECTIVE / XP lines, and
the FILE panel shows `NET DELTA: −24.700 — RECONCILED`.

## Stage 9 — Neo-China proper (pulled ahead)

**Goal.** The owner's note: *the game needs to feel and be like it's in a
city.* The playable space stops being a yard and becomes a district of
Neo-China: streets between building blocks, sidewalks and curbs, alleys with
dumpsters and fire escapes, storefronts under awnings, parked cars, lamps,
pedestrian rails, an elevated walkway with switchback stairs, a metro
kiosk on the plaza, the wake's nodes at the intersections — enclosed by
tall facades, with the skyline, traffic on an elevated ring road, and THE
KERNEL beyond. Three districts ship (Lease Row / magenta, Deadletter Docks
/ cyan, Repo Depot / amber), the range stays for tests, and the ledger UI
travels between them.

**Files.**
- `shared/sim/city.ts` — the district generator: a 3×3 grid of 24 m blocks
  on 9 m streets (1.5 m sidewalks, 15 cm curbs), block kinds (`tower`,
  `split` with an alley, `court`, `market`, `lot`, `yard`, `stack`,
  `plaza`), storefronts, awnings (render-only `decor`), vending machines,
  cars, lamps, rails, the walkway (landings + stairs in the perimeter
  streets, a spur into the plaza), signs in each district's voice, the
  light rig, wasp patrols over the streets, mechs on the ring avenue,
  traffic lanes. Deterministic per spec (seeded LCG). `DISTRICT_SPECS`.
- `shared/sim/level.ts` — `LevelDef` grew `displayName`, `district`,
  `bounds`, `decor`, `signs`, `lights`, `traffic`, `skylineSeed`; the
  registry `levelById` / `LEVEL_IDS` / `DEFAULT_LEVEL_ID` (`lease_row`);
  the yard's lights and signs became data. `shared/sim/box.ts` holds the
  `Box` type so the city and the level registry don't import in a cycle.
- `shared/sim/nav.ts` — a 1 m walkability grid over any level: ground is
  the highest surface under 3 m (walkways and awnings are overhead), a
  cell is standable when the only contacts are step-height vertical ones
  (a curb beside your foot is a step-up, not a wall); BFS paths with a step
  limit, turning-point waypoints, reachability sets. Probes route bots
  along streets with it; campaign AI will too.
- `client/render/city.ts` — `dressLevel` replaces `dressArena`: a
  material-keyed `MeshBatch` (per-face UV scaling so brick and window grids
  stay in metres), the `NeonBatch`, a `SignAtlas` (all of a level's signs
  on one texture → one mesh), tags for every city element (facades with
  ledge strips every few floors, ground-floor plinths with shutters and
  coloured shop glow, cars with cabins, glass, wheels, tail and head
  lights, lamps with pools, rails in the clip's magenta-post/cyan-bar
  motif, chain-link impound fences with amber top strips, containers,
  cranes, the metro mouth with green light bars and the hex lock glyph),
  `buildSkyline` seeded per district with an inner radius past the
  facades, and `Traffic` (head/tail-light streaks on the ring road, one
  LineSegments updated per frame).
- `client/render/renderer.ts` — district cast from the level, point lights
  from level data (strongest eight), traffic on the far layer, frame-wide
  render counters for the budget check.
- `client/game.ts`, `client/main.ts` — `?level=` builds the level; a Welcome
  naming a different district makes the client travel (reload with the
  room's level and the session token, so it rejoins as the same file).
- `client/hud/hud.ts` — zone label, mission title, radar scale from the
  level; the MAP tab / **M** opens the district select (travel).
- `server/room.ts`, `server/node-host.ts`, `server/worker.ts` — `level`
  option; `?level=` on the room URL picks the district (the Durable Object
  builds its room on first contact so the opening URL decides).
- `tests/city.test.ts` — registry, determinism, spawns/nodes in free space,
  every spawn reaches every node at street level in every district, the
  walkway is reachable up its stairs with steps only, a district plays and
  hashes deterministically.
- `probe/stage9.ts` — below.

**Design decisions surfaced by the tests and probe.**
- The walkway must follow a real street (the first draft crossed through
  building masses) and its stairs must be entered from their low end: the
  first stairs ran straight into the perimeter facade, so the nav showed
  them as unreachable; the landings + switchback stairs along the perimeter
  street fixed it and kept that street open beside them.
- Node B sits under the walkway, so a nav that treats the walkway as
  ground can't route from B; the probe steps back down the street before
  routing up. (A multi-level nav is future work; the two-`maxTop` grids
  cover streets and the walkway.)
- Amber is VANTAGE's colour, not a district's wallpaper: the depot's rig
  is cyan/magenta with amber on a fifth of the strips and on the lot lights,
  fences and towers; the first amber-lit depot read 58% yellow.
- Everything is batched: ~290 boxes and ~60 signs become ~30 level draw
  calls; a full frame (mirror + scene + post) is ~120–155 calls and ~48k
  triangles — well inside a 60 fps budget on an integrated GPU (SwiftShader
  here still holds the 60 Hz sim; rendering is the software rasteriser's
  problem, not the scene's).

**Acceptance (`npm run probe:city`, 32/32; `npm test`, 96 tests):** each
district loads with its name and cast; a Blank sprints the streets from
spawn to node B along nav waypoints and flips it, walks back down the
street, and climbs the switchback stairs onto the walkway; THE KERNEL reads
on the horizon; every street / node / walkway / horizon frame sits in the
clip's bands (near-black base, luma, neon fraction, cyan + magenta
carrying the neon — green counted at a flipped node); the render budget
holds; the sim holds 60 Hz; the MAP tab lists the range and three
districts; online, a room built with `?level=deadletter_docks` plays the
docks and a client that arrives for Lease Row travels to the docks and
rejoins as the same file.

## Stage 8 — Identity & rituals

**Goal.** What others see of a file, and the ceremonies around a match —
with zero gameplay effect and zero information leak. A procedural
three-layer GLYPH derived from the file id that grows a layer at the
Chapter gates; equippable MONIKERS the city calls you by (earned by
stamps, counters and Chapters; worn only if earned); DEBTS (nemesis-lite:
the enemy who closed your file most last match is written to your file,
flagged in the next dossier and over their head, and a DEBT CLEARED banner
fires when you settle it — +5 Wakelight, once per pair per round, three per
pair per day); a 1.2 s pre-match DOSSIER flash of both cells' files;
kill-confirm audio that gains layers with the shooter's own mastery tier
(shooter-side only); the post-match LEDGER ENTRY that prints line by line,
stamps, and waits for the player to sign; CHAPTER RITES at Depth 10 / 25 /
50 (LISTED, DIVERGENT, NAMED — at 50 the NAME field fills and the killfeed
stops reading BLANK); and the DEADLETTER OFFICE hub that renovates itself
with the Chapters, hangs trophies cut from the file's real ledger, and has a
firing range whose ghosts replay your own best run. The probe's contract:
identity data leaks nothing mechanical — every social payload and every
over-the-head tag passes a scanner that knows every stat, item, chip,
firmware and weapon id, and the room refuses to send a payload that fails it.

**Files.**
- `shared/identity/glyph.ts` — FNV seed from the file id; three layers
  (ring / spokes / orbit / shard) derived so earned layers never change
  when a new one grows; `layersForDepth` (1 / 2 at 10 / 3 at 25, the outer
  ring closes at 50); SVG for the HUD and dossier, canvas drawing for the
  over-the-head tags.
- `shared/identity/monikers.ts` — 20 monikers with unlocks (free, Chapter,
  stamp, counter); `CHAPTERS` (10 LISTED, 25 DIVERGENT, 50 NAMED with their
  rite lines); `chapterFor`, `unlockedMonikers`, `wornMoniker` (equipped
  and earned, else none — never a kick).
- `shared/identity/identity.ts` — `PublicIdentity` (glyph seed, chapter,
  moniker, display, stamp count, Debt flag), `IDENTITY_KEYS`,
  `displayName` (moniker or BLANK until Chapter III, then the name), the
  wire tag `seed.chapter.moniker.debt`, and `mechanicalLeaks` /
  `assertClean` — the scanner.
- `shared/progression/account.ts` — `moniker`, `chapters`, `debt`,
  `social` (pair caps), `ghosts`; `upgradeAccount` fills them on old rows;
  `validGhost` / `recordGhost`; the sandbox seed now completes every
  curriculum so rank 30 holds once it earns XP.
- `shared/net/protocol.ts` (v7) — identity string on join, `tag` beside the
  remote name (under the name mask), `Msg.Social` with `dossier` / `debt` /
  `rite`; `FileMsg.identity` for the file's own identity.
- `server/room.ts` — identity per client (refreshed at join, round start,
  settlement), display names on the wire, dossiers at round start
  (viewer-relative Debt flag), `onPlayerKill` (Debt ledger, DEBT CLEARED
  with the velocity caps), `rituals` at settlement (the Debt, Chapter
  rites), `sendSocial` behind `assertClean`; stats expose identity and
  social counts.
- `server/node-host.ts`, `server/worker.ts`, `server/player-do.ts` —
  `POST /file/:id/ghost` keeps a validated run when it is the best.
- `client/hud/hud.ts` + `hud.css` — glyph and moniker in the status line,
  the dossier panel, the Debt banner, the receipt (prints on the render
  clock, stamps, `[ENTER] SIGN`), the rite card.
- `client/audio.ts` — `kill(tier)` layers (second tick, chord, sub drop +
  sweep), `printTick`, `sign`, `rite`, `debtCleared`, `debtOwed`, `dossier`.
- `client/render/renderer.ts` — a canvas sprite over every remote: glyph
  (regenerated from the seed on the wire), what the city calls them, the
  Debt marker in magenta.
- `client/file.ts` — moniker persisted and sent at link; the IDENTITY
  section of the FILE panel (glyph, display, Chapter, moniker picker with
  how each is earned, rites, the Debt); `?shop=` loads the real file offline
  (the hub); `postGhost`.
- `client/game.ts` — Social handling (dossier / Debt / rite → HUD + audio),
  the receipt ritual on settlement, Enter to sign, kill tiers from the
  file's own mastery, remote Debt marker, hub wiring.
- `shared/sim/hub.ts` — the Deadletter Office level: office, furniture,
  doorway, range with cover, start/end pads, renovation slots per Chapter,
  the trophy wall; `overPad`.
- `client/render/hub.ts` — renovation decor by Chapter, trophy plaques from
  ledger lines (matches, Debts, Chapters, stamps, range records), the desk
  nameplate at Chapter III, the ghost figure.
- `client/ghost.ts` — the range recorder (10 Hz from leaving the start pad
  to reaching the end pad; voided on death or return) and playback on the
  sim clock; best run in localStorage and on the file.
- Tests: `tests/identity.test.ts` (9), `tests/rituals.test.ts` (3, room
  level). Probe: `probe/stage8.ts` (`npm run probe:identity`).

**Acceptance (`npm run probe:identity`, 17/17; `npm test`, 119 tests):**
online, a NAMED sandbox file is called ALPHA in the status line with its
glyph and the equipped NAMED moniker while a fresh file claiming NAMED
wears nothing and is called BLANK; the dossier flashes 3 files for 1.2 s
at round start carrying only identity keys (leak scan: 0); others see
ALPHA by name at Chapter III and BRAVO as BLANK with tags of seed, chapter
and moniker only; a rank-1 shooter hears the tier-0 confirm and a rank-30
shooter the tier-3 confirm; at settlement the Ledger Entry prints line by
line with print chatter, stamps, and closes on Enter; the file that was
closed twice owes a Debt to the closer and is told so; a file crossing
Depth 10 performs Chapter I (LISTED card, chord); round two's dossier flags
the Debt; killing that file fires DEBT CLEARED (+5 Wakelight, uncapped)
and clears it on the file; 10 social messages and 4 tags pass the scanner
that flags a control loadout; offline, the Deadletter Office loads ALPHA's
real file (6 renovation pieces, 16 trophies from the ledger), a range run
is recorded, posted and kept as the best (5.57 s), and after a reload the
ghost replays the best run, pulls 38 m ahead of a walking Blank, and the
slower run does not replace it; clean console.

**Proof.** `docs/proof/stage8/` — `stage8-dossier.png`, `stage8-receipt.png`,
`stage8-rite.png`, `stage8-debt.png`, `stage8-office.png`,
`stage8-ghost.png`, `stage8.json`.

## Stage 10 — Campaign

**Goal.** MELTDOWN as a focused, browser-scale open-city RPG on top of the
FPS: the Deadletter Office is the hub, three houses (the Estate, the
Clockeaters, the wake cells) each speak through a fixer, ~12 side gigs
(escrow heists, drone-convoy ambushes, wake-cell rescues, sensor-lattice
sabotage) pay Scrip, XP, stamps and Kernel Protocols, a THREAT RATING rises
with the file so VANTAGE hunts harder and the PA calls your moniker,
CRT-terminal dialogue with real choices is tracked as TESTIMONY that changes
later layouts, which handlers survive and which endings are reachable, and
the seven-mission arc ends in the white office on a choice, not a trigger
pull. Kernel Protocols are real campaign-only power (+damage/+health/+rate)
drawn with blood-red Kernel filament, living in a module the PvP room never
imports; a loadout that carries them is stripped and re-validated at PvP
join. Weapons 7 (THE DIRECTIVE) and 8 (CLOCKEATER) unlock here. Solo and
2-player co-op.

**Files.**
- `shared/campaign/factions.ts` — the houses and handlers (Ida Vessel,
  Marrow, the Deacon, Wern, VANTAGE).
- `shared/campaign/testimony.ts` — testimony gates, survivors
  (`handlersAlive`), the four endings (two hidden) and `endingsFor`.
- `shared/campaign/threat.ts` — `threatRating` from Depth, wins, kills,
  missions and gigs; `threatProfile` (extra wasps/mechs, detection, named).
- `shared/campaign/protocols.ts` — five Kernel Protocols, `protocolMods`,
  `MAX_PROTOCOLS` (3 worn).
- `shared/campaign/script.ts` — dialogue graphs (creation, the seven mission
  beats, Wern's argument in THE LEAK, the white office offer) with gated
  choices that write testimony.
- `shared/campaign/missions.ts` — 7 missions + 12 gigs as data: typed
  objectives (dialogue / reach / kill / destroy / survive / hold / escort),
  variants keyed on testimony, rewards, Threat and testimony requirements.
- `shared/campaign/runtime.ts` — the mission runtime both hosts step:
  spawns the contract's VANTAGE presence and the Threat patrols, resolves
  spots against the level, advances objectives from the world and the
  tick's events, spawns waves, walks the escort, waits on dialogue; fails
  when every Blank stays down.
- `shared/campaign/save.ts` — the save on the file (faction, testimony,
  done, protocols owned/worn, weapons, ending); arc order, gig offers,
  `completeContract` (idempotent rewards), `pickFaction`, `wearProtocols`.
- `shared/campaign/endpoint.ts` — the campaign file endpoint's one
  validator (node host + campaign worker).
- `shared/sim/world.ts` — `spawnWasp / spawnMech / spawnDummy`,
  `dummyRespawn` option, `setLoadout(p, loadout, extra?)` (the only door
  campaign power has into the sim; PvP rooms never pass it).
- `shared/sim/white.ts` — the white office level; `LEVEL_INFO`,
  `HIDDEN_LEVELS` in the registry; dresser materials for the hub and the
  office.
- `shared/weapons/manifest.ts` — `directive` (slot 7, marksman) and
  `clockeater` (slot 8, three-round burst pistol), `CAMPAIGN_WEAPONS`;
  ammo slots 1–8 on the wire, 4-bit slot field in the input, curricula,
  chips (20 templates × 8 = 160), viewmodels, audio.
- `shared/manifest/loadout.ts` — `CAMPAIGN_ONLY_FIELDS` +
  `stripCampaignFields`; the `weapon-locked` rule (a file must own
  `weapon:<id>`).
- `server/room.ts` — strip-and-revalidate at join (`campaignStripped` in
  stats); `RoomHooks` (afterStep / onAdmit / onClientMessage), `send`,
  `accountOf`, `saveAccount`, `wakePhase` / `dummyRespawn` options.
- `server/campaign-room.ts` — the co-op room: a Room with the runtime
  attached through hooks; the first file is the host and resolves dialogue;
  every file wears its own protocols and settles the contract.
- `server/campaign-worker.ts` + `wrangler.campaign.toml` — a separate
  Worker (the co-op DO and the campaign file route through a cross-script
  PlayerFile binding) so the PvP Durable Object never loads the campaign;
  `server/node-host.ts` serves both in development.
- `shared/net/protocol.ts` v7 — `Msg.Mission` (room → clients) and
  `Msg.Choice` (host → room).
- `client/campaign.ts` — the controller: contracts desk (creation script,
  the arc, fixers and gigs, protocols worn, explore), missions stepped
  offline, scripts played on the CRT terminal, completion posted to the
  ledger host (or a local save), Threat presence in explorable districts,
  co-op mirror, endings.
- `client/render/campaign.ts` — objective beam, escort figure, target
  markers, the filament over the weapon.
- `client/hud/hud.ts` + `hud.css` — objective block, CRT terminal (typed
  lines, numbered choices), contracts panel, full-screen cards.
- Tests: `tests/campaign.test.ts` (10). Probe: `probe/stage10.ts`
  (`npm run probe:campaign`).

**Acceptance (`npm run probe:campaign`, 20/20; `npm test`, 133 tests):** a
fresh file opens the contracts desk in the Deadletter Office and the
creation script plays; picking a house writes it to the file on the ledger
host and the desk lists the arc, the fixers and the gigs on offer; launching
WAKE UNLISTED travels to Lease Row with the wake off and the contract's
VANTAGE placed; the terminal resolves, the runtime moves to B (marker up),
reaching B starts a 20 s hold with a wave halfway, the file at E opens a
two-way choice, and out through the plaza the contract closes, the card
prints and the host settles it (testimony `m1:lease=burn`, +300 Scrip, XP,
Threat 1); the endpoint settles contracts in arc order only and refuses an
out-of-order one; worn Kernel Protocols are real in a campaign district
(70 → 105 health, ×1.15 damage, the filament over the weapon); an
explorable district carries the file's Threat with extra patrols and no
wake; at Threat ≥ 3 the PA calls the file by name; a loadout carrying
protocols joins a PvP room stripped (`campaignStripped` 1) at base health
with no damage mod and no filament; the Directive is refused for a file
without the unlock and spawns in slot 7 for one that owns it; co-op: two
files see the room's contract, the first is the host, the host's choice
reaches the room's runtime, and the contract settles on both files with the
host's testimony; the white office has no guards, the desk is the objective,
the endings open follow the testimony, Wern's offer plays, the chair is
taken and the ending is written to the file; no page errors.

**Proof.** `docs/proof/stage10/` — `stage10-contracts.png` (the desk),
`stage10-terminal.png` (the CRT terminal on the street),
`stage10-mission.png` (the hold at B), `stage10-closed.png` (the contract
card), `stage10-filament.png` (Kernel filament over the weapon),
`stage10-white.png` (the white office), `stage10-ending.png` (the chair),
`stage10.json`.

**The PvP wall (probe-tested).** `tests/campaign.test.ts` walks the import
graph from `server/room.ts`, `server/worker.ts`, `server/player-do.ts` and
`shared/manifest/loadout.ts` and asserts no path reaches
`shared/campaign/`; the room test and the probe show a loadout carrying
`protocols` admitted stripped at base health with no damage mod, while a
differently named unknown field is still refused.

## Stage 9b — City life

**Goal.** The owner repeated the note — *the game needs to feel and be like
it's in a city* — after Stage 9 had built the districts. A built district is
still a set: nothing moved, nothing spoke, and every street ended at a wall.
This pass makes Neo-China inhabited. Citizens walk the sidewalks under
umbrellas, the monorail crosses the walkway street on its beam, every
street runs out through the perimeter into a vista of road, lamps, receding
towers and traffic — sealed for play by a chain-link gate the Blank cannot
mantle — holographic ad panels run VANTAGE tickers, the signs flicker and
drop out, steam lifts off the grates, the tallest slabs on the skyline
carry aircraft blinkers and an airship drifts over the district. Under it
the soundscape: distant traffic swelling and fading, crowd murmur, sirens
crossing the district, the PA's three-note chime and a speaker-on-a-wall
voice, and the monorail's whoosh overhead. All of it is render-only: the
sim reads the same boxes it did before (plus the gates and the monorail
posts), the nav grid is unchanged, and PA/sirens run on the sim clock so
the headless probe hears the same city every run.

**Files.**
- `shared/sim/level.ts` — `WalkLoop`, `TramLine`, `StreetExit`, `AdPanel`;
  `LevelDef.walks / pedestrians / tram / vents / exits / ads`.
- `shared/sim/city.ts` — facades cut at the four street exits per axis with
  3.2 m `gate` boxes (collidable, too tall to mantle); a 170 m vista beyond
  each exit (`vista_road`, `vista_bldg`, `vista_lamp` decor) with two traffic
  lanes; sidewalk loops per block + the perimeter loop; six steam vents;
  three ad panels; the monorail line over the walkway street (`beam` and
  `portal` decor, collidable `post` boxes); pedestrians per district
  (Lease Row 110, Deadletter Docks 55, Repo Depot 70).
- `client/render/life.ts` — `Crowd` (four instanced meshes: body, hood,
  wrist lamp, umbrella; each citizen walks a loop at its own pace, pauses,
  turns around), `Tram` (two lit cars, head/tail lights, a point light
  under the car, `passing` rising edge for the whoosh), `Steam` (additive
  points shader), `HoloAds` (canvas tickers redrawn at 12 Hz, colour
  cycling), `Sky` (blinker points on slabs over 60 m + an airship on the
  far layer), `flickerMaterial` (the sign atlas takes a time uniform and a
  per-quad `flick` phase: slow breathing plus random drop-outs), and
  `CityLife` owning them.
- `client/render/city.ts` — tags for gates, vistas, beam, portal; the sign
  atlas carries the `flick` attribute and `dressLevel` returns the sign
  material; the skyline records slab roofs for the blinkers.
- `client/render/renderer.ts` — `life` updated every frame on wall-clock
  time (capped at a hitch) so a slow frame still moves the crowd and the
  tram their full distance; VFX keep their hitch-capped clock.
- `client/audio.ts` — traffic swell and crowd murmur in the bed;
  `siren(pan)`, `pa()`, `tram()` cues (counted in `fired`).
- `client/game.ts` — `cityTick()` on the sim clock: first PA at 5 s, then
  every 27–43 s; first siren at 9 s, then every 38–60 s, alternating sides;
  PA lines name the district and land in the HUD log (`cityLog` keeps them
  all); the tram whoosh fires on the tram's rising edge after render.
- `client/main.ts` — `state().life`: crowd size and sample, tram position and
  earshot, PA lines, ad redraws, airship position, blinker count, flicker.
- `probe/stage9b.ts` (`npm run probe:cityLife`).

**Acceptance (`npm run probe:cityLife`, 16/16; `npm run probe:city` still
32/32; `npm test`, 107 tests):** Lease Row has 110 citizens, a monorail,
steam, 3 ad panels, 46 blinkers and sign flicker; citizens walk at ~1 m/s
on render time while the sim tick stands still, and every sampled citizen
is on a sidewalk loop; the monorail car advances along its beam; the ad
tickers redraw every drawn frame (12 Hz cap) and the airship drifts; 8
gates seal the 8 street exits — no nav path leads beyond the facade line
and a Blank sprinting for the exit stops at z = −53.6 m against the gate at
−54; 296 vista pieces and 22 traffic lanes continue the city beyond; the
vista through the gate reads like the clip (dark 62%, luma 0.12, neon
6.2%, cyan + magenta 66%); the monorail whoosh fires exactly once on the
rising edge of earshot; in 75 s of sim time 2 sirens and 2 PA lines fire
and the PA copy (district name substituted) is in the HUD log; the audio
bed runs; the render budget holds at 198 calls / 117k triangles; the sim
holds 60 Hz with the city alive; no page errors.

**Proof.** `docs/proof/stage9b/` — `stage9b-street.png` (the crowd on the
sidewalks, the beam overhead, the ticker), `stage9b-vista.png` (through the
gate: lamps, traffic, the towers receding), `stage9b-monorail.png` (the beam
and posts from the street), `stage9b.json`.

## Stage 7 — Ledger Graph + weapon mastery

**Goal.** Progression at launch size, still flat on power: the whole Ledger
Graph (48 nodes in three rings, three keystones), weapon mastery 1–30 per
weapon with challenge curricula at the gates, ~120 chips in three sockets,
two firmwares per weapon certified as sidegrades, ~120 attestation stamps
the server un-redacts, and a ledger shop that buys nodes with Scrip. The
brief's probe: budget and connectivity enforced server-side.

**Files.**
- `shared/manifest/items.ts` — 48 nodes: ring 1 (12, Depth 1–4), ring 2
  (18, Depth 6–14), ring 3 (18, Depth 16–30). Every node is authored as a
  benefit and a cost list; `reconciled()` scales the costs to the benefit
  weight and settles the rounding on the last one (the `RECONCILE_LOG`
  records what the Auditor changed). Links are generated as a hex
  constellation (ring neighbours + nearest nodes in the adjacent rings,
  always mutual). `NODE_FORBIDDEN_STATS` now includes `damage`.
- `shared/manifest/chips.ts` — 120 chips from twenty templates × six
  weapons: Muzzle (range / recoil / audio), Kinetic (handling / mobility
  while held), Protocol (fiction mechanics: CONTAGION ROUND boosts the
  nearest node on a kill, ESCROW LOCK restores 10 shield on a kill, VANTAGE
  BANE +25% against drones and mechs, plus footstep / flip / detection
  trades). A mechanic is priced at 3 ledger points; `lintChipSchema`.
- `shared/manifest/firmwares.ts` — 12 firmwares (rank 20 / 28) as patches
  on the weapon definition: THREE-COUNT (3-round bursts — a new `burst`
  fire mode in the state machine), LONG LEASE, DOUBLE BARREL (two-shell
  bursts), SLAM FIRE, DUMP STAGE, MEASURED, CAPACITOR, OVERCHARGE (pierce),
  CLUSTER, LONG FUSE, ARC RELAY, HEAVY HAFT.
- `shared/manifest/loadout.ts` — `chips` and `firmware` on the loadout;
  validation: one chip per socket, the weapon's own chip, the right socket,
  unlocked by that weapon's mastery rank; firmware by rank; `kitFor`.
- `shared/sim/player.ts` / `weapons.ts` / `world.ts` — a per-player kit
  (firmware-patched definitions, chip sheets, mechanics by slot);
  `modsFor(p, slot)` = the file's sheet × the held weapon's chips;
  `weaponDefOf`; burst state on the wire (protocol v6); kill events carry
  a `KillCtx` (zone, distance, alt, through cover, projectile, shooter
  stance / airborne / slide-jump, victim EMP'd) for challenges and stamps.
- `shared/progression/mastery.ts` — XP curve (≈67k to rank 30), gates at
  5/10/15/20/25 with a curriculum per weapon (headshots, mid-slide kills,
  kills beyond 25 m, doubles, optic kills; slugs and point-blank for the
  hammer; braced kills; full-charge, quickshot and through-cover kills for
  the rail; boosted flips and sticky kills for the phage; chain stuns and
  lunges for the baton). `rankFor` holds at a gate until its challenge is
  done; chips and firmwares unlock by rank.
- `shared/progression/stamps.ts` — 115 stamps generated from a matrix
  (per weapon: first kill, first headshot, five in a round, kill beyond
  1.5× ideal range, mid-slide, mid-air, mastery X/XX/XXX, a hundred files;
  movement, the wake, support, grenades, the file, matches, the city);
  `redact()` turns letters into blocks.
- `server/progression.ts` — the match-time tracker: reads the player's
  events each tick, feeds use-XP (kill 120, hit 6, headshot +60, VANTAGE
  +30) and challenge counters, keeps lifetime counters on the file, and
  un-redacts stamps the moment the server has seen the thing; a `File`
  message with reason `stamp` carries new stamps, ranks and challenges to
  the client mid-round (and saves the file). Settlement books match-level
  firsts (wins, full wakes, no-death rounds, top score, districts walked).
- `server/room.ts` — validates chips/firmwares against the file's ranks at
  spawn; `server/accounts.ts` seeds `rich*` files with Scrip for the shop;
  `server/node-host.ts` and `server/worker.ts` + `player-do.ts` — the
  ledger shop (`GET /file/:id`, `POST /file/:id/buy|refund`), persisted
  with mastery/stamps/counters in a D1 `extras` column (self-migrating).
- `client/file.ts` — the GRAPH panel (**G** / GRAPH tab): the constellation
  as a forged district map — three dashed rings, violet leased hexes with
  their Scrip price, dashed hexes for Depth-gated ones, green owned hexes,
  keystones at the centre; click a leased hex to buy (violet → green),
  an owned one to attest; the FILE panel gains WEAPON MASTERY (rank, gate
  text with progress, three socket selects and a firmware select per
  weapon, the trade lines) and ATTESTATION STAMPS (▣ in clear, ▢ redacted);
  stamps, ranks and cleared challenges print to the log with a CRT kick.
- `shared/fairness/lint.ts` — candidates now include every chip on its
  weapon, the best-offence three-chip stack per weapon, and every firmware
  as a sidegrade (±20% per bracket, never faster in all five, certified in
  band by `certifyFirmwares()` in the harness).
- `tests/mastery.test.ts` (11), `probe/stage7.ts`.

**Design decisions surfaced by the lint and the harness.**
- Damage joins health as a stat no node may touch: three linked head-shot
  nodes paying in damage stacked to −17% and crossed every weapon's
  breakpoint (+16% TTK, +263% for the hammer at range). Headshot
  multipliers are paid in handling, shield and mobility now.
- Range benefits stack across a chain into a breakpoint at 40 m (+18%
  range made the rifle a 7-hit kill: −14% TTK); they are 2–3% per node.
- Mobility costs must alternate sign around a ring, or a chain of seven
  neighbours blows the ±5% course; big regen benefits cost reload, spread
  and noise, not move speed (the first COUNTERPARTY draft, settled to the
  ledger, came out at −13.5% move).
- The SMG's spread chips became recoil chips: on a sprayer one fewer
  missed round at 25–40 m is a whole cycle (−8% TTK from a −6% cone).
- Firmwares are certified in the band and duelled as sidegrades: the first
  THREE-COUNT was strictly slower (+25%); the shipped one is +15% damage,
  a third-second reset and a wider hip cone — faster at its ideal range,
  slower at 40 m. CAPACITOR's −25% charge beat baseline in every bracket
  until its damage dropped under the two-shot line past 25 m.

**Acceptance (`npm run probe:mastery`, 20/20; `npm test`, 107 tests):** the
quick lint passes 324 builds; all 12 firmwares certify in band; at spawn a
chip in the wrong socket, a chip above the file's rank, a firmware without
its rank and another weapon's chip are refused with the rule; a mastered
file's three chips and THREE-COUNT are admitted, the server's admitted kit
matches, and the sim runs the burst definition and the +3% range / +1.5%
move only while the rifle is held; the FILE panel shows ranks, sockets and
firmware; a fresh Blank cannot afford a node, a Depth-10 file buys SLIPFILE
(4600 Scrip left, the hex turns green), cannot buy BLACK SWAN (Depth 30),
cannot buy twice, gets 200 back on refund, and the ledger records it; a
kill online feeds the killer's rifle XP, un-redacts FIRST FILE CLOSED
mid-round, the client logs the stamp, and the file reads it in clear among
redacted lines while XP alone holds rank ≤ 5 with no challenge done.
