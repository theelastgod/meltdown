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

## Stage 482 — PHOSPHOR's shop line said green-on-black

**Goal.** Stage 481 taught the FILE chain miss. The Wakelight shop
prints each cosmetic's `line` into the FILE tab. PHOSPHOR still said
mixed-case `green-on-black terminal, the first CRT you ever saw`.

**What changed.** `GREEN-ON-BLACK TERMINAL, THE FIRST CRT YOU EVER
SAW`.

**Proof.** Measured line was mixed-case. After the fix the CRT sentence
is the catalogue. `tests/endgame.test.ts` asserts that sentence and
that rewrite.ts must not the mixed-case template. Mutation: mixed case
again — 1 fail.

## Stage 481 — The FILE's chain miss said the raw reason

**Goal.** Stage 480 taught the settings line. A missing treasury still
printed `info.reason` as the host sent it, so a chain-down suffix like
`fetch failed` reached the COUNTER-LEDGER tab mixed-case.

**What changed.** `crtPhrase(info.reason)` when there is a reason,
else `LOADING…`.

**Proof.** Measured source interpolated `info?.reason` raw. After the
fix file.ts must `crtPhrase(info.reason)`. `tests/endgame.test.ts`
asserts that template and must not the raw `??`. Mutation: raw reason
again — 1 fail.

## Stage 480 — The settings line said applied live

**Goal.** Stage 479 finished the main-menu row mill. The line under a
settings row still printed mixed-case `← → adjusts · applied live ·
kept in this browser` (phone: `tap [−] [+]`).

**What changed.** `← → ADJUSTS · APPLIED LIVE · KEPT IN THIS BROWSER`
and `TAP [−] [+] · APPLIED LIVE · KEPT IN THIS BROWSER`.

**Proof.** Measured line was mixed-case. After the fix the CRT sentences
are the source. `tests/keyhint.test.ts` asserts those sentences and that
keyhint.ts must not the mixed-case template. Mutation: mixed case
again — 1 fail.

## Stage 479 — SETTINGS's subtitle said sensitivity

**Goal.** Stage 478 taught FILE's subtitle. SETTINGS's row still
printed mixed-case `sensitivity, field of view, volumes, the CRT`.

**What changed.** `SENSITIVITY, FIELD OF VIEW, VOLUMES, THE CRT`.

**Proof.** Measured line was mixed-case. After the fix the CRT sentence
is the source. `tests/district.test.ts` asserts that sentence and that
menu.ts must not the mixed-case template. Mutation: mixed case again —
1 fail.

## Stage 478 — FILE's subtitle said the Ghostfile

**Goal.** Stage 477 taught THE RANGE's subtitle. FILE's row still
printed mixed-case `the Ghostfile: nodes, mastery, stamps, the
counter-ledger`.

**What changed.** `THE GHOSTFILE: NODES, MASTERY, STAMPS, THE
COUNTER-LEDGER`.

**Proof.** Measured line was mixed-case. After the fix the CRT sentence
is the source. `tests/district.test.ts` asserts that sentence and that
menu.ts must not the mixed-case template. Mutation: mixed case again —
1 fail.

## Stage 477 — THE RANGE's subtitle said the drainage yard

**Goal.** Stage 476 taught THE OFFICE's subtitle. THE RANGE's row still
printed mixed-case `the drainage yard, offline, with dummies`.

**What changed.** `THE DRAINAGE YARD, OFFLINE, WITH DUMMIES`.

**Proof.** Measured line was mixed-case. After the fix the CRT sentence
is the source. `tests/district.test.ts` asserts that sentence and that
menu.ts must not the mixed-case template. Mutation: mixed case again —
1 fail.

## Stage 476 — THE OFFICE's subtitle said the hub

**Goal.** Stage 475 taught CAMPAIGN's subtitle. THE OFFICE's row still
printed mixed-case `the hub: your file on the wall, the range ghosts,
the dossier`.

**What changed.** `THE HUB: YOUR FILE ON THE WALL, THE RANGE GHOSTS,
THE DOSSIER`.

**Proof.** Measured line was mixed-case. After the fix the CRT sentence
is the source. `tests/district.test.ts` asserts that sentence and that
menu.ts must not the mixed-case template. Mutation: mixed case again —
1 fail.

## Stage 475 — CAMPAIGN's subtitle said the desk

**Goal.** Stage 474 taught THE RUN's subtitle. CAMPAIGN's row still
printed mixed-case `the desk at the Deadletter Office: fixers, gigs,
the seven-mission arc`.

**What changed.** `THE DESK AT THE DEADLETTER OFFICE: FIXERS, GIGS,
THE SEVEN-MISSION ARC`.

**Proof.** Measured line was mixed-case. After the fix the CRT sentence
is the source. `tests/district.test.ts` asserts that sentence and that
menu.ts must not the mixed-case template. Mutation: mixed case again —
1 fail.

## Stage 474 — THE RUN's subtitle said play to earn

**Goal.** Stage 473 taught WAKE's subtitle. THE RUN's row still printed
mixed-case `play to earn: carry $CAPITAL claims out of the PvP zone to
a gate; die and they drop`.

**What changed.** `PLAY TO EARN: CARRY $CAPITAL CLAIMS OUT OF THE PVP
ZONE TO A GATE; DIE AND THEY DROP`.

**Proof.** Measured line was mixed-case. After the fix the CRT sentence
is the source. `tests/district.test.ts` asserts that sentence and that
menu.ts must not the mixed-case template. Mutation: mixed case again —
1 fail.

## Stage 473 — WAKE's subtitle said the signature mode

**Goal.** Stage 472 finished the loadout kick mill. The main menu's
WAKE row still printed mixed-case `the signature mode: flip the nodes,
hold the district, beat THE KERNEL's clock`.

**What changed.** `THE SIGNATURE MODE: FLIP THE NODES, HOLD THE
DISTRICT, BEAT THE KERNEL'S CLOCK`.

**Proof.** Measured line was mixed-case. After the fix the CRT sentence
is the source. `tests/district.test.ts` asserts that sentence and that
menu.ts must not the mixed-case template. Mutation: mixed case again —
1 fail.

## Stage 472 — A keystone list said max N KEYSTONE

**Goal.** Stage 471 taught `FIELD … IS NOT PART OF A PVP LOADOUT`. A
keystone field that is an array still kicked `max 1 KEYSTONE`.

**What changed.** `MAX ${n} KEYSTONE`.

**Proof.** Measured kick was mixed-case. After the fix:
`MAX 1 KEYSTONE`. `tests/fairness.test.ts` asserts that sentence and
that loadout.ts must the CRT template and must not the mixed-case
template. Mutation: mixed case again — 1 fail.

## Stage 471 — An unknown field said is not part of a PvP loadout

**Goal.** Stage 470 taught `NO SOCKET`. A smuggled `protocols` field
still kicked `field "protocols" is not part of a PvP loadout`.

**What changed.** `FIELD "${k}" IS NOT PART OF A PVP LOADOUT`.

**Proof.** Measured kick was mixed-case. After the fix:
`FIELD "protocols" IS NOT PART OF A PVP LOADOUT`. Join kick for
`kernel` is `unknown-field: FIELD "kernel"`. `tests/fairness.test.ts`
and `tests/room.test.ts` assert those sentences and that loadout.ts
must the CRT template and must not the mixed-case template. Mutation:
mixed case again — fairness 1 fail, room 1 fail.

## Stage 470 — A missing socket said no socket

**Goal.** Stage 469 taught `UNKNOWN NODE`. A chip keyed on socket
`barrel` still kicked `LEASE-BREAKER: no socket "BARREL"`.

**What changed.** `NO SOCKET`.

**Proof.** Measured kick was mixed-case. After the fix:
`LEASE-BREAKER: NO SOCKET "BARREL"`. `tests/mastery.test.ts` asserts
that sentence and that loadout.ts must the CRT template and must not
the mixed-case template. Mutation: mixed case again — 1 fail.

## Stage 469 — An unknown node said only the raw id

**Goal.** Stage 468 taught `UNKNOWN KEYSTONE`. An attested id of
`nope_node` still kicked the raw id `nope_node`.

**What changed.** `UNKNOWN NODE ${id}`.

**Proof.** Measured kick was the bare id. After the fix:
`UNKNOWN NODE nope_node`. `tests/fairness.test.ts` asserts that
sentence and that loadout.ts must the CRT template and must not
`detail: id`. Mutation: raw id again — 1 fail.

## Stage 468 — An unknown keystone said only the raw id

**Goal.** Stage 467 taught `UNKNOWN FIRMWARE`. A keystone of
`not_a_stone` still kicked the raw id `not_a_stone`.

**What changed.** `UNKNOWN KEYSTONE ${id}`.

**Proof.** Measured kick was the bare id. After the fix:
`UNKNOWN KEYSTONE not_a_stone`. `tests/fairness.test.ts` asserts that
sentence and that loadout.ts must the CRT template and must not
`detail: lo.keystone`. Mutation: raw id again — 1 fail.

## Stage 467 — An unknown firmware said only the raw id

**Goal.** Stage 466 taught `UNKNOWN CHIP`. A firmware id of `nope`
still kicked the raw id `nope`.

**What changed.** `UNKNOWN FIRMWARE ${id}`.

**Proof.** Measured kick was the bare id. After the fix:
`UNKNOWN FIRMWARE nope`. `tests/mastery.test.ts` asserts that sentence
and that loadout.ts must the CRT template and must not `detail: id`.
Mutation: raw id again — 1 fail.

## Stage 466 — An unknown chip said only the raw id

**Goal.** Stage 465 taught firmware `UNKNOWN WEAPON`. A muzzle slot
set to `nope` still kicked the raw id `nope`.

**What changed.** `UNKNOWN CHIP ${id}`.

**Proof.** Measured kick was the bare id. After the fix:
`UNKNOWN CHIP nope`. `tests/mastery.test.ts` asserts that sentence
and that loadout.ts must the CRT template and must not `detail: id`.
Mutation: raw id again — 1 fail.

## Stage 465 — An unknown firmware gun said unknown weapon

**Goal.** Stage 463 taught chip `UNKNOWN WEAPON`. A firmware map keyed
on `also_bad` still kicked `unknown weapon also_bad`.

**What changed.** `UNKNOWN WEAPON ${id}` on the firmware-weapon kick.

**Proof.** Measured kick was mixed-case. After the fix:
`UNKNOWN WEAPON also_bad`. `tests/mastery.test.ts` asserts that
sentence and that loadout.ts must the CRT template and must not the
mixed-case template. Mutation: mixed case again — 1 fail.

## Stage 464 — Four Imagine plates sat on disk uncatalogued

**Goal.** Stage 422 catalogued skins 21–24. Four new Imagine plates
(repo chevron, longwave filament, phage vein, clock gear) were
conditioned to 256px and sat under `public/assets` with no catalog
row, so Wakelight could not sell them.

**What changed.** Manifest + skins 25–28: REPO CHEVRON, LONGWAVE
FILAMENT, PHAGE VEIN, CLOCK GEAR. Renderer-only, fail-soft. Viewmodel
and remote strips still unplated.

**Proof.** `lint:assets` 183 assets, 0 violations. `tests/assets.test.ts`
asserts all four ids are declared and named by a skin. Mutation: CLOCK
GEAR lost its texture field — 1 fail.

## Stage 463 — An unknown chip gun said unknown weapon

**Goal.** Stage 462 taught `UNKNOWN SECONDARY`. A chip map keyed on
`not_a_gun` still kicked `unknown weapon not_a_gun`.

**What changed.** `UNKNOWN WEAPON ${id}` on the chip-weapon kick.

**Proof.** Measured kick was mixed-case. After the fix:
`UNKNOWN WEAPON not_a_gun`. `tests/mastery.test.ts` asserts that
sentence and that loadout.ts must the CRT template and must not the
mixed-case template. Mutation: mixed case again — 1 fail.

## Stage 462 — An unknown secondary said unknown secondary

**Goal.** Stage 461 taught `UNKNOWN PRIMARY`. A loadout whose secondary
is `also_bad` still kicked `unknown secondary also_bad`.

**What changed.** `UNKNOWN SECONDARY ${id}`.

**Proof.** Measured kick was mixed-case. After the fix:
`UNKNOWN SECONDARY also_bad`. `tests/fairness.test.ts` asserts that
sentence and that loadout.ts must the CRT template and must not the
mixed-case template. Mutation: mixed case again — 1 fail.

## Stage 461 — An unknown primary said unknown primary

**Goal.** Stage 460 taught `MUST TOUCH AN ATTESTED NODE`. A loadout
whose primary is `not_a_gun` still kicked `unknown primary not_a_gun`.

**What changed.** `UNKNOWN PRIMARY ${id}`.

**Proof.** Measured kick was mixed-case. After the fix:
`UNKNOWN PRIMARY not_a_gun`. `tests/fairness.test.ts` asserts that
sentence and that loadout.ts must the CRT template and must not the
mixed-case template. Mutation: mixed case again — 1 fail.

## Stage 460 — A keystone that misses the attestation said must touch

**Goal.** Stage 455 taught `KEYSTONE MUST BE AN ID`. DEBTLESS attested
against WAKE LUNG still kicked `DEBTLESS must touch an attested node
(SLIPFILE, QUIET LEDGER)`.

**What changed.** `MUST TOUCH AN ATTESTED NODE`.

**Proof.** Measured kick was mixed-case. After the fix:
`DEBTLESS MUST TOUCH AN ATTESTED NODE (SLIPFILE, QUIET LEDGER)`.
`tests/fairness.test.ts` asserts that sentence and that loadout.ts must
the CRT template and must not the mixed-case template. Mutation: mixed
case again — 1 fail.

## Stage 459 — A chips list said must map weapon

**Goal.** Stage 458 taught `FIRMWARE MUST MAP`. A chips field that is an
array still kicked `chips must map weapon → socket → chip id`.

**What changed.** `CHIPS MUST MAP WEAPON → SOCKET → CHIP ID`.

**Proof.** `tests/mastery.test.ts`: the kick is
`CHIPS MUST MAP WEAPON → SOCKET → CHIP ID`. loadout.ts must that CRT
string and must not the mixed-case string. Mutation: mixed case again —
1 fail.

## Stage 458 — A firmware list said must map weapon

**Goal.** Stage 457 taught `FIRMWARE MUST BE AN ID`. A firmware field that
is an array still kicked `firmware must map weapon → firmware id`.

**What changed.** `FIRMWARE MUST MAP WEAPON → FIRMWARE ID`.

**Proof.** `tests/mastery.test.ts`: the kick is
`FIRMWARE MUST MAP WEAPON → FIRMWARE ID`. loadout.ts must that CRT string
and must not the mixed-case string. Mutation: mixed case again — 1 fail.

## Stage 457 — A non-string firmware said must be an id

**Goal.** Stage 456 taught `CHIP MUST BE AN ID`. A numeric firmware still
kicked `LEASE-BREAKER: firmware must be an id`.

**What changed.** `FIRMWARE MUST BE AN ID`.

**Proof.** `tests/mastery.test.ts`: the kick is
`LEASE-BREAKER: FIRMWARE MUST BE AN ID`. loadout.ts must the CRT template
and must not the mixed-case template. Mutation: mixed case again — 1 fail.

## Stage 456 — A non-string chip said must be an id

**Goal.** Stage 455 taught `KEYSTONE MUST BE AN ID`. A numeric muzzle chip
still kicked `LEASE-BREAKER.MUZZLE: chip must be an id`.

**What changed.** `CHIP MUST BE AN ID`.

**Proof.** `tests/mastery.test.ts`: the kick is
`LEASE-BREAKER.MUZZLE: CHIP MUST BE AN ID`. loadout.ts must the CRT
template. Mutation: mixed case again — 1 fail.

## Stage 455 — A non-string keystone said must be an id

**Goal.** Stage 248 taught `KEYSTONE` on that kick. A numeric keystone still
kicked `KEYSTONE must be an id`.

**What changed.** `KEYSTONE MUST BE AN ID`.

**Proof.** `tests/fairness.test.ts`: the kick is `KEYSTONE MUST BE AN ID`.
loadout.ts must that CRT string and must not `KEYSTONE must be an id`.
Mutation: mixed case again — 1 fail.

## Stage 454 — A disconnected attestation said connected subgraph

**Goal.** Stage 453 taught `ATTESTED TWICE`. Attesting SLIPFILE and WAKE
LUNG with no edge still kicked `attestation is not a connected subgraph
(1 of 2 reachable from SLIPFILE)`.

**What changed.** `ATTESTATION IS NOT A CONNECTED SUBGRAPH (N OF M
REACHABLE FROM NAME)`.

**Proof.** `tests/fairness.test.ts`: the kick is that CRT sentence.
loadout.ts must the CRT template and must not the mixed-case template.
Mutation: mixed case again — 1 fail.

## Stage 453 — The same node twice said attested twice

**Goal.** Stage 452 taught `N ATTESTED, MAX M`. Attesting SLIPFILE twice
still kicked `SLIPFILE attested twice`.

**What changed.** `ATTESTED TWICE`.

**Proof.** `tests/fairness.test.ts`: the kick is `SLIPFILE ATTESTED TWICE`.
loadout.ts must `${itemName(id)} ATTESTED TWICE` and must not
`${itemName(id)} attested twice`. Mutation: mixed case again — 1 fail.

## Stage 452 — Eight attested said attested, max

**Goal.** Stage 451 taught `ATTESTED MUST BE A LIST OF NODE IDS`. Attesting
eight nodes still kicked `8 attested, max 7`.

**What changed.** `N ATTESTED, MAX M`.

**Proof.** `tests/fairness.test.ts`: the kick is `8 ATTESTED, MAX 7`.
loadout.ts must `${attested.length} ATTESTED, MAX ${MAX_ATTESTED}` and must
not the mixed-case template. Mutation: mixed case again — 1 fail.

## Stage 451 — A malformed attested list said must be a list of node ids

**Goal.** Stage 450 taught `SOCKETS MUST BE AN OBJECT`. Attested that is not
an array still kicked `attested must be a list of node ids`.

**What changed.** `ATTESTED MUST BE A LIST OF NODE IDS`.

**Proof.** `tests/mastery.test.ts`: loadout.ts must that CRT string and must not
the sentence-case string. Mutation: mixed case again — 1 fail.

## Stage 450 — Chip sockets as a list said must be an object

**Goal.** Stage 239 taught the gun name on that kick. A chips map that is
an array still kicked `LEASE-BREAKER: sockets must be an object`.

**What changed.** `SOCKETS MUST BE AN OBJECT`.

**Proof.** `tests/mastery.test.ts`: the kick is
`LEASE-BREAKER: SOCKETS MUST BE AN OBJECT`. loadout.ts must the CRT
template. Mutation: mixed case again — 1 fail.

## Stage 449 — Attesting a keystone said is a KEYSTONE

**Goal.** Stage 448 taught firmware `IS A … FIRMWARE`. Attesting DEBTLESS
as a node still kicked `DEBTLESS is a KEYSTONE`.

**What changed.** `IS A ${kind}`.

**Proof.** `tests/fairness.test.ts`: the kick is `DEBTLESS IS A KEYSTONE`.
loadout.ts must `${itemName(id)} IS A ${it.kind.toUpperCase()}` and must not
the mixed-case template. Mutation: mixed case again — 1 fail.

## Stage 448 — A wrong-weapon firmware said is a firmware

**Goal.** Stage 447 taught chip-socket `IS A … CHIP, NOT`. Flashing DUMP
STAGE on the Lease-Breaker still kicked `DUMP STAGE is a STACK SMG firmware`.

**What changed.** `IS A … FIRMWARE`.

**Proof.** `tests/mastery.test.ts`: the kick matches `IS A STACK SMG FIRMWARE`.
loadout.ts must the CRT firmware-weapon template. Mutation: mixed case
again — 1 fail.

## Stage 447 — A wrong-socket chip said is a chip, not

**Goal.** Stage 446 taught `IS A … CHIP`. Putting LONG BARREL in Kinetic
still kicked `LEASE-BREAKER LONG BARREL is a MUZZLE chip, not KINETIC`.

**What changed.** `IS A … CHIP, NOT …`.

**Proof.** `tests/mastery.test.ts`: the kick matches `IS A MUZZLE CHIP, NOT
KINETIC`. loadout.ts must the CRT chip-socket template. Mutation: mixed
case again — 1 fail.

## Stage 446 — A wrong-weapon chip said is a chip

**Goal.** Stage 235 taught the names. Putting STACK LONG BARREL on the
Lease-Breaker still kicked `STACK LONG BARREL is a STACK SMG chip`.

**What changed.** `IS A … CHIP`.

**Proof.** `tests/mastery.test.ts`: the kick matches `IS A STACK SMG CHIP`.
loadout.ts must the CRT template. Mutation: mixed case again — 1 fail.

## Stage 445 — A firmware below mastery said needs mastery

**Goal.** Stage 444 taught chip `NEEDS MASTERY`. Flashing THREE-COUNT at rank
1 still kicked `THREE-COUNT needs LEASE-BREAKER mastery 20 (you are 1)`.

**What changed.** `NEEDS … MASTERY … (YOU ARE …)`.

**Proof.** `tests/mastery.test.ts`: the kick matches `LEASE-BREAKER MASTERY`
and `YOU ARE`. loadout.ts must the CRT firmware-rank template. Mutation:
mixed case again — 1 fail.

## Stage 444 — A chip below mastery said needs mastery

**Goal.** Stage 443 taught `IS NOT IN YOUR FILE`. Socketing FLASH CUT at
rank 1 still kicked `LEASE-BREAKER FLASH CUT needs LEASE-BREAKER mastery
22 (you are 1)`.

**What changed.** `NEEDS … MASTERY … (YOU ARE …)`. Firmware rank stays
mixed case.

**Proof.** `tests/mastery.test.ts`: the kick matches `LEASE-BREAKER MASTERY`
and `YOU ARE`. loadout.ts must the CRT chip-rank template. Mutation:
mixed case again — 1 fail.

## Stage 443 — An unowned node said is not in your file

**Goal.** Stage 442 taught `UNLOCKS IN THE CAMPAIGN`. Attesting LONG LEASE
the file does not hold still kicked `LONG LEASE is not in your file`.

**What changed.** `IS NOT IN YOUR FILE` on the node and keystone paths.

**Proof.** `tests/fairness.test.ts`: the kick is `LONG LEASE IS NOT IN YOUR
FILE`. loadout.ts must `${itemName(id)} IS NOT IN YOUR FILE` and
`${itemName(k.id)} IS NOT IN YOUR FILE`. Mutation: one of two mixed case
again — 1 fail.

## Stage 442 — A campaign gun said unlocks in the campaign

**Goal.** Stage 441 taught loadout `NEEDS DEPTH`. Spawning THE DIRECTIVE
without the unlock still kicked `THE DIRECTIVE unlocks in the campaign`.

**What changed.** `UNLOCKS IN THE CAMPAIGN`.

**Proof.** `tests/campaign.test.ts`: the kick is `THE DIRECTIVE UNLOCKS IN THE
CAMPAIGN`. loadout.ts must `${gun(w)} UNLOCKS IN THE CAMPAIGN` and must not
`${gun(w)} unlocks in the campaign`. Mutation: mixed case again — 1 fail.

## Stage 441 — A Depth-gated gun said needs Depth

**Goal.** Stage 430 taught buyNode `NEEDS DEPTH`. Spawning PHAGE LAUNCHER too
shallow still kicked `PHAGE LAUNCHER needs Depth 20 (you are 10)`.

**What changed.** `NEEDS DEPTH` / `YOU ARE`.

**Proof.** `tests/fairness.test.ts`: the kick matches `^PHAGE LAUNCHER NEEDS DEPTH`.
loadout.ts must the CRT template. Mutation: mixed case again — 1 fail.

## Stage 440 — A sandbox buy said the sandbox file already owns everything

**Goal.** Stage 435 taught `NO LEDGER HOST LINKED`. Buying a node with no shop
still returned `offline: the sandbox file already owns everything`.

**What changed.** `OFFLINE: THE SANDBOX FILE ALREADY OWNS EVERYTHING`.

**Proof.** `tests/endgame.test.ts`: file.ts must that CRT reason and must not
the sentence-case reason. Mutation: lowercase again — 1 fail.

## Stage 439 — A hidden GPU said unknown

**Goal.** Stage 438 taught `SAMPLING`. A browser that hides the renderer
still named it `unknown` on the overlay.

**What changed.** `UNKNOWN`.

**Proof.** `tests/endgame.test.ts`: perf.ts must `return s || "UNKNOWN"`
and must not `return s || "unknown"`. Mutation: lowercase again — 1 fail.

## Stage 438 — A booting perf overlay said sampling

**Goal.** Stage 437 taught `REPORT IN N S`. The overlay still booted with
`PERF · sampling…`.

**What changed.** `PERF · SAMPLING…`.

**Proof.** `tests/endgame.test.ts`: perf.ts must `textContent = "PERF · SAMPLING…"`
and must not `textContent = "PERF · sampling…"`. Mutation: lowercase
again — 1 fail.

## Stage 437 — A waiting perf overlay said report in N s

**Goal.** Stage 436 taught `NO LEDGER HOST`. Before the report posts, the
strip still wrote `report in 30 s`.

**What changed.** `REPORT IN ${…} S`.

**Proof.** `tests/endgame.test.ts`: perf.ts must `REPORT IN ${Math.max(…)} S`
and must not `report in ${Math.max(…)} s`. Mutation: mixed case again —
1 fail.

## Stage 436 — The perf overlay said no ledger host

**Goal.** Stage 435 taught `NO LEDGER HOST LINKED`. The perf strip still wrote
`NOT REPORTED: no ledger host`.

**What changed.** `NO LEDGER HOST`.

**Proof.** `tests/endgame.test.ts`: perf.ts must `postError = "NO LEDGER HOST"`
and must not `postError = "no ledger host"`. Mutation: lowercase again — 1 fail.

## Stage 435 — A FILE op with no shop said no ledger host linked

**Goal.** Stage 371 taught ENDGAME no-host CRT. Claim / rewrite / cosmetic
with no shop still returned `no ledger host linked`.

**What changed.** `NO LEDGER HOST LINKED` on both FILE posts.

**Proof.** `tests/endgame.test.ts`: file.ts must `reason: "NO LEDGER HOST LINKED"`
and must not `reason: "no ledger host linked"`. Mutation: lowercase again —
1 fail.

## Stage 434 — A ghost token said unknown skin

**Goal.** Stage 433 taught `NOT ON YOUR RIG`. Wearing a token the catalogue
does not have, already on the rig, still returned `unknown skin`.

**What changed.** `UNKNOWN SKIN`.

**Proof.** `tests/counter.test.ts`: wearSkin of 99999 on a rig that holds
it is `UNKNOWN SKIN`. counter.ts must `reason: "UNKNOWN SKIN"` and must not
`reason: "unknown skin"`. Mutation: lowercase again — 1 fail.

## Stage 433 — A token not on the rig said not on your rig

**Goal.** Stage 432 taught `NOT IN YOUR FILE`. Wearing a token the file's
rig does not hold still returned `not on your rig`.

**What changed.** `NOT ON YOUR RIG`.

**Proof.** `tests/counter.test.ts`: wearSkin of token 1 on a new file is
`NOT ON YOUR RIG`. counter.ts must `reason: "NOT ON YOUR RIG"` and must not
`reason: "not on your rig"`. Mutation: lowercase again — 1 fail.

## Stage 432 — A refund of an unowned node said not in your file

**Goal.** Stage 431 taught `NEEDS N SCRIP`. Refunding a node the file does
not hold still returned `not in your file`.

**What changed.** `NOT IN YOUR FILE`.

**Proof.** `tests/fairness.test.ts`: refundNode of slipfile on a new file is
`NOT IN YOUR FILE`. account.ts must `reason: "NOT IN YOUR FILE"` and must not
`reason: "not in your file"`. Mutation: lowercase again — 1 fail.

## Stage 431 — A poor buy said needs Scrip

**Goal.** Stage 430 taught `NEEDS DEPTH`. Buying a node the file cannot afford
still returned `needs 400 Scrip`.

**What changed.** `NEEDS ${price} SCRIP`.

**Proof.** `tests/fairness.test.ts`: account.ts must `NEEDS ${price} SCRIP` and
must not `needs ${price} Scrip`. Mutation: mixed case again — 1 fail.

## Stage 430 — A Depth-gated buy said needs Depth

**Goal.** Stage 394 taught FILE `NEEDS DEPTH`. Buying a node the file is too
shallow for still returned `needs Depth 10`.

**What changed.** `NEEDS DEPTH ${it.requiresDepth}`.

**Proof.** `tests/fairness.test.ts`: buyNode of wake_lung matches `^NEEDS DEPTH `.
account.ts must `NEEDS DEPTH ${it.requiresDepth}`. Mutation: mixed case again —
1 fail.

## Stage 429 — A held node said already in your file

**Goal.** Stage 428 taught `UNKNOWN ITEM`. Buying a node the file already
holds still returned `already in your file`.

**What changed.** `ALREADY IN YOUR FILE`.

**Proof.** `tests/fairness.test.ts`: a second buyNode of slipfile is
`ALREADY IN YOUR FILE`. account.ts must `reason: "ALREADY IN YOUR FILE"`
and must not `reason: "already in your file"`. Mutation: lowercase
again — 1 fail.

## Stage 428 — An unknown node said unknown item

**Goal.** Stage 427 taught `NOT ON TODAY'S BOARD`. Buying an id the ledger
catalogue does not have still returned `unknown item`.

**What changed.** `UNKNOWN ITEM`.

**Proof.** `tests/fairness.test.ts`: buyNode of `not_a_node` is
`UNKNOWN ITEM`. account.ts must `reason: "UNKNOWN ITEM"` and must not
`reason: "unknown item"`. Mutation: lowercase again — 1 fail.

## Stage 427 — An id off today's board said not on today's board

**Goal.** Stage 426 taught `ALREADY CLAIMED`. Claiming an id that is not
one of the day's three still returned `not on today's board`.

**What changed.** `NOT ON TODAY'S BOARD`.

**Proof.** `tests/endgame.test.ts`: claim of `nope_id` is
`NOT ON TODAY'S BOARD`. contracts.ts must `reason: "NOT ON TODAY'S BOARD"`
and must not `reason: "not on today's board"`. Mutation: lowercase
again — 1 fail.

## Stage 426 — A second claim said already claimed

**Goal.** Stage 425 taught `NOT ON OFFER YET`. Claiming a daily contract
the file already banked still returned `already claimed`.

**What changed.** `ALREADY CLAIMED`.

**Proof.** `tests/endgame.test.ts`: a second claim is `ALREADY CLAIMED`.
contracts.ts must `reason: "ALREADY CLAIMED"` and must not
`reason: "already claimed"`. Mutation: lowercase again — 1 fail.

## Stage 425 — A locked gig said not on offer yet

**Goal.** Stage 424 taught `ALREADY CLOSED`. A Threat-locked gig still returned
`not on offer yet`.

**What changed.** `NOT ON OFFER YET`.

**Proof.** `tests/campaign.test.ts`: canLaunch of g_escrow_depot is
`NOT ON OFFER YET`. save.ts must `"NOT ON OFFER YET"`. Mutation: lowercase
again — 1 fail.

## Stage 424 — A finished gig said already closed

**Goal.** Stage 423 taught `COMES FIRST`. Re-launching a gig already on the
file still returned `already closed`.

**What changed.** `ALREADY CLOSED`.

**Proof.** `tests/campaign.test.ts`: save.ts must `"ALREADY CLOSED"` and must not
`"already closed"`. Mutation: lowercase again — 1 fail.

## Stage 423 — Skipping a mission said comes first

**Goal.** Stage 421 taught `THE ARC IS COMPLETE`. Launching m2 before m1 still
returned `WAKE UNLISTED comes first`.

**What changed.** `${next.title} COMES FIRST`.

**Proof.** `tests/campaign.test.ts`: canLaunch(m2) is `WAKE UNLISTED COMES FIRST`.
save.ts must `${next.title} COMES FIRST`. Mutation: lowercase again — 1 fail.

## Stage 422 — Hitscan, blast, spark and optic still wore the lamp plate

**Goal.** Hitscan beams, nade blasts, impact sparks, THE DIRECTIVE's optic and THE
WAKE hex pads all reused `tex_lamp`. Imagine filled dedicated plates: tracer, blast,
spark, wake hex, directive core, plus SMG / lease / shock kit plates for the catalog.

**What changed.** Those FX bind the new ids, fail-soft. Catalog skins 21–24
(STACK PLATE, DIRECTIVE CORE, LEASE STEEL, ARC VIOLET) name the kit plates.

**Proof.** `tests/assets.test.ts`: weapons must `bindPlate(beamMat, "tex_tracer")`,
`blastMat`/`tex_blast`, `optic`/`tex_directive_core`; vfx `smat`/`tex_spark`; wake
ring/fill `tex_wake_hex`. Mutation: beamMat still `tex_lamp` — 1 fail.

## Stage 421 — Launching after the arc said the arc is complete

**Goal.** Stage 420 taught `PICK A HOUSE FIRST`. Launching a main mission
after the seven still returned `the arc is complete`.

**What changed.** `THE ARC IS COMPLETE`.

**Proof.** `tests/campaign.test.ts`: save.ts must `reason: "THE ARC IS COMPLETE"`
and must not `reason: "the arc is complete"`. Mutation: mixed case again —
1 fail.

## Stage 420 — A mission with no house said pick a house first

**Goal.** Stage 419 taught `UNKNOWN CONTRACT`. Launching a main mission with
no house still returned `pick a house first`.

**What changed.** `PICK A HOUSE FIRST`.

**Proof.** `tests/campaign.test.ts`: save.ts must `reason: "PICK A HOUSE FIRST"`
and must not `reason: "pick a house first"`. Mutation: mixed case again — 1 fail.

## Stage 419 — An unknown launch said unknown contract

**Goal.** Stage 418 taught `CLOSED BY THE ROOM`. Launching or completing an
id the catalogue does not have still returned `unknown contract`.

**What changed.** `UNKNOWN CONTRACT` in `canLaunch` and `completeContract`.

**Proof.** `tests/campaign.test.ts`: save.ts must `reason: "UNKNOWN CONTRACT"`
and must not `reason: "unknown contract"`. Mutation: one of two mixed case
again — 1 fail.

## Stage 418 — A claimed completion said closed by the room

**Goal.** Stage 417 taught `HOUSE ALREADY PICKED`. Completing a contract from
the client still returned `a contract is closed by the room that ran it, not
by asking`.

**What changed.** `A CONTRACT IS CLOSED BY THE ROOM THAT RAN IT, NOT BY ASKING`.
`tests/fileauth.test.ts` now matches `CLOSED BY THE ROOM`.

**Proof.** `tests/campaign.test.ts`: endpoint.ts must the CRT sentence and must
not the mixed-case sentence. Mutation: mixed case again — 1 fail.

## Stage 417 — A second house said house already picked

**Goal.** Stage 416 taught `UNKNOWN HOUSE`. Picking a house when one is already
on the file still returned `house already picked`.

**What changed.** `HOUSE ALREADY PICKED`.

**Proof.** `tests/campaign.test.ts`: campaign endpoint must `HOUSE ALREADY PICKED`
and must not `house already picked`. Mutation: mixed case again — 1 fail.

## Stage 416 — An unknown house said unknown house

**Goal.** Stage 414 taught campaign `UNKNOWN OP`. Picking a house that is not
on the list still returned `unknown house`.

**What changed.** `UNKNOWN HOUSE`.

**Proof.** `tests/campaign.test.ts`: campaign endpoint must `reason: "UNKNOWN HOUSE"`
and must not `reason: "unknown house"`. Mutation: mixed case again — 1 fail.

## Stage 415 — An unknown economy op said unknown op

**Goal.** Stage 414 taught campaign `UNKNOWN OP`. A counter post the
endpoint does not recognise still returned `unknown op`.

**What changed.** `UNKNOWN OP` in `shared/economy/endpoint.ts`.

**Proof.** `tests/endgame.test.ts`: economy endpoint must `reason: "UNKNOWN OP"`
and must not `reason: "unknown op"`. Mutation: mixed case again — 1 fail.

## Stage 414 — An unknown campaign op said unknown op

**Goal.** Stage 413 taught cosmetic `UNKNOWN OP`. A campaign post the
endpoint does not recognise still returned `unknown op`.

**What changed.** `UNKNOWN OP` in `shared/campaign/endpoint.ts`. Economy
stays mixed case.

**Proof.** `tests/endgame.test.ts`: campaign endpoint must `reason: "UNKNOWN OP"`
and must not `reason: "unknown op"`. Mutation: mixed case again — 1 fail.

## Stage 413 — An unknown cosmetic op said unknown op

**Goal.** Stage 412 taught `NOT OWNED`. A cosmetic post with an op the host
does not recognise still returned `unknown op`.

**What changed.** `UNKNOWN OP` on both hosts. Campaign and economy
endpoints stay mixed case.

**Proof.** `tests/endgame.test.ts`: both hosts must `reason: "UNKNOWN OP"` and
must not `reason: "unknown op"`. Mutation: player-do mixed case again — 1 fail.

## Stage 412 — Wearing a theme you do not own said not owned

**Goal.** Stage 411 taught `SLOT N NOT OWNED`. Setting a theme the file
does not have still returned `not owned` from both hosts.

**What changed.** `NOT OWNED` on the cosmetic theme refuse in
`server/player-do.ts` and `server/node-host.ts`.

**Proof.** `tests/endgame.test.ts`: both hosts must `reason: "NOT OWNED"` and
must not `reason: "not owned"`. Mutation: player-do mixed case again — 1 fail.

## Stage 411 — A write into a missing slot said not owned

**Goal.** Stage 410 taught `EMPTY ALIAS`. Saving preset 4 or alias 4 on a new
file still returned `slot 4 not owned (1 slots)`.

**What changed.** `slotNotOwned`: `SLOT 4 NOT OWNED (1 SLOT)`. savePreset and
setAlias call it.

**Proof.** `tests/endgame.test.ts`: `slotNotOwned(4, 1)` is `SLOT 4 NOT OWNED (1 SLOT)`.
rewrite.ts must `slotNotOwned(slot, slots)` and must not
`slot ${slot} not owned (${slots} slots)`. Mutation: mixed case again — 1 fail.

## Stage 410 — An empty alias said empty alias

**Goal.** Stage 409 taught `NEEDS SLOT N FIRST`. Setting a blank alias still
returned `empty alias`.

**What changed.** `EMPTY ALIAS`.

**Proof.** `tests/endgame.test.ts`: rewrite.ts must `reason: "EMPTY ALIAS"` and
must not `reason: "empty alias"`. Mutation: lowercase again — 1 fail.

## Stage 409 — Buying a slot out of order said needs first

**Goal.** Stage 408 taught `SLOT N ALREADY OWNED`. Buying slot 3 before
slot 2 still returned `needs alias slot 2 first`.

**What changed.** `NEEDS ${c.kind.toUpperCase()} SLOT ${n - 1} FIRST`.

**Proof.** `tests/endgame.test.ts`: rewrite.ts must the CRT template and must
not `needs ${c.kind} slot ${n - 1} first`. Mutation: mixed case again — 1 fail.

## Stage 408 — A granted slot said already owned

**Goal.** Stage 407 taught `UNKNOWN COSMETIC`. A Deep Wake pass holder
buying a slot they already have still returned `alias slot 2 already owned
(4 slots)`.

**What changed.** `${c.kind.toUpperCase()} SLOT ${n} ALREADY OWNED (${have} SLOTS)`.
`tests/seasonpass.test.ts` now expects `ALREADY OWNED`.

**Proof.** `tests/endgame.test.ts`: rewrite.ts must `SLOT ${n} ALREADY OWNED`
and must not `slot ${n} already owned`. Mutation: mixed case again — 1 fail.

## Stage 407 — An unknown shop id said unknown cosmetic

**Goal.** Stage 406 taught `NEEDS N WAKELIGHT`. Buying an id the catalogue
does not have still returned `unknown cosmetic`.

**What changed.** `UNKNOWN COSMETIC`.

**Proof.** `tests/endgame.test.ts`: rewrite.ts must `reason: "UNKNOWN COSMETIC"`
and must not `reason: "unknown cosmetic"`. Mutation: lowercase again — 1 fail.

## Stage 406 — A poor shop said needs Wakelight

**Goal.** Stage 405 taught `ALREADY OWNED`. Buying a theme without enough
Wakelight still returned `needs 300 Wakelight`.

**What changed.** `NEEDS ${c.wakelight} WAKELIGHT`.

**Proof.** `tests/endgame.test.ts`: rewrite.ts must `NEEDS ${c.wakelight} WAKELIGHT`
and must not `needs ${c.wakelight} Wakelight`. Mutation: mixed case again — 1 fail.

## Stage 405 — Buying a cosmetic twice said already owned

**Goal.** Stage 400 taught `REWRITE OPENS AT`. Buying a theme the file already
has still returned `already owned`.

**What changed.** `ALREADY OWNED`.

**Proof.** `tests/endgame.test.ts`: rewrite.ts must `reason: "ALREADY OWNED"` and
must not `reason: "already owned"`. Mutation: lowercase again — 1 fail.

## Stage 404 — Listing a rig token said List for how much

**Goal.** Stage 403 taught firmware `· R`. Selling a rig token still prompted
`List for how much $CAPITAL?`.

**What changed.** `LIST FOR HOW MUCH $CAPITAL?`.

**Proof.** `tests/endgame.test.ts`: file.ts must the CRT prompt and must not
the sentence-case prompt. Mutation: mixed case again — 1 fail.

## Stage 403 — A firmware option said r

**Goal.** Stage 402 taught chip `· R`. A firmware still tagged `· r5` on
the FILE kit select.

**What changed.** `· R${f.rank}`.

**Proof.** `tests/endgame.test.ts`: file.ts must `} · R${f.rank}` and must not
`} · r${f.rank}`. Mutation: mixed case again — 1 fail.

## Stage 402 — A chip option said r

**Goal.** Stage 401 taught `GATE R`. A chip still tagged `· r5` on the
FILE kit select.

**What changed.** `· R${c.rank}`. Firmware option ranks stay lowercase.

**Proof.** `tests/endgame.test.ts`: file.ts must `} · R${c.rank}` and must not
`} · r${c.rank}`. Mutation: mixed case again — 1 fail.

## Stage 401 — A mastery gate said GATE r

**Goal.** Stage 400 taught `REWRITE OPENS AT`. An open mastery challenge still
dimmed `GATE r5`.

**What changed.** `GATE R${gate.gate}`. Chip and firmware option ranks stay
lowercase for the next stages.

**Proof.** `tests/endgame.test.ts`: file.ts must `GATE R${gate.gate}` and must
not `GATE r${gate.gate}`. Mutation: mixed case again — 1 fail.

## Stage 400 — Rewrite too early said Depth

**Goal.** Stage 399 taught `NO FILE`. Below Depth 50, Rewrite still dimmed
`Depth 12 — Rewrite opens at 50`.

**What changed.** `DEPTH ${a.depth} — REWRITE OPENS AT ${MAX_DEPTH}`.

**Proof.** `tests/endgame.test.ts`: rewrite.ts must the CRT template and must not
`Depth ${a.depth} — Rewrite opens at`. Mutation: mixed case again — 1 fail.

## Stage 399 — Rewrite without a file said no file

**Goal.** Stage 395 taught `NOT IN YOUR FILE`. Opening Rewrite with no account still
dimmed `no file`.

**What changed.** `NO FILE`.

**Proof.** `tests/endgame.test.ts`: file.ts must `reason: "NO FILE"` and must not
`reason: "no file"`. Mutation: lowercase again — 1 fail.

## Stage 398 — Mastery progress said xp

**Goal.** Stage 397 taught moniker `— NONE —`. Unmastered kit still dimmed
`${into}/${need} xp`.

**What changed.** `${into}/${need} XP`.

**Proof.** `tests/endgame.test.ts`: file.ts must `class="dim">${into}/${need} XP`
and must not `class="dim">${into}/${need} xp`. Mutation: lowercase again —
1 fail.

## Stage 397 — An empty moniker said none

**Goal.** Stage 396 taught chip `— NONE —`. An empty moniker still dimmed
`— none —` on THE CITY CALLS YOU row.

**What changed.** `— NONE —` on the moniker select.

**Proof.** `tests/endgame.test.ts`: file.ts must the moniker select
`— NONE —` and must not the moniker select `— none —`. Mutation: mixed
case again — 1 fail.

## Stage 396 — An empty chip socket said none

**Goal.** Stage 395 taught `NOT IN YOUR FILE`. An empty chip socket still
dimmed `— none —` on the FILE kit.

**What changed.** `— NONE —` on the chip select. The moniker empty option
is left for the next stage.

**Proof.** `tests/endgame.test.ts`: file.ts must the chip select `— NONE —`
and must not the chip select `— none —`. Mutation: mixed case again — 1 fail.

## Stage 395 — An unowned node said not in your file

**Goal.** Stage 394 taught `NEEDS DEPTH`. An unowned ledger node still dimmed
`not in your file` on the FILE panel.

**What changed.** `NOT IN YOUR FILE`. Loadout/fairness `is not in your file`
is left mixed case — those tests require authored names plus the sentence.

**Proof.** `tests/endgame.test.ts`: file.ts must `class="c">NOT IN YOUR FILE`
and must not `class="c">not in your file`. Mutation: mixed case again — 1 fail.

## Stage 394 — A gated node said needs Depth

**Goal.** Stage 393 taught `(LOCKED)`. A Depth-gated ledger node still dimmed
`needs Depth 12` on the row and the hex tooltip.

**What changed.** `NEEDS DEPTH` in both places.

**Proof.** `tests/endgame.test.ts`: file.ts must `NEEDS DEPTH ${` and must not
`needs Depth ${`. Mutation: mixed case again — 1 fail.

## Stage 393 — A locked chip said (locked)

**Goal.** Stage 392 taught the alias placeholder. A chip or firmware above your
mastery still tagged `(locked)`.

**What changed.** `(LOCKED)` on both option lists.

**Proof.** `tests/endgame.test.ts`: file.ts must ` (LOCKED)` and must not
` (locked)`. Mutation: lowercase again — 1 fail.

## Stage 392 — An alias field said a name the city may call you

**Goal.** Stage 391 taught `(G OPENS THE WHOLE GRAPH)`. Setting an alias still
showed `a name the city may call you`.

**What changed.** `A NAME THE CITY MAY CALL YOU`.

**Proof.** `tests/endgame.test.ts`: file.ts must the CRT placeholder and must
not the sentence-case placeholder. Mutation: lowercase again — 1 fail.
`npm test` 1161/1161.

## Stage 391 — The graph hint said G opens the whole graph

**Goal.** Stage 390 taught the EXPLORE how-to. FILE still dimmed
`(G opens the whole graph)`.

**What changed.** `(G OPENS THE WHOLE GRAPH)`.

**Proof.** `tests/endgame.test.ts`: file.ts must `(G OPENS THE WHOLE GRAPH)`
and must not `(G opens the whole graph)`. Mutation: lowercase again — 1 fail.
`npm test` 1160/1160.

## Stage 390 — EXPLORE said travel to a district

**Goal.** Stage 389 taught `NOTHING ON THE RECORD`. The EXPLORE row still
dimmed `travel to a district from the MAP with the Threat live:`.

**What changed.** `TRAVEL TO A DISTRICT FROM THE MAP WITH THE THREAT LIVE:`.

**Proof.** `tests/campaign.test.ts`: campaign.ts must the CRT line and must not
the mixed-case line. Mutation: lowercase again — 1 fail.
`npm test` 1159/1159.

## Stage 389 — Empty TESTIMONY said nothing on the record

**Goal.** Stage 388 taught `TELL A FRIEND THE CODE`. A file with no testimony
still dimmed `— nothing on the record —`.

**What changed.** `— NOTHING ON THE RECORD —`.

**Proof.** `tests/campaign.test.ts`: campaign.ts must `NOTHING ON THE RECORD`
and must not `nothing on the record`. Mutation: lowercase again — 1 fail.
`npm test` 1158/1158.

## Stage 388 — The crew share line said tell a friend the code

**Goal.** Stage 387 taught `THE HOST HOLDS THE TERMINALS`. The same line still
ended `tell a friend the code`.

**What changed.** `TELL A FRIEND THE CODE`.

**Proof.** `tests/campaign.test.ts`: campaign.ts must `TELL A FRIEND THE CODE`
and must not `tell a friend the code`. Mutation: lowercase again — 1 fail.

## Stage 387 — A crew guest said the host holds the terminals

**Goal.** Stage 386 taught `YOU HOLD THE TERMINALS`. A guest still dimmed
`the host holds the terminals`.

**What changed.** `THE HOST HOLDS THE TERMINALS`.

**Proof.** `tests/campaign.test.ts`: campaign.ts must `THE HOST HOLDS THE TERMINALS`
and must not `"the host holds the terminals"`. Mutation: lowercase again — 1 fail.

## Stage 386 — A crew host said you hold the terminals

**Goal.** Stage 385 taught the join how-to. A crew host still dimmed
`you hold the terminals`.

**What changed.** `YOU HOLD THE TERMINALS`.

**Proof.** `tests/campaign.test.ts`: campaign.ts must `YOU HOLD THE TERMINALS`
and must not `"you hold the terminals"`. Mutation: lowercase again — 1 fail.
`npm test` 1155/1155.

## Stage 385 — The crew how-to said or RUN WITH A CREW on a contract

**Goal.** Stage 384 taught the sandbox graph footer. Joining a crew still dimmed
`or RUN WITH A CREW on a contract above and read the code out`.

**What changed.** `OR RUN WITH A CREW ON A CONTRACT ABOVE AND READ THE CODE OUT`.

**Proof.** `tests/campaign.test.ts`: campaign.ts must the CRT line and must not
the mixed-case line. Mutation: lowercase again — 1 fail.
`npm test` 1154/1154.

## Stage 384 — The Ledger Graph sandbox said sandbox: every node

**Goal.** Stage 383 taught the shop footer. Offline, the graph still said
`sandbox: every node is in the file — click to attest`.

**What changed.** `SANDBOX: EVERY NODE IS IN THE FILE — CLICK TO ATTEST`.

**Proof.** `tests/endgame.test.ts`: file.ts must the CRT line and must not the
sentence-case line. Mutation: lowercase again — 1 fail.
`npm test` 1153/1153.

## Stage 383 — The Ledger Graph said click a leased node

**Goal.** Stage 382 taught `NO ONE ANSWERS`. The Ledger Graph footer, with a
shop, still said `click a leased node to buy it with Scrip (violet → green);
click an owned node to attest it`.

**What changed.** The same sentence, CRT.

**Proof.** `tests/endgame.test.ts`: file.ts must the CRT line and must not
`click a leased node to buy it with Scrip`. Mutation: lowercase again — 1 fail.
`npm test` 1152/1152.

## Stage 382 — A re-leased fixer said no one answers

**Goal.** Stage 381 taught `NO CONTRACTS ON OFFER`. A dead handler still dimmed
`no one answers`.

**What changed.** `NO ONE ANSWERS`.

**Proof.** `tests/campaign.test.ts`: campaign.ts must `NO ONE ANSWERS` and must not
`no one answers`. Mutation: lowercase again — 1 fail.

## Stage 381 — An empty fixer board said no contracts on offer

**Goal.** Stage 370 taught CRT empty states. A fixer with nothing on offer still
dimmed `no contracts on offer · 2 closed`.

**What changed.** `NO CONTRACTS ON OFFER` and `CLOSED`.

**Proof.** `tests/campaign.test.ts`: campaign.ts must those CRT tokens and must not
the sentence-case pair. Mutation: lowercase again — 1 fail.

## Stage 380 — The counter chain label said chain

**Goal.** Stage 379 taught the prizes how-to. COUNTER-LEDGER still dimmed
`DEVNET · chain 8899`.

**What changed.** ` · CHAIN ` + chainId.

**Proof.** `tests/endgame.test.ts`: file.ts must `" · CHAIN " + info.chainId`
and must not `" · chain " + info.chainId`. Mutation: lowercase again — 1 fail.
`npm test` 1149/1149.

## Stage 379 — The prizes how-to said THE RUN settles nightly

**Goal.** Stage 378 taught the Ledger Market heading. PRIZES still dimmed
`THE RUN settles nightly, Audit placements weekly, Deep Wake contributions
at season end; claims are sponsored`.

**What changed.** The same sentence, CRT.

**Proof.** `tests/endgame.test.ts`: file.ts must the CRT line and must not
`THE RUN settles nightly, Audit placements weekly`. Mutation: lowercase
again — 1 fail.
`npm test` 1148/1148.

## Stage 378 — The Ledger Market heading said settles only in

**Goal.** Stage 377 taught `LISTED BY`. The market heading still wrote
`settles only in $CAPITAL · 5% fee: 2% burned, 2% treasury, 1% creator`.

**What changed.** The same line, CRT.

**Proof.** `tests/endgame.test.ts`: file.ts must the CRT heading and must not
`LEDGER MARKET · settles only in`. Mutation: lowercase again — 1 fail.
`npm test` 1147/1147.

## Stage 377 — A market row said listed by

**Goal.** Stage 376 taught the other-book manifesto. A Ledger Market listing
still wrote `listed by YOU` / `listed by 0x…`.

**What changed.** `LISTED BY`.

**Proof.** `tests/endgame.test.ts`: file.ts must `LISTED BY` on the row and must
not `listed by ${mine`. Mutation: lowercase again — 1 fail.
`npm test` 1146/1146.

## Stage 376 — The other book was sentence case

**Goal.** Stage 375 taught `UNITS SETTLE NIGHTLY`. The manifesto still dimmed
`VANTAGE priced you. This is the other book.`

**What changed.** The same four sentences, CRT.

**Proof.** `tests/endgame.test.ts`: file.ts must `VANTAGE PRICED YOU. THIS IS THE OTHER BOOK.`
and must not the sentence-case pair. Mutation: lowercase again — 1 fail.

## Stage 375 — Units settle nightly was sentence case

**Goal.** Stage 374 taught `BELOW DEPTH ${RUN_DEPTH} THE RUN PAYS SCRIP`. The
settlement how-to still dimmed `units settle nightly at up to`.

**What changed.** The same sentence, CRT.

**Proof.** `tests/endgame.test.ts`: file.ts must `UNITS SETTLE NIGHTLY AT UP TO` and
must not `units settle nightly at up to`. Mutation: lowercase again — 1 fail.

## Stage 374 — A Depth-gated RUN said the run pays Scrip

**Goal.** Stage 373 taught the private-room invite. Below the Depth gate THE RUN
still dimmed `below Depth ${RUN_DEPTH} the run pays Scrip`.

**What changed.** `BELOW DEPTH ${RUN_DEPTH} THE RUN PAYS SCRIP`.

**Proof.** `tests/endgame.test.ts`: file.ts must the CRT line and must not the
sentence-case line. Mutation: lowercase again — 1 fail.
`npm test` 1143/1143.

## Stage 373 — A private-room invite said give it to whoever you want in

**Goal.** Stage 372 taught the sink how-to. Opening a private room still dimmed
`give it to whoever you want in; it is the only way in`.

**What changed.** `GIVE IT TO WHOEVER YOU WANT IN; IT IS THE ONLY WAY IN`.

**Proof.** `tests/endgame.test.ts`: file.ts must the CRT line and must not the
sentence-case line. Mutation: lowercase again — 1 fail.
`npm test` 1142/1142.

## Stage 372 — The sink how-to said both burned in full

**Goal.** Stage 371 taught the ENDGAME no-host dim. Linked sinks still dimmed
`both burned in full; a pass is cosmetics, an hour is a server of your own —
a private room banks Scrip, never $CAPITAL`.

**What changed.** The same sentence, CRT.

**Proof.** `tests/endgame.test.ts`: file.ts must the CRT line and must not
`both burned in full; a pass is cosmetics`. Mutation: lowercase again — 1 fail.
`npm test` 1141/1141.

## Stage 371 — ENDGAME without a host said contracts, Audits

**Goal.** Stage 370 taught THE RUN's unlinked dim. Opening FILE with no ledger
host still dimmed `contracts, Audits, the Deep Wake and Rewrite need a ledger
host (link a room or open with ?shop=)`.

**What changed.** `CONTRACTS, AUDITS, THE DEEP WAKE AND REWRITE NEED A LEDGER
HOST (LINK A ROOM OR OPEN WITH ?SHOP=)`.

**Proof.** `tests/endgame.test.ts`: file.ts must the CRT line and must not
`contracts, Audits, the Deep Wake`. Mutation: lowercase again — 1 fail.
`npm test` 1140/1140.

## Stage 370 — THE RUN's unlinked dim was sentence case

**Goal.** Stage 369 taught MAP's empty history. An unlinked FILE still dimmed
`THE RUN pays the wallet: link one and the units you bank at a gate settle into $CAPITAL.`

**What changed.** The same sentence, CRT.

**Proof.** `tests/endgame.test.ts`: file.ts must the CRT line and must not
`THE RUN pays the wallet:`. Mutation: lowercase again — 1 fail.

## Stage 369 — MAP said no rounds have moved the graph yet

**Goal.** Stage 223 taught Deep Wake history titles. An empty MAP history still
dimmed `no rounds have moved the graph yet`.

**What changed.** `NO ROUNDS HAVE MOVED THE GRAPH YET`.

**Proof.** `tests/endgame.test.ts`: hud.ts must that CRT line and must not the
sentence-case line. Mutation: lowercase again — 1 fail.

## Stage 368 — An unlinked wallet how-to was sentence case

**Goal.** Stage 367 taught `$CAPITAL BY LENGTH, BURNED`. `[LINK A WALLET]`
still dimmed `Robinhood Wallet · WalletConnect · injected`.

**What changed.** `ROBINHOOD WALLET · WALLETCONNECT · INJECTED`.

**Proof.** `tests/endgame.test.ts`: file.ts must the CRT line and must not the
sentence-case line. Mutation: lowercase again — 1 fail.
`npm test` 1138/1138.

## Stage 367 — A name fee said by length, burned

**Goal.** Stage 366 taught `THE REGISTRY OPENS AT DEPTH`. Writing a name
still dimmed `$CAPITAL by length, burned`.

**What changed.** `$CAPITAL BY LENGTH, BURNED`.

**Proof.** `tests/endgame.test.ts`: file.ts must `$CAPITAL BY LENGTH, BURNED`
and must not `$CAPITAL by length, burned`. Mutation: lowercase again — 1 fail.
`npm test` 1137/1137.

## Stage 366 — A closed name registry said the registry opens at Depth

**Goal.** Stage 365 taught `WRITTEN WHERE THEY CAN'T REDACT IT`. A linked
file below Depth 50 still dimmed `the registry opens at Depth 50`.

**What changed.** `THE REGISTRY OPENS AT DEPTH ${NAME_DEPTH}`.

**Proof.** `tests/endgame.test.ts`: file.ts must the CRT line and must not the
sentence-case line. Mutation: lowercase again — 1 fail.
`npm test` 1136/1136.

## Stage 365 — A written name said written where they can't redact it

**Goal.** Stage 364 taught `ONE SIWE STATEMENT; THE GHOSTFILE MINTS WITH
SPONSORED GAS`. A linked file that already has a name still dimmed
`written where they can't redact it`.

**What changed.** `WRITTEN WHERE THEY CAN'T REDACT IT`.

**Proof.** `tests/endgame.test.ts`: file.ts must the CRT line and must not the
sentence-case line. Mutation: lowercase again — 1 fail.
`npm test` 1135/1135.

## Stage 364 — SIWE how-to was sentence case

**Goal.** Stage 363 taught `FETCHING THE CHAIN CLIENT…`. Signing the link still
dimmed `one SIWE statement; the Ghostfile mints with sponsored gas`.

**What changed.** `ONE SIWE STATEMENT; THE GHOSTFILE MINTS WITH SPONSORED GAS`.

**Proof.** `tests/endgame.test.ts`: file.ts must the CRT line and must not the
sentence-case line. Mutation: lowercase again — 1 fail.

## Stage 363 — The counter said fetching the chain client

**Goal.** Stage 362 taught treasury `LOADING…`. Waiting for the chain client still
dimmed `COUNTER-LEDGER // fetching the chain client…`.

**What changed.** `FETCHING THE CHAIN CLIENT…`.

**Proof.** `tests/endgame.test.ts`: file.ts must `FETCHING THE CHAIN CLIENT…` and must
not `fetching the chain client`. Mutation: lowercase again — 1 fail.

## Stage 362 — A missing treasury said loading

**Goal.** Stage 361 taught Audit `LOADING…`. The counter still fell back to
`loading…` when treasury was missing.

**What changed.** `LOADING…`.

**Proof.** `tests/endgame.test.ts`: file.ts must `info?.reason ?? "LOADING…"` and
must not `"loading…"`. Mutation: lowercase again — 1 fail.
`npm test` 1132/1132.

## Stage 361 — A waiting Audit said loading

**Goal.** Stage 360 taught `LOADING THE BOARD…`. An Audit with no playlist still
dimmed `loading…`.

**What changed.** `LOADING…`.

**Proof.** `tests/endgame.test.ts`: after `joinAudit`, file.ts must `LOADING…` and
must not `loading…`. Mutation: lowercase again — 1 fail.
`npm test` 1131/1131.

## Stage 360 — Waiting contracts said loading the board

**Goal.** Stage 359 taught `NO LINES YET`. Daily contracts with no rows yet still
dimmed `loading the board…`.

**What changed.** `LOADING THE BOARD…`.

**Proof.** `tests/endgame.test.ts`: file.ts must `LOADING THE BOARD…` and must not
`loading the board…`. Mutation: lowercase again — 1 fail.
`npm test` 1130/1130.

## Stage 359 — An empty ledger said no lines yet

**Goal.** Stage 358 taught `NO LISTINGS`. An empty FILE ledger still dimmed
`no lines yet`.

**What changed.** `NO LINES YET`.

**Proof.** `tests/endgame.test.ts`: file.ts must `NO LINES YET` and must not
`no lines yet`. Mutation: lowercase again — 1 fail.
`npm test` 1129/1129.

## Stage 358 — An empty market said no listings

**Goal.** Stage 357 taught `NO SCORES YET THIS WEEK`. An empty Ledger Market still
dimmed `no listings`.

**What changed.** `NO LISTINGS`.

**Proof.** `tests/endgame.test.ts`: file.ts must `NO LISTINGS` and must not `no listings`.
Mutation: lowercase again — 1 fail.

## Stage 357 — An empty Audit board said no scores yet this week

**Goal.** Stage 354 taught `NOT PLAYED YET`. An empty leaderboard still dimmed
`no scores yet this week`.

**What changed.** `NO SCORES YET THIS WEEK`.

**Proof.** `tests/endgame.test.ts`: file.ts must `NO SCORES YET THIS WEEK` and must not
`no scores yet this week`. Mutation: lowercase again — 1 fail.

## Stage 356 — FILE identity said files on you

**Goal.** Stage 342 taught `1 FILE ON YOU` on the HUD and ledger. FILE's identity
row still wrote `(2 files on you)`.

**What changed.** `filesWord(...) ON YOU`.

**Proof.** `tests/identity.test.ts`: file.ts must `filesWord(v.identity.debt.kills)} ON YOU`
and must not `files on you`. Mutation: lowercase files on you again — 1 fail.
`npm test` 1126/1126.

## Stage 355 — An empty rig said nothing on the rig yet

**Goal.** Stage 354 taught `NOT PLAYED YET`. An empty cosmetics rig still dimmed
`nothing on the rig yet`.

**What changed.** `NOTHING ON THE RIG YET`.

**Proof.** `tests/endgame.test.ts`: file.ts must `NOTHING ON THE RIG YET` and must
not `nothing on the rig yet`. Mutation: sentence-case again — 1 fail.
`npm test` 1126/1126.

## Stage 354 — An unplayed Audit said not played yet

**Goal.** Stage 353 taught `NONE POSTED`. An Audit never joined still dimmed
`not played yet`.

**What changed.** `NOT PLAYED YET`.

**Proof.** `tests/endgame.test.ts`: file.ts must `"NOT PLAYED YET"` and must not
`"not played yet"`. Mutation: sentence-case again — 1 fail.
`npm test` 1125/1125.

## Stage 353 — No prizes said none posted

**Goal.** Stage 352 taught `EMPTY`. A wallet with no prize still dimmed
`none posted for this wallet`.

**What changed.** `NONE POSTED FOR THIS WALLET`.

**Proof.** `tests/endgame.test.ts`: file.ts must `NONE POSTED FOR THIS WALLET` and
must not `none posted for this wallet`. Mutation: sentence-case again — 1 fail.
`npm test` 1124/1124.

## Stage 352 — An empty preset said empty

**Goal.** Stage 351 taught `1 SLOT`. An unused preset or alias still dimmed `empty`.

**What changed.** `EMPTY`.

**Proof.** `tests/endgame.test.ts`: file.ts must `class='dim'>EMPTY` and must not
`class='dim'>empty`. Mutation: lowercase empty again — 1 fail.

## Stage 351 — One shop slot was SLOTS

**Goal.** Stage 347 taught `1 STAMP`. FILE still headed `PRESETS · 1 SLOTS` and
`ALIASES · 1 SLOTS`. A new file has one of each.

**What changed.** `slotsWord`: `1 SLOT`, `2 SLOTS`. Both headings call it.

**Proof.** `tests/endgame.test.ts`: `slotsWord(1)` is `1 SLOT`. file.ts must
`slotsWord(slots.presets)` / `slotsWord(slots.aliases)` and must not
`slots.presets} SLOTS`. Mutation: always SLOTS — 1 fail.

## Stage 350 — One banked unit was UNITS OWED

**Goal.** Stage 349 taught `OWED 1 UNIT`. Banking still wrote `1 UNITS OWED` on
the ledger.

**What changed.** `unitsWord`: `1 UNIT`, `2 UNITS`. The bank line calls it.

**Proof.** `tests/run.test.ts`: `unitsWord(1)` is `1 UNIT`. room.ts must
`unitsWord(paid)} OWED` and must not `${paid} UNITS OWED`. Mutation: always
UNITS — 1 fail.
`npm test` 1121/1121.

## Stage 349 — One owed was UNITS

**Goal.** Stage 346 taught `1 UNIT DROPPED`. THE RUN strip and FILE still wrote
`OWED 1 UNITS`.

**What changed.** `unitsLabel`: `UNIT` / `UNITS`. The strip and the FILE tab call it.

**Proof.** `tests/runcue.test.ts`: `unitsLabel(1)` is `UNIT`. hud.ts must
`unitsLabel(v.owed)` and must not `v.owed}</b> UNITS`. Mutation: always UNITS —
1 fail.
`npm test` 1120/1120.

## Stage 348 — One try was TRIES

**Goal.** Stage 347 taught `1 STAMP`. Giving up the seat still said
`AFTER 1 TRIES`.

**What changed.** `triesWord`: `1 TRY`, `2 TRIES`. The LINK LOST line calls it.

**Proof.** `tests/rejoin.test.ts`: `triesWord(1)` is `1 TRY`. game.ts must
`triesWord(this.rejoins)` and must not `this.rejoins} TRIES`. Mutation: always
TRIES — 1 fail.
`npm test` 1119/1119.

## Stage 347 — One stamp was STAMPS

**Goal.** Stage 338 taught `1 DEATH`. The dossier still wrote `1 STAMPS`, and
Rewrite still wrote `1 STAMPS KEPT`.

**What changed.** `stampsWord`: `1 STAMP`, `2 STAMPS`. The dossier and the rewrite
ledger both call it.

**Proof.** `tests/identity.test.ts`: `stampsWord(1)` is `1 STAMP`. hud.ts must
`stampsWord(e.stamps)` and must not `e.stamps} STAMPS`. Mutation: always STAMPS —
1 fail.
`npm test` 1118/1118.

## Stage 346 — One unit dropped was UNITS

**Goal.** Stage 345 taught `1 CLAIM OUT`. Dying with one unit still logged
`◈ 1 UNITS DROPPED WHERE YOU FELL`.

**What changed.** `1 UNIT DROPPED`, `5 UNITS DROPPED`.

**Proof.** `tests/runcue.test.ts`: drop of 1 is `◈ 1 UNIT DROPPED WHERE YOU FELL`. Source
must not `${m.value} UNITS DROPPED`. Mutation: always UNITS — 1 fail.

## Stage 345 — One claim was CLAIMS OUT

**Goal.** Stage 340 taught `1 PULL`. THE RUN strip still said `1 CLAIMS OUT`.

**What changed.** `claimsWord`: `1 CLAIM OUT`, `2 CLAIMS OUT`.

**Proof.** `tests/runcue.test.ts`: `claimsWord(1)` is `1 CLAIM OUT`. hud.ts must
`claimsWord(v.claims)` and must not `v.claims} CLAIMS OUT`. Mutation: always CLAIMS —
1 fail.

## Stage 344 — One mech was MECHS

**Goal.** Stage 343 taught `1 WASP`. Threat and contract notes still said
`1 MECHS`.

**What changed.** `mechsWord`: `1 MECH`, `2 MECHS`. Both notes call it.

**Proof.** `tests/hold.test.ts`: `mechsWord(1)` is `1 MECH`. campaign.ts must
`mechsWord(t.mechs)` and must not `t.mechs} MECHS`. Mutation: always MECHS — 1 fail.
`npm test` 1116/1116.

## Stage 343 — One wasp was WASPS

**Goal.** Stage 342 taught `1 FILE`. A wave still stamped `◆ VANTAGE RESPONDS — 1 WASPS`.

**What changed.** `waspsWord`: `1 WASP`, `2 WASPS`. The stamp and the threat/contract
notes call it.

**Proof.** `tests/hold.test.ts`: `waspsWord(1)` is `1 WASP`. campaign.ts must
`waspsWord(ev.count)` and must not `ev.count} WASPS`. Mutation: always WASPS — 1 fail.
`npm test` 1115/1115.

## Stage 342 — One file was FILES

**Goal.** Stage 338 taught `1 DEATH`. A Debt still said `1 FILES ON YOU` on the
banner, the log and the ledger.

**What changed.** `filesWord`: `1 FILE`, `2 FILES`. HUD and room both call it.

**Proof.** `tests/identity.test.ts`: `filesWord(1)` is `1 FILE`. game.ts must
`filesWord(m.kills)` and must not `m.kills} FILES`. Mutation: always FILES — 1 fail.
`npm test` 1114/1114.

## Stage 341 — A dummy re-lease quoted the rest in sentence case

**Goal.** Stage 320 CRT-cased the private-room admit line. A dummy coming back still
stamped `◆ VANTAGE RE-LEASE — DUMMY-00 back on the ledger`.

**What changed.** `BACK ON THE LEDGER`.

**Proof.** `tests/kill.test.ts`: source must `BACK ON THE LEDGER` on that stamp and
must not `back on the ledger`. Mutation: sentence-case rest again — 1 fail.
`npm test` 1113/1113.

## Stage 340 — One pull was PULLS

**Goal.** Stage 339 taught `1 KILL`. The same YOU line still said `1 PULLS`.

**What changed.** `pullsWord`: `1 PULL`, `2 PULLS`.

**Proof.** `tests/round.test.ts`: `pullsWord(1)` is `1 PULL`. Source must
`pullsWord(stats.flips)` and must not `stats.flips} PULLS`. Mutation: always PULLS —
1 fail.

## Stage 339 — One kill was KILLS

**Goal.** Stage 338 taught `1 DEATH`. The same YOU line still said `1 KILLS`.

**What changed.** `killsWord`: `1 KILL`, `3 KILLS`.

**Proof.** `tests/round.test.ts`: `killsWord(1)` is `1 KILL`. Source must
`killsWord(stats.kills)` and must not `stats.kills} KILLS`. Mutation: always KILLS —
1 fail.

## Stage 338 — One death was DEATHS

**Goal.** Stage 337 CRT-cased `41 S ON NODES`. The same card still wrote
`1 DEATHS`. `probe:stage5` asserted that form.

**What changed.** `deathsWord` prints `1 DEATH` / `2 DEATHS`. The card calls it.
The probe now expects `1 DEATH`.

**Proof.** `tests/round.test.ts`: `deathsWord(1)` is `1 DEATH`. round.ts must
`deathsWord(stats.deaths)`. Mutation: always `DEATHS` — 1 fail.
`npm test` 1110/1110.

## Stage 337 — ON NODES suffixed seconds as s

**Goal.** Stage 336 CRT-cased `NEXT ROUND IN 13S`. The same card still wrote
`41 s ON NODES`. `probe:stage5` asserted that form.

**What changed.** `nodeSecondsLine` prints `41 S ON NODES`. The card calls it.
The probe now expects `S`.

**Proof.** `tests/round.test.ts`: `nodeSecondsLine(41.4)` is `41 S ON NODES`.
round.ts must `nodeSecondsLine(stats.nodeSeconds)`. Mutation: lowercase s
again — 1 fail.
`npm test` 1109/1109.

## Stage 336 — NEXT ROUND IN suffixed the wait as s

**Goal.** Stage 335 CRT-cased the hold clock. The results card still wrote
`NEXT ROUND IN 13s`. `probe:stage5` asserted that lowercase form.

**What changed.** `nextRoundLine` prints `NEXT ROUND IN 13S`. The card calls it.
The probe now expects `S`.

**Proof.** `tests/round.test.ts`: `nextRoundLine(13)` is `NEXT ROUND IN 13S`.
round.ts must `nextRoundLine(left)`. `probe:stage5` expects `S`. Mutation:
lowercase s again — 1 fail.
`npm test` 1108/1108.

## Stage 335 — Campaign hold/survive suffixed the clock as s

**Goal.** Stage 334 CRT-cased `RE-LEASING IN 3S`. A hold still wrote `12s / 20s`
on the objective strip.

**What changed.** `holdClock` prints `12S / 20S`. Offline and co-op both call it.

**Proof.** `tests/hold.test.ts`: `holdClock(12.9, 20)` is `12S / 20S`. campaign.ts
must `holdClock(v.progress, v.need)` and must not the lowercase template.
Mutation: lowercase s again — 1 fail.
`npm test` 1107/1107.

## Stage 334 — RE-LEASING IN suffixed the wait as s

**Goal.** Stage 328 CRT-cased `REJOINING IN 0.5S`. The death stamp still said
`◆ FILE CLOSED — RE-LEASING IN 3s`.

**What changed.** `3S` on both FILE CLOSED lines.

**Proof.** `tests/kill.test.ts`: game.ts must `RE-LEASING IN 3S` and must not
`RE-LEASING IN 3s`. Mutation: lowercase s again — 1 fail.

## Stage 333 — FILE CLOSED BY suffixed metres as m

**Goal.** Stage 332 CRT-cased the nodefoot as `M`. The death stamp still said
`◆ FILE CLOSED BY VANTAGE-04 · 12 m — RE-LEASING IN 3s`.

**What changed.** `${d.toFixed(0)} M`.

**Proof.** `tests/kill.test.ts`: game.ts must `} M` and must not `} m` on that
distance. Mutation: lowercase m again — 1 fail.
`npm test` 1105/1105.

## Stage 332 — The nodefoot suffixed distance as m

**Goal.** Stage 266 CRT-cased WASP LIVE as `M`. Approaching a node still wrote
` · 12 m`.

**What changed.** `${r.distance.toFixed(0)} M`.

**Proof.** `tests/node.test.ts`: hud.ts must `} M` and must not `} m` on the
distance. Mutation: lowercase m again — 1 fail.
`npm test` 1104/1104.

## Stage 331 — FLIP / LOCK IN suffixed the wait as s

**Goal.** Stage 328 CRT-cased `REJOINING IN 0.5S`. Standing on a node still said
`FLIP IN 2.4s` / `LOCK IN 1.0s`.

**What changed.** `nodeClockNote` prints ` · FLIP IN 2.4S`. The nodefoot calls it.

**Proof.** `tests/node.test.ts`: `nodeClockNote("flip", 2.4)` is ` · FLIP IN 2.4S`.
hud.ts must `nodeClockNote(r.toward, r.seconds)`. Mutation: lowercase s again — 1 fail.
`npm test` 1103/1103.

## Stage 330 — The RANGE ledger suffixed times as s

**Goal.** Stage 326 CRT-cased the RANGE log as `5.55S`. `recordGhost` still wrote
`RANGE · DEADLETTER OFFICE (HUB) · 12.50s · FIRST RUN` and `11.00s (−1.50s)`.

**What changed.** `${run.seconds.toFixed(2)}S` and the improvement delta the same way.

**Proof.** `tests/identity.test.ts`: first run is `12.50S · FIRST RUN`; a faster run
is `11.00S (−1.50S)`. Mutation: lowercase s again — 1 fail.
`npm test` 1102/1102.

## Stage 329 — Kill TTK suffixed the time as s

**Goal.** Stage 326 CRT-cased RANGE times as `5.55S`. A kill log still wrote
`· TTK 0.80s`.

**What changed.** `ttkNote` prints ` · TTK 0.80S`. Both the wire log and the offline log
call it.

**Proof.** `tests/kill.test.ts`: `ttkNote(0.8)` is ` · TTK 0.80S`. game.ts must
`ttkNote(ev.ttkTicks / SIM_HZ)` and `ttkNote(ev.ttkSeconds)`. Mutation: the lowercase
suffix again — 1 fail.

## Stage 328 — REJOINING IN suffixed the wait as s

**Goal.** Stage 327 CRT-cased the RANGE alert. Knocking after a drop still
pushed `LINK LOST · REJOINING IN 0.5s · TRY 1 OF 6`.

**What changed.** `${(wait / 1000).toFixed(1)}S`.

**Proof.** `tests/roomlabel.test.ts`: source must `REJOINING IN ${(wait / 1000).toFixed(1)}S`
and must not `}s` on that line. Mutation: lowercase s again — 1 fail.
`npm test` 1100/1100.

## Stage 327 — The RANGE alert suffixed times as s

**Goal.** Stage 326 CRT-cased the RANGE log. The stamp still said
`◆ RANGE RECORD — 5.55s`.

**What changed.** `${run.seconds.toFixed(2)}S` on both RANGE RECORD and RANGE.

**Proof.** `tests/roomlabel.test.ts`: source must `RANGE RECORD — ${run.seconds.toFixed(2)}S`
and must not `}s` on that line. Mutation: lowercase s again — 1 fail.
`npm test` 1099/1099.

## Stage 326 — The RANGE log suffixed times as s

**Goal.** Stage 323 CRT-cased `1h` as `1H`. Finishing a range ghost still pushed
`RANGE · 5.55s · NEW BEST`.

**What changed.** `${run.seconds.toFixed(2)}S` and the BEST time the same way.

**Proof.** `tests/roomlabel.test.ts`: source must `RANGE · ${run.seconds.toFixed(2)}S`
and must not `}s` on that line. Mutation: lowercase s again — 1 fail.
`npm test` 1098/1098.

## Stage 325 — An Audit playlist quoted its line in sentence case

**Goal.** Stage 321 CRT-cased THE RUN's admit line. Joining PELLET WEEK still
pushed `AUDIT · PELLET WEEK · Repo Hammer and Clockeater only. Every file is a shotgun file.`

**What changed.** The eight playlist lines are CRT. The HUD and FILE tab already
interpolate `audit.line`.

**Proof.** `tests/endgame.test.ts`: every `AUDITS[].line` equals its uppercase;
PELLET WEEK is `REPO HAMMER AND CLOCKEATER ONLY. EVERY FILE IS A SHOTGUN FILE.`
Mutation: the sentence-case PELLET WEEK line again — 1 fail.
`npm test` 1097/1097.

## Stage 324 — LINKING wrote sim / ms rtt / loss

**Goal.** Stage 298 CRT-cased the drop line. A simulated link still wrote
`LINKING ws://… (sim 80ms rtt, 5% loss)`. The URL is the path, not the join line;
the suffix is CRT.

**What changed.** `linkingSimNote` prints ` (SIM 80MS RTT, 5% LOSS)`.

**Proof.** `tests/roomlabel.test.ts`: latency 50 / loss 0.1 is ` (SIM 100MS RTT, 10% LOSS)`.
game.ts must `linkingSimNote(cfg.sim)` and must not interpolate `(sim ${cfg.sim.latencyMs`.
Mutation: the lowercase suffix again — 1 fail.

## Stage 323 — PRIVATE ROOM · CODE suffixed hours as h

**Goal.** Stage 320 CRT-cased the private-room admit line. Opening one still
said `PRIVATE ROOM · CODE ABCD · 1h`.

**What changed.** `${hours}H`.

**Proof.** `tests/counter.test.ts`: source must `CODE ${r.code} · ${hours}H` and
must not `${hours}h` on that line. Mutation: lowercase h again — 1 fail.
`npm test` 1095/1095.

## Stage 322 — An empty attested list said none

**Goal.** Stage 301 taught FILE `weaponName`. The join FILE line still fell back
to `none` when nothing was attested: `ATTESTED [none]`.

**What changed.** `|| "NONE"`.

**Proof.** `tests/roomlabel.test.ts`: source must `|| "NONE"` on the attested join
and must not `|| "none"`. Mutation: lowercase none again — 1 fail.
`npm test` 1094/1094.

## Stage 321 — THE RUN quoted the rest in sentence case

**Goal.** Stage 320 CRT-cased the private-room admit line. Joining THE RUN still
pushed `THE RUN · carry the claims to a gate; die and they drop`.

**What changed.** `THE RUN · CARRY THE CLAIMS TO A GATE; DIE AND THEY DROP`.

**Proof.** `tests/roomlabel.test.ts`: source must that CRT line and must not
`THE RUN · carry the claims`. Mutation: sentence-case rest again — 1 fail.
`npm test` 1093/1093.

## Stage 320 — PRIVATE ROOM quoted the rest in sentence case

**Goal.** Stage 298 CRT-cased the drop line. Joining a private room still pushed
`PRIVATE ROOM · the buyer's rules and invite list · banks Scrip, never $CAPITAL`.

**What changed.** `PRIVATE ROOM · THE BUYER'S RULES AND INVITE LIST · BANKS SCRIP, NEVER $CAPITAL`.

**Proof.** `tests/roomlabel.test.ts`: source must that CRT line and must not
`PRIVATE ROOM · the buyer's rules`. Mutation: sentence-case rest again — 1 fail.
`npm test` 1092/1092.

## Stage 319 — LINKED quoted a host note in sentence case

**Goal.** Stage 309 CRT-cased `LINK REFUSED`. A successful link that still carries a
reason interpolated it as written: `LINKED · 0xabc… · already bound`.

**What changed.** The success note uses `crtPhrase(r.reason)`.

**Proof.** `tests/counter.test.ts`: source must `+ crtPhrase(r.reason)` on the LINKED
line. Mutation: concatenate `r.reason` raw — 1 fail.

## Stage 318 — COUNTER-LEDGER quoted the catch as written

**Goal.** Stage 317 CRT-cased a thrown sink. Fetching `/counter` that throws still
interpolated `String(e)`: `COUNTER-LEDGER: TypeError: Failed to fetch`.

**What changed.** `COUNTER-LEDGER: ${crtPhrase(String(e).slice(0, 100))}`.

**Proof.** `tests/counter.test.ts`: source must `COUNTER-LEDGER: ${crtPhrase(` and must not
`COUNTER-LEDGER: ${String(e)}`. Mutation: interpolate String(e) — 1 fail.

## Stage 317 — A thrown sink burn quoted FAILED in sentence case

**Goal.** Stage 316 CRT-cased a thrown counter op. Buying the Deep Wake pass or
room-hours that throw still interpolated the catch as written:
`DEEP WAKE SEASON 1 FAILED: Failed to fetch`.

**What changed.** `${label} FAILED: ${crtPhrase(reason)}`.

**Proof.** `tests/counter.test.ts`: source must `${label} FAILED: ${crtPhrase(` and
must not `${label} FAILED: ${reason}`. Mutation: interpolate the raw reason — 1 fail.
`npm test` 1089/1089.

## Stage 316 — A thrown counter op quoted FAILED in sentence case

**Goal.** Stage 315 CRT-cased `NAME FAILED`. Wear / reconcile / stamps that throw
still interpolated the catch as written: `WEAR FAILED: Failed to fetch`.

**What changed.** `${op.toUpperCase()} FAILED: ${crtPhrase(reason)}`.

**Proof.** `tests/counter.test.ts`: source must `${op.toUpperCase()} FAILED: ${crtPhrase(`
and must not `${op.toUpperCase()} FAILED: ${reason}`. Mutation: interpolate the raw
reason — 1 fail.
`npm test` 1088/1088.

## Stage 315 — NAME FAILED quoted the caught error in sentence case

**Goal.** Stage 314 CRT-cased `ROOM FAILED`. Registering a name that reverts still
interpolated the caught line as written: `NAME FAILED: User rejected the request.`

**What changed.** `NAME FAILED: ${crtPhrase(reason)}`.

**Proof.** `tests/counter.test.ts`: source must `NAME FAILED: ${crtPhrase(` and must not
`NAME FAILED: ${reason}`. Mutation: interpolate the raw reason — 1 fail.
`npm test` 1087/1087.

## Stage 314 — ROOM FAILED quoted the caught error in sentence case

**Goal.** Stage 313 CRT-cased `SELL FAILED`. Opening a private room that throws
still interpolated the caught line as written: `ROOM FAILED: Failed to fetch`.

**What changed.** `ROOM FAILED: ${crtPhrase(reason)}`.

**Proof.** `tests/counter.test.ts`: source must `ROOM FAILED: ${crtPhrase(` and must not
`ROOM FAILED: ${reason}`. Mutation: interpolate the raw reason — 1 fail.
`npm test` 1086/1086.

## Stage 313 — SELL FAILED quoted the caught error in sentence case

**Goal.** Stage 312 CRT-cased `BUY FAILED`. Listing a skin that reverts still interpolated
the caught line as written.

**What changed.** `SELL FAILED: ${crtPhrase(reason)}`.

**Proof.** `tests/counter.test.ts`: source must `SELL FAILED: ${crtPhrase(` and must not
`SELL FAILED: ${reason}`. Mutation: interpolate the raw reason — 1 fail.

## Stage 312 — BUY FAILED quoted the caught error in sentence case

**Goal.** Stage 311 CRT-cased `LINK FAILED`. A reverted market buy still interpolated the
caught line as written: `BUY FAILED: User rejected the request.`

**What changed.** `BUY FAILED: ${crtPhrase(reason)}`.

**Proof.** `tests/counter.test.ts`: source must `BUY FAILED: ${crtPhrase(` and must not
`BUY FAILED: ${reason}`. Mutation: interpolate the raw reason — 1 fail.

## Stage 311 — LINK FAILED quoted the caught error in sentence case

**Goal.** Stage 309 CRT-cased `LINK REFUSED`. A thrown SIWE still interpolated
the provider as written: `LINK FAILED: User rejected the request.`

**What changed.** `crtPhrase()` on the caught message. `LINK FAILED` interpolates it.

**Proof.** `tests/counter.test.ts`: `crtPhrase("User rejected the request.")` is
`USER REJECTED THE REQUEST.` Source must `crtPhrase(` on that line. Mutation:
interpolate the raw reason — 1 fail.
`npm test` 1083/1083.

## Stage 310 — ROOM REFUSED quoted the host in sentence case

**Goal.** Stage 309 CRT-cased `LINK REFUSED`. Opening a private room without a
wallet still said `ROOM REFUSED: link a wallet first: a private room is bought, not requested`.

**What changed.** `crtPhrase()` on the host reason. `ROOM REFUSED` interpolates it.

**Proof.** `tests/counter.test.ts`: `crtPhrase("link a wallet first: a private room is bought, not requested")`
is `LINK A WALLET FIRST: A PRIVATE ROOM IS BOUGHT, NOT REQUESTED`. Source must
`crtPhrase(` on that line. Mutation: interpolate the raw reason — 1 fail.
`npm test` 1082/1082.

## Stage 309 — LINK REFUSED quoted the host in sentence case

**Goal.** Stage 306 CRT-cased `WALLET REFUSED`. A refused SIWE still interpolated
the host as written: `LINK REFUSED: stale nonce`.

**What changed.** `crtPhrase()` on the host reason. `LINK REFUSED` interpolates it.

**Proof.** `tests/counter.test.ts`: `crtPhrase("stale nonce")` is `STALE NONCE`.
Source must `crtPhrase(` on that line. Mutation: interpolate the raw reason — 1 fail.
`npm test` 1081/1081.

## Stage 308 — NO WALLET left a sentence-case how-to

**Goal.** Stage 307 CRT-cased `(LOCAL ACCOUNT)`. Connecting with no injected
provider still said `NO WALLET: open in a browser with Robinhood Wallet…`.

**What changed.** `NO WALLET: OPEN IN A BROWSER WITH ROBINHOOD WALLET, METAMASK OR RABBY, OR LINK OVER WALLETCONNECT`.

**Proof.** `tests/counter.test.ts`: source must that CRT line and must not
`NO WALLET: open in a browser`. Mutation: sentence-case rest again — 1 fail.
`npm test` 1080/1080. Typecheck and the four lints green.

## Stage 307 — The wallet line said local account

**Goal.** Stage 306 CRT-cased `WALLET REFUSED`. A local-key wallet still said
`WALLET · 0xabc… (local account)`.

**What changed.** `(LOCAL ACCOUNT)`.

**Proof.** `tests/counter.test.ts`: source must `(LOCAL ACCOUNT)` and must not
`(local account)`. Mutation: lowercase again — 1 fail.

## Stage 306 — WALLET REFUSED quoted the provider in sentence case

**Goal.** Stage 302 CRT-cased `WEAR · OK`. Refusing a wallet still interpolated the
provider's English: `WALLET REFUSED: User rejected the request.`

**What changed.** `crtPhrase()` uppercases the reason. `WALLET REFUSED` interpolates it.

**Proof.** `tests/counter.test.ts`: `crtPhrase("User rejected the request.")` is
`USER REJECTED THE REQUEST.` Source must `crtPhrase(` on that line. Mutation: interpolate
the raw message — 1 fail.

## Stage 305 — A market list said token

**Goal.** Stage 304 CRT-cased `BOUGHT · LISTING`. Listing a skin still said
`LISTED · token 3 · 60 $CAPITAL`.

**What changed.** `LISTED · TOKEN ${token}`.

**Proof.** `tests/counter.test.ts`: source must `LISTED · TOKEN ${token}` and must not
`LISTED · token ${token}`. Mutation: lowercase token again — 1 fail.

## Stage 304 — A market buy said listing

**Goal.** Stage 302 CRT-cased `WEAR · OK`. A buy still wrote
`BOUGHT · listing 3` — sentence case in a CRT log.

**What changed.** `BOUGHT · LISTING ${listing}`.

**Proof.** `tests/counter.test.ts` requires `BOUGHT · LISTING` and refuses
`listing`. Mutation: lowercase restored — 1 fail.

## Stage 303 — The campaign ledger kept the underscore on a gun

**Goal.** Stage 301 taught FILE `weaponName`. The close line on the ledger
still fell back to `weapon.toUpperCase()`, so an unknown kit printed
`WEAPON LEASE_BREAKER`.

**What changed.** The fallback spells underscores as spaces.

**Proof.** `tests/weaponname.test.ts` requires `.replace(/_/g, " ").toUpperCase()`
and refuses `?? weapon.toUpperCase()`. Mutation: the replace omitted — 1 fail.

## Stage 302 — The FILE tab printed WEAR · ok

**Goal.** Stage 298 CRT-cased kick reasons. The counter-ledger line on FILE
still said `WEAR · ok` and left a refusal in sentence case.

**What changed.** `counterOpLine()` CRT-cases the op, `OK`, and the reason.

**Proof.** `tests/counter.test.ts`: `counterOpLine("wear", true)` is `WEAR · OK`.
Source must call it. Mutation: `ok` left lowercase — 1 fail.

## Stage 301 — FILE PRIMARY fell back to the id

**Goal.** The kill log, the Audit line and the campaign card all call `weaponName`. FILE's
PRIMARY / SECONDARY still used `WEAPON_LIST.find(...)?.name ?? String(id)`, so an unknown
kit printed `lease_breaker` instead of LEASE-BREAKER.

**What changed.** That helper calls `weaponName(String(id))`.

**Proof.** `tests/weaponname.test.ts`: FILE source must `weaponName(String(id))` and must not
`?? String(id)`. Mutation: the String fallback again — 1 fail.

## Stage 300 — Deep Wake history spelled districts with replace

**Goal.** The MAP tab already calls `levelDisplayName`. Season close and
turn lines still used `id.toUpperCase().replace(/_/g, " ")`, the same
fallback that printed WHITE OFFICE instead of THE WHITE OFFICE.

**What changed.** `levelDisplayName(d)` / `levelDisplayName(push.level)` in
`shared/endgame/season.ts`.

**Proof.** `tests/endgame.test.ts` requires those calls and refuses the
replace. Mutation: `rollSeason` uses replace again — 1 fail.

## Stage 299 — The HUD zone line duplicated the district helper

**Goal.** Wake lines, the PA and BACK ON THE LEDGER call `districtName`. The
status bar still inlined `displayName ?? name.replace`, the same fallback
that printed `LEASE_ROW` before Stage 292.

**What changed.** `this.zone = districtName(level)`.

**Proof.** `tests/district.test.ts` requires that call and refuses the inline
fallback. Mutation: the replace restored — 1 fail.

## Stage 298 — The drop line printed room full

**Goal.** The log CRT-cases the link status (`LINK CLOSED`). The kick reason
still arrived as written: `room full`, `malformed message`.

**What changed.** `linkStatusLine()` CRT-cases both sides.

**Proof.** `tests/roomlabel.test.ts`: `linkStatusLine("closed", "room full")` is
`LINK CLOSED · ROOM FULL`. Source must call it. Mutation: the reason left in
sentence case — 1 fail.

## Stage 297 — The WAKE picker printed neochina-lease_row

**Goal.** The district list labels LEASE ROW. The line under a pick still said
`MAGENTA cast · public room neochina-lease_row`. The city does not call a district by its
socket name.

**What changed.** `districtPickLine` prints `MAGENTA CAST · LEASE ROW`. The room id stays on
the URL.

**Proof.** `tests/district.test.ts`: wake line is `MAGENTA CAST · LEASE ROW` and has no
`neochina`. Source must `districtPickLine(this.pick, l)` and must not interpolate
`HOSTS.publicRoom`. Mutation: the room id in the line again — 1 fail.

## Stage 296 — City neon tubes were unplated boxes

**Goal.** Street lamps, KERNEL bars and the metro lock already wear `tex_lamp`.
Every other neon strip — the tubes along walls, walkways, rails, gates —
was still unmapped `MeshBasicMaterial` from `NeonBatch.flush`.

**What changed.** `bindPlate(neonMat, "tex_lamp")` when a colour's mesh is
flushed, fail-soft. The colour stays; the lamp plate is the map.

**Proof.** `tests/assets.test.ts` requires that call in `city.ts`. Mutation: the call omitted —
1 fail.

## Stage 295 — The metro lock glyph was a flat green hex

**Goal.** Stage 273 plated THE WAKE's hex ring. The tunnel mouth's hex lock
— a 6-sided green ring over the dark door — was still unmapped
`MeshBasicMaterial`.

**What changed.** `bindPlate(lockMat, "tex_lamp")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `city.ts`. Mutation: the call omitted —
1 fail.

## Stage 294 — Traffic streaks were unplated lines

**Goal.** Stage 291 plated hitscan `LineBasicMaterial`. The horizon traffic —
warm head-lights and red tails sliding past the facades — was still unmapped
`LineBasicMaterial`.

**What changed.** `bindPlate(trafficMat, "tex_lamp")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `city.ts`. Mutation: the call omitted —
1 fail.

## Stage 293 — THE WAKE link lines were unplated dashes

**Goal.** Stage 291 plated hitscan `LineBasicMaterial`. THE WAKE's dashed edges between hexes
were still unmapped `LineDashedMaterial`.

**What changed.** `bindPlate` accepts `LineDashedMaterial`. `bindPlate(linkMat, "tex_lamp")`,
fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `wake.ts`. Mutation: the call omitted —
1 fail.

## Stage 292 — The PA and the ledger line fell back to the level id

**Goal.** Wake lines already call `districtName`. The VANTAGE PA and
`BACK ON THE LEDGER` still used `displayName ?? this.levelId`, which
prints `LEASE_ROW` whenever the display name is missing.

**What changed.** Both call `districtName(this.world.level)`.

**Proof.** `tests/district.test.ts` requires both calls and refuses
`displayName ?? this.levelId`. Mutation: the PA uses the id again — 1 fail.

## Stage 291 — Hitscan tracer lines were unplated

**Goal.** Stage 283 plated the cylinder beam in `weapons.ts`. The pooled
`LineSegments` every shot actually draws — 64 additive tracer segments —
were still unmapped `LineBasicMaterial`.

**What changed.** `bindPlate` accepts `LineBasicMaterial`. `bindPlate(mat, "tex_lamp")`
on the tracer pool, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `vfx.ts`. Mutation: the call omitted —
1 fail.

## Stage 290 — The Deep Wake MAP named a house CEL

**Goal.** Stage 224 taught the MAP THE WAKE CELLS. Pressure on a node still
printed the first three letters of the id — `+3 CEL`, `+3 EST`, `+3 CLO` —
next to a holder already named in full.

**What changed.** `houseName(n.leader)` in `client/hud/hud.ts`.

**Proof.** `tests/endgame.test.ts` requires `houseName(n.leader)` and refuses
`n.leader.slice(0, 3).toUpperCase()`. Mutation: the slice restored — 1 fail.

## Stage 289 — TESTIMONY printed CHAIR CLOCKEATER

**Goal.** Stage 222 taught the completed-arc line THE CLOCKEATER'S CHAIR. Stage 286 CRT-cased
testimony values, so `m7:ending=chair_clockeater` became `ENDING=CHAIR CLOCKEATER` — still the
id, not the title.

**What changed.** `testimonyLine` interpolates `endingTitle(v)` when the stripped key is `ending`.

**Proof.** `tests/campaign.test.ts`: `testimonyLine("m7:ending", "chair_clockeater")` is
`ENDING=THE CLOCKEATER'S CHAIR`. Source must `endingTitle(v)`. Mutation: uppercase the id
again — 1 fail.

## Stage 288 — The mobile wet floor was an unplated sheen

**Goal.** Sidewalks already wear `tex_wet_cobble`. The phone's fake wet floor
— an additive plane in place of the desktop mirror — was still unmapped
`MeshBasicMaterial`.

**What changed.** `bindPlate(floorMat, "tex_wet_cobble")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `wetfloor.ts`. Mutation: the call omitted —
1 fail.

## Stage 287 — Impact sparks were unplated additive spheres

**Goal.** Stage 283 plated hitscan beams. The pooled impact sparks — 64
instanced spheres at the hit — were still unmapped additive
`MeshBasicMaterial`.

**What changed.** `bindPlate(smat, "tex_lamp")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `vfx.ts`. Mutation: the call omitted —
1 fail.

## Stage 286 — TESTIMONY printed lease=burn

**Goal.** Stage 285 stripped `m1:`. The remainder was still the file's
snake_case tokens: `lease=burn`, `spare_docks`. The rest of the CRT speaks
LEASE-BREAKER, not lease_breaker.

**What changed.** `testimonyLine()` CRT-cases both sides (`LEASE=BURN`,
`LATTICE=SPARE DOCKS`). The panel calls it.

**Proof.** `tests/campaign.test.ts`: `testimonyLine("m1:lease", "burn")` is
`LEASE=BURN`. Mutations: CRT-case omitted — 1 fail; the panel call omitted —
1 fail.

## Stage 285 — TESTIMONY printed m1:lease

**Goal.** The contracts panel promised to strip the mission prefix the file
stores. It used `/^m\\d:/`, which matches a backslash, not a digit, so
`m1:lease=burn` reached the CRT as written.

**What changed.** `testimonyKey()` in `shared/campaign/testimony.ts` strips
`/^m\d+:/`. The panel calls it.

**Proof.** `tests/campaign.test.ts`: `testimonyKey("m1:lease")` is `lease`;
`client/campaign.ts` calls `testimonyKey(k)`. Mutations: the regex reverted to
`/^m\\d:/` — 1 fail; the panel call omitted — 1 fail.

## Stage 284 — Explosion spheres were unplated additive balls

**Goal.** Stage 283 plated hitscan beams. Nade and emp blasts — the expanding additive sphere —
were still unmapped `MeshBasicMaterial`.

**What changed.** `bindPlate(blastMat, "tex_lamp")`, fail-soft. The blast colour stays.

**Proof.** `tests/assets.test.ts` requires that call in `weapons.ts`. Mutation: the call omitted —
1 fail.

## Stage 283 — Hitscan beams were unplated additive tubes

**Goal.** Stage 277 plated campaign objective beams. Hitscan tracers — the cylinder from muzzle
to impact every shot — were still unmapped additive `MeshBasicMaterial`.

**What changed.** `bindPlate(beamMat, "tex_lamp")`, fail-soft. The tracer colour stays.

**Proof.** `tests/assets.test.ts` requires that call in `weapons.ts`. Mutation: the call omitted —
1 fail.

## Stage 282 — Smoke clouds were unplated grey spheres

**Goal.** Stage 203 plated the thrown nade's body with `tex_weapon_dark`. The
fourteen lingering smoke volumes after a smoke nade were still unmapped
`MeshBasicMaterial` grey.

**What changed.** `bindPlate(mat, "tex_weapon_dark")` on each cloud sphere, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `weapons.ts`. Mutation: the call omitted —
1 fail.

## Stage 281 — The mech searchlight cone was a flat amber volume

**Goal.** Stage 253 plated the searchlight lens. The 30 m additive cone that
reads the beam in the rain was still unmapped `MeshBasicMaterial` at 0.045
opacity.

**What changed.** `bindPlate(coneMat, "tex_lamp")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `weapons.ts`. Mutation: the call omitted —
1 fail.

## Stage 280 — THE WAKE flip ring was a flat hex pulse

**Goal.** Stage 273 plated the pad's hex ring. The liberation ring that expands
when a node flips — a 6-sided additive hoop — was still unmapped
`MeshBasicMaterial`.

**What changed.** `bindPlate(mat, "tex_lamp")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `wake.ts`. Mutation: the call omitted —
1 fail.

## Stage 279 — The player's cloak was an unplated silhouette

**Goal.** Crowd hoods, the escort hood, and the range ghost already wear `tex_cloak`.
The cloak every file wears in the street — local and remote — was still unmapped
near-black `MeshStandardMaterial`.

**What changed.** `bindPlate(mat, "tex_cloak")`, fail-soft. The trim still takes the
worn skin; the body plate does not.

**Proof.** `tests/assets.test.ts` requires that call in `rig.ts`. Mutation: the call omitted —
1 fail.

## Stage 278 — The Kernel filament was a flat red strand

**Goal.** Stage 277 plated the objective beam. The five red tubes over the viewmodel while a
Kernel Protocol is worn were still unmapped additive `MeshBasicMaterial`.

**What changed.** `bindPlate(fm, "tex_lamp")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `campaign.ts`. Mutation: the call omitted —
1 fail.

## Stage 277 — The campaign objective beam was a flat cyan tube

**Goal.** Stage 276 plated the floor ring. The 40 m cyan cylinder above it — and the 14 m red
beams over destroy targets, which share the same helper — were still unmapped additive
`MeshBasicMaterial`.

**What changed.** `beam()` binds `tex_lamp` on its material, fail-soft.

**Proof.** `tests/assets.test.ts` requires `bindPlate(mat, "tex_lamp")` in `campaign.ts`. Mutation:
the call omitted — 1 fail.

## Stage 276 — The campaign objective ring was a flat cyan hoop

**Goal.** Stage 269 plated THE RUN's ground ring. The campaign marker's floor
ring — the cyan hoop under the objective beam — was still unmapped
`MeshBasicMaterial` at 0.6 opacity.

**What changed.** `bindPlate(ringMat, "tex_lamp")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `campaign.ts`. Mutation: the call omitted —
1 fail.

## Stage 275 — THE WAKE light column was a flat violet tube

**Goal.** Stage 272 plated THE RUN's 9 m column. THE WAKE's 12 m column of light
above each hex pad was still unmapped additive `MeshBasicMaterial` violet at
0.035 opacity.

**What changed.** `bindPlate(colMat, "tex_lamp")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `wake.ts`. Mutation: the call omitted —
1 fail.

## Stage 274 — THE WAKE hex fill was a flat violet disc

**Goal.** Stage 273 plated the hex ring. The fill inside it — the pad that lerps
violet → green as hold drains — was still unmapped `MeshBasicMaterial` at 0.05
opacity.

**What changed.** `bindPlate(fillMat, "tex_lamp")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `wake.ts`. Mutation: the call omitted —
1 fail.

## Stage 273 — THE WAKE hex ring was a flat violet hoop

**Goal.** Stage 269 plated THE RUN's ground ring. THE WAKE's hex node ring — the neon
outline a file stands on to flip a pad — was still unmapped `MeshBasicMaterial` violet
at 0.95 opacity.

**What changed.** `bindPlate(ringMat, "tex_lamp")`, fail-soft. The violet wash stays;
the lamp plate is the map.

**Proof.** `tests/assets.test.ts` requires that call in `wake.ts`. Mutation: the call omitted —
1 fail.

## Stage 272 — THE RUN's safe-zone column was a flat cyan tube

**Goal.** Stage 269 plated the ground ring. The 9 m column of light above it was still
unmapped `MeshBasicMaterial` cyan at 0.06 opacity.

**What changed.** `bindPlate(colMat, "tex_lamp")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `run.ts`. Mutation: the call omitted —
1 fail.

## Stage 271 — THE DIRECTIVE's optic cube was a flat red box

**Goal.** Stage 270 plated LEASE-BREAKER's magenta rail. THE DIRECTIVE still had a 3 cm red
cube on the optic as unmapped `MeshBasicMaterial`. Street lamps already wear `tex_lamp`.

**What changed.** `bindPlate(optic, "tex_lamp")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `weapons.ts`. Mutation: the call omitted —
1 fail.

## Stage 270 — LEASE-BREAKER's top rail was a flat magenta box

**Goal.** The viewmodel tracer strip is the gun's colour. LEASE-BREAKER still
had a second rail — a 10 cm magenta box on top of the receiver — as unmapped
`MeshBasicMaterial`. Street lamps and THE KERNEL's bars already wear `tex_lamp`.

**What changed.** `bindPlate(mgRail, "tex_lamp")`, fail-soft. The magenta
stays; the lamp plate is the map.

**Proof.** `tests/assets.test.ts` requires that call in `weapons.ts`. Mutation:
the call omitted — 1 fail.

## Stage 269 — THE RUN's safe-zone ring was a flat cyan hoop

**Goal.** Stage 268 plated the claim octahedra. The ground ring of each safe
zone — the hoop a file stands inside to bank — was still unmapped
`MeshBasicMaterial` cyan at 0.55 opacity.

**What changed.** `bindPlate(ringMat, "tex_lamp")`, fail-soft. The cyan wash
stays; the lamp plate is the map.

**Proof.** `tests/assets.test.ts` requires that call in `run.ts`. Mutation:
the call omitted — 1 fail.

## Stage 268 — THE RUN's claims were unplated octahedra

**Goal.** Stage 267 plated the range ghost. THE RUN's hovering claims — amber while held,
magenta when dropped — were still unmapped `MeshBasicMaterial`. The market kiosk screen
already wears `tex_kiosk_crt`.

**What changed.** `bindPlate(mat, "tex_kiosk_crt")` when a claim mesh is born, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `run.ts`. Mutation: the call omitted —
1 fail.

## Stage 267 — The range ghost was a flat cyan capsule

**Goal.** Stage 203 plated the escort hood. The Deadletter range ghost — the cyan figure that
replays a best time — was still unmapped additive cyan.

**What changed.** `bindPlate(this.ghostMat, "tex_cloak")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `hub.ts`. Mutation: the call omitted —
1 fail.

## Stage 266 — Offline kill log called a player PLAYER

**Goal.** Online kill log says `FILE #n ⟶ FILE-01`. Offline said
`BLANK ⟶ PLAYER-01` because it printed `victimKind.toUpperCase()`. The stamp
is FILE CLOSED. The city does not call a file a PLAYER.

**What changed.** `victimLabel()` in `client/hud/kill.ts` — player is FILE,
dummy DUMMY, wasp WASP, mech MECH. Offline and online logs both call it.

**Proof.** `tests/kill.test.ts`: `victimLabel("player")` is FILE, not PLAYER;
`game.ts` has no `victimKind.toUpperCase()` and no second DUMMY/FILE table.
Mutations: `player` branch returns `PLAYER` — 1 fail; offline log back to
`toUpperCase()` — 1 fail.

## Stage 265 — THE KERNEL's halo was a flat red plane

**Goal.** Stage 260 plated the red grid bars. The 420 m × 200 m plane behind THE KERNEL —
the blood-red wash on the horizon — was still `MeshBasicMaterial` with no map.

**What changed.** `bindPlate(haloMat, "tex_lamp")`, fail-soft. The red tint stays.

**Proof.** `tests/assets.test.ts` requires that call in `city.ts`. Mutation: the call omitted —
1 fail.

## Stage 264 — Chapter III window glow was a flat cyan slab

**Goal.** Stage 208 plated the Chapter III desk nameplate. The other Chapter III
renovation — `window_glow`, a 8 m × 1 m floor-level pane in the Deadletter Office —
was still `MeshBasicMaterial` at `0x0b2a30` with no map. Street glass already wears
`tex_glass`.

**What changed.** `bindPlate(m, "tex_glass")` on the `window_glow` tag, fail-soft.
The cyan tint stays; the glass plate is the map.

**Proof.** `tests/assets.test.ts` requires the `window_glow` bind in `hub.ts`.
Mutation: the call omitted — 1 fail.

## Stage 263 — Lamp pools and vending fronts were a flat cyan wash

**Goal.** Street lamps already wear `tex_lamp`. The ground-pool under each lamp and the lit
front of each vending machine still used `M.glow` — `MeshBasicMaterial` cyan at 0.18 opacity
with no map.

**What changed.** `bindPlate(M.glow, "tex_lamp")`, fail-soft. The cyan wash stays; the lamp
plate is the map.

**Proof.** `tests/assets.test.ts` requires that call in `city.ts`. Mutation: the call omitted —
1 fail.

## Stage 262 — Spawn pads were flat green and magenta boxes

**Goal.** `tex_wet_asphalt` has been in the manifest since the city pack and never reached a mesh.
`pad_start` / `pad_end` — the floor a player stands on at every spawn — were still unmapped
`MeshBasicMaterial` green and magenta.

**What changed.** `bindPlate(M.padStart, "tex_wet_asphalt")` and the same on `M.padEnd`, fail-soft.
The pad colours stay; the leftover wet-road plate is the map.

**Proof.** `tests/assets.test.ts` requires both calls in `city.ts` and lists `tex_wet_asphalt` among
the leftover ids. Mutation: the `padStart` call omitted — 1 fail.

## Stage 261 — Parked-car headlamps were a flat cream strip

**Goal.** Street lamps already wear `tex_lamp`. Each parked car still had a cream
`MeshBasicMaterial` head-light strip with no map — the same unplated cream the
monorail headlamp had before Stage 254.

**What changed.** `bindPlate(M.head, "tex_lamp")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `city.ts`. Mutation: the call omitted —
1 fail.

## Stage 260 — THE KERNEL's red strips were flat bars

**Goal.** Stage 200 plated the hull. The nine vertical and six horizontal red bars on THE KERNEL
— the blood-red grid a player reads on the horizon — were still `MeshBasicMaterial` with no map.

**What changed.** `bindPlate(stripMat, "tex_lamp")`, fail-soft. The red colour stays; the lamp
plate is the same map every other city light uses.

**Proof.** `tests/assets.test.ts` requires that call in `city.ts`. Mutation: the call omitted —
1 fail.

## Stage 259 — The airship nose was a flat red sphere

**Goal.** Stage 255 plated the keel strip. The red nose at +29 m was still unmapped.

**What changed.** `bindPlate(noseMat, "tex_lamp")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `life.ts`. Mutation: the call omitted —
1 fail.

## Stage 258 — The monorail tail lamp was a flat red box

**Goal.** Stage 254 plated the headlamp. The red tail on the other end of each car was still
unmapped.

**What changed.** `bindPlate(tailMat, "tex_lamp")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `life.ts`. Mutation: the call omitted —
1 fail.

## Stage 257 — The wasp rotors were a flat brown disc

**Goal.** Stage 209 put the hull plate on the rotor arms. The spinning discs were still
`MeshBasicMaterial` brown with no map.

**What changed.** One `rotorMat` for the four discs, `bindPlate(rotorMat, "tex_wasp_hull")`,
fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `weapons.ts`. Mutation: the call omitted —
1 fail.

## Stage 256 — The monorail under-strip was a flat magenta bar

**Goal.** Stage 254 plated the headlamp. The magenta band under each car was still
`MeshBasicMaterial` with no map.

**What changed.** `bindPlate(railStripMat, "tex_billboard_mg")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `life.ts`. Mutation: the call omitted —
1 fail.

## Stage 255 — The airship keel strip was a flat cyan bar

**Goal.** Stage 210 plated the airship ad panel. The 34 m cyan strip hanging under it was still
`MeshBasicMaterial` with no map.

**What changed.** `bindPlate(keelMat, "tex_billboard_cy")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `life.ts`. Mutation: the call omitted —
1 fail.

## Stage 254 — The monorail headlamp was a flat cream box

**Goal.** Stage 211 plated the monorail window band. The headlamp on each car — the cream box a
player reads as the train comes in — was still `MeshBasicMaterial` with no map.

**What changed.** `bindPlate(headMat, "tex_lamp")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `life.ts`. Mutation: the call omitted —
1 fail.

## Stage 253 — The mech searchlight lens was a flat cream disc

**Goal.** Stage 251 put `tex_lamp` on the visor strip. The searchlight's facing disc — the 0.22 m
circle a player reads when a mech looks at them — was still `MeshBasicMaterial` cream with no map.

**What changed.** `bindPlate(lensMat, "tex_lamp")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `weapons.ts`. Mutation: the call omitted —
1 fail.

## Stage 252 — The wasp eye was a flat amber box

**Goal.** Stage 251 put `tex_lamp` on the mech visor. The wasp's eye — the amber cube a player
reads when a rotor comes in — was still unmapped.

**What changed.** `bindPlate(eyeMat, "tex_lamp")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `weapons.ts`. Mutation: the call omitted —
1 fail.

## Stage 251 — The mech visor strip was a flat amber box

**Goal.** Dummy servos and crowd chest lamps wear `tex_lamp`. The mech's visor strip — the 2 m
amber bar a player reads at 30 m — was `MeshBasicMaterial` amber with no map.

**What changed.** `bindPlate(stripMat, "tex_lamp")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `weapons.ts`. Mutation: the call omitted —
1 fail.

## Stage 250 — The unknown-socket kick said "barrel"

**Goal.** Stage 247 taught the chip-shape kick MUZZLE. Putting a chip in a socket named `barrel`
still kicked `LEASE-BREAKER: no socket "barrel"`. The FILE panel labels sockets in capitals.

**What changed.** That quoted socket is uppercased.

**Proof.** `tests/mastery.test.ts`: the kick is `LEASE-BREAKER: no socket "BARREL"`. Mutation:
lowercase `barrel` again — 1 fail.

## Stage 249 — The keystone-shape kick said keystone

**Goal.** Stage 248 taught the keystone-limit kick KEYSTONE. Putting a number in the keystone slot
still kicked `keystone must be an id`. The FILE panel already labels the slot KEYSTONE.

**What changed.** That word is `KEYSTONE`.

**Proof.** `tests/fairness.test.ts`: the kick is `KEYSTONE must be an id`. Mutation: lowercase
`keystone` again — 1 fail.

## Stage 248 — The keystone-limit kick said keystone

**Goal.** Stage 246 taught the not-a-node kick KEYSTONE. Sending two keystones as a list still
kicked `max 1 keystone`. The FILE panel already labels the slot KEYSTONE.

**What changed.** That word is `KEYSTONE`.

**Proof.** `tests/fairness.test.ts`: the kick is `max 1 KEYSTONE`. Mutation: lowercase `keystone`
again — 1 fail.

## Stage 247 — The chip-shape kick said .muzzle

**Goal.** Stage 245 taught the chip-socket kick MUZZLE / KINETIC. Putting a number in the muzzle
socket still kicked `LEASE-BREAKER.muzzle: chip must be an id`. The FILE panel labels the socket
MUZZLE.

**What changed.** That socket word is uppercased.

**Proof.** `tests/mastery.test.ts`: the kick is `LEASE-BREAKER.MUZZLE: chip must be an id`. Mutation:
lowercase `muzzle` again — 1 fail.

## Stage 246 — The not-a-node kick said "is a keystone"

**Goal.** Stage 232 taught the FILE names. Attesting DEBTLESS as a node still kicked
`DEBTLESS is a keystone`. The FILE panel labels it KEYSTONE.

**What changed.** The kind is uppercased.

**Proof.** `tests/fairness.test.ts`: the kick is `DEBTLESS is a KEYSTONE`. Mutation: lowercase
`keystone` again — 1 fail.

## Stage 245 — The chip-socket kick said "not kinetic"

**Goal.** Stage 236 taught the kick LEASE-BREAKER LONG BARREL. The FILE panel labels the socket
KINETIC. The kick still said `is a muzzle chip, not kinetic`.

**What changed.** Both socket words are uppercased.

**Proof.** `tests/mastery.test.ts`: the kick is `… MUZZLE chip, not KINETIC`. Mutation: lowercase
`kinetic` again — 1 fail.

## Stage 244 — The closed-contract ledger named red_lease

**Goal.** Stage 243 taught the contracts list RED LEASE. Closing DEADLETTER RUN still wrote
`PROTOCOL RED LEASE` by uppercasing `red_lease`, not by reading the authored name. The settlement
card already interpolates `PROTOCOLS.find(…).name`.

**What changed.** That ledger slot interpolates `protocolById(…).name`.

**Proof.** `tests/campaign.test.ts`: the line matches PROTOCOL RED LEASE, not `PROTOCOL red_lease`.
Source must `${protocolById(m.reward.protocol)?.name`. Mutation: interpolate the id again — 1 fail.

## Stage 243 — The contracts list named PROTOCOL

**Goal.** Stage 215 taught campaign unlocks THE DIRECTIVE. The contracts CRT still printed a bare
`PROTOCOL` on a mission that grants RED LEASE. The settlement card already prints KERNEL PROTOCOL ·
RED LEASE; the weapon reward on the same row already interpolates `weaponName`.

**What changed.** That slot interpolates `PROTOCOLS.find(…).name`.

**Proof.** `tests/campaign.test.ts`: m2 grants `red_lease` named RED LEASE; the row template is
`PROTOCOL ${PROTOCOLS.find`, not `` `PROTOCOL` ``. Mutation: the bare PROTOCOL again — 1 fail.

## Stage 242 — The firmware-shape kick named lease_breaker

**Goal.** Stage 241 taught the chip-shape kick LEASE-BREAKER. Flashing a number as firmware still
kicked `lease_breaker: firmware must be an id`. The FILE panel already prints LEASE-BREAKER.

**What changed.** That detail interpolates `gun(wid)`.

**Proof.** `tests/mastery.test.ts`: the kick is `LEASE-BREAKER: firmware must be an id`, not
`lease_breaker:`. Source must `${gun(wid as WeaponId)}`. Mutation: interpolate the id again — 1 fail.

## Stage 241 — The chip-shape kick named lease_breaker.muzzle

**Goal.** Stage 240 taught the unknown-socket kick LEASE-BREAKER. Putting a number in the muzzle
socket still kicked `lease_breaker.muzzle: chip must be an id`. The FILE panel already prints
LEASE-BREAKER.

**What changed.** That detail interpolates `gun(wid)`.

**Proof.** `tests/mastery.test.ts`: the kick is `LEASE-BREAKER.muzzle: chip must be an id`, not
`lease_breaker.muzzle`. Source must `${gun(wid as WeaponId)}.${socket}`. Mutation: interpolate
the id again — 1 fail.

## Stage 240 — The unknown-socket kick named lease_breaker

**Goal.** Stage 239 taught the chips-shape kick LEASE-BREAKER. Putting a chip in a socket named
`barrel` still kicked `lease_breaker: no socket "barrel"`. The FILE panel already prints
LEASE-BREAKER.

**What changed.** That detail interpolates `gun(wid)`.

**Proof.** `tests/mastery.test.ts`: the kick is `LEASE-BREAKER: no socket "barrel"`, not
`lease_breaker:`. Source must `${gun(wid as WeaponId)}`. Mutation: interpolate the id again — 1 fail.

## Stage 239 — The chips-shape kick named lease_breaker

**Goal.** Stage 238 taught the connected kick SLIPFILE. Socketing chips as a list still kicked
`lease_breaker: sockets must be an object`. The FILE panel already prints LEASE-BREAKER.

**What changed.** That detail interpolates `gun(wid)`.

**Proof.** `tests/mastery.test.ts`: the kick is `LEASE-BREAKER: sockets must be an object`, not
`lease_breaker:`. Source must `${gun(wid as WeaponId)}`. Mutation: interpolate the id again — 1 fail.

## Stage 238 — The connected kick named slipfile

**Goal.** Stage 232 taught the not-owned kick LONG LEASE. Attesting SLIPFILE and WAKE LUNG — two
nodes that do not touch — still kicked `attestation is not a connected subgraph (1 of 2 reachable
from slipfile)`. The FILE panel already prints SLIPFILE on the hex.

**What changed.** That detail interpolates `itemName(start)`.

**Proof.** `tests/fairness.test.ts`: the kick is `… reachable from SLIPFILE`, not `from slipfile`.
Source must `${itemName(start)}`. Mutation: interpolate the id again — 2 fail.

## Stage 237 — The firmware-weapon kick named stack_smg:dump_stage

**Goal.** Stage 235 taught the chip-weapon kick. Flashing DUMP STAGE onto the Lease-Breaker still
kicked `stack_smg:dump_stage is a stack_smg firmware`.

**What changed.** That detail interpolates `f.name` and `gun(f.weapon)`.

**Proof.** `tests/mastery.test.ts`: the kick is `DUMP STAGE is a STACK SMG firmware`. Mutation:
interpolate the id again — 1 fail.

## Stage 236 — The chip-socket kick named lease_breaker:long_barrel

**Goal.** Stage 235 taught the cross-weapon kick STACK LONG BARREL. Putting LONG BARREL in the
kinetic socket still kicked `lease_breaker:long_barrel is a muzzle chip, not kinetic`.

**What changed.** That detail interpolates `c.name`.

**Proof.** `tests/mastery.test.ts`: the kick is `LEASE-BREAKER LONG BARREL is a muzzle chip, not
kinetic`. Mutation: interpolate the id again — 1 fail.

## Stage 235 — The chip-weapon kick named stack_smg:long_barrel

**Goal.** Stage 233 taught the chip-rank kick LEASE-BREAKER FLASH CUT. Putting a Stack SMG LONG
BARREL on the Lease-Breaker still kicked `stack_smg:long_barrel is a stack_smg chip`.

**What changed.** That detail interpolates `c.name` and `gun(c.weapon)`.

**Proof.** `tests/mastery.test.ts`: the kick is `STACK LONG BARREL is a STACK SMG chip`, not
`stack_smg:long_barrel`. Mutation: interpolate the id again — 1 fail.

## Stage 234 — The firmware-rank kick named lease_breaker:three_count

**Goal.** Stage 233 taught the chip-rank kick LEASE-BREAKER FLASH CUT. Flashing THREE-COUNT at
rank 12 still kicked `lease_breaker:three_count needs lease_breaker mastery 20`. The FILE panel
already prints THREE-COUNT.

**What changed.** That detail interpolates `f.name` and `gun(wid)`.

**Proof.** `tests/mastery.test.ts`: the kick matches THREE-COUNT and LEASE-BREAKER mastery, not
`lease_breaker:three_count`. Mutation: interpolate the ids again — 1 fail.

## Stage 233 — The chip-rank kick named lease_breaker:flash_cut

**Goal.** Stage 231 taught the loadout kick THE DIRECTIVE. Socketing FLASH CUT at rank 12 still
kicked `lease_breaker:flash_cut needs lease_breaker mastery 22`. The FILE panel already prints
LEASE-BREAKER FLASH CUT.

**What changed.** That detail interpolates `c.name` and `gun(wid)`.

**Proof.** `tests/mastery.test.ts`: the kick matches LEASE-BREAKER FLASH CUT and LEASE-BREAKER
mastery, not `lease_breaker:flash_cut`. Mutation: interpolate the ids again — 1 fail.

## Stage 232 — The not-owned kick named long_lease

**Goal.** Stage 230 taught RING ONE ESCROW. Attesting LONG LEASE on a file that does not own it
still kicked `long_lease is not in your file`. Duplicate attestations and a keystone that does
not touch the subgraph were the same: ids.

**What changed.** Those details interpolate `itemName`.

**Proof.** `tests/fairness.test.ts`: unowned `long_lease` is `LONG LEASE is not in your file`.
Source must `${itemName(id)} is not in your file`. Mutation: interpolate the id again — 2 fail.

## Stage 231 — The loadout kick named directive

**Goal.** Stage 229 taught the Audit kick LEASE-BREAKER. Bringing THE DIRECTIVE into a PvP room
without the unlock still kicked `directive unlocks in the campaign`. A Depth-1 file with the
Phage still kicked `phage needs Depth 5`. The FILE panel already prints THE DIRECTIVE and
PHAGE LAUNCHER.

**What changed.** Those details interpolate `WEAPONS[id].name`.

**Proof.** `tests/campaign.test.ts`: locked Directive is `THE DIRECTIVE unlocks in the campaign`.
`tests/fairness.test.ts`: Phage at Depth 2 is `PHAGE LAUNCHER needs Depth`. Source must
`${gun(w)} unlocks`. Mutation: interpolate the id again — 1 fail.

## Stage 230 — The RING ONE kick named escrow

**Goal.** Stage 229 taught the weapon kick LEASE-BREAKER. RING ONE still kicked
`escrow is not a ring-1 node`. The FILE panel already prints ESCROW.

**What changed.** That detail interpolates `itemName(id)`.

**Proof.** `tests/endgame.test.ts`: attested `escrow` on RING ONE matches ESCROW and not
`escrow is not`. Mutation: interpolate the id again — 1 fail.

## Stage 229 — The Audit kick named lease_breaker

**Goal.** Stage 228 taught the FILE tab REPO HAMMER. Joining PELLET WEEK with the Lease-Breaker
still kicked `lease_breaker is not in PELLET WEEK (repo_hammer, clockeater, shock_baton)`.

**What changed.** `auditErrors` prints `WEAPONS[id].name`.

**Proof.** `tests/endgame.test.ts`: the detail matches LEASE-BREAKER and REPO HAMMER, not
`lease_breaker` / `repo_hammer`. Mutation: interpolate the id again — 1 fail.

## Stage 228 — The Audit line listed repo_hammer

**Goal.** PELLET WEEK's FILE tab printed `repo_hammer, clockeater, shock_baton` next to the
playlist. The rack, the stamp and the join line already say REPO HAMMER.

**What changed.** The list maps `weaponName`.

**Proof.** `tests/endgame.test.ts`: FILE source must `au.weapons.map(weaponName)` and must not
`au.weapons.join`. Mutation: join the ids again — 1 fail.

## Stage 227 — A range ghost wrote DEADLETTER_OFFICE

**Goal.** Stage 216 taught the city `levelDisplayName`. A best time on the Deadletter range still
pushed `RANGE · DEADLETTER OFFICE` from the id with underscores swapped, and a White Office ghost
would have said WHITE OFFICE, not THE WHITE OFFICE. The hub's own display name is DEADLETTER
OFFICE (HUB).

**What changed.** `rangeCourseName` is the city's name without importing the level builder.
`recordGhost` interpolates it.

**Proof.** A hub ghost writes `RANGE · DEADLETTER OFFICE (HUB)` and not `DEADLETTER_OFFICE`.
Source must not `run.level.toUpperCase()`. Mutation: uppercase the id again — 1 fail.

## Stage 226 — Picking a house wrote HOUSE · CELLS

**Goal.** Stage 223 taught Deep Wake THE WAKE CELLS. Choosing a faction still pushed
`HOUSE · CELLS` / `HOUSE · CLOCKEATERS` onto the file ledger. The contracts panel already
prints THE ESTATE, THE CLOCKEATERS, THE WAKE CELLS.

**What changed.** `factionName(id)` is the authored name. `pickFaction` interpolates it.

**Proof.** `tests/campaign.test.ts`: `factionName("cells")` is THE WAKE CELLS; picking cells
writes `HOUSE · THE WAKE CELLS` and not `HOUSE · CELLS`. Source must `factionName(faction)`.
Mutation: uppercase the id again — 1 fail.

## Stage 225 — The receipt spelled FIRST_KILL LEASE BREAKER

**Goal.** Mid-round the CRT already printed `STAMP · FIRST FILE CLOSED · LEASE-BREAKER` from
`stamp.line`. The file message that fills the FILE ledger, and the Ledger Entry receipt at
settlement, still wrote the id: `STAMP · first_kill:lease_breaker` on the wire, and
`STAMP · FIRST_KILL LEASE BREAKER` on the receipt. The durable file (progression.ts) already
used the line.

**What changed.** `stampLine(id)` is the authored line. The room interpolates it on both paths.

**Proof.** `tests/mastery.test.ts`: `first_kill:lease_breaker` is `FIRST FILE CLOSED · LEASE-BREAKER`,
not `FIRST_KILL LEASE BREAKER`. Source must `STAMP · ${stampLine(id)}` and must not
`id.toUpperCase().replace(/[:_]`. Mutation: receipt uppercases the id again — 1 fail.

## Stage 224 — The Deep Wake map still said CELLS

**Goal.** Stage 223 taught the season log THE WAKE CELLS. The MAP tab still printed `CELLS 3`
in the header, and each node's house chip was `h.toUpperCase()` — CELLS, ESTATE, CLOCKEATERS.
District keys were `lease_row` with underscores swapped.

**What changed.** The header and the chips call `houseName`. District rows call
`levelDisplayName`.

**Proof.** `tests/endgame.test.ts`: hud source must `houseName(h)` and `houseName("cells")` and
must not `h.toUpperCase()` for the chip. Mutation: chips uppercase the id again — 1 fail.

## Stage 223 — Deep Wake history said TURNED CELLS

**Goal.** A node turning to the Wake Cells wrote `LEASE ROW B TURNED CELLS` and `B → CELLS`. The
houses the city names are THE ESTATE, THE CLOCKEATERS, THE WAKE CELLS. Season close was the same:
`CELLS HELD 3/5`.

**What changed.** `houseName` maps the four houses. The season last-line, the turn history, and
the close log all call it.

**Proof.** `tests/endgame.test.ts`: `houseName("cells")` is THE WAKE CELLS; history matches
`LEASE ROW B TURNED THE WAKE CELLS` and not `TURNED CELLS`. Source must `houseName(t.to)`.
Mutation: `t.to.toUpperCase()` — 1 fail.

## Stage 222 — The completed arc printed CHAIR CLOCKEATER

**Goal.** Stage 174 made the office deliver THE CLOCKEATER'S CHAIR and THE CITY THAT READ THE
FIRE. The contracts panel, when the arc was done, still spelled the id:
`THE ARC IS COMPLETE · ENDING: CHAIR CLOCKEATER`. WIPE became WIPE, not WIPE THE LEDGER. The
open-endings list a few lines down already used `e.title`.

**What changed.** `endingTitle(id)` is the authored title. The complete line interpolates it.

**Proof.** `tests/endings.test.ts`: every shipped ending's title; `chair_clockeater` is not
`CHAIR CLOCKEATER`. Source must `endingTitle(c.ending)`. Mutation: uppercase the id again — 1 fail.

## Stage 221 — Travelling printed WHITE_OFFICE

**Goal.** Stage 216 taught the contracts list `levelDisplayName`. Joining a room on a different
district still pushed `TRAVELLING — WHITE OFFICE` from `net.levelName` with underscores swapped
for spaces. THE WHITE OFFICE lost THE. DEADLETTER_DOCKS became DEADLETTER DOCKS only by luck.

**What changed.** The travelling alert interpolates `levelDisplayName(net.levelName)`.

**Proof.** `tests/district.test.ts`: source must `TRAVELLING — ${levelDisplayName(net.levelName)}`
and must not `net.levelName.replace`. Mutation: uppercase the id again — 1 fail.

## Stage 220 — The join line quoted ledger ids

**Goal.** On admit the CRT pushed `ATTESTED [long_lease, quiet_ledger] · BAD_DEBT`. The FILE
panel already prints LONG LEASE, QUIET LEDGER, BAD DEBT. The id with `toUpperCase` only happened
to match for DEBTLESS.

**What changed.** `itemName(id)` is the authored name. The join line maps attested nodes and the
keystone through it.

**Proof.** `tests/economy.test.ts`: `bad_debt` is `BAD DEBT`, `long_lease` is `LONG LEASE`. Source
must `attested.map(itemName)` and `itemName(f.loadout.keystone)`, must not `keystone.toUpperCase()`.
Mutation: join line uppercases the id again — 1 fail.

## Stage 219 — A mastery line spelled the weapon id

**Goal.** Crossing rank 10 on the Lease-Breaker pushed `MASTERY · LEASE BREAKER → RANK 10` — the
id with underscores swapped for spaces. THE DIRECTIVE was `DIRECTIVE → RANK 5`. Clearing a gate
pushed `CHALLENGE CLEARED · DIRECTIVE R5`, not the challenge. The stamp beside it already says
THE DIRECTIVE.

**What changed.** `masteryRankLine` and `challengeClearedLine` take the tracker ids and print the
manifest name (and the challenge text). The CRT interpolates those.

**Proof.** `tests/mastery.test.ts`: `lease_breaker:r10` is `LEASE-BREAKER → RANK 10`;
`directive:r5` is `THE DIRECTIVE → RANK 5` and `THE DIRECTIVE · 8 HEADSHOT KILLS`. Source must
call the helpers. Mutation: rank helper reverts to `replace(":r"` — 1 fail; game.ts interpolates
the id again — 1 fail.

## Stage 218 — Directive chips were named THE CHOKE

**Goal.** Stage 109 taught the rack not to label THE DIRECTIVE as THE. Stage 217 taught the stamp
matrix the same. Chip names still took `w.name.split(" ")[0]`, so every Directive muzzle, kinetic
and protocol chip was THE CHOKE, THE COMPENSATOR, THE LONG BARREL.

**What changed.** Chip names use `weaponShortLabel`, the same skip-the-article helper the rack
uses. DIRECTIVE CHOKE.

**Proof.** `tests/chiptrade.test.ts`: `directive:choke` is DIRECTIVE CHOKE, not THE CHOKE. Source
must call `weaponShortLabel(w.name)` and must not `w.name.split(" ")[0]`. Mutation: first token
again — 2 fail.

## Stage 217 — Directive stamps called the gun "THE"

**Goal.** Stage 109 taught the rack not to label THE DIRECTIVE as `THE`. The stamp matrix still
took `w.name.split(" ")[0]`, so a Directive first-kill, first-head, mastery and hundred all read
`· THE`. A Repo Hammer read `· REPO`. LEASE-BREAKER is one word, so the existing FIRST FILE
CLOSED check could not see it.

**What changed.** The matrix uses `w.name`.

**Proof.** `tests/mastery.test.ts`: every `first_kill` line is `FIRST FILE CLOSED · ${w.name}`;
source must not `split`. Mutation: first word again — 2 fail.

## Stage 216 — A contract in the wrong district printed the id

**Goal.** The contracts list spells `DEADLETTER DOCKS`. Launching THE LEAK from Lease Row wrote
`THE LEAK PLAYS IN DEADLETTER_DOCKS`. m7 would have said `WHITE_OFFICE` where the city says
THE WHITE OFFICE.

**What changed.** `levelDisplayName(id)` is the display name without building the district.
The wrong-district note and the contracts list both call it.

**Proof.** `tests/district.test.ts`: `deadletter_docks` is `DEADLETTER DOCKS`, `white_office` is
`THE WHITE OFFICE`, no underscore on any mission. Source must call `levelDisplayName(def.level)`
and must not `def.level.toUpperCase()`. Mutation: the note uppercases the id — 1 fail.

## Stage 215 — Campaign unlocks called THE DIRECTIVE "DIRECTIVE"

**Goal.** Stage 212 made the kill stamp print `weaponName`. Closing THE LEAK still wrote
`WEAPON DIRECTIVE` on the file ledger and `WEAPON UNLOCKED · DIRECTIVE` on the CRT card. The
contracts list was the same. The rack, the stamp and the manifest say THE DIRECTIVE.

**What changed.** The ledger uses `WEAPONS[id].name`. The card and the list call `weaponName`.

**Proof.** Completing THE LEAK writes `WEAPON THE DIRECTIVE`. `tests/weaponname.test.ts`: campaign
and save sources must not `toUpperCase` the id. Mutation: `rw.weapon.toUpperCase()` — 1 fail.

## Stage 214 — Range dummy servos were a flat amber box

**Goal.** The dummy's body and hood wear `tex_dummy`. The chest servo and the neck band shared one
`MeshBasicMaterial` amber with no map, so a target in the office range was a plated silhouette
with two glowing unplated bits. Street lamps and crowd chest lights already use `tex_lamp`.

**What changed.** `bindPlate(amber, "tex_lamp")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `renderer.ts`. Mutation: the call omitted —
1 fail.

## Stage 213 — Crowd chest lamps were a flat amber box

**Goal.** Street lamps wear `tex_lamp`. Each pedestrian's chest lease-light was `MeshBasicMaterial`
amber with no map, so the crowd was plated coats and cloaks with a glowing cube on the sternum.

**What changed.** `bindPlate(lampMat, "tex_lamp")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `life.ts`. Mutation: the call omitted — 1 fail.

## Stage 212 — The kill stamp still hyphenated the gun

**Goal.** Stage 123 made the event log print `weaponName` — REPO HAMMER, STACK SMG, LEASE-BREAKER.
The CRT stamp under the confirm still built the gun from the id: underscores to hyphens, then
uppercased. A Repo Hammer close read `REPO-HAMMER`. Phage read `PHAGE`, not `PHAGE LAUNCHER`. The
Directive read `DIRECTIVE`, not `THE DIRECTIVE`. LEASE-BREAKER happened to match, so the existing
stamp test could not see it.

**What changed.** `closeLine` interpolates `weaponName(read.weapon)`. One spelling, stamp and log.

**Proof.** `tests/kill.test.ts`: every shipped weapon's stamp contains the manifest name and no
underscore. Source must call `weaponName(read.weapon)` and must not `replace(/_/g`. Mutation:
hyphenate the id again — 2 fail.

## Stage 211 — The monorail's windows were a flat ice box

**Goal.** The tram hull wears `tex_monorail`. The window band was `MeshBasicMaterial` `#bfefff`
with no map, so a car passing overhead was plated steel with a glowing slab. `tex_glass` already
dresses shop glass.

**What changed.** `bindPlate(windowMat, "tex_glass")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `life.ts`. Mutation: the call omitted — 1 fail.

## Stage 210 — The airship's ad panel was a flat magenta slab

**Goal.** The hull already wears `tex_airship`. The 34 m panel under it — the thing you actually
read against the skyline — was `MeshBasicMaterial` magenta with no map. `tex_billboard_mg` was
already on shop fronts.

**What changed.** `bindPlate(panelMat, "tex_billboard_mg")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call in `life.ts`. Mutation: the call omitted — 1 fail.

## Stage 209 — Wasp arms were a flat brown box

**Goal.** Stage 200 bound `tex_wasp_hull` to the wasp body. Each rotor arm was a new
`MeshStandardMaterial` at `0x1a1812` with no map, so a wasp up close was a plated hull on four
unplated sticks.

**What changed.** The arms share the hull material. Fail-soft with the hull.

**Proof.** `tests/assets.test.ts` requires the arm mesh to be built with `waspMat`. Mutation: a
fresh unplated standard material — 1 fail.

## Stage 208 — The NAMED nameplate was a brown box

**Goal.** Chapter III puts a nameplate on the Deadletter desk. `tex_nameplate` already dresses
directive pages in the city. The hub's `nameplate` renovation tag stayed a flat `0x3a3218` standard
material, so the plate that says the city learned your name never wore the plate.

**What changed.** `bindPlate(m, "tex_nameplate")` on that tag, fail-soft.

**Proof.** `tests/assets.test.ts` requires the hub call. Mutation: the call omitted — 1 fail.

## Stage 207 — Pedestrian rails were a flat magenta box

**Goal.** Stage 200 bound leftover city plates. `tex_cable` was on disk — wet conduit, cyan
markers, magenta neon in the rain — and `dressLevel` never named it. The clip's pedestrian rail
(`rail` tags: posts and a top bar) stayed `MeshBasicMaterial` magenta with no map.

**What changed.** `bindPlate(M.railMg, "tex_cable")`, fail-soft.

**Proof.** `tests/assets.test.ts` requires that call and lists `tex_cable` with the leftover ids.
Mutation: the call omitted — 1 fail.

## Stage 206 — The catalog plate never reached the body the city sees

**Goal.** Stage 55 bound a worn skin's plate to the first-person viewmodel strip. The default camera
is third person. The body trim — the MeshBasicMaterial spine and boots the city actually looks at —
kept the tint and never the map. A teammate's strip was the same: `skinByToken` set the colour and
left `stripMat.map` null. RUST LEASE was a download plus an orange edge.

**What changed.** `bindSkinMap` writes the plate onto `local.trim`. `skinBound` fails if the trim is
not drawing it. Remotes load the catalog texture onto their strip and trim, fail-soft, keyed so a
slower plate cannot land after a swap.

**Proof.** `tests/assets.test.ts` ("a worn catalog plate reaches the body the city sees"). Mutations:
`local.trim.map` omitted — 1 fail; `skinBound` trim check omitted — 1 fail; remote `stripMat.map`
omitted — 1 fail; remote `trim.map` omitted — 1 fail; `def?.texture` not read — 1 fail.

## Stage 205 — Phage rounds were a flat violet box

**Goal.** Frag/smoke/emp nades got plates in Stage 203. Phage and sticky projectiles stayed
`MeshBasicMaterial` violet with no map, so a launched round did not wear the phage plate the
catalog already sold.

**What changed.** Both bind `skin_phage_plate` fail-soft.

**Proof.** `tests/assets.test.ts` requires `bindPlate(this.projMats.phage, "skin_phage_plate")`.
Mutation: that call omitted — 1 fail.

## Stage 204 — A nade at your feet online did not kick the camera

**Goal.** Offline, `explode` kicks 0.6 when you are inside 2× radius, and `emp` kicks 1 inside the
radius. Online those FX played the bang and the light and left the camera still.

**What changed.** The same hypot checks on `FX.explode` / `FX.emp`.

**Proof.** `tests/onlinefx.test.ts`. Mutation: explode case has no post.kick — 1 fail.

## Stage 203 — The escort's hood and thrown nades were unplated

**Goal.** Stage 200 bound leftover city plates. The campaign escort's body wore `tex_crowd_coat`
and its hood stayed a flat cone. Frag/smoke/emp nades were unmapped steel.

**What changed.** Hood `tex_cloak`. Frag and smoke `tex_weapon_dark`, EMP `tex_metal`. Posts use
the pipe plate.

**Proof.** `tests/assets.test.ts` lists `tex_cloak` in renderer sources. Mutation: hood
constructor omits bindPlate — 1 fail if the id is dropped from campaign.ts.

## Stage 202 — Remote bodies estimated speed on the capped clock

**Goal.** Stage 193 divided the local landing by rawDt so a hitch did not slam the camera.
`poseRemotes` already took a parameter named rawDt, then `render` passed it the hitch-capped `dt`.
A 12 fps frame with 0.2 m of travel read as 6 m/s instead of 2.4 m/s, so teammates sprinted in
place for one pose.

**What changed.** `this.poseRemotes(rawDt)`. VFX still age on the capped clock.

**Proof.** `tests/feel.test.ts` requires `poseRemotes(rawDt)` and refuses `poseRemotes(dt)`.
Mutation: pass `dt` — 1 fail.

## Stage 201 — STACK SMG CHOKE was COMPENSATOR three ranks early

**Goal.** Stage 171 converted SMG spread benefits to recoil so CHOKE would not net to zero. The
honest leftover: rank-9 CHOKE became recoil −12% / spread +12%, which is rank-6 COMPENSATOR.

**What changed.** `stack_smg:choke` is authored as recoil −12% / ADS strafe −12%. Other weapons keep
the spread/recoil choke. Fairness is untouched.

**Proof.** `tests/chiptrade.test.ts`: CHOKE costs adsMove, COMPENSATOR costs spread, line is
`CHOKE: −12% recoil / −12% ADS strafe`. Mutation: SMG uses the shared choke template — costs
become spread, 1 fail.

## Stage 200 — Higgsfield plates sat in the manifest and never hit a mesh

**Goal.** `public/assets` already held awnings, billboards, chain-link, kernel hull, crowd coats,
district bricks, mill variants, and more. `dressLevel` still bound a handful of ids. Awnings were
flat magenta. THE KERNEL was a dark box. Pedestrians wore the cloak plate twice. The rest of the
city was procedural canvas.

**What changed.** Those named plates bind on the matching materials (fail-soft). District facades
pick amber/cyan plates plus unused mill variants. New hull/CRT/cobble/skin plates were conditioned
from leftover mill variants. Catalog skins 17–20 (phage, longwave, hammer, baton).

**Proof.** `tests/assets.test.ts` lists the leftover ids in the renderer sources. `lint:assets` 171
assets, 0 violations. Mutation: drop `"tex_awning_cy"` from city.ts — 1 fail.

## Stage 199 — Ghostfile node rows quoted a second, rounded trade

**Goal.** Stage 190 made the hex tooltip print `formatChipLine` from the settled mods. The FILE
panel (Tab) still rebuilt the same node with `Math.round` and the camelCase key. COLLATERAL's
tooltip said `+40% regen / −2.25% move, −23.5% reload`. The row under it said
`+40% shieldRegen / −2% moveSpeed, −24% reloadSpeed`.

**What changed.** `ledgerTradeText` takes the trade half of the node's line. The row interpolates
that. One string, both places.

**Proof.** `tests/chiptrade.test.ts`: COLLATERAL is `+40% regen / −2.25% move, −23.5% reload`,
not `reloadSpeed` or `−24%`. FILE-panel source must call `ledgerTradeText(it)` and must not
contain `Math.round(Math.abs(m.delta) * 100)`. Mutation: row lists `m.stat` instead — 1 fail.

## Stage 198 — Online FX replayed the predicted swap

**Goal.** Stage 196 gave every FX id an online case. Swap, throw, charge, lunge and melee
already play from local prediction (`applyInput` predictOnly, then `onEvent`). Playing them
again on `FX.swap` for `playerId === me` doubled the click.

**What changed.** Those five play only when `playerId !== me` (or `=== me` then `break` for
melee). Teammates still hear them. You already did.

**Proof.** `tests/onlinefx.test.ts`. Mutation: FX.swap plays for me — 1 fail.

## Stage 197 — PAID printed the raw float

**Goal.** `client/file.ts` printed `PAID ${run.paid} $CAPITAL`. `run.paid` is $CAPITAL, often a
fraction after settlement (Stage 185). The prizes line beside it uses `toFixed(0)`. A file at
month-12's 0.4252 rate showed `PAID 85.04109589041096 $CAPITAL`.

**What changed.** `Number(run.paid).toFixed(2)`.

**Proof.** `tests/paidfmt.test.ts`. Mutation: raw interpolation — 1 fail.

## Stage 196 — Wasps going down online made no sound

**Goal.** Offline, `waspDeath` logs WASP-NN DOWNED and plays `audio.explosion(false)`; `mechDeath`
does the same with the bigger bang. The room already puts both on the wire as `FX.waspDeath` /
`FX.mechDeath`. The online switch logged the line and returned. Swap, throw, charge-full, lunge,
melee and full-wake were the same: on the wire, no case.

**What changed.** The online FX switch has a case for every `FX` id. Wasp/mech deaths play the
same explosions as offline. The walk is the FX table itself.

**Proof.** `tests/onlinefx.test.ts`. Mutation: waspDeath HUD-only — 1 fail.

## Stage 195 — Probe checks that fail on a boundary are not guards

**Goal.** `probe:net` required `far.d > 30` while BRAVO paces a waypoint at 30 m. `probe:identity`
required `owed.kills >= 2` when a Debt is the enemy who closed you *most*. Both had been seen
fail with the behaviour they actually test still holding.

**What changed.** Earshot is `far.d >= 29.5 && nearest >= 28`. Debt is `kills >= 1`.

**Proof.** `tests/probesflake.test.ts`. Mutation: `> 30` / `>= 2` restored — those strings fail.

## Stage 194 — A mech lock was silent online

**Goal.** Offline, `flagged` plays the HUD flag and the two-tone once a second. Online
`FX.flagged` played only the HUD. The server already delivers the event.

**What changed.** Both paths call `mechHasYou()`.

**Proof.** `tests/mechflag.test.ts`. Mutation: HUD-only `FX.flagged` — 1 fail.

## Stage 193 — A hitch made every hop land like a roof drop

**Goal.** Fall speed was `(v.y - lastY) / min(rawDt, 1/30)`. A true 6 m/s landing read as 15 m/s
at 12 fps and slammed the camera the full 0.22 m. Dip recovery also drained on the capped clock.

**What changed.** `fallSpeed(lastY, y, rawDt)`. `landT` drains on `rawDt`. Local pose `vy` /
`turnRate` use `rawDt` too.

**Proof.** `fallSpeed` is −6 at 1/60, 1/20 and 1/12. Mutation: divide by capped `dt` — 1 fail.

## Stage 192 — A grenade's light faded per frame

**Goal.** Blast mesh opacity used `(clock - born) / life`. The point light did `intensity *= 0.85`
per update. Halfway through a 0.45 s frag: 0.62 at 144 Hz, 13.4 at 60 Hz.

**What changed.** `intensity = peak * (1 - t)` on the same `t` as the sphere.

**Proof.** `tests/blastlight.test.ts`: 32× 1/144 and 13× 1/60 agree within 3. Mutation: `*= 0.85`
— 144 Hz is 0.66, not ~60.

## Stage 191 — Online respawn was silent

**Goal.** `audio.respawn` and `◆ BACK ON THE LEDGER` lived on the sim's `respawn` event. Online
the client never steps the world, and the server does not put `respawn` on the wire. `onSnapshot`
already computed `wasAlive` and used it only for correction stats.

**What changed.** The dead→alive edge on the snapshot calls `backOnTheLedger()`, the same door
the sim event uses offline. Did not add `respawn` to the wire.

**Proof.** `tests/respawncue.test.ts`. Mutation: snapshot edge omitted — 1 fail.

## Stage 190 — Ledger node lines quoted the pre-scale costs

**Goal.** `reconciled()` rescales costs so the Auditor balances, then ships the authored
`line`. COLLATERAL said −20% reload and applied −23.5%. The Ghostfile row printed the real
mod; the hex tooltip printed the authored line.

**What changed.** `reconciled()` writes `formatChipLine` from the settled benefits and costs.
`lintItemSchema` `line-matches-mods` rebuilds it. Keystones keep their authored lines.

**Proof.** COLLATERAL is `+40% regen / −2.25% move, −23.5% reload`. Mutation: authored line
restored — 2 fail.

## Stage 189 — Firmware lines quoted the multiplier, not the integer

**Goal.** Patches `Math.round` onto a small base. THREE-COUNT said +15% and dealt 16→18
(+12.5%). DOUBLE BARREL said −8% pellet and dealt 10→9 (−10%), and cut the mag 6→4 with no
mention. SLAM FIRE said −15% and landed on the same 9. MEASURED said +26% and dealt 9→11
(+22%).

**What changed.** The lines use the integer the patch produces. DOUBLE BARREL names magazine 4.
A walk: a damage change on the patch is a percentage on the line within 0.6 points; a mag
change is named.

Did not change the patches (TTK / fairness). The lie was the copy.

**Proof.** `tests/firmware.test.ts`. Mutation: DOUBLE BARREL back to −8% and no mag — 2 fail.

## Stage 188 — Chip lines quoted the template, not the mods

**Goal.** Every chip is a template remapped per weapon: the hammer's spread benefits are ×0.7,
the SMG's spread benefits become recoil, the Clockeater's fire-rate benefits become reload,
then `settle()` rescales the costs. The kit panel printed `t.line` verbatim, with one rewrite
for Clockeater fire-rate. CHOKE on the hammer said −12% spread and delivered −8.5%. CHOKE on
the SMG said −12% spread and delivered −12% recoil. COUNTERWEIGHT on the SMG sold a cone it
does not move.

Measured: 31 named percentages across the 160 chips did not match a settled mod.

**What changed.** `formatChipLine` builds the line from the settled benefits and costs. The
template string is no longer shown. `lintChipSchema` `line-matches-mods` rebuilds the line
and fails if they differ.

Did not retune the ledger-node lines (item 15) or firmware damage rounding (item 12). Those
are other tables.

**Proof.** `tests/chiptrade.test.ts`: hammer CHOKE is "−8.5% spread / +8.5% recoil"; SMG CHOKE
is "−12% recoil / +12% spread"; SMG COUNTERWEIGHT does not say spread. Mutation: lines back
to `${t.name}: ${t.line}` — 5 fail, including the shipped-manifest lint.

## Stage 187 — OVERCHARGE sold a pierce the stock rail already has

**Goal.** OVERCHARGE's line was "+8% charge time, +8% damage, pierces cover". Stock LONGWAVE
already has `charge.pierce: true`. Pierce in the sim continues through bodies in front of a
wall; `castRay` clamps to the nearest box first, so nothing behind cover is a candidate.
The player pays +8% charge for a headline that is both redundant and false.

Did not teach rays to pass level geometry. That is a different gun.

**What changed.** The line is the two stats. The patch no longer writes `pierce: true` over
true. A walk: a firmware that names "pierces cover" must be adding pierce the stock weapon
does not have.

**Proof.** `tests/firmware.test.ts` (8). Mutation: line and `pierce: true` restored — 2 fail.

## Stage 186 — CAPACITOR sold a second shot the rail cannot need

**Goal.** CAPACITOR's line was "−15% charge time, −7% damage (two shots past 25 m)". Charged
damage is 102. A Blank is 100 effective. The LONGWAVE range profile is fullTo === falloffTo
=== 200, minMult 1, so falloff is 1 at every metre the ray travels. 102 one-shots at 1 m and
at 259 m. The harness at 40 m is 0.767 s / 1 shot vs stock 0.917 s / 1 shot.

Did not add a 25 m falloff. That would two-shot at the weapon's own ideal range (40 m) and is
a balance rewrite. The lie was the parenthetical.

**What changed.** The line is the two stats it actually applies. A walk: any firmware that
names "two shots past N m" must deal less than 100 at N+1 m.

**Proof.** `tests/firmware.test.ts` (6). Mutation: parenthetical restored — 2 fail (the walk
at 26 m still deals 102; CAPACITOR still says two shots).

## Stage 185 — Reconciling a later day wiped yesterday's unpaid units as stranded

**Goal.** `counter.run.owed` is units and it carries across days. `run.paid` is $CAPITAL.
`settle-run` already spends `min(owed, today's row)` and credits `line.amount`. The
reconciliation promised the same: leftover unpaid from a day with no wallet is reported,
never cleared.

`driftOf` treated "in this day's epoch" as "every unit on the file was paid for". A file
that banked 20 unlinked, then linked and banked 150 on a later day, settled that later day
correctly (`owed` 20, `paid` 150) and the next backlog pass classified the 20 as stranded,
zeroed it, and wrote `paid: 150 + 20`. The 20 were units; `paid` is $CAPITAL.

Measured with the real `reconcileRunBacklog({fix:true})` after that night: `{kind:"stranded",
units:20, fixed:true}`, `owed:0`, `paid:170`. The existing unpaid guard never re-banked, so
it stayed green.

**What changed.**

- `clearedDay` on the run counter — settle-run and the direct withdrawal set it when they
  spend the day's row. `driftOf` then reports leftover as `unpaid`, not `stranded`.
- A stranded repair copies settle-run: `spent = min(owed, today's row)`, `paid +=` the epoch
  leaf's $CAPITAL, `clearedDay = day`. Both call sites share `clearStranded`.

**Proof.** `tests/settle.test.ts`: leftover 20 survives the later night and the backlog;
a mixed stranded clear spends 20 of 200 and credits 20 $CAPITAL, not 200. Typecheck, unit
tests, economy lint.

Mutations:

- **A**, `driftOf` back to "in epoch ⇒ all owed is stranded": **2** fail — leftover is
  stranded-and-fixed; mixed report says 200 units.
- **B**, repair `owed:0, paid += owed`: **1** fails — mixed clear wipes the carried 180.

## Stage 184 — Threat never widened how far VANTAGE could see

**Goal.** Threat Rating "rises with the account … and the districts answer: more patrols, wider
detection, the PA calling your moniker." `ThreatProfile.detectMult` is `1 + 0.06 * r`.
THREAT_LINES[6] is "FLAGGED · DETECTION DOUBLED". The wasp's notice distance is
`trueD / SightTarget.detectMult` against `WASP.detect` (18 m).

`detectMult` had zero readers outside its own file. `spawnThreat` placed `extraWasps` /
`extraMechs`. `stepAI` built each SightTarget from the file's build sheet alone
(`modsFor(p).droneDetect * (0.85 + 0.15 * footstep)`). The only test was
`expect(t.detectMult).toBeCloseTo(1.36)` — arithmetic nothing runs. Measured on a real
lease_row world, a stationary wasp 22 m from a Blank (LOS open on +x from spawn):

| | detectMult on the target | chase by 2 s |
| --- | ---: | --- |
| Threat 0 | 1.00 | no |
| Threat 10 | 1.00 (profile says 1.6) | no |

The ticks were identical. At 18 × 1.6 = 28.8 m the rating-10 world should have flipped.

**What changed.**

- `World.threatDetectMult` — default 1 (PvP never calls spawnThreat). `spawnThreat` writes the
  profile. `stepAI` multiplies it into SightTarget next to the build. `hashWorld` carries it.
- Did not retune `1 + 0.06 * r` so rating 6 is 2.0. The line still overclaims; wiring the field
  is this stage. Doubling is a balance decision, same family as Stage 173.

**Proof.** `tests/detectmult.test.ts` (2): spawnThreat writes 1 / 1.36 / 1.6; 22 m is patrol at
Threat 0 and chase at Threat 10. Typecheck clean. `npm test` 1005/1005 across 111 files.
Campaign / economy / assets lints clean. Fairness not re-run: this stage does not touch a sheet.

Mutations:

- **A**, `stepAI` back to the build sheet alone: **1** fails — Threat 10 does not chase at 22 m.
- **B**, spawnThreat does not write the field: **1** fails — the world stays at 1 after rating 6.
  The 22 m play still passes, because that test sets the field itself. Each layer owns one.

## Stage 183 — The rejoin knock gave up at 31.5 s of a 60 s seat

**Goal.** After a drop, the client knocks on a doubling wait "for as long as the room keeps the
seat". `REJOIN_GRACE_SECONDS` is 60. `server/room.ts` holds the file for that many milliseconds
(`now - disconnectedAt > rejoinGraceSeconds * 1000`). The comment on the wait rule says the last
try and the grace are the same number, so a knock still lands while the seat is there.

`rejoinDelay` refused a try once the geometric sum `500 * (2^n - 1)` would exceed the window.
Try 7 would land at 63.5 s, so the plan stopped at try 6. Measured on the shipped functions:

| try | wait (ms) | lands at (ms) | unused (ms) |
| --- | ---: | ---: | ---: |
| 1 | 500 | 500 | 59500 |
| 2 | 1000 | 1500 | 58500 |
| 3 | 2000 | 3500 | 56500 |
| 4 | 4000 | 7500 | 52500 |
| 5 | 8000 | 15500 | 44500 |
| 6 | 16000 | 31500 | 28500 |
| 7 | null | — | 28500 |

`rejoinTries()` was 6. 47.5% of the hold unused. `client/game.ts` then prints
`LINK LOST · THE ROOM HAS LET THE SEAT GO AFTER 6 TRIES` and does not knock again. The room
still has the seat. The existing test encoded this: it asserted the geometric sum of six waits
was `<= 60000` and the sum of seven was not, which is the halt, not the promise.

**What changed.** `rejoinDelay` walks the waits, doubles while the double fits, and spends the
remainder on the last try so it lands on the window. Default plan: six doubles, then 28.5 s,
seventh knock at 60.0 s, try 8 is null. `rejoinTries()` is 7. The HUD line is still the same
string; it now reports seven tries because it reads the rule.

Did not densify the 28.5 s tail into extra 16 s knocks. That would recover a 40 s outage sooner;
it is a different shape than "the last try and the grace are the same number".

**Proof.** `tests/rejoin.test.ts` (7): last landing is 60000 ms; a knock never lands after the
window for grace 0, 1, 5, 15, 60, 120 s; a 1 s window's last knock is at 1000 ms, not 500.
Typecheck clean. `npm test` 1003/1003 across 110 files. Four lints: fairness PASS (366 builds,
recorded debt 89, new 0), campaign 0 errors, economy 0, assets 163 / 0 violations.

A 23-probe sweep on this still tree did not finish as a number. The first probe (`stage1`)
passed its checks then threw `page.goto` 30 s on a second page, npm exited 1, and a vite was
left on 5199. Later probes inherited that: several printed `N/N checks passed` and then a
navigation timeout; `probe:cityLife` read 8.4 ticks/s on SwiftShader (the Stage 179 look flake);
`probe:campaign` stayed on the m1 hold (wasps 5→5) — that is Stage 180's anchor, and the probe
is the next thing to point at B, not this wait rule. The wrapper killed the sweep at 60 min
during `probe:body`. Those counts are not this stage's. The unit tests and the four lints are.

Two gates were already red on this tree, not this defect, and would have failed `verify` before
the probes:

- Stage 180's second `Objective` import in `shared/campaign/lint.ts` made `tsc` fail. Dropped the
  duplicate.
- Viewmodel plates call `TextureLoader` from `buildRig` in node tests; no `document`, four
  unhandled rejections, suite exit 1. `load()` fails soft, same as a 404. The walkway test under
  suite load (Stage 179) took 7.6 s against a 5 s default; timeout 15 s.

Mutations, fix reverted:

- **A**, geometric-sum gate restored (`spent = 500*(2^n-1)`, refuse when spent > window): **3**
  fail. Last knock at 31500 not 60000; a 1 s window still ends at 500 ms.
- **B**, start-of-wait gate (`started < window`, no cap): **3** fail. Last knock at 63500, after
  the seat; try 2 of a 1 s window lands at 1500 ms.

The existing geometric-sum assertion would have stayed green under A. It was checking the halt.

## Stage 182 — Threat 5 announced a mech that was not there

**Goal.** THREAT_LINES[5] is "HUNTED · A REPO MECH IS ASSIGNED". `threatProfile` spawned
`extraMechs` at `r >= 6`. At Threat 5 the FILE panel and the explore HUD printed the assignment
next to `+0 MECHS`.

**What changed.** `extraMechs: r >= 5 ? 1 : 0`. The line and the street agree. Later ratings keep
the mech and move the line on, which is what those lines are for.

**Proof.** For every rating 0..10, `/REPO MECH/.test(line)` implies `extraMechs > 0`. Mutation:
threshold back to 6 — Threat 5 fails that walk.

## Stage 181 — Turning the informant in re-leased Marrow, with no death

**Goal.** The m2 choice "TURN HIM IN to Marrow's people" is answered by Marrow in person: "The
Clockeaters will handle it. You won't like how. Neither will I." Nothing in the scene harms her.
The parallel Ida branch has an explicit death line. CLOCKEATER lives on Marrow's depot gig.

`handlersAlive` marked her dead on `m2:informant === "turn"`. The CONTRACTS panel had the same
rule copied, not imported. Four Marrow gigs vanished; two of them were also gated on that
testimony, so CLOCKEATER was locked twice. Measured: `handlersAlive({"m2:informant":"turn"})`
was `{marrow:false}`; `gigsOnOffer` at any Threat returned no Marrow gig.

**What changed.**

- `handlersAlive` — Marrow lives. Ida still dies on expose, because that scene writes it.
- `client/campaign.ts` — the panel reads `handlersAlive` instead of a second copy of the rule.
- `g_escrow_depot` (CLOCKEATER) no longer carries the doubled `not: turn` gate. The harbour
  heist still does: turning him in costs a Clockeater job, not a fixer and not the unique
  weapon.

**Proof.** `tests/campaign.test.ts`: turning him in leaves Marrow alive and `g_escrow_depot` on
offer. Mutation: restore `marrow: t["m2:informant"] !== "turn"` — 2 fail, the alive assertion
and `"g_escrow_row"` on offer.

## Stage 180 — The first mission's hold ran anywhere in Lease Row

**Goal.** "HOLD THE TERMINAL WHILE THE FILE DECRYPTS" is the first combat beat of WAKE UNLISTED.
The text names a place. Every other survive/hold in the 19 contracts names one too: an `at` node
and a radius, so the timer only runs there, the wave spawns there, and `syncFx` draws a marker.

This one was `{ kind: "survive", seconds: 20, text: "HOLD THE TERMINAL WHILE THE FILE DECRYPTS",
waves: 1 }` — no `at`. `stepMission` treats a missing at as "everywhere"
(`inside = !at || nearAny(...)`). The wave spawned on the player. The marker, the radar goal and
the distance readout all vanished for those 20 seconds because they require `o.at`.

Measured on a real lease_row world: reach B, start the hold, teleport to A, wait 21 s. The
objective advanced to "TAKE THE FILE FROM THE CABINET AT E" with the player never at the terminal.
The same table walk returns exactly one unanchored survive/hold in the whole campaign: this one.

**What changed.**

- `shared/campaign/missions.ts` — `at: { node: "B" }, radius: 6`, same as the other escrow holds.
- `shared/campaign/lint.ts` — `hold-is-anchored`: a survive/hold with no `at` is an error. Wired
  through `lintCampaign` so CI sees it, not only a named call.

**Proof.** `tests/hold.test.ts` (5): away from B the timer stalls; at B for 20 s it decrypts; the
wave's wasps are within 12 m of B, not of the player at A; the shipped table has none without
`at`; deleting `at` and running `lintCampaign` still reports `hold-is-anchored`. Existing
`tests/campaign.test.ts` already held the player at B, so it stayed green. Mutations: unanchoring
m1 fails the table walk and the away-from-B test; unwiring the rule from `lintCampaign` fails
*"the rule is not reachable through lintCampaign"*.

## Stage 179 — Every airborne kill after one slide was a slide-jump kill

**Goal.** `KillCtx.shooterSlideJump` feeds `slideJumpKills`, which is the SLIDER moniker and the
FIRST SLIDE-JUMP KILL stamp. The flag is supposed to mean the kill was made during the airborne
arc that began as a slide-jump.

It reconstructed that as `!shooter.grounded && shooter.slideTime > 0`. `slideTime` is set to 0
only on slide *entry* and on respawn. Neither exit branch cleared it — not the slide-jump, not
the normal slide-end. From the first slide of a life until death, `slideTime > 0` is permanently
true and the flag degenerates to plain `!grounded`, identical to `shooterAir` beside it.

Measured on a real world — slide, let it end on its own, then an ordinary jump:

```
SLIDE ENDED  stance stand  slideTime 0.267  grounded true   slideJumps 0
PLAIN JUMP   stance stand  grounded false   vy 7.03         slideTime 0.267
PLAIN JUMP KILL  shooterSlideJump true   shooterAir true   (stats.slideJumps is still 0)
```

A genuine slide-jump is also true, and so is the next plain jump *after landing from one*:
`slideTime` is still 0.100, `slideJumps` is 1, and `shooterSlideJump` is true again. Clearing
`slideTime` on exit is not enough — after a real slide-jump the leftover duration would survive
the landing too.

**What changed.**

- `shared/sim/player.ts` — `fromSlideJump`: this airborne arc began as a slide-jump. Set in the
  slide-jump branch, cleared on landing (the same `nowGrounded && !wasGrounded` that emits `land`),
  on mantle entry (that arc is over; mantle end never fires `land`), and in `reviveMotion`. Both
  slide exits also zero `slideTime`, so the field is the duration of the slide that is happening.
- `shared/sim/world.ts` — `shooterSlideJump` reads `shooter.fromSlideJump`. The field is in
  `hashWorld`, `exportLocal` and `importLocal`.
- `shared/net/protocol.ts` — `fromSlideJump` is a u8 next to `grounded` on LocalAuth.
  `PROTOCOL_VERSION` 10 → 11, so a stale bundle is kicked for the version rather than feeding
  `alive` into the new byte. The fixture snapshot has `local: null`, so its fingerprint is
  unchanged; the join fingerprint moves with the version. A round-trip of a snapshot that *does*
  carry local is in `tests/slidejump.test.ts`.

**Proof.** Typecheck clean. The new tests (10 in `tests/slidejump.test.ts`, the extra MOTION field
in `tests/revive.test.ts`) are green, as is `tests/wire.test.ts` at PROTOCOL_VERSION 11. Mutations
below were watched with the fix reverted. A first full sweep on this machine was not a still tree —
`tests/city.test.ts` timed out at 5 s under suite load and passed in 2.3 s alone; `probe:look`'s
60 Hz check read 5.3 ticks/s on SwiftShader; `probe` timed out waiting for a third page's `ready`;
and a later edit hot-reloaded a page out from under `probe:wake`. Those numbers are not this
stage's. The sweep is re-run on a still tree after this commit.

Four mutations of the original defect and two of the new field's other readers:

- **A**, `world.ts` back to `!grounded && slideTime > 0`: **1** fails, and it is the genuine
  kill — *"a kill in the air out of a slide-jump is one"* — because this stage also zeros
  `slideTime` on the jump, so the old formula now misses the real thing.
- **B**, `fromSlideJump = true` left out of the slide-jump branch: **4** fail (the genuine kill,
  the wire round-trip, the leftover-duration assertion, the export).
- **C**, landing no longer clears the field: **1** fails —
  *"fromSlideJump survived the landing"*.
- **D**, `reviveMotion` does not write it: **2** fail — the structural MOTION walk in
  `tests/revive.test.ts` and *"a respawn does not carry a slide-jump arc into the next life"*.
- **E**, the original defect whole: old formula and `slideTime` left uncleared: **4** fail,
  including *"an ordinary jump-shot after a slide was credited as a slide-jump kill"* and
  leftover `slideTime` 0.267 / 0.100.
- **F**, `hashWorld` omits the field: **1** fails — two lives that differ only in the flag hash
  equal.

A and C are the argument for having both layers: zeroing `slideTime` without the new field
loses the real kill; keeping the field without clearing it on land hands the stamp to the next
plain jump.

## Stage 178 — The file jumped after respawning, with nobody touching the keyboard

**Goal.** A jump press the gate refuses is not thrown away. It is held in `jumpBuffer` for
`MOVE.jumpBuffer` seconds so that it fires the moment it becomes legal — the reason a jump you
pressed a frame too early still works when you land. The gate refuses a jump while crouched, while
sliding under a low gap where `canStand` is false, and past coyote time in the air.

`respawnPlayer` never touched `jumpBuffer`. Worse, the buffer cannot expire while dead:
`stepPlayer` returns at

```ts
if (!p.alive) return reqs;
```

and the decay is *below* that line, so whatever the buffer held at the instant of death is frozen
for the whole respawn wait — waiting longer does not save you. Measured on a real world, a jump
pressed while crouched and then a death, with no key held at any point afterwards:

```
buffer at death 0.100 · after respawn: buffer 0.000  vy -2.50  y 1.02  jumps 0→1
```

The file left the ground on its first live tick. `stats.jumps` counted it, so it also fed the
mastery challenges that count jumps. `grounded` and `airTime` froze at the instant of death the
same way.

**This is Stage 167's defect two layers up.** There, a drone's respawn restored a subset of one
life's state and carried its EMP through death. Here it is the player's, and the missing fields are
the ones that decide whether the file is standing, falling, or about to jump.

**What changed.**

- `shared/sim/player.ts` — `reviveMotion(p, spawn)`: the motion state of one life, written once.
  `createPlayer` calls it after building the object and `respawnPlayer` calls it instead of its own
  shorter list, so there is one definition for the first life and every later one.

The fields it writes are `pos`, `vel`, `yaw`, `pitch`, `stance`, `height`, `grounded`, `airTime`,
`jumpBuffer`, `slideTime`, `slideCooldown`, `slideDir` and the three mantle fields. `id`, `name`,
`team`, `mods`, `kit` and `stats` are not this life's and are not touched — `stats` least of all,
since those are the match's totals and a respawn that cleared them would erase the scoreboard.

**One of those is honest bookkeeping rather than a bug.** The three mantle fields were also stale
across a respawn, but a mantle cannot resume: the branch is gated on `stance === "mantle"` and a
respawn stands the file up. They are written here because they are this life's motion, so that the
next field added to the list cannot be the next one forgotten — not because I found them doing
harm, and the test says which of the two it is checking.

**Proof.** vitest 985/985, six new in `tests/revive.test.ts`, nothing existing moved — worth saying
for a change to what every respawn in the game does, and to what `createPlayer` returns. The full
sweep ran green on a still tree: **23 probes, 523 checks, nothing skipped and nothing rerun** —
`probe` 21/21, `probe:look` 18/18, `probe:net` 27/27, `probe:arsenal` 32/32, `probe:wake` 27/27,
`probe:file` 20/20, `probe:city` 45/45, `probe:cityLife` 21/21, `probe:mastery` 23/23,
`probe:identity` 25/25, `probe:campaign` 46/46, `probe:endgame` 18/18, `probe:economy` 1/1,
`probe:counter` 16/16, `probe:crawl` 11/11, `probe:ship` 11/11, `probe:run` 27/27, `probe:harden`
9/9, `probe:frame` 8/8, `probe:mobile` 40/40, `probe:persist` 7/7, `probe:tps` 50/50, `probe:body`
21/21. Build clean, smoke 7/7.

That full green matters more here than usual. `pos`, `vel`, `stance` and the rest of this state
cross the wire and feed `hashWorld`, so a respawn that now writes four more fields is a change the
determinism replay, the prediction and reconciliation probes and the 50-check tick-rate probe all
had to agree with. They did, unchanged.

Four mutations:

- **A**, the respawn back to its old subset — the defect itself: 3 of 6 fail.
- **B**, `jumpBuffer` alone left out: **1** fails, and it is the player-visible one —
  *"the file jumped after respawning with no key held: expected 1 to be +0"*.
- **C**, `grounded` and `airTime` alone left out: **1** fails, and it is the structural walk —
  *"airTime differs between a respawned file and a fresh one: expected '0.0166…' to be '0'"*.
  B and C are the argument for having both layers: the field a player can feel is caught by the
  test that plays, and the field nobody can see is caught by the test that counts.
- **D**, `reviveMotion` also clearing `stats.kills`: 1 fails. The scope of what a life owns is
  tested, not just the contents.

## Stage 177 — Thirty-five seconds of sound the browser was never asked to make

**Goal.** `client/audio.ts` heads a block *"the opening crawl: a hum under the text, a soft key per
two characters, the tear"*, and `client/crawl.ts` says *"the hum runs under the text and stops dead
at the cut"*. The crawl calls all three cues for its whole run.

A browser will not build an `AudioContext` without a user gesture, and `GameAudio` builds its
context in exactly one place: `resume()`. The only thing that called it during boot was a click on
the **canvas** — and the crawl's overlay sits over the canvas and calls `e.stopPropagation()` on
its own clicks. Nothing ever reached the listener. Every cue arrived at `if (!this.ctx) return;`
*after* counting itself, which is why `audioCues()` looked healthy the whole time.

Measured in a real browser, on the same dev server, before and after this stage — counting every
`AudioContext` the page constructs:

| | before a gesture | after one key over the crawl | after one click on the overlay |
| --- | --- | --- | --- |
| shipped | 0 contexts, cues `crawlHumOn:1 crawlTick:2` | **0** | **0** |
| now | 0 contexts (correct: no gesture yet) | **1** | **1** |

Zero, either way in, for the whole crawl — and the keyboard exit takes `finish(false)`, which
skipped even the one `resume()` the code had, so the menu that follows played its title-card sting
and UI cues into a null context too.

**What changed.**

- `client/game.ts` — a gesture *anywhere in the document* wakes the audio: `pointerdown`,
  `keydown` and `touchstart`, in **capture** phase, because the overlay stops the bubble. Not
  `once`, since `resume()` is idempotent and also lifts a context the browser suspended while the
  tab was backgrounded. The crawl keeps swallowing its own clicks — it owns them — and a test
  holds that it still does, because "stop swallowing the click" would have been the wrong fix.
- `client/audio.ts` — `humWanted`. The hum is edge-triggered at the moment the first paragraph
  starts typing, long before any gesture, so the *request* has to outlive the missing context:
  `resume()` starts a hum that was already asked for. A tick and a tear are one-shots and are
  simply gone; a hum that runs for half a minute is not.
- `client/main.ts` — `audioLive()` on the probe surface. `crawl().hum` is the crawl's own request
  latch, which is what the probe was already reading; `audioLive()` is whether a context exists and
  whether the oscillator is running. The two came apart for the entire crawl and nothing could see
  it. `crawlHumming` had existed since Stage 12 and was read by nothing.

**Proof.** vitest 979/979, eight new in `tests/crawlaudio.test.ts`, nothing existing moved. The
full sweep ran on a still tree: 22 of 23 probes green, 523 checks, with `probe:crawl` **11/11** (10
before — the new check) and `probe:run` 27/27 in sequence for the sixth sweep running. Build clean,
smoke 7/7.

`probe:identity` failed once in that sweep, at 24/25, and it is not this stage's: the clause that
missed was `owed.kills >= 2` reading 1, from real combat between three live clients, while every
other clause of that check (the Debt's name, its target on both the server and the client) matched.
Re-run three times on this tree and twice on a clean tree: **5/5 pass**. The mechanism rules it out
as well — `probe:identity` calls `resumeAudio()` on every page immediately after join, before any
combat, so the AudioContext is built at the same moment with and without this change, and the new
listener's later `resume()` calls find a context already there and do nothing.

`probe:net` then failed once on the re-run, at 26/27, on `far.d > 30` reading **30.0** — the bot
paces to a waypoint that straddles the threshold. Re-run: 27/27, at 30.1. Everything that check is
about (0 footsteps heard at range, walking in 18 of 18 samples) held in both. Both of these are
marginal guards rather than defects, and both are written down rather than left to be rediscovered.

Four mutations:

- **A**, the document listener removed — the defect itself: 1 unit test fails, and `probe:crawl`
  fails reading *"after one key: ready **false** humming false"*.
- **B**, `humWanted` dropped so a hum asked for early never starts: 3 unit tests fail, and the probe
  fails reading *"after one key: ready **true** humming **false**"* — a context, and silence under
  it. Two mutations, two different signatures out of one check, which is what a check earning its
  place looks like.
- **C**, `humWanted` latched on and never cleared: 1 fails — a hum the crawl had already stopped at
  the cut must not come back when the gesture arrives.
- **D**, the listener without `capture: true`: 1 fails. Capture is the whole mechanism; without it
  the overlay blocks it again and the fix is decorative.

**Most of this stage was spent measuring the wrong thing, and that is worth writing down.** The
first four measurements all reported 0 contexts *with the fix in place*, and the served module had
the new listener in it when I curled it. The page was loading `/assets/index-BIWgUxr9.js` — a built
bundle. A `vite preview` server started by a throwaway script two stages earlier had leaked: the
script killed the `npx` shim and left the real child alive on port 5299, serving `dist/` from
before this stage. Every "measurement" was of stale code. Then, hunting it, I ran
`ps | grep -E '[v]ite' | xargs kill` — and the pattern matched my own shell's command line, so I
killed the shell mid-command (exit 144). That is the exact trap the method rules name; I walked
into it anyway. The rule now has a second half: kill by PID, and kill the *process*, not the `npx`
wrapper in front of it.

## Stage 176 — Four hundred $CAPITAL for three things the game could not see

**Goal.** The Deep Wake season pass is the largest sink in the economy: `SEASON_PASS_PRICE = 400`
$CAPITAL, burned on chain, gone from the supply. What it hands back is deliberately small and
deliberately off-chain — a theme and two slots, *"no stat, no token, nothing the sim reads"*, so
that the game's biggest sink can never become a trading vehicle:

| grant | what it says it is |
| --- | --- |
| `theme_deep_wake` | DEEP WAKE — *"the colour the graph goes when a season ends and nobody wins"* |
| `alias_4` | ALIAS SLOT IV — *"a fourth saved name, for the season you paid to sit out of"* |
| `preset_6` | PRESET SLOT VI — *"a sixth saved loadout"* |

The counter-ledger granted them like this:

```ts
if (bought.includes(season)) for (const id of SEASON_PASS_GRANTS) if (!a.owned.includes(id)) a.owned.push(id);
```

`a.owned` is the progression-item list: nodes, chips, keystones, weapons. Every consumer of a
cosmetic reads `a.cosmetics`, whose only writer is the Wakelight shop. Measured on an account
holding exactly what that line writes:

```
AFTER : owned has all grants? true · cosmetics []
RESULT slotsOf {"aliases":1,"presets":1}
RESULT setTheme(theme_deep_wake) -> false
RESULT savePreset(6) -> {"ok":false,"reason":"slot 6 not owned (1 slots)"}
RESULT setAlias(4) -> {"ok":false,"reason":"slot 4 not owned (1 slots)"}
```

The theme would not apply. Both slots stayed locked. **The pass bought nothing at all**, and the
400 $CAPITAL was burned all the same.

**The probe that proves the sink was checking the wrong list.** `probe:run` asserts the burn, the
supply drop and then `SEASON_PASS_GRANTS.every((g) => fs.owned.includes(g))` — the list the defect
wrote to. It passed every run. This is the same shape as Stage 171's chip lint and Stage 174's
ending filter: a guard that measures the half that works.

**Half the repair is the list; the other half is how a slot is counted.** `slotsOf` read the
*number* of `alias_` / `preset_` ids on the file. That is right for anything bought in the shop,
because `buyCosmetic` refuses slot n before slot n-1, so shop-bought ids are contiguous and the
count equals the highest. It is wrong for a pass that grants `alias_4` and `preset_6` outright —
one past the top of the shop (which sells up to `alias_3` and `preset_5`) and the only way to reach
either. Moving the ids to `cosmetics` alone would have given a pass holder **two** alias slots, not
four, and `setAlias(4)` would still have failed. `slotsOf` now reads the highest slot owned, which
is identical for every combination the shop can sell — a test walks the whole ladder and requires
the two readings to agree at each rung — and means what the id says for a grant.

**What changed.**

- `shared/economy/catalog.ts` — `grantSeasonPass(a)`: the grants go on `a.cosmetics`, idempotently,
  because a reconcile runs on every counter refresh. That also repairs files that already paid: the
  next refresh puts the cosmetics where they can be found, with no migration.
- `server/chain/ledger.ts` — `reconcile` calls it.
- `shared/endgame/rewrite.ts` — `slotsOf` reads the highest owned slot; `buyCosmetic` refuses to
  sell a slot the file already has, so a pass holder cannot be charged 90 Wakelight for ALIAS SLOT
  II when they already hold four.
- `probe/stage14.ts` — the sink check reads `cosmetics`.

**Proof.** vitest 971/971, thirteen new in `tests/seasonpass.test.ts`, nothing existing moved. The
full sweep ran green on a still tree: 23 probes, 523 checks — `probe` 21/21, `probe:look` 18/18,
`probe:net` 27/27, `probe:arsenal` 32/32, `probe:wake` 27/27, `probe:file` 20/20, `probe:city`
45/45, `probe:cityLife` 21/21, `probe:mastery` 23/23, `probe:identity` 25/25, `probe:campaign`
46/46, `probe:endgame` 18/18, `probe:economy` 1/1, `probe:counter` 16/16, `probe:crawl` 10/10,
`probe:ship` 11/11, `probe:run` **27/27** with the sink check now reading the list the game uses,
`probe:harden` 9/9, `probe:frame` 8/8, `probe:mobile` 40/40, `probe:persist` 7/7, `probe:tps` 50/50,
`probe:body` 21/21. Build clean, smoke 7/7. `probe:run` passed in sequence for the fifth sweep
running.

The central guard is written over `SEASON_PASS_COSMETICS` rather than over these three ids: for each
grant it asks the game to *use* the thing — apply the theme, write to the alias slot, save into the
preset slot — so a fourth grant added later has to work rather than merely be present. Presence is
exactly what the old probe check measured.

Six mutations:

- **A**, the grant back on `a.owned` — the defect itself: 3 of 13 fail.
- **B**, `slotsOf` back to counting ids: 3 fail, including the ladder test that holds counting and
  highest to agree wherever both are defined.
- **C**, the already-owned sale check removed: 1 fails, on Wakelight actually leaving the wallet.
- **D**, the grant disconnected from `reconcile` while the function stays: **this passed**, and was
  a hole — every other test called `grantSeasonPass` by name. `probe:run` does catch it, against a
  real chain, in about two and a half minutes. Closed with a cheap check that the ledger's held-pass
  branch calls the grant, so the unit suite says it too.
- **E**, the grant not idempotent: 1 fails.
- **F**, `slotsOf` taking the max without the floor of one: 2 fail — a file that has never bought
  anything still has one alias and one preset.

**The architecture caught me mid-stage, which is the point of having it.** `grantSeasonPass` went
first into `shared/endgame/rewrite.ts`, beside the other cosmetic functions, importing the pass
definition from `shared/economy/catalog.ts`. Two tests failed immediately: `tests/quarantine.test.ts`
and `tests/counter.test.ts` both hold that the PvP match bundle never reaches `shared/economy` or
`server/chain`, and `rewrite.ts` is in that bundle's graph. The import would have pulled prices into
the room. The grant lives on the economy side instead, where the pass it implements already lives.

## Stage 175 — Two of the six lattice nodes were sealed inside a building

**Goal.** BLIND THE MODEL is mission five of seven. *"Destroy the sensor lattice district by
district. VANTAGE responds like an immune system — the hardest combat in the arc."* The objective
reads **PUT OUT THE SIX LATTICE NODES**, and it names six places:

```ts
spots: [{ node: "B" }, { node: "C" }, { node: "D" }, { node: "E" }, { x: 0, z: -30 }, { x: 0, z: 30 }]
```

Four are level nodes, which the district generator puts on open ground. Two are coordinates typed
into the mission table, and both land inside a building on LEASE ROW:

| spot | standing column | |
| --- | --- | --- |
| node B | clear | |
| node C, D, E | clear | |
| `(0, -30)` | inside `x[-11, 11] y[0, 4.2] z[-31.4, -22]` | the split block's south building |
| `(0, 30)` | inside `x[-11, 11] y[0, 4.2] z[22, 44]` | the tower block's ground floor |

A lattice node is a dummy 1.8 m tall. Both were entombed under 4.2 m of concrete with eight metres
of it in every horizontal direction. Measured by sweeping a full circle of eye positions at four
radii:

```
node B (control)     line of sight from 222/288 eye positions (nearest radius 2 m)
literal (0,-30)      line of sight from   0/277 eye positions · from 20 m overhead: false
literal (0,30)       line of sight from   0/277 eye positions · from 20 m overhead: false
```

Zero, from anywhere, at any range, including from directly above. `castRay` clips at the first
solid box before it tests a single dummy capsule, and `applyExplosion` refuses any target that
fails `canSee`, so no weapon and no grenade in the game could touch them. Campaign worlds run with
`dummyRespawn: false`, so the pair never cycled out and got another chance. **The mission asks for
six and can deliver four.** It cannot be completed.

One branch escapes: the m3 PUBLISH variant asks for four and names four nodes. Every other route
through the arc — including the m3 "HOLD IT" answer — reaches mission five and stops there.

**What changed.**

- `shared/campaign/lint.ts` — `lintSpotsAreInTheOpen`, wired into `lintCampaign`. Every spot every
  mission, gig and variant names is resolved on its own level; a standing column inside solid
  geometry is `spot-is-in-the-open`, a destroy spot with no sightline from any open ground is
  `spot-can-be-shot`, and a node the level does not have is `spot-names-a-node`. All errors. Run
  over the shipped campaign it reports exactly the two, across 7 missions and 12 gigs — so this was
  one authoring slip, not a pattern, which is worth knowing before rewriting anything else.
- `shared/campaign/missions.ts` — the two spots move to `(32, -32)` and `(-34, 34)`.

**The new coordinates were found, not chosen.** Scanning LEASE ROW for ground with at least 3.5 m
of clearance, at least 12 m from any existing node, and with a sightline, gives 16 candidates; the
best in each half are `(32, -32)` and `(-34, 34)` at **4.4 m** of clearance each. The generator
gives its own node B **4.2 m**, so the two typed spots now stand in more room than the level's own
work, and the test holds them to that comparison rather than to a number. They sit on opposite
outer diagonals, which spreads the six across the district the brief says to blind — the original
pair was meant to be north and south on the centre axis, and that axis has no open ground: measured
along `x = 0`, clearance never exceeds 5.0 m and that is the plaza itself, with the rest of the line
either buildings or half-metre gaps between props.

**Proof.** vitest 958/958, twelve new in `tests/spots.test.ts`, nothing existing moved. The full
sweep ran green on a still tree: 23 probes, 523 checks — `probe` 21/21, `probe:look` 18/18,
`probe:net` 27/27, `probe:arsenal` 32/32, `probe:wake` 27/27, `probe:file` 20/20, `probe:city`
45/45, `probe:cityLife` 21/21, `probe:mastery` 23/23, `probe:identity` 25/25, `probe:campaign`
46/46, `probe:endgame` 18/18, `probe:economy` 1/1, `probe:counter` 16/16, `probe:crawl` 10/10,
`probe:ship` 11/11, `probe:run` 27/27, `probe:harden` 9/9, `probe:frame` 8/8, `probe:mobile` 40/40,
`probe:persist` 7/7, `probe:tps` 50/50, `probe:body` 21/21. Build clean, smoke 7/7. `probe:run`
passed in sequence for the fourth sweep running, which is now long enough to say the shape Stages
166–171 kept hitting has not recurred since.

The guard walks the manifest, not a list: every spot of every objective of every mission, gig and
variant, resolved on that mission's own level. A seventh lattice node typed into the wrong block
fails it before anyone plays mission five.

Six mutations:

- **A**, both coordinates put back — the defect itself: 9 of 12 tests fail and the lint errors
  twice.
- **B**, only one of the two put back: 9 fail and the lint errors once. The guard counts, so a
  half-fix is not a fix.
- **C**, the rule unwired from `lintCampaign` while the function stays: **this passed**, and was a
  hole. Every test called `lintSpotsAreInTheOpen` by name, so the rule could be disconnected from
  the thing CI actually runs and nothing would say so. Closed with a test that injects a bad spot
  and requires `lintCampaign` itself to report it; the mutation now fails.
- **D**, the rule skipping variants: 1 fails.
- **E**, the rule looking only at `destroy` and not at `reach`, `hold`, `survive at` or `escort`:
  1 fails. A place you must stand in is as unreachable as a place you must shoot.
- **F**, the standable test ignoring box height, so every spot reads as blocked: 6 fail and the
  lint errors on the *new* coordinates. A rule that says no to everything is not a working rule.

**One thing tried and thrown away.** The check that would really answer this is "can the player
walk there", so I wrote a flood fill from the plaza over a 1 m grid. It reported node B, node E and
both new candidates as unreachable — all four demonstrably reachable, since gigs send players to
them and the campaign is played through them. The model was wrong: a 1 m lattice with a disc test
cannot represent step-ups, mantling or squeezing past a bollard, which is most of how this game
moves. Rather than tune it until it agreed with what I already believed, it is gone. The lint keeps
the two questions it can answer exactly — is the column solid, and can anything see it — and the
walkable question stays unanswered rather than answered wrongly.

## Stage 174 — Two endings were written, listed, and could never be played

**Goal.** MELTDOWN ships six endings. The player reaches the white office, Wern makes the offer, and
the last line of the campaign is a choice. Four of the six are written by that choice. Two are
written by nothing at all.

`wipe_fire` — THE CITY THAT READ THE FIRE — and `wipe_quiet` — THE QUIET WAKING — are the two
readings of wiping the ledger, told apart by what the m6 broadcast said. The comment above `ENDINGS`
states the contract it was built to satisfy:

> m6:broadcast wrote "full" or "redacted" and nothing read either until now: the arc could be
> finished twice, having answered its final question differently each time, and end the same way
> both times. These two are mutually exclusive by construction — every run opens exactly one.

That is precisely what still happened, because the office did not choose by gate. It read the id:

```ts
const endingId = t["m7:ending"] ?? "wipe";
const e = ENDINGS.find((x) => x.id === endingId) ?? ENDINGS[0]!;
```

and the only writer of `m7:ending` is the m7 office script, whose four choices write `wipe`,
`chair`, `chair_clockeater` and `chair_estate`. Across the whole repository the strings `wipe_fire`
and `wipe_quiet` appear in `testimony.ts` and in test and probe files, and nowhere as a value any
gameplay code writes or selects. Measured:

```
broadcast=full      ENDINGS OPEN panel: [wipe, wipe_fire]   ->  delivered: wipe "WIPE THE LEDGER"
broadcast=redacted  ENDINGS OPEN panel: [wipe, wipe_quiet]  ->  delivered: wipe "WIPE THE LEDGER"
```

The CONTRACTS panel names the ending. `probe:campaign` takes a screenshot of the panel naming it.
The player never sees it. Two endings' worth of finished writing — six lines that no one could
reach — and the arc ends the same way twice however its last question was answered.

**Two guards were watching this and neither could fail.** `tests/campaign.test.ts` checks that the
broadcast opens the right ending, but it calls `endingsFor`, a pure `ENDINGS.filter(gateOpen)`: it
measures the filter, never the selection. The campaign reachability lint — Stage 25, built for
exactly this class of bug, whose own header says *"The ending is simply never reachable and no one
finds out until a player doesn't"* — has an `ending-is-reachable` rule that asks whether an ending's
**gate** can be opened. Both gates could. Nothing asked whether the office could ever name it.

**What changed.**

- `shared/campaign/testimony.ts` — `EndingDef` gains `refines?: EndingId`, and the two broadcast
  endings declare `refines: "wipe"`. New `resolveEnding(t, faction)`: the ending the player chose,
  unless one of its refinements has its gate open, in which case that one.
- `client/campaign.ts`, `shared/campaign/save.ts` — both call sites resolve instead of looking up.
- `shared/campaign/lint.ts` — a new `ending-is-deliverable` rule: an ending must be an id some
  choice writes, or refine one that is, following the chain and refusing a cycle. Plus
  `ending-refines-an-ending`, because a typo in a `refines` is silent otherwise.

**The two chairs deliberately do not refine anything.** THE CLOCKEATER'S CHAIR and THE ESTATE'S
CHAIR are asked for by their own office choices, gated on faction and testimony. A clockeater who
picks the plain TAKE THE CHAIR while the sharper one is on offer meant to pick it, and resolving it
away would be taking a choice from the player to fix a bug in a different ending. The broadcast
endings have no choice of their own, which is what makes them the ones to resolve.

**Proof.** vitest 946/946, fourteen new in `tests/endings.test.ts`, nothing existing moved. The full
sweep ran green on a still tree: 23 probes, 523 checks — `probe` 21/21, `probe:look` 18/18,
`probe:net` 27/27, `probe:arsenal` 32/32, `probe:wake` 27/27, `probe:file` 20/20, `probe:city`
45/45, `probe:cityLife` 21/21, `probe:mastery` 23/23, `probe:identity` 25/25, `probe:campaign`
**46/46** (44 before), `probe:endgame` 18/18, `probe:economy` 1/1, `probe:counter` 16/16,
`probe:crawl` 10/10, `probe:ship` 11/11, `probe:run` 27/27, `probe:harden` 9/9, `probe:frame` 8/8,
`probe:mobile` 40/40, `probe:persist` 7/7, `probe:tps` 50/50, `probe:body` 21/21. Build clean, smoke
7/7. `probe:run` passed in sequence for the third sweep running.

The two new probe checks run the white office a second time, on a fresh arc that broadcast
`redacted`, and take choice 0 — wipe the ledger. The card that comes up reads **THE QUIET WAKING**,
its first line is *"YOU CUT THE TERROR OUT AND SENT THEM ONLY THE TERMS"*, the panel had listed
`wipe, chair, wipe_quiet`, and the file records `wipe_quiet`. `docs/proof/stage10/stage10-ending-quiet.png`
is that card. The chair run beside it is untouched and still ends on TAKE THE CHAIR.

Six mutations:

- **A**, the office reading `m7:ending` by id again — the defect itself: 4 of 14 unit tests fail.
  The campaign lint stays green, correctly: the data still says these endings refine a written one,
  so the manifest really is deliverable and it is the runtime that stopped delivering. Two layers,
  two owners (the Stage 161 pattern).
- **B**, `refines` dropped from the two endings: 8 unit tests fail **and** the lint errors —
  *"ending wipe_quiet: ending-is-deliverable — no choice writes this id and it refines nothing that
  is written"*. This is the mutation that recreates the shipped state, and it is now loud in both
  places.
- **C**, the deliverability rule deleted from the lint: 3 fail, all of them the rule-fires tests,
  and the endings themselves stay green — correctly, because the endings really are fine.
- **D**, resolution ignoring the gate so the first refinement always wins: 6 fail. A refinement
  whose gate is shut must not take over, or a run that broadcast neither gets an ending it did not
  earn.
- **E**, `refines: "chair"` added to THE CLOCKEATER'S CHAIR: 1 fails, the test that says taking the
  plain chair is still the plain chair. The scope of the fix is tested, not just its effect.
- **F**, the defect restored and the **probe** run: `probe:campaign` fails at the drawn card —
  *"ending wipe · card WIPE THE LEDGER"* where it must read THE QUIET WAKING. The claim is read off
  the frame the player would be looking at, not off a state string.

## Stage 173 — The Fairness Lint has been red since the commit that wrote it

**Goal.** The Fairness Lint is the project's stated promise that no build in the Ghostfile can buy
an unfair edge: every node, pair, seven-node growth, keystone, chip and firmware is duelled against
a baseline at five range brackets, and a ±4% swing in time-to-kill is a violation. `npm run verify`
runs it. CI runs it. `probe:file` takes it as a proof artifact — *"lint: the shipped catalogue
passes the Fairness Lint"*.

It has never passed.

```
$ npx tsx shared/fairness/cli.ts
FAIRNESS LINT FAIL — 366 builds, 36 baseline duels, 17.0s
  ... 89 violations
```

And at `196911a`, the Stage 6 commit that introduced the lint: **62 violations**. Red from its first
line. What ran instead, in all three places, was `--quick`:

```
- run: npm run lint:fairness -- --quick     # .github/workflows/verify.yml:53
```

`--quick` duels three of the eight weapons — `lease_breaker`, `repo_hammer`, `longwave` — and exits
0. All 89 violations are on `stack_smg` (75) and `clockeater` (14). **Every violation the full lint
has ever reported is on a weapon the quick set does not contain.** The gate was not merely cheaper
than the lint; it was disjoint from it. `probe/stage6.ts` hard-coded `--quick` into its `lint()`
helper too, so the proof artifact that says the catalogue passes had never asked about five of the
eight weapons either.

This is Stage 30's shape — a gate green because of what it does not reach — except Stage 30's gate
had been red for 39 runs and this one has been red for the project's whole life.

**The violations are real, and they are not this stage's to decide.** They are dose-responsive, not
noise. Measured, one node at a time against the baseline, on `stack_smg`:

| node | spread | @25 m | @40 m |
| --- | --- | --- | --- |
| `stop_loss` | −6% | −4.4% | −6.7% |
| `repo_grip` | −10% | −5.9% | −7.7% |
| `haircut` | −12% | −5.9% | −7.7% |
| `hair_trigger` | +19% | — | +19.2% |
| `hair_trigger` + `short_squeeze` | +29% | — | +30.8% |

A −10% spread node makes the SMG 7.7% faster at 40 m, which is 12 m past the range its own manifest
entry says it stops working (`R(10, 12, 28, 0.55, 60)` — ideal 10 m, full damage to 12 m, falloff
ends at 28 m). Whether a ledger node is allowed to make an SMG viable at 40 m is a balance decision,
and balance decisions belong to the owner. This stage does not make it, and does not loosen the rule
to make the number go away.

**What changed.** The debt is written down, and the lint fails on anything that is not on the list.

- `shared/fairness/debt.ts` — 89 entries, generated by `npm run lint:fairness -- --record`. Each
  carries a stable key, the magnitude at the time of recording and the detail line it was recorded
  with. The file's own header says what it is: not a list of things that are fine, a list of
  decisions waiting to be made.
- `shared/fairness/lint.ts` — every `LintViolation` gains a `key` (build, rule, weapon, bracket,
  side) that survives the numbers moving, a `magnitude`, and a `slack`. `reconcileDebt` fails on any
  violation with no entry and on any entry that grew by more than its own slack; a cleared entry is
  reported and never fails, because a run that fixes something must not go red for fixing it.
- `.github/workflows/verify.yml`, `package.json`, `probe/stage6.ts` — all three now run the full
  lint. `--quick` survives as a local-iteration flag that says so in its own output and does not
  consult the record.

**The slack belongs to the duel, not to the file.** A duel's TTK is a whole number of shots, so it
moves in steps of one shot interval and nothing smaller. The first version of this used one constant
for everything, and measuring killed it: one shot of the SMG at 25 m is 5.9% of a 1.133 s kill,
while one shot of CLOCKEATER at 25 m is **28.3%** of a 0.883 s kill — five times coarser. A global
slack sized for the SMG would read a single CLOCKEATER shot as a regression; one sized for
CLOCKEATER would swallow a fifth of any SMG kill. Each violation now carries `60 / rpm` over its own
baseline time. This also explains the shape of the recorded magnitudes: −5.9% and −7.7% at 25 m and
40 m are exactly one and two SMG shots, which is what a quantised measurement looks like.

**Proof.** vitest 932/932, seventeen new in `tests/fairnessdebt.test.ts`, nothing existing moved.
The full sweep ran green on a still tree: 23 probes, 521 checks — `probe` 21/21, `probe:look` 18/18,
`probe:net` 27/27, `probe:arsenal` 32/32, `probe:wake` 27/27, `probe:file` **20/20** (19 before: the
new check is *"nothing new and nothing worse against the recorded debt"*), `probe:city` 45/45,
`probe:cityLife` 21/21, `probe:mastery` 23/23, `probe:identity` 25/25, `probe:campaign` 44/44,
`probe:endgame` 18/18, `probe:economy` 1/1, `probe:counter` 16/16, `probe:crawl` 10/10,
`probe:ship` 11/11, `probe:run` 27/27, `probe:harden` 9/9, `probe:frame` 8/8, `probe:mobile` 40/40,
`probe:persist` 7/7, `probe:tps` 50/50, `probe:body` 21/21. `probe:run` passed in sequence for the
second sweep running. Build clean; smoke 7/7 with `.env.production` moved aside, which is the shape
CI builds in (Stage 172 measured why it reads 6/7 in this sandbox). The full lint now costs CI 17 s
where `--quick` cost 6 s.

Both injections still bite, which is the thing that would have made this stage worthless if it had
broken: `--inject=tradeless` and `--inject=netpower` each still exit 1 with the lint's own
violations, and neither is checked against the record — an injected bad actor is not debt.

Six mutations:

- **A**, `hair_trigger` given +6% damage — a node that really does get stronger: **175 new, 10
  worse, exit 1**. The ratchet is not a rubber stamp; a real change floods it.
- **B**, one entry deleted from `debt.ts`: `new 1`, exit 1. The record must be exact, not a
  superset.
- **C**, a recorded magnitude widened by hand from 4.4% to 90% — the ratchet's own blind spot, since
  it compares *against* the record and cannot police it. The lint passes; `tests/fairnessdebt.test.ts`
  fails, because a recorded magnitude must agree with the percentage in its own detail line. **C2**,
  the detail edited to match the inflated magnitude: also caught, because the percentage must follow
  from the two times printed beside it. This is the Stage 161 pattern — the layer that owns a rule
  is the layer that catches it, and it is correct that the other one does not.
- **D**, the slack dropped from the comparison: the lint still passes on an unchanged run, correctly
  — nothing drifted — and two unit tests fail. Said plainly: the slack's guard is the synthetic
  drift in the tests, because an unchanged run cannot exercise it.
- **E**, CI put back on `--quick`: caught.
- **F**, the probe's clean check put back on `--quick`: caught.

**Found by this stage's own verification, and fixed here.** `npm run verify`'s script string still
said `lint:fairness -- --quick` after the workflow changed. `tests/verify.test.ts` — Stage 30's
guard, that every check the project claims is a step CI runs — failed on it. A guard written three
stages of this kind ago catching this one's drift is the whole argument for writing them.

## Stage 172 — The eighth weapon was a key that threw you out of the match

**Goal.** The button bitfield puts the twelve action bits in 0–11 and the weapon slot select in
bits 12–15. The server validated the whole word against one hand-written number:

```ts
if (i.buttons < 0 || i.buttons > MAX_BUTTONS) return false;   // MAX_BUTTONS = 0x7fff
```

`0x7fff` is one bit short of the field it was guarding. Slot 8 encodes as `8 << 12` = `0x8000`, so
of the eight weapons the game ships, the eighth was the only one a player could not ask for.
Measured against the real `Room`, over the real wire encoding:

| slot | buttons | server |
| --- | --- | --- |
| 1–7 | `0x1000`–`0x7000` | accepted |
| 8 | `0x8000` | *"strike 1/3 on player 1: invalid input"* |

It does not stop at one strike. A rejected input does not advance `rec.lastSeq`, and the client
sends each input three times (`INPUT_REDUNDANCY = 3`) so that ordinary packet loss costs nothing.
Both facts are right on their own; together they mean every redundant copy of a refused input is
refused again. Measured, one press of the `8` key:

```
strike 1/3 on player 1: invalid input
strike 2/3 on player 1: invalid input
```

Two of three, from one key. A second press inside the five-second window:

```
strike 3/3 on player 1: invalid input
kick player 1: invalid input
```

— connection closed, `room.stats().players` 0. **Pressing `8` twice ends your match.**

Three input paths reach it, and one of them arrives without the player choosing to:

- `Digit8` on the keyboard (`client/input.ts`).
- the mouse wheel, which cycled `((slot - 1 + 1) % 8) + 1` — from slot 7 that is slot 8, so every
  forward lap passes through it.
- the phone's `WPN` button, which cycled `(slot % 8) + 1` — the same, and on a phone the cycle
  button is the *only* way to change weapon, so a mobile player is kicked on their second lap.

CLOCKEATER is not a stub in slot 8. It is `WEAPON_DEPTH` 1 — PvP-legal — the reward for the
ESCROW HEIST · DEPOT gig, with twenty chips, a firmware set, a 25-rank mastery track that asks for
slide kills and air kills and double kills, and a duel in the Fairness Lint. `World.setLoadout`
writes `p.weapon.slot` directly, so a player who equips it as their **primary** spawns holding it
and is fine; it is asking for it that is refused. A player who carries it as their secondary earns
the weapon, sees it on the wheel, presses the key, and is thrown out of the room.

**What changed.**

- `shared/sim/input.ts` — the bound is gone. `validButtons` checks the two halves as what they are:
  an `ACTION_MASK` derived from `Btn.SlotShift` rather than written out, and a slot nibble held to
  `MAX_SLOT`. This is *tighter* than the old rule, not looser — slots 9–15 were rejected before
  only as a side effect of exceeding `0x7fff`, and are now rejected on purpose.
- `server/room.ts` — `validInput` asks `validButtons(i.buttons)`.
- `shared/sim/weapons.ts` — the swap's `sel <= 8` reads `MAX_SLOT`.
- `shared/sim/input.ts`, `client/input.ts`, `client/touch.ts` — the cycle was written twice, each
  with its own hard-coded 8. It is now `cycleSlot(current, dir)`, once, off `MAX_SLOT`.

Four places knew how many weapon slots exist and one of them disagreed. They now read one constant.

**Proof.** vitest 915/915, twelve new in `tests/slots.test.ts`, nothing existing moved.
The central guard walks `WEAPONS` rather than a written-down list: every slot in the manifest is
pressed twice through the real wire encoding into a real `Room`, and must draw no strike, no kick,
and leave the player seated — then stepped a second of sim and must actually be the weapon in hand.
A ninth weapon added at slot 9 fails here until `MAX_SLOT` is raised to meet it, which is the only
version of this guard that survives the next weapon.

The full sweep ran green on a still tree: 23 probes, 520 checks, nothing skipped and nothing rerun
— `probe` 21/21, `probe:look` 18/18, `probe:net` 27/27, `probe:arsenal` 32/32, `probe:wake` 27/27,
`probe:file` 19/19, `probe:city` 45/45, `probe:cityLife` 21/21, `probe:mastery` 23/23,
`probe:identity` 25/25, `probe:campaign` 44/44, `probe:endgame` 18/18, `probe:economy` 1/1,
`probe:counter` 16/16, `probe:crawl` 10/10, `probe:ship` 11/11, `probe:run` 27/27, `probe:harden`
9/9, `probe:frame` 8/8, `probe:mobile` 40/40, `probe:persist` 7/7, `probe:tps` 50/50, `probe:body`
21/21. **`probe:run` passed in sequence**, the first time since Stage 166 that it has not needed the
standalone fallback; nothing was done to it, so this is one data point against the instability, not
an explanation of it.

A first attempt at this sweep failed `probe:look`, `probe:net` and `probe:arsenal` with *"Execution
context was destroyed"* and `window.__game` undefined. That was mine: I edited `client/input.ts`
while the sweep was running and the dev server reloaded the pages under the probes. The rule is
"verify on a still tree" and it is a rule because breaking it manufactures failures that look like
findings. The sweep above is the rerun on a tree nothing touched.

Build clean. The smoke test read 6/7 locally, on *"no page errors —
`net::ERR_CERT_AUTHORITY_INVALID`"*, and it is this sandbox rather than the build. `.env.production`
exists here and is gitignored, so the local `vite build` bakes in the live
`meltdown-{match,counter,campaign}.wendellphillips.workers.dev` hosts; headless Chromium reaches for
one at boot, through this environment's TLS-inspecting proxy, and refuses the re-signed certificate.
Measured both ways: clean tree with `.env.production` present, 6/7 on the same check; this tree with
`.env.production` moved aside, **7/7, "clean console"** and zero `workers.dev` strings in the
bundle. CI has no `.env.production`, which is why runs #193–#198 were green on it.

Seven mutations, each a rule put back the way it was:

- **A**, `buttons <= 0x7fff` — the defect itself: 4 of 12 fail, naming CLOCKEATER by name
  (*"slot 8 (CLOCKEATER) drew strikes"*, *"slot 8 (CLOCKEATER) never became the held weapon"*).
- **B**, the slot ceiling dropped so 9–15 are accepted again: 2 fail. The tightening is load-bearing
  and tested, not a comment.
- **C**, the undefined-bit mask dropped: 1 fails — bit 16 and non-integers.
- **D**, the sim's swap bound back to a literal `7`: 2 fail. The server taking a slot the sim
  ignores is its own defect, and the round-trip test is what separates them.
- **E**, the manifest given a ninth slot with the constants untouched: 4 fail, including the
  manifest-walk itself. This is the recurrence guard firing.
- **F**, the cycle wrapping at 7: 2 fail — *"expected [1,2,3,4,5,6,7,1] to deeply equal
  [1,2,3,4,5,6,7,8]"*. A cycle that silently skips a weapon is the quieter half of this bug.
- **G**, the old bound restored with the cycle left intact: the two lap tests stay green and the two
  that press what the cycle produced fail. The cycle and the validator guard different things;
  neither covers for the other.

**One thing this stage found and did not fix.** `npm run lint:fairness` — the full 366-build run —
exits 1 with **89 violations**, every one of them `ttk-deviation`, and has done for at least four
commits (a5703d9, 949d876, 384985b, a5f9837: 89 at every one, so it predates Stage 168). CI has
never seen it. `verify.yml` line 53 runs `lint:fairness -- --quick`, and `--quick` duels three
weapons: `lease_breaker`, `repo_hammer`, `longwave`. All 89 violations are on `stack_smg` (75) and
`clockeater` (14) — the two weapons the quick set does not contain. The gate is not merely faster
than the lint; it is blind to exactly what the lint is failing on, worst deviation 30.8%.

This is Stage 30's shape again — a gate that is green because of what it does not reach — and it is
a stage of its own, not a footnote to this one. It is recorded rather than quietly carried.

## Stage 171 — Two chips that did nothing, and the lint that certified them

**Goal.** The STACK SMG's spread *benefits* are converted to recoil benefits of the same weight, and
the comment above the rule says exactly why: a tighter cone on a sprayer is worth −6 to −8% TTK at
25–40 m, far more than the trade charges for, so the benefit is paid in "handling you feel, not
misses you don't". The conversion is deliberately one-sided and it is right.

But CHOKE's cost was already recoil. So the benefit converted *onto its own cost*, and they
cancelled:

| chip | line shown to the player | benefit | cost | net |
| --- | --- | --- | --- | --- |
| `stack_smg:choke` | *"−12% spread / +12% recoil"* | recoil −0.1200 | recoil +0.1200 | **0.0000** |
| `stack_smg:flash_cut` | *"−8% spread, quieter / +8% recoil, −4.5% reload"* | recoil −0.0800 | recoil +0.0800 | **0.0000** |

CHOKE is the STACK SMG's rank-9 muzzle chip. A player reaches rank 9, sockets the only thing that
socket takes at that rank, and gets exactly nothing. FLASH CUT at rank 22 is worse than nothing: its
recoil cancels and its −4.5% reload cost stands, so the socket is a net loss with "quieter" attached.

`lintChipSchema` runs on every sweep — through the Fairness Lint and through `tests/mastery.test.ts`
— and reported zero problems across all 160 chips. It could not see this. It compares the total
*weight* of the two sides, and the two sides weighed the same **precisely because they cancelled**:
`benefits weigh 7.20, costs 7.20`. A guard whose arithmetic is satisfied by the defect.

**What changed.**

- `shared/manifest/chips.ts` — where a converted benefit lands on a stat the cost already occupies,
  the cost moves to the axis the benefit vacated. The trade keeps its shape and its magnitude, and
  nothing cancels. Weapons outside the conversion set are untouched: `lease_breaker:choke` is still
  spread for recoil.
- `shared/manifest/chips.ts` — `lintChipSchema` gains `same-stat-trade`: a benefit and a cost on one
  stat cancel, wholly or partly, and the weight rule above cannot see it.

**Proof.** vitest 903/903, eight new, nothing existing moved — the manifest still ships 160 chips,
twenty per weapon, and the Fairness Lint still passes. `tests/chiptrade.test.ts` holds three things:
that no chip in the manifest trades a stat against itself, that **every** benefit still nets
non-zero once its own costs are subtracted — presence is not the test, because the defect had both
sides present — and that the new lint rule actually fires on a hand-made colliding chip, because a
rule that never fires is a green light with no bulb. A fourth holds that it does *not* fire on an
honest opposite-direction trade, and two more pin the conversion's scope: `lease_breaker:choke` is
untouched, and FLASH CUT keeps the half of itself that never collided.

The sweep ran green to 381 checks and then failed four banking checks inside `probe:run`, the shape
Stage 166 established fails with a change and without one. Run alone `probe:run` is 27/27, and the
rest a step at a time: `probe:harden` 9/9, `probe:frame` 8/8, `probe:mobile` 40/40, `probe:persist`
7/7, `probe:tps` 50/50, `probe:body` 21/21, build and smoke 7/7. Nothing here is on the banking
path: these are STACK SMG muzzle chips and the run bot carries the default loadout.

Mutation A, the colliding cost left where it was — the defect itself: 5 of the 8 fail. Mutation B,
the new lint rule removed while the manifest stays fixed: exactly one fails, the rule-fires test,
and the manifest tests stay green — correctly, because the manifest really is fixed. The two layers
guard different things and neither stands in for the other. Mutation C, the cost moved whether or
not anything collided: 2 fail, one of them the multi-part chip whose other half must not move.

**One thing this exposes rather than fixes, and it is a content decision rather than an engineering
one.** CHOKE and COMPENSATOR are mirror templates — one trades recoil for spread, the other spread
for recoil. On a weapon where the game has decided those are the same axis, the mirror collapses:
`stack_smg:choke` is now recoil −0.12 for spread +0.12, which is exactly `stack_smg:compensator`,
three ranks earlier. Nothing is dead any more, but rank 9 hands that weapon a chip it already has at
rank 6. No derivation produces a distinct trade there; it needs a different template for that
weapon, which is an authoring call and belongs with the other owner decisions in `docs/PLAN.md`.

## Stage 170 — A rank-20 firmware that changed nothing at all

**Goal.** Mastery rank 20 on the PHAGE LAUNCHER unlocks **CLUSTER**: *"+25% burst radius, −15%
damage"*. A player grinds a weapon to rank 20, flashes it, and fires a round identical to the one
they fired before.

A firmware is a `patch` over a `WeaponDef`, and the patched definition is stored on the player's kit
and read everywhere the sim needs it — except at the one place a phage round is built.
`createProjectile` took no definition at all and read `WEAPONS.phage`, the stock manifest entry, so
everything a firmware changes was thrown away between the trigger and the round. Measured, firing
one round and reading the projectile the sim actually made:

| | the flashed definition says | the round the sim made |
| --- | --- | --- |
| CLUSTER radius | 4.38 m | **3.50 m** (stock) |
| CLUSTER damage | 51 | **60** (stock) |
| CLUSTER edge damage | 15 | **18** (stock) |
| LONG FUSE damage | 65 | **60** (stock) |
| LONG FUSE fuse | 3.25 s | **2.50 s** (stock) |
| LONG FUSE gravity | 9.6 | **12.0** (stock) |
| LONG FUSE speed | 48.0 | 48.0 ✓ |

CLUSTER is inert in every property it has. LONG FUSE lands one of its four, and only because
`speed` happens to travel separately on the fire request rather than through the round's
constructor. The rank-28 firmware sells *"faster, flatter rounds, +8% damage, longer fuse"* and
delivers the first word of it.

**What changed.**

- `shared/sim/projectiles.ts` — `createProjectile` takes the firing weapon's definition *as this
  file has it* and reads the round's fuse, gravity, radius, damage, edge damage and direct hit from
  there, falling back to the manifest when there is no weapon behind the round. The sticky alt's
  arm time, damage and proximity come from the same definition rather than from `WEAPONS.phage.alt`,
  so a firmware that patched the alt would reach the round too.
- `shared/sim/world.ts` — the spawn passes `weaponDefOf(p)`, the firing file's own definition. A
  grenade has no weapon behind it and passes nothing.

**Proof.** vitest 895/895, four new, nothing existing moved. `tests/firmware.test.ts` fires one
round with each firmware flashed and reads the projectile the sim actually made. Each test first
asserts the firmware really does change the property — `def.radius > stock.radius` — so it cannot
pass by asserting a no-op, which is how a check for an inert firmware would most easily fool
itself.

The fourth is the structural one and it guards the rule rather than these two firmwares: it walks
**every** firmware in the manifest that patches a projectile and requires radius, damage, edge
damage, gravity and direct to reach the round. A firmware added later, or a property added to the
spec, is covered without anyone remembering to come back here.

The sweep ran green to 384 checks and then failed one banking check inside `probe:run` — `banked
0`, the shape Stage 166 established fails with a change and without one. Run alone `probe:run` is
27/27, and the rest a step at a time: `probe:harden` 9/9, `probe:frame` 8/8, `probe:mobile` 40/40,
`probe:persist` 7/7, `probe:tps` 50/50, `probe:body` 21/21, build and smoke 7/7. Nothing this stage
touches is on the banking path: a phage round is not thrown at a gate.

Mutation A, the round built from the stock manifest again — the defect itself: 3 of the 4 fail.
Mutation B, a single property left reading stock while the rest are patched: 2 fail, one of them
the manifest-wide walk, which is the point of writing it that way. Mutation C, the definition
accepted as an argument and then ignored inside: 3 fail.

The test that a file with nothing flashed still fires the stock round stays green under all three,
correctly — stock is stock whichever way it is read. It is there so the others cannot pass by
making every round identical.

## Stage 169 — A round fired from inside a body went through it

**Goal.** `rayCapsule` returns the distance at which a ray *enters* a capsule. Every quadratic in it
takes the near root, and the near root is negative when the ray starts inside — so the `t >= 0`
tests rejected it and the function reported a miss. A shot fired from inside a body did not hit it.

That is not a corner case here, because **files do not push each other apart**. Two placed 0.15 m
apart and simulated for two seconds are still 0.15 m apart. Standing inside another file is
ordinary melee range — which is where the shock baton is meant to be used and where a shotgun is at
its best — and a mech's capsule is 1.1 m wide, so simply walking up to one put your eye inside it.

Measured on a level shot, the function had a hole in the middle of its own domain:

| horizontal gap to the target's axis | before | after |
| --- | --- | --- |
| 2.00 m | hit at 1.666 m | hit at 1.666 m |
| 0.45 m | hit at 0.116 m | hit at 0.116 m |
| 0.39 m | hit at 0.056 m | hit at 0.056 m |
| 0.30 m | **miss** | hit at 0.000 m |
| 0.00 m | **miss** | hit at 0.000 m |
| a mech at 0.80 m | **miss** | hit at 0.000 m |

So the defect was a discontinuity: at 0.39 m a level shot landed, and at 0.30 m it hit nothing at
all. The zone rule is unchanged — `zoneOf` reads the hit point's height exactly as it does at every
other distance, and at contact range a level shot is already at head height, which is what it
reports at 0.39 m today.

**What changed.**

- `shared/sim/collision.ts` — `insideCapsule(p, a, b, r)`, and `rayCapsule` returns 0 when its
  origin is already inside. A ray that starts inside is already touching: its entry distance is
  zero. The hitscan skips the shooter's own capsule (`o.id === shooterId`) and the AI loops skip
  themselves, so nothing can now hit itself.

**Proof.** vitest 891/891, five new, and nothing existing moved — including the TTK harness, which
measures every weapon at its intended range and never fires from inside anything.
`tests/contact.test.ts` holds the zero-range hit, the mech's wider capsule, and two files at melee
range killing each other. The structural one walks the whole approach from two metres to zero in
one-centimetre steps and requires every single step to land and the distance never to rise as the
target gets closer — a hole anywhere in the function's domain fails it, not just this one.

The sweep ran green to `probe:ship` — 358 checks — then stopped at `probe:run` on the same
40-second join timeout at `stage14.ts:126` seen in Stages 166 and 168, which a baseline sweep
established fails with a change and without one. The rest was run a step at a time: `probe:run`
alone 27/27, `probe:harden` 9/9, `probe:frame` 8/8, `probe:mobile` 40/40, `probe:persist` 7/7,
`probe:tps` 50/50, `probe:body` 21/21, build and smoke 7/7.

Mutation A, the inside check removed — the defect itself: 4 of the 5 fail. Mutation B, inside
reported at the ray's far limit rather than zero: 3 fail, caught by the continuity walk, which
holds the *value* and not merely the non-null. Mutation C, every ray treated as starting inside:
exactly the negative test fails — the one that fires past a capsule, beside it, away from it and
beyond its range — so the fix is bounded and has not simply made everything hit.

The melee-range test was written first in a weaker form, and measuring caught it: with the defect
in place it still passed. `rayCapsule` did not return null there at all. The shot was aimed steeply
down, so the ray left through the bottom sphere and the *near root of that sphere* was positive —
the function returned **0.867 m** for a target at 0.20 m. The round registered, at the wrong
distance, the wrong zone and the wrong falloff, and five rounds fired point blank left the target
on 20 health instead of killing it. "A round landed" could not tell those apart. The test now holds
the round to the distance it actually flew and the exchange to its outcome, and mutation A fails it.
That also sharpens what the defect was: not always a miss, but always the wrong answer.

## Stage 168 — A file came back from its own death holding someone else's gun

**Goal.** Stage 167 found a drone whose respawn restored a subset of its state. This is the same
defect one layer up, where it costs a player their weapon.

`respawnPlayer` calls `resetWeaponState`, which assigns a whole fresh `createWeaponState()` over the
live one — and that fresh state hardcodes `slot: 1` and the stock magazines. The attested primary
and the firmware magazines were written once, inside `setLoadout`, and nothing wrote them again.
Measured on a world, a loadout and a death:

| attested primary | slot at spawn | slot after one death |
| --- | --- | --- |
| LEASE-BREAKER | 1 | 1 |
| REPO HAMMER | 2 | **1** |
| STACK SMG | 3 | **1** |
| LONGWAVE RAIL | 4 | **1** |
| PHAGE LAUNCHER | 5 | **1** |

Four of the five. Only the LEASE-BREAKER survived, and only because slot 1 is the number that was
hardcoded. Pick anything else, die once, and you spend the rest of the match holding a rifle you
did not choose — a different recoil pattern, a different range band, a different reload — unless you
notice and scroll back.

The magazines went the same way, and the wrong way round:

| firmware | stock | flashed | at spawn | after one death |
| --- | --- | --- | --- | --- |
| DUMP STAGE (`−15% magazine`) | 40 | 34 | 34 | **40** |
| DOUBLE BARREL | 6 | 4 | 4 | **6** |

A firmware's magazine is one of the costs it charges for its rate or its burst. It was charged once,
at spawn, and refunded on every death after that.

**What changed.**

- `shared/sim/player.ts` — `armFromKit(p)`: the weapon state a kit implies, in one place. The
  attested primary in hand, and every firmware magazine loaded. `PlayerKit` gains `primarySlot`,
  because which weapon was attested was not recorded anywhere that survived `resetWeaponState` —
  `p.weapon.slot` was the only copy and it was the thing being overwritten.
- `shared/sim/world.ts` — `setLoadout` records `primarySlot` and calls `armFromKit` instead of
  writing the slot and the magazines inline.
- `shared/sim/player.ts` — `respawnPlayer` calls the same `armFromKit` after `resetWeaponState`.

The slot and the ammo already cross the wire in `exportLocal`/`importLocal` and are already in
`hashWorld`, so the server's fix reaches the client without a protocol change and the determinism
check covers it.

**Proof.** vitest 886/886, ten new, and not one existing test moved — which is worth noting for a
change to what every respawn in the game does. `tests/respawn.test.ts` holds each primary through a
death, each firmware magazine through a death, and then the structural one: a respawned file's
whole weapon state must equal a freshly spawned file's, field for field, for three different
loadouts. Anything `setLoadout` sets that a respawn forgets fails there rather than in a match.

The sweep ran green to `probe:ship` — 358 checks — and then stopped at `probe:run` on the same
40-second join timeout at `stage14.ts:126` that Stage 166 established fails with a change and
without one. So the rest was run a step at a time rather than read past: `probe:run` alone 27/27,
`probe:harden` 9/9, `probe:frame` 8/8, `probe:mobile` 40/40, `probe:persist` 7/7, `probe:tps`
50/50, `probe:body` 21/21, build and smoke 7/7. The whole list covered, in pieces.

Mutation A, the respawn no longer re-arming from the kit — the defect itself: 8 of the 10 fail.
Mutation B, the slot restored but the firmware magazines forgotten: exactly the two magazine tests.
Mutation C, the kit recording slot 1 whatever was attested: exactly the four primary tests. Each
half of the rule is guarded on its own, and no mutation can be mistaken for another.

Two of the eight scouts run over this repository in parallel reported this independently, which is
what put it on the list. Neither was taken on trust: `resetWeaponState` was read, then the loss was
measured on a real world with a real loadout and a real death. The first measurement of the
magazine half showed no difference at all and was wrong — the firmware ids are namespaced
(`repo_hammer:double_barrel`, not `double_barrel`), so the one under test had silently not been
flashed. With the right id the refund is real, and it is in the table above.

## Stage 167 — A drone carried its own death back with it

**Goal.** An EMP grenade disables a drone for three seconds: it stops, sags out of the air, and
hangs there while you finish it. That is the combination the grenade exists for. Twenty seconds
later the replacement wasp spawns at the top of its patrol — and falls straight back out of the sky.

One life's state had two definitions: the constructor's list, and a shorter list inside the respawn
branch. Whatever the shorter one left out was carried through death, and the countdown is *frozen*
while the drone is dead, because `stepWasp` returns from the `!w.alive` branch before it reaches
the disabled one. Measured on the exact sequence a player performs:

| | before | after |
| --- | --- | --- |
| EMP left when it was shot down | 2.50 s | 2.50 s |
| disabled *after* it respawns | **2.48 s** | 0.00 s |
| where it hangs after respawning | 4.00 m → **3.11 m** | 4.00 m |
| a fresh drone opens fire after | 0.98 s | 0.98 s |
| its *replacement* opens fire after | **0.48 s** | 0.97 s |

So it went both ways. `disabledTimer` came back and the new drone was born broken. `fireCooldown`
went the other way: the one-second grace that stops a drone shooting you the instant it sees you
belonged only to the first generation, and every replacement was half a second quicker on the
trigger than the drone it replaced. `lostTimer` and `jamTimer` rode across too. The mech carried the
same 2.50 s of EMP through a *sixty*-second death.

**What changed.**

- `shared/sim/ai.ts` — `reviveWasp()` and `reviveMech()`. One life's state now has one definition,
  written the same way when the drone is built and when it comes back; `createWasp` and
  `createMech` call it rather than repeating it. `id`, `waypoints` and `path` are not reset because
  they are which drone this is, and neither is `shots`, which is the index into the drone's own
  aim-jitter sequence — a property of the drone, not of one life.

**Proof.** vitest 876/876, five new. `tests/drone.test.ts`: a drone EMP'd and shot down comes back
with `disabledTimer` 0, at 4.00 m, patrolling; the grace before the first shot belongs to every
life; and the mech the same.

The fifth test is the one that matters, and it guards the category rather than the instance: a wasp
that has chased, fired, been EMP'd, been jammed and lost its target is compared **field for field**
against a freshly built one, excluding only the three identity fields. A field added to the
constructor and forgotten in the revive fails that test rather than a player's match.

The full sweep green: 526 checks, and smoke 7/7 once `.env.production` — a local deploy artifact
that points the build at the live Workers, which this sandbox's TLS interception then fails — is
moved aside. `probe:run` passed in this sweep, which is worth recording: Stage 166 saw it fail
twice and established by a baseline sweep that it fails with and without that change. Intermittent
confirmed from the other side.

Mutation A, the wasp's respawn back to its hand-listed subset — the defect itself: 3 of the 12
fail, the EMP, the grace and the field-for-field. Mutation B, one field quietly dropped from the
revive (`disabledTimer`) and nothing else changed: 2 fail, and the field-for-field test is one of
them — which is the whole point of writing it, because that mutation is what this defect *was*.
Mutation C, the grace set to 0: exactly the grace test. Mutation D, the mech's respawn back to its
subset: the two mech tests and nothing else. Each mutation is caught, and each by the tests that
own it rather than by all of them at once.

Two of the eight scouts run over this repository in parallel independently reported the same shape
one layer up — that `respawnPlayer` restores a subset too, and that a player's chosen primary
weapon does not survive their own death. Read directly rather than taken on trust:
`resetWeaponState` assigns a whole fresh `createWeaponState()` over the live one, and that fresh
state hardcodes `slot: 1`. Nothing after the respawn puts the chosen primary back. That is the next
stage, and it is this one with the stakes raised.

## Stage 166 — The drone's range was 25 metres only against a file wearing nothing

**Goal.** `WASP.fireRange` is 25 m, and every other number around it is in metres: `detect` 18,
`holdDistance` 8, the falloff profile out to 60. But the wasp compares that range against `bestD`,
the distance divided by the target's `detectMult` — the distance as the drone *models* the file
rather than the distance the file is. So 25 m was the reach only against a file whose detectability
happened to be exactly 1, which means a file with nothing attested.

Measured against the real manifest, one attestation at a time, no stacking:

| attestation | Depth | detectMult | opened fire at | held the chase to |
| --- | --- | --- | --- | --- |
| BLACK SWAN | 30 | 0.500 | 12.5 m | 14.5 m |
| WIRE FRAUD | 11 | 0.666 | 16.7 m | 19.3 m |
| STATIC SKIN | 1 | 0.721 | 18.0 m | 20.9 m |
| *(nothing attested)* | — | 1.000 | **25.0 m** | 29.0 m |
| ESCROW | 8 | 1.123 | 28.1 m | 32.6 m |
| MELTDOWN CLAUSE | 16 | 1.221 | 30.5 m | 35.4 m |
| BAD DEBT | 6 | 1.350 | 33.7 m | 39.1 m |

Twenty-four of the ledger's nodes move it, and every one of them describes itself as changing how
well you are *seen*. STATIC SKIN is a first-district node — "−30% drone detection / footsteps +20%
louder" — and it quietly took nine metres off the drone's gun. BAD DEBT, at Depth 6, added nearly
nine. Nothing in the game says so, because it is not what any of them were written to do.

The two halves had been folded into one number. Detectability should decide when a drone notices a
file and how long it holds one it has already noticed; both of those are questions about modelling
and both scale correctly. How far the gun shoots is not one of those questions. Metres are metres.

**What changed.**

- `shared/sim/ai.ts` — `stepWasp` carries the chosen target's true distance alongside the modelled
  one, and the gun is gated on the true distance. Acquisition and the reacquire window keep the
  scaling, which is what they are for. Four lines.

The mech is deliberately untouched. Its beam has no range of its own — it fires at whatever the
searchlight has flagged, and the searchlight *is* the detector, so scaling it by detectability is
that rule working, not the same defect a second time.

**Proof.** vitest 871/871, seven of them new. `tests/drone.test.ts` holds the two halves apart: the
gun fires inside 25 m and not outside it for a loud file, a quiet one and a bare one alike; and
detectability still moves where a patrolling wasp notices a file (17.9 m bare, 23 m loud, and a
quiet file not noticed at 23 m) and how far a chasing one holds it (28.9 m bare, 38 m loud). A file
so quiet the drone holds it only to 14.5 m is shot only inside that, because a file the drone
cannot model is a file it cannot shoot — the gun is not the binding rule there.

Mutation A, the gun gated on the modelled distance again — the defect itself: 4 of the 7 fail.
Mutation B, detectability scaling nothing at all, which is the obvious over-correction: exactly the
3 detectability tests fail and the gun tests stay green, which is the shape it should have.
Mutation C, the gun given BAD DEBT's old reach as a constant: 4 fail. The two halves of the rule
are guarded separately and neither mutation can be mistaken for the other.

A live check was written for this and then thrown away, and why is the useful part. `probe:arsenal`
was made to measure every drone round that reached the file against the 25 m range: it came back
`143 of 144 drone rounds landed, longest 8.1 m`. The wasp closes to `holdDistance`, 8 m, and fires
from there — so with the defect reverted the same check reported the same numbers and passed,
33/33. It could not fail. That is also the answer to why this survived 165 stages of probes that
watch drones shoot: every one of them watched a drone shoot from inside eight metres, and the range
was never exercised where it was wrong. The rule is a pure function of the sim and the unit layer
owns it.

`probe:run` failed in this stage's sweep and is not this stage's, which took a full baseline sweep
to establish rather than a re-run. With the change applied it came back `banked 0` on three banking
checks, twice. Run on its own it is 27/27 with the change and 27/27 with it stashed — but that
proves little, because the failure only appears inside a sweep. There is also a real mechanism by
which this change could have caused it: a quiet file now takes drone fire out to the full 25 m
where before the drone held off, so ALPHA could plausibly have been dying mid-carry and dropping
the claim. So the sweep was run again with the change stashed, and `probe:run` failed there too —
differently, a 40 s timeout at `stage14.ts:126`, long before any banking. Unstable in a sweep on
this machine, with the change and without it.

The sweep stops where it falls, so the steps after `probe:run` were run one at a time instead of
read past: `probe:harden` 9/9, `probe:frame` 8/8, `probe:mobile` 40/40, `probe:persist` 7/7,
`probe:tps` 50/50, `probe:body` 21/21, and build + smoke 7/7. Everything before it was green in the
sweep itself, 382 checks. That is the whole list covered, in pieces rather than in one run, and CI
on a clean container is the arbiter. `probe:run`'s instability under sweep load is the next stage's.

## Stage 165 — The jump was photographed by waiting for a frame to land inside two thirds of a second

**Goal.** Stage 164's sweep failed one check that was not Stage 164's: `probe:body`'s `a jump splits
the legs and flares the hem` came back `1 air frames` where it wants 2, and 20/20 on three clean
re-runs of the same tree. That failure is this stage's, and it is arithmetic rather than luck.

A jump is 7.4 m/s against 22 m/s²: off the ground for 0.67 s and no longer. This harness draws a
frame every 0.23 s. So the window holds three frame boundaries, the check needs two of them, and it
has one frame of margin. The 240 iterations of patience wrapped around the wait buy nothing at all:
once the file is down, no later frame can be airborne, however many you wait for. The walk and the
slide can be waited for because they repeat or persist. A jump happens once.

The first explanation was wrong and measuring said so. `state()` builds a large object and hashes
the world, and the wait called it on every one of those frames — an obvious suspect for slowing the
very frames being counted. Measured, it costs 0.2 ms against a 227 ms frame: nothing. The frame rate
is the renderer's, and the check was reading the renderer.

Then both readings side by side at four window sizes, which is the one thing that does move the
frame interval here:

| viewport | frame | rendered-frame race | stepping the sim |
| --- | --- | --- | --- |
| 960×540 | 229 ms | 2 airborne frames — passes | air, split 0.758, flare 0.228 |
| 1600×900 | 316 ms | **1** — fails | air, split 0.751, flare 0.216 |
| 2133×1200 | 466 ms | **1** — fails | air, split 0.751, flare 0.216 |
| 2844×1600 | 642 ms | **0** — fails | air, split 0.751, flare 0.216 |

The CI failure reproduced exactly at 316 ms, and the sweep runs at 960×540 with one frame of margin.

**What changed.** All of it in `probe/stage63.ts`; no game code moved.

- `leapRead()` steps the sim into the air rather than watching for it. `advance()` ticks the sim and
  draws nothing, so the file is put off the ground tick by tick, held eight ticks in while it is
  still rising, and the pose is read while it is held there. It reports the loop's own count of
  frames drawn while the air was found, which is zero — a reading that owes nothing to the frame
  rate can say so exactly, and a rendered-frame race cannot say it at all.
- `poseAfter()` reads the pose after a fixed count of frames. `poseBody` clamps its ease step at
  1/30 s and every frame here is longer than that, so each rendered frame advances the ease by the
  same fraction whatever the frame rate: a count of frames means the same thing on a fast machine
  and a slow one. Thirty puts the slowest channel within 1e-4 of its target.
- `settled()` compares every bone by value. It waited on `out.hips.y` and `hoodApex`, and `out` is a
  live reference into the rig — the same object on both sides of the subtraction, so that half of
  the test was always exactly zero and only the hood ever governed it. The hood goes still long
  before the legs do, which is why the same jump read 0.800 rad of split at 960×540 and 0.751 at
  1600×900: what came back depended on the window size. Its guard here is indirect — every other
  pose check in the probe reads through it, and all of them stay green — and the jump no longer
  depends on it at all.

**Proof.** `npm run probe:body` 21/21, six runs: `frames drawn while finding the air: 0 at 960x540,
0 at 1600x900 · split 0.800 vs 0.800, flare 0.250 vs 0.250 · apart by 0.000 / 0.000`, identical
every time. The full CI sweep on the tree before this change was 519/520, the one failure being this
check under the tolerance it has now earned; nothing outside this probe file has changed since.

Mutation A, the rendered-frame race restored: 20/21, `frames drawn while finding the air: 2 at
960x540, 2 at 1600x900`. Mutation B, the photograph taken 60 ticks in, after the file has landed:
19/21, `split 0.00 · flare 0.00`, both jump checks. Mutation C, the pose read through `settled()`
again: 20/21, the two window sizes 0.009 apart against a 0.005 tolerance. Mutation D, the rig's air
pose no longer splitting the legs: 19/21 at `split -0.00`, so the check still guards the thing it is
named for and not only its own plumbing.

Two of those tolerances are worth separating honestly. `drawn === 0` is exact: a reading that needs
a frame to land inside the window cannot report zero, so mutation A cannot pass it. The agreement
between the two window sizes is empirical — 0.000 apart six times over with a fixed frame count,
against 0.001 to 0.048 apart reading through `settled()` — so it catches mutation C but is a
measurement, not a proof.

And for the second stage running, the first guard written did not guard. It was the two window
sizes alone, on the reasoning that a slower renderer is what breaks the race — and mutation A passed
it, because at 1600×900 this machine still caught two airborne frames. How many frames land inside
0.67 s is the machine's business, and on a fast enough one even the race gets its two. Counting the
frames the reading itself drew takes the machine out of it.

## Stage 164 — Five of the tutorial's six facts were counted; the sixth was sampled, and it was the one that went missing

**Goal.** Stage 163's sweep failed one check that was not Stage 163's, and it was written down
rather than re-run past: the first probe's tutorial line came back `R reload · SHIFT sprint` where
it wants no `SHIFT`, then 19/19 on a re-run of the same tree. This is that check's defect, and it
is the player's, not the probe's.

`learn()` is folded inside `Hud.update()`, which `frame()` reaches only past `if (!render ||
!this.drawing) return;` — so the tutorial samples nothing but frames the renderer actually drew.
Five of its six facts survive that, because they are the sim's own running totals: `stats.shots`,
`stats.jumps` and `stats.slides` only rise, and a reload holds `reloadTimer > 0` long enough to
land in any frame at all. The sixth read `speed`: the horizontal velocity of the one frame being
drawn.

A sprint is a moment, and sampling catches a moment only if it happens to be looking. Driven in
30-tick chunks with a frame between them — the first probe's regime, and a slow machine's — the sim
reached 7.2 m/s over 410 ticks while 19 frames were drawn, and the line went on asking for SHIFT.
The slower the machine, the longer this game tells you to press a key you have already pressed.

This is Stage 156's defect one layer over. That stage moved the fps window out of the drawn-frame
branch because it was counting frames from inside the branch that only runs when a frame is drawn.
Work that belongs to every frame does not belong under that return.

**What changed.**

- `client/hud/keys.ts` — `learn()` takes `topSpeed` where it took `speed`. Every fact it reads is
  now cumulative, so a frame missed is not a lesson missed.
- `client/hud/hud.ts` — the call passes `p.stats.topSpeed`, the sim's own high-water mark, taken
  every tick at `shared/sim/player.ts:545` and only ever rising. The foot line's `m/s` and its
  stance word still read the frame's own speed, and should: those say what is happening, and the
  tutorial says what has happened.
- `tests/keys.test.ts` — a sprint whose peak fell between two drawn frames, the threshold held at
  the read rather than above it, and moving kept apart from sprinting at 0.5 m/s.
- `probe/stage1.ts` — two checks. The drawn line is now held against every lesson the sim's own
  counters can state, rather than against a string typed into the probe. And, on a page of its own
  before anything else runs, a whole sprint goes inside a single `advance()` call: `advance()` ticks
  synchronously and draws nothing, so the only frames drawn are the one before it and the one after,
  both with the file at rest. That is the slow machine exactly, and unlike a chunked run it is not
  a matter of where the frames happen to fall.

**Proof.** vitest 864/864. `npm run probe` 21/21, including `the sim reached 7.20 m/s while no drawn
frame saw above 0.00 · line "WASD · HOLD CLICK fire · R reload · SPACE jump · CTRL slide · SHIFT
sprint" → "HOLD CLICK fire · R reload · SPACE jump · CTRL slide"`, and `top 9.40 m/s vs sprint read
6.2 · shots 7 · jumps 3 · slides 1 → line "R reload"`. The whole sweep as CI runs it green but for one check that is not this
stage's, below.

Mutation A, the call site handed the frame's own speed again: `probe` fails 3 times out of 3 on
`the sim reached 7.20 m/s while no drawn frame saw above 0.00`, and the bot run's two tutorial
checks come back `R reload · SHIFT sprint` with it. Mutation B, the sprint read doubled so nothing
reaches it: 3 of the 7 unit tests fail and the probe stays green, correctly — the call site is still
handing over the mark. Mutation C, the walk read dropped to 0: 1 test. Mutation D, the sprint fact
no longer sticky: `never forgets a lesson`, alone.

One failure in this stage's sweep was not this stage's. `probe:body`'s `a jump splits the legs and
flares the hem` came back `1 air frames` where it wants 2, and 20/20 with `2 air frames · widest
split 0.80 rad` on three clean re-runs of the same tree. It drives one jump in realtime and counts
the rendered frames that land off the ground, calling `state()` — which hashes the world — on every
one of 240; when the machine is busy the count it is waiting for does not arrive. Nothing in this
stage touches the rig or that probe. That is the next stage's. (The suspicion of `state()` here was
wrong: Stage 165 measured it at 0.2 ms against a 227 ms frame. The cause is the window, not the
read.)

The first guard written for this stage did not guard it, and that is the part worth keeping. It read
the drawn line against the sim's counters at the end of the existing bot run — derived rather than
hardcoded, which is an improvement, and still green 5 times out of 5 with the fix reverted. The bot
slides at 9.4 m/s for thirty ticks, so a drawn frame catches the peak almost every time; Stage 163
caught the once it did not. A check that fails one run in twenty is not a guard. Putting the whole
sprint inside one `advance()` call takes the luck out: with the fix reverted it fails every time,
because there is no drawn frame above 0.00 m/s for the sampled read to find.

## Stage 163 — The first screen a player sees offered two keys it had not got

**Goal.** The menu's footer reads `↑↓ MOVE · ENTER SELECT · ← → ADJUST · ESC BACK`, and it is the
same line on every screen, because Stage 152 gave it one argument: whether the player is on a phone.

On the settings screen all four are true. On the main menu — the first screen anybody sees — two are
not. `adjust()` returns on its first line unless the highlighted row is a setting, and the main menu
has none. `back()` handles `wake`, `settings` and `pause`, and matches nothing on `main`.

And it did not just fail silently. `back()` played the back cue before testing where it was, so ESC
on the title screen made the sound of going back and went nowhere — which tells a player their key
was wrong when it was the screen that was.

**What changed.**

- `client/hud/keyhint.ts` — `menuFooter(touch, adjustable, canBack)`. Moving and selecting are
  always named, because every screen is a list. Adjusting and going back are named only where they
  exist. Adjusting is decided per screen rather than per row, so the line does not flicker as the
  cursor passes the one row in settings that is not a setting.
- `client/menu.ts` — `canBack()` is one rule, read by the footer and by `back()` itself, and `back()`
  returns before the cue when there is nowhere to go. The footer is written each render rather than
  once into the shell.
- `tests/keyhint.test.ts` — each control named only where it exists, moving and selecting always,
  and a phone never offered ESC whatever the screen.
- `probe/stage13.ts` — the ship probe reads the drawn footer on both screens, and presses ESC on the
  main menu with the cue counter open on either side of it.

**Proof.** vitest 862/862. `npm run probe:ship` 11/11: `main "↑↓ MOVE · ENTER SELECT · dev" ·
settings "↑↓ MOVE · ENTER SELECT · ← → ADJUST · ESC BACK · dev" (9 rows)`, and `screen main → main ·
back cue 1 → 1` — the counter reached 1 on a real back out of settings and did not move for the
main menu's ESC. The whole sweep as CI runs it green but for one check that is not this stage's,
below.

Mutation A, the footer the same line on every screen again: `probe:ship` 10/11 with the main menu
offering `← → ADJUST · ESC BACK`, and `tests/keyhint.test.ts` fails 2 of its 10 on its own. Mutation
B, the cue played before the screen is tested: 10/11 with `back cue 1 → 2` — the sound of going
back, on a screen that stayed exactly where it was, which is the defect this stage found under the
wording one.

One failure in this stage's sweep was not this stage's, and it is worth writing down rather than
re-running past. The first probe's tutorial check came back `after: "R reload · SHIFT sprint"` where
it wants no `SHIFT`; re-run on the same tree it was 19/19 with `after: "R reload"`. Stage 130's line
teaches what the file has not done, and whether the bot is recorded as having sprinted depends on it
crossing a speed threshold inside a plan step — the same timing-sensitivity Stages 151 and 156 found
elsewhere. Nothing in this stage touches `learn()` or the bot. That is the next stage's.

## Stage 162 — The fit was checked one element at a time, after each was found cut

**Goal.** Three stages found the same defect in three places: content that was right in a box too
small for it. Stage 148 and 151, the event log's entries. Stage 150, the file's own header line, cut
at every width this game has ever been drawn at, with a moniker every file earns in its first match.
Stage 160, the map's footer, cut in every district since it was written, under a check that asserted
its text exactly and its width never.

Each was found by looking at a picture and then measuring. That is a fine way to find the first one
and a poor way to find the fourth. This asks the question of every text on the HUD at once, in the
states the probes have already built — because the states are where the defects were: a mission
running, a claim carried, the chooser open. The base HUD is clean at 1920, 1280, 960 and 800; every
one of the cut readouts was somewhere a player had got to.

**What changed.**

- `probe/hudfit.ts` — `hudCuts(page)` returns every element on the drawn HUD whose text is wider
  than its box, where the box holds it to one line or clips it, and `cutDetail` names them with
  their overflow in pixels.
- `probe/stage10.ts`, `probe/stage11.ts`, `probe/stage14.ts` — the sweep runs at the frame each
  already screenshots: a mission running, the district chooser and the Deep Wake open, the run strip
  up with a claim carried.

**The rule needed both halves, and the first version had one.** It began as leaves only, on the
reasoning that a parent which scrolls because its child does is the child's story. That walked
straight past the file's header line, which is five spans that each fit inside a line that does not
— so reverting Stage 150 left the sweep green. It reports any element that holds its text to one
line or clips it, leaf or not.

**Proof.** vitest 860/860. `probe:campaign` 44/44, `probe:endgame` 18/18, `probe:run` 27/27, each
reporting `nothing cut on the HUD`. The whole sweep as CI runs it — every probe, the four lints, the
firmware certification, build and smoke — green.

The mutations are the point of this stage, because a guard that finds nothing today is only worth
having if it would have found the ones already found. Reverting **Stage 160**, the map footer's shed:
`probe:campaign` 43/44 and `probe:endgame` 17/18 with `".f" by 13px ("▲ AHEAD · 114 M ACROSS")`,
`probe:run` 26/27 with `".f" by 7px` — three probes that have never heard of the map footer, naming
the element and the pixels. Reverting **Stage 150**, the header line's shed: `probe:run` 26/27 with
`".line" by 139px ("▲ ALPHA · DRAINAGE YARD (MAGENTA) · 2 ONLINE")` and `probe:campaign` 43/44 by
2 px. Two defects that each took a stage and a screenshot to find are now caught by one check that
knows about neither.

Stage 150's revert is also how the sweep's own hole was found: under the leaves-only rule it stayed
green, because the header is five spans that each fit inside a line that does not. The rule was
widened before the stage was finished rather than after.

## Stage 161 — The district chooser and a contract were printed on the same page

**Goal.** The endgame probe's own frame, `stage11-deepwake.png`, shows the district list with
`VANTAGE CLEARING HOUSE`, `FLIPS · 7 NODE SECONDS · OBJECTIVE 335` and `[ENTER] SIGN` legible
straight through the rows you are meant to pick from.

Every HUD panel is painted `--pan`, `rgba(3, 5, 9, 0.72)`. Over the city that translucency is the
whole look — the street shows faintly through the chrome, which is what the reference clip does.
Over another panel it is not a look, it is two documents on one page.

Measured on a drawn HUD at 960×540 rather than read off the picture: open contracts, press `M`, and
the chooser's 386×189 box overlaps the contracts panel by **72 954 px²**, which is all of it — with
the terminal panel under it too. Two keystrokes. In the probe's own state it is 52 496 px² of the
settlement receipt.

**What changed.**

- `client/hud/panel.ts` — `cssAlpha(colour)` reads the alpha a browser reports, in every form it
  reports it in, and counts anything it cannot read as clear, which is the failing side.
  `hidesPanels(alpha, overlapPx)` is the rule: a panel over nothing may be as translucent as the
  look wants; a panel over another panel's text may not.
- `client/hud/hud.css` — `--solid`, the panel colour with nothing showing through, and the chooser
  painted with it. Nothing else changed: what the city shows through the HUD is the look and stays.
- `tests/panel.test.ts` — the colours the HUD is really painted, the forms of the same colour, the
  unreadable ones, and the rule either side of its edge.
- `probe/stage11.ts` — the endgame probe, whose frame is the evidence, measures the chooser's
  overlap with every other visible panel and holds it to the rule.

**Proof.** vitest 860/860. `npm run probe:endgame` 17/17: `chooser painted rgb(3, 5, 9) (alpha 1)
over 52496 px² of ".p am receipt"`, where it had been `rgba(3, 5, 9, 0.72)` over the same. The whole
sweep as CI runs it — every probe, the four lints, the firmware certification, build and smoke —
green, and nothing else moved: the HUD is painted exactly as it was everywhere but the chooser.

Mutation A, the chooser translucent again: `probe:endgame` 16/17 — `painted rgba(3, 5, 9, 0.72)
(alpha 0.72) over 52496 px²`, the defect as it was found. Mutation B, the rule counting 0.7 as
hiding: `tests/panel.test.ts` fails, and the probe stays green — correctly, because with the CSS
right the chooser really is opaque and a slacker threshold does not change that verdict. The two
mutations are caught by the two different layers, each by the one that owns it: the probe guards the
wiring, the test guards the rule.

## Stage 160 — The map's footer never fitted the map

**Goal.** The campaign probe's own frame, `stage10-mission.png`, draws the area map with
`▲ AHEAD · 114 M ACROS` under it. The S is gone, cut at the box's edge.

Measured on the drawn HUD rather than read off the picture, it is not a long-district edge case: the
footer overflows in **every district at every window width**, and always has. The full form wants
123 px of a 116 px box with a two-digit distance and 129 px with a three — drainage yard 70 M and
the white office 34 M are cut by 7 px, lease row, the docks and the depot at 114 M and the
Deadletter Office at 134 M by 13.

Stage 129 wrote that footer, Stage 132 measured the phone's and gave it a short form, and the third-
person probe has checked this one since — `^▲ AHEAD · N M ACROSS$`, the text, exactly, and never the
fit. The phone's check has asserted `footerOverflow <= 0` since Stage 132. The desktop's never did,
so the desktop has been cut for thirty stages while a check went green over it.

**What changed.**

- `client/hud/radar.ts` — the footer's forms, longest first: `▲ AHEAD · 114 M ACROSS`, then
  `▲ 114 M ACROSS`, then the phone's `▲ 114 M WIDE`, then `▲ 114 M`. `mapFoot(box, widths)` takes
  the longest that fits. The heading-up word sheds first because the arrow already says it; the
  arrow and the number are never shed, because they are what the footer is for.
- `client/hud/hud.ts` — each form is measured once per change of distance and the fitting one drawn,
  the same shape the header line has used since Stage 150.
- `tests/radar.test.ts` — the ladder shortens at every step, keeps the arrow and the number in every
  form, picks the longest that fits, and falls to the shortest rather than to none.
- `probe/stage60.ts` — the check now reads the drawn footer's overflow and its box, not only its
  words.

**Proof.** vitest 853/853. `npm run probe:tps` 50/50: `footer "▲ 70 M ACROSS" · the map spans 70.0 m
· overflow 0 px · inside the box true`. Measured again across every district after the change:
drainage yard 70, lease row / docks / depot 114, the Deadletter Office 134, the white office 34 —
`scroll 116, client 116, overflow 0` in all of them, at 1280 and at 960, where before they were 123
and 129 against 116. The whole sweep as CI runs it — every probe, the four lints, the firmware
certification, build and smoke — green.

Mutation A, the footer never shedding: `probe:tps` 49/50 — `footer "▲ AHEAD · 70 M ACROSS" ·
overflow 7 px`, the defect as it was found, on the shortest district in the game. Mutation B, the
ladder allowed 16 px of slack: 49/50 with the same overflow, and `tests/radar.test.ts` fails on its
own. The phone's own footer check, which has asserted `footerOverflow <= 0` since Stage 132, stays
green through both — it was never the one that was wrong.

## Stage 159 — The join line printed the link instead of the room

**Goal.** The other thing wrong in the frame Stage 157 came out of. The event log's join line took
the last segment of the socket URL and printed it whole:

```
» LINKED · ROOM run-yard?mode=run&ai=0&level=drainage_yard · FILE #1
```

straight off `stage14-carry.png`, wrapping onto a second line of a log that holds five — two of the
five entries a player gets, spent on a query string. Every networked frame this repo has produced
carries it; Stage 153's proof line quotes `ROOM probe?ai=0&level=drainage_yard`.

A real room is named `wake-run-drainage_yard?level=drainage_yard&mode=run` from the menu, or
`audit-3020?audit=1&level=lease_row` from an Audit, so the line told the player the district twice
and then the room's settings, which they cannot change and did not ask about. The room's name is the
path's last segment; the query is how the client was told to connect.

**What changed.**

- `client/hud/room.ts` — `roomName(url)`, beside the band's other room readouts: the query and the
  fragment come off before the path is split, the segment is unescaped, and a link that names no
  room still says something.
- `client/game.ts` — the join line asks for the room's name rather than slicing the URL itself.
- `tests/roomlabel.test.ts` — the real room shapes, the escaped name, the malformed escape, the
  link that names nothing, and a query carrying a slash.
- `probe/stage2.ts` — the net probe reads the line off a page whose log is still new, and fails
  unless it names the room and carries no query at all.

**Proof.** vitest 848/848. `npm run probe:net` 27/27: `"» LINKED · ROOM probe-join-31 · FILE #1" ·
room read as "probe-join-31"`, where it had read `probe-join-31?ai=0&level=drainage_yard`. The whole
sweep as CI runs it — every probe, the four lints, the firmware certification, build and smoke —
green.

Mutation A, the join line slicing the URL itself again: `probe:net` 26/27 — `"» LINKED · ROOM
probe-join-31?ai=0&level=drainage_yard · FILE #1"`, the defect exactly as it was found. The rule's
own tests survive it, which is the point of having the probe: a rule that is right and called by
nobody looks the same as one that works.

Mutation B was a hole before it was a mutation. Taking the query off the path before splitting it is
one of two guards — the segment is cut at a `?` again after unescaping — and with the first removed
every test still passed and the probe still passed. The two differ only when the query itself
carries a slash, which a link to another room or a path-valued setting does: without the first cut,
`ws://h/room/probe?next=ws://other/room/decoy` names the room `decoy`. That case is a test now, and
with it the mutation fails. A guard no test can tell from its neighbour is not guarded.

## Stage 158 — The first trigger pull of a session compiled a shader

**Goal.** Stage 157's sweep went red on the frame budget's hitch check — `max 302 ms` against a 61 ms
median — and green when re-run. The same ~300 ms stall under sustained fire is in Stage 156's sweep
record at 307 ms, where it passed only because that run's median was slower and the ratio came to
3.9 of an allowed 4. A check that catches a real stall only when the machine is otherwise fast is
worth chasing rather than re-running.

It reproduced immediately, and it is not a flake. Firing 700 frames from a cold page: every frame
under 100 ms except one, **frame 3 of the first burst, at 278 ms** — and on the next run 308. Frame 2
created two shader programs; frame 3 paid for them.

The two programs are the tracer and spark pools. They are hidden while empty — rightly, two draw
calls of degenerate geometry are two draw calls — and Three.js compiles a material's program the
first time its object is drawn. So nothing had ever drawn them, and the shot that made them visible
compiled two shaders mid-frame at the moment a duel starts.

The renderer's constructor already warms the scene: it shows both pools and calls `compile`. The
cache keys say why that bought nothing. The two programs compiled on the first shot differ from two
the warm-up had already built by exactly one field — `1,7` against `1,6`, the scene's point-light
count. The warm-up runs while the lights are still being built, so it compiles programs for a scene
the game never draws, and the real ones are compiled on the frame that first needs them. The comment
above that `compile` call warns about this exact trap for a different field of the same key, the
output colour space, and fixes it by binding the buffer the scene is drawn into. The lights are one
field over, and nothing had ever checked that the warming worked.

**What changed.**

- `client/render/warmup.ts` — `drawPool(live, framesLeft)` and `warmStep(framesLeft)`: a pool is
  drawn because it has something to show, or because it is still warming. Rather than compile
  earlier against a guess at the final scene, the pools stay drawn for the first frames of real
  rendering, where the state is whatever the game actually draws with.
- `client/render/vfx.ts` — the visibility line goes through the rule and counts the warm down.
- `tests/warmup.test.ts` — an empty pool is drawn for the warm frames and then not, a live one
  always, and the counter never restarts.
- `probe/stage21.ts` — the frame budget now fails if the first sustained burst of a session compiles
  a shader at all. It had been measuring the consequence, on a ratio, and catching it one run in two.

**Proof.** vitest 843/843. `npm run probe:frame` 8/8: `programs 46 → 46 over 69 shots · geometries
61 → 61`, and the hitch check it used to fail intermittently now reads `p50 61.5 max 73 ms · 1.2×`.
Measured directly from a cold page, firing 120 frames: 0 programs compiled on the first burst, worst
frame 99.8 ms against a 61.1 ms median, a ratio of 1.63 where it had been 308 over 61. Two side
effects confirm the diagnosis rather than being aimed at: the per-shot geometry registration goes
from `59 → 61` to `61 → 61`, because the pools register at load now, and `0.029 per shot` becomes
`0.000`. The whole sweep as CI runs it — every probe, the four lints, the firmware certification,
build and smoke — green.

Mutation A, no warm frames at all: `probe:frame` 7/8 — `programs 44 → 46 over 69 shots`, the two
shaders compiling on the first burst again, and `tests/warmup.test.ts` fails on its own.

One claim this stage dropped on measuring it. The warm was written at two frames "because the driver
creates the program on the frame the object is drawn and links it on first use". Mutation B, warming
for a single frame, passes the probe 8/8 with nothing compiled and no stall — so one frame is
sufficient here and that reason is not demonstrated. The constant stays at two as cheap margin for a
driver that does link lazily, but the comment now says what was measured, and the test that had
asserted `>= 2` asserts what can be defended: at least one frame, and few enough that a warm-up
cannot become a permanent cost. A test defending a guess fails the wrong mutations.

## Stage 157 — The line under the crosshair named a file that was not there

**Goal.** The bottom row's middle has read `1 · BLANK · 0.0 m/s · STAND` since the look stage wrote
the HUD. The speed and the stance are live and always have been. The other two are not: the `1` and
the `BLANK` were typed into the markup and no code has ever written either of them. Grep the client
for `.center` and the single hit reads its width for layout.

So the line named a file that was not there. This repo's own run-probe frame, `stage14-carry.png`,
has the header saying `▲ ALPHA`, the event log saying `FILE #1`, and the line between them, under
the crosshair, saying `1 · BLANK`.

Three stages measured that line and moved it without reading it. Stage 118 lifted it above the
bottom row where the slots and the tab strip leave it no room; Stage 132 took that rule back off the
phone; Stage 136 seated the reader frames above it. Stage 132's goal in this file quotes the string
in full — `1 · BLANK · 0.0 m/s · STAND` — as a thing printed in the wrong place, which it also was.

**What changed.**

- `client/hud/footline.ts` — `footTag(fileId, display)`: the file's number in the room and what the
  city calls it. An unnamed file is `BLANK`, which is what the room calls one too; a file with no
  seat yet is `#—`, because `#0` and `#-1` are each a claim about a seat that does not exist.
- `client/hud/hud.ts` — the two halves are spans now. The name is remembered where the header's
  handle is written, so the two readouts cannot disagree, and the line is written when either half
  changes rather than on every frame.
- `tests/footline.test.ts` — the pair, the nameless file, the seatless one, and that the cache key
  moves when either half does.
- `probe/stage14.ts` — the run probe, whose own frame is the evidence, now reads the line off
  ALPHA's drawn HUD and fails unless it is the number the room gave the file and the name the
  header carries.

**Proof.** vitest 839/839. `npm run probe:run` 26/26: `"#1 · ALPHA · 0.0 m/s · AIR" · the room
seated this file as #1 and the header calls it "ALPHA"`. The whole sweep as CI runs it — every
probe, the four lints, the firmware certification, build and smoke — green: `probe` 19/19,
`probe:look` 18/18, `probe:net` 26/26, `probe:arsenal` 32/32, `probe:wake` 27/27, `probe:file`
19/19, `probe:city` 45/45, `probe:cityLife` 21/21, `probe:mastery` 23/23, `probe:identity` 25/25,
`probe:campaign` 43/43, `probe:endgame` 16/16, `probe:counter` 16/16, `probe:crawl` 10/10,
`probe:ship` 10/10, `probe:harden` 9/9, `probe:frame` 7/7, `probe:mobile` 40/40, `probe:persist`
7/7, `probe:tps` 50/50, `probe:body` 20/20, smoke 7/7.

Mutation A, the line never written after the markup: `probe:run` 25/26 — `"#— · BLANK · 0.0 m/s ·
AIR"` against a room that had seated the file as #1 and a header calling it ALPHA, which is the
defect as it was found. Mutation B, the name always the placeholder: 25/26 — `"#1 · BLANK"`, the
number right and the name still a lie, and `tests/footline.test.ts` fails 2 of its 4 on its own.

One failure in this stage's sweep was not this stage's. `probe:frame` came back 6/7 on the hitch
check — `p50 61.2 p95 69.5 p99 301.6 max 302 ms · 4.9×` against a 4× bound. Re-run on the same tree
it was 7/7 at `max 78 ms · 1.3×`. The same ~300 ms hitch under sustained fire is in the Stage 156
sweep's record too, at `p99 306.7 max 307 ms`, where it passed only because the median was slower
that run and the ratio came to 3.9. So the check is a ratio whose bound tightens as the machine gets
faster, and there is a real third-of-a-second stall under sustained fire behind it, seen twice. That
is the next stage's, not this one's: two writes behind a cache cannot stall a frame for 300 ms, and
the check sits between two 7/7 runs with this change in.

## Stage 156 — The frame counter was measured on a clock that stopped when the frame did

**Goal.** The right-hand band has said `N FPS · SIM N Hz` since the first stage. The sim number is
this game's foundational claim — a fixed 60 Hz timestep decoupled from the render rate — and the
pair is what a player reads to tell a renderer that cannot keep up from a simulation that is running
wrong. Measured against a stopwatch, a page running its sim at 60.0 Hz and drawing 3.8 frames a
second said `8 FPS · SIM 120 Hz`. Both numbers were wrong, both by a factor of two, in the same
direction, and it was the flattering direction.

The cause was one line's position. `frame()` runs the accumulator and ticks the sim on every frame
the loop is given, then returns early at `if (!render || !this.drawing) return;` for anything that is
not a drawn frame. The window both numbers were folded in sat below that return, so its clock only
advanced on the frames the renderer drew, while the ticks divided by it came from every frame. And
frames come from two drivers: the animation frame, and the 16 ms keep-alive that carries the sim and
the link when animation frames are scarce. That timer fires whenever the last frame was more than
60 ms ago — which on a machine drawing at four frames a second is always. So the window measured
about half the time that passed and doubled everything divided by it.

Which is exactly the wrong way round. On a machine drawing as fast as it is asked to the two clocks
are the same and the band is right. It only lies to the player whose machine is struggling — the one
person who is reading it.

What kept it alive for a hundred and fifty-five stages is where the keep-alive's threshold falls.
The timer only takes a frame when the last one was more than 60 ms ago, so the second driver — and
the doubling with it — switches on below about sixteen frames a second and is silent above. The
first probe draws at 18 fps and reads true: 17.1 before this stage and 18.0 after, on the same
runner an hour apart. The frame-budget probe draws at 12.9 and reads 28.9. The readout was exact
wherever anyone happened to look at it and wrong where nobody did, and no probe had ever asserted
on it — each measures the sim rate honestly for itself and prints the band's number beside its own
as decoration.

**What changed.**

- `client/hud/perf.ts` — the window as a rule: `perfStep` folds one frame, taking the elapsed time
  and the ticks from every frame the loop was given and the frame count only from the ones that
  drew, and returns a reading when the half-second closes. The elapsed time is the sim's own clock,
  the clamped delta the accumulator was fed, so `SIM` answers the same question the probes ask it —
  how fast the sim ran for the time it was given.
- `client/game.ts` — the fold moved above the drawn-frame return, where the ticks it divides already
  were. `stats.frames` still counts only real draws.
- `tests/perfwindow.test.ts` — a loop given 60 frames a second that draws one in sixteen must read
  60 Hz and 3.75 fps, not 60 and 60; the window's boundary and reset; and a frame that arrives out of
  order cannot run the clock backwards.
- `probe/stage21.ts` — the frame-budget probe measures everything else about a frame and never read
  the number the player gets. It now samples the band across the span and holds it to the counters:
  the renderer's own frame count and the sim's own tick count over the same seconds.

**Proof.** vitest 835/835. `npm run probe:frame` 7/7: `band said 13.0 FPS · SIM 60.0 Hz over 22
readings; the counters say 12.8 fps · 60.0 Hz over 12.9s (off by 1% and 0%)`. The whole sweep as CI
runs it — every probe, the four lints, the firmware certification, build and smoke — green:
`probe` 19/19, `probe:look` 18/18, `probe:net` 26/26, `probe:arsenal` 32/32, `probe:wake` 27/27,
`probe:file` 19/19, `probe:city` 45/45, `probe:cityLife` 21/21, `probe:mastery` 23/23,
`probe:identity` 25/25, `probe:campaign` 43/43, `probe:endgame` 16/16, `probe:counter` 16/16,
`probe:crawl` 10/10, `probe:ship` 10/10, `probe:run` 25/25, `probe:harden` 9/9, `probe:mobile`
40/40, `probe:persist` 7/7, `probe:tps` 50/50, `probe:body` 20/20, smoke 7/7.

Mutation A, the clock back on the drawn frames only: `probe:frame` 6/7 — `band said 28.9 FPS · SIM
133.2 Hz; the counters say 13.1 fps · 60.0 Hz (off by 121% and 122%)`, which is the defect as it was
found, reproduced from the one line. Mutation B, every frame the loop is given counted as a drawn
one: 6/7 — `21.0 FPS · SIM 60.0 Hz` against 13.1 fps, the sim number right and the frame number
still half a lie. `tests/perfwindow.test.ts` catches both on its own, 2 of 5 and 1 of 5.

One claim this stage dropped on being measured. The first draft of this entry said the render rates
quoted in earlier proof lines were doubled too. They are not: the first probe draws at 18 fps, above
the keep-alive's threshold, and read 17.1 before the change and 18.0 after on the same runner an
hour apart. The doubling starts below about sixteen frames a second, and that is the whole reason
this survived — the number was exact wherever it was being watched.

## Stage 155 — A lost join ended the session before it began

**Goal.** The last stage's link check had to pick its seed. On the same 5 % simulated loss the net
probe has played on since the netcode stage, two of the three seeds tried never joined at all: the
page sat in `connecting` for ever, `playerId: -1`, and on one of them the room streamed 143
snapshots at a seat it had already given away. The client asked to join once, on `onOpen`, and the
room answered once. Neither packet was timed, so one loss anywhere in the handshake ended the
session before it began — silently, with the game still running and the HUD still saying `LINKING`.

The knock built in Stage 153 did not cover it: that knocks on a link that dropped, and this link
never opened.

**What changed.**

- `shared/net/rejoin.ts` — the handshake's own plan beside the rejoin plan: `joinDelay` (700 ms,
  doubling, three re-asks), `joinGiveUpMs` and `joinWindowMs`. It is short and it ends: a join is
  not an input to repeat forever, because the room admits on it.
- `client/net/netclient.ts` — the join is asked on that plan rather than once, the wait is disarmed
  by the Welcome, a kick or a close, and a spent plan closes the link so the knock takes the door. A
  repeat Welcome is taken as an ack and nothing else: running that branch twice would have started a
  second ping timer and told the game it had joined again.
- `server/room.ts` — a repeat join from a seated connection is answered with the Welcome and the
  File message again, up to the same count the client can spend, and only then struck. It used to be
  struck immediately, which punished the one client the room could still help. A repeat that arrives
  while the first join is still loading its file is ignored, so one connection is never seated twice.
- `client/game.ts` — a close with no token knocks too: a handshake that never completed has nothing
  to rejoin with, so it asks the door again from the start rather than ending there.
- `tests/joinretry.test.ts` — the plan, the room saying hello again, the bound past which it is
  noise, and the connection that asks three times while its file is still loading.
- `probe/stage2.ts` — the two seeds that stranded, 31 and 12, each on its own room on the same
  lossy link, must end up joined; and at least one of them must have asked more than once, or the
  check would prove only that the loss had moved.

**Proof.** vitest 830/830. `npm run probe:net` 26/26: `seed 31: file #1 after 2 ask(s) in 917 ms ·
seed 12: file #1 after 2 ask(s) in 915 ms`. Both asked twice, which is the whole claim — the first
ask was lost on each of them, exactly as it was when they stranded, and the second carried it.
The whole sweep as CI runs it — every probe, the four lints, the firmware certification, build and
smoke — green: `probe` 19/19, `probe:look` 18/18, `probe:arsenal` 32/32, `probe:wake` 27/27,
`probe:file` 19/19, `probe:city` 45/45, `probe:cityLife` 21/21, `probe:mastery` 23/23,
`probe:identity` 25/25, `probe:campaign` 43/43, `probe:endgame` 16/16, `probe:counter` 16/16,
`probe:crawl` 10/10, `probe:ship` 10/10, `probe:run` 25/25, `probe:harden` 9/9, `probe:frame` 6/6,
`probe:mobile` 40/40, `probe:persist` 7/7, `probe:tps` 50/50, `probe:body` 20/20, smoke 7/7. The
net client is on every one of those links, so every one of them had to be run.

Mutation A, the client asking once and never again: `probe:net` 25/26 — `seed 31: still connecting
after 30005 ms · seed 12: still connecting after 30004 ms`, the defect exactly as it was found.
Mutation B, the room striking the repeat join again: `probe:net` 25/26 on the same two seeds, and
`tests/joinretry.test.ts` fails 2 of its 6 on its own. The plan's own tests survive both, which is
the point of having the probe: a rule that is right and wired to nothing looks identical to a rule
that works.

One thing this stage found rather than built: the retry opened a hole of its own. A store that
answers asynchronously — the Workers' Durable Object does — leaves the first join in flight with no
seat yet recorded, so the second ask would have been admitted as a fresh join and seated one
connection twice. The room ignores a repeat that arrives while the first is still loading, and the
test that would have caught it asks three times before releasing the file.

## Stage 154 — The client measured the link and told nobody

**Goal.** The client has measured its own round trip since the netcode stage: a median over the
last samples, the number its whole clock estimate is built on, kept in `rttMs` and read by nothing
but the probe's diagnostics. Grep the HUD for `rtt`, `ping` or `latency` and the only hits are the
radar's gunfire pings, which are a different thing entirely.

So the right-hand band, which has room for it and already carries the frame's own cost — `0 FPS ·
SIM 60 Hz` — said nothing about the link. A player being rubber-banded across the street had
nothing on the screen to tell them whether it was the link or the game, and no number to take to
anyone.

**What changed.**

- `client/hud/room.ts` — `linkLabel` and `linkTone`, beside the room's own label: the round trip
  rounded to a whole millisecond, nothing at all before the first sample or outside a room, and a
  tone — ok, slow past 120 ms, bad past 250.
- `client/hud/hud.ts` — `setRoom` takes the round trip and writes it into the band beside the file
  count, with the tone as its class. The header line is untouched: it sheds first on a narrow
  screen (Stage 150) and this is a diagnostic, not a name.
- `client/hud/hud.css` — the three tones.
- `client/game.ts` — the number comes from the net client each frame, and both readouts moved out
  of the drawn-frame work: they are text, so a client that is not drawing still says them. The
  net probe's clients all run `norender`, and the first version of this check could not read a
  band that only a rendering client wrote.
- `tests/roomlabel.test.ts` — the label, the silence before the first sample, and the thresholds.
- `probe/stage2.ts` — the net probe opens one page that draws, on the same simulated 150 ms link
  the rest of the probe plays on, and fails unless the band's number is the client's own round trip
  and its tone is what that number deserves.

**Proof.** vitest 824/824. `npm run probe:net` 25/25, twice: `band "1 ONLINE · 147 MS" (linkms
slow) · the client's own rtt 147.0 ms on a 150 ms simulated link`, and 143 ms on the second run.
Regressions `npm run probe` 19/19, `probe:run` 25/25, `probe:mobile` 40/40 and `probe:tps` 50/50;
build, smoke 7/7.

Mutation A, the band showing the link as free: `probe:net` 24/25 — `band "1 ONLINE · 0 MS" · the
client's own rtt 147.0 ms`. Mutation B, every link looking fine: `probe:net` 23/25 — `(linkms ok)`
on a 152 ms link. `tests/roomlabel.test.ts` catches both on its own as well.

Two things this stage found rather than built. The first: the check could not read the band on a
client that does not draw, which is every client the net probe runs, so both readouts moved out of
the drawn-frame work. The second: with the probe's 5 % simulated loss, two of the three link seeds
tried never joined at all — the client sat in `connecting` for ever, `bytesOut: 0`, while the room
streamed snapshots at it. The join is sent once and never again. That is a defect of its own and
the next stage's.

And one flake fixed in passing: Stage 153's drop check read `LINK LOST · REJOINING` out of an event
log that holds five entries, four of which the rejoin itself writes, with the room's PA writing
into it too. It reads the line while it is the newest now, and the net probe ran twice green.

## Stage 153 — A dropped link froze the match and nobody tried the door

**Goal.** The room keeps a disconnected file's seat for sixty seconds: `player 1 (ALPHA)
disconnected; rejoin window 60s`, its body still in the world, `players: 1, connected: 0`. The
client, meanwhile, did nothing at all. On a closed socket it set its status to `closed`, pushed
`LINK CLOSED · client close` into the event log, and stopped.

Measured against a live room by closing the transport the way a network blip closes it: the
client's world froze at tick 126 while the room ran on to 727, and ten seconds later the client was
still sitting there, `status: "closed"`, with a valid session token in its pocket and a seat held
open for it. `reconnect()` has existed since the netcode stage and nothing has ever called it but
the probe.

**What changed.**

- `shared/net/rejoin.ts` — the plan: half a second, then double, for as long as the waits before it
  fit inside the room's grace window. Six knocks over 31.5 seconds of a 60 second window. The
  window is a shared constant now, so the room's default and the client's last try cannot drift.
- `server/room.ts` — its default grace reads that constant.
- `client/net/netclient.ts` — `left`, set by `close()`: a drop can be told from a departure.
- `client/game.ts` — a closed link that was not a departure and not a kick knocks on the room,
  saying so in the log (`LINK LOST · REJOINING IN 0.5s · TRY 1 OF 6`), and the line on the way back
  reads `RELINKED` rather than `LINKED`.
- `tests/rejoin.test.ts` — the plan, its bound, and that it scales with the window it is given.
  One of this stage's own mutations — a plan that never says no — hung the run rather than failing
  it, because the counter that turns the plan into a number for the player's line trusted the plan
  to stop. It is bounded now, and a test holds it to that.
- `probe/stage2.ts` — the net probe drops ALPHA's transport with no `reconnect()` call and fails
  unless the client comes back by itself, as the same file with the same token, into a seat the
  room still holds, with its world running on.

**Proof.** vitest 820/820. `npm run probe:net` 24/24, the drop read from the running room: `back
true as file #1 · tick 1424 → 1522 · token kept true · "» LINK LOST · REJOINING IN 0.5s · TRY 1 OF
6" · "» RELINKED · ROOM probe?ai=0&level=drainage_yard · FILE #1" · seat connected true`.
Regressions `npm run probe` 19/19, `probe:run` 25/25, `probe:campaign` 43/43, `probe:harden` 9/9,
`probe:persist` 7/7 and `probe:mobile` 40/40; build, smoke 7/7.

Mutation A, the client mourning the drop instead of knocking: `probe:net` 20/24 — the drop check
reading `back false · tick 1417 → 1418 · seat connected false`, the frozen world this stage is
about, and three later checks that need ALPHA in the room went with it. Mutation B, a plan that
never says no: `tests/rejoin.test.ts` 3 failed — and the run finished rather than hanging, which
the first attempt at this mutation did not, because the counter had trusted the plan to stop.
Mutation C, the client knocking even when it left on purpose: `probe:net` 22/24, the probe's own
`reconnect()` racing a knock it never asked for.

## Stage 152 — The first screen told a phone to press ENTER

**Goal.** Stage 145 took the keys off the frames a thumb reaches inside the game: the FILE book,
the graph, the contracts desk, the district panel, THE RUN's strip. It left the screen every player
sees first. The menu's footer reads `↑↓ MOVE · ENTER SELECT · ← → ADJUST · ESC BACK`, and the line
under a settings row reads `← → adjusts · applied live · kept in this browser`. On a phone that is
four instructions and two arrows for keys it has not got — on WAKE, THE RUN, CAMPAIGN, SETTINGS,
and on the pause menu a thumb opens with the PAUSE pad Stage 141 built.

What makes it only a wording fault is that the menu has taken clicks since it was written: a tap on
a row chooses it, a tap on a row's `[−]` or `[+]` adjusts it. The phone probe has been tapping
RESUME on the pause menu since Stage 141. The screen worked; it just told you to do something else.

**What changed.**

- `client/hud/keyhint.ts` — `menuFooter(touch)` and `settingsLine(touch)`, beside the close and open
  hints Stage 145 put there. On a phone the footer reads `TAP A LINE TO CHOOSE · TAP [−] [+] TO
  ADJUST` and the settings line `tap [−] [+] · applied live · kept in this browser`. The two chips
  keep their brackets, because they are drawn in the row and a thumb presses them.
- `client/menu.ts` — both lines come from the rules, against the same `wantsTouch()` the touch
  build already uses.
- `tests/keyhint.test.ts` — both forms, and that the touch form names no key.
- `probe/stage32.ts` — the phone probe reads the footer and the settings line off the drawn menu,
  reaching settings and coming back the way a thumb does.
- `probe/stage13.ts` — and the desktop's footer still names the keys a desktop has.

**Proof.** vitest 814/814. `npm run probe:mobile` 40/40, read off the drawn menu: `footer "TAP A
LINE TO CHOOSE · TAP [−] [+] TO ADJUST · dev" · settings line "tap [−] [+] · applied live · kept
in this browser" · 16 adjust chips`. `npm run probe:ship` 10/10 with the desktop's `"↑↓ MOVE ·
ENTER SELECT · ← → ADJUST · ESC BACK · dev"`. Regressions `npm run probe` 19/19,
`probe:campaign` 43/43, `probe:wake` 27/27, `probe:tps` 50/50, `probe:run` 25/25 and `probe:crawl`
10/10; build, smoke 7/7.

Mutation A, the footer keeping the keyboard's words whatever the device: `tests/keyhint.test.ts` 2
failed and `probe:mobile` 39/40, the phone reading `↑↓ MOVE · ENTER SELECT · ← → ADJUST · ESC
BACK`. Mutation B, the settings line keeping its arrows: `probe:mobile` 39/40, `settings line "← →
adjusts · applied live · kept in this browser"`.

## Stage 151 — CI ran the probes I did not

**Goal.** Verify runs #176 and #177 went red on work that had been verified here first. Three
failures, each one a probe this session had not run:

- `probe:mobile`, on both runs: `off every node, with no node line up, the alert still hangs under
  the phone's row rather than on it — ... alert none`. Stage 147's phone check raised the alert,
  waited 350 ms and two frames, and read. That is the house rule for reading an alert, and on a
  runner drawing at 12 fps it is a race: the fade the rule allows for is drawn when the runner gets
  to it, not when the stopwatch says.
- `npm run probe` (the first probe), on #177: `the VANTAGE PA reads in full: wrapped inside the
  log's box to its last word, with no ellipsis`. Stage 133's check asserted that the PA was the one
  line that wrapped and that every other line kept `text-overflow: ellipsis`. Stage 148 gave every
  line the wrap, and left that check asserting the thing it had just removed.
- `probe:endgame`, on #177: `the Welcome names the playlist and the client runs the same gravity
  and sheet the room runs`. Its Audit page is 480 × 270, and there Stage 148's new bound — the log
  drops its oldest entry until it clears the stack above it — can never be satisfied: the log's own
  anchor, 88 px off the bottom of a 270 px view, is above the alert's seat whatever the log says.
  So it trimmed to a single line and the `AUDIT · STACK & PHAGE` line the check looks for was gone.

**What changed.**

- `probe/stage32.ts`, `probe/stage5.ts` — both wait for the frame where the alert is lit, bounded
  at 240 frames, rather than for 350 ms. The phone's check also reports the alert's opacity, its
  display and the silenced groups when it finds nothing, so the next failure says why.
- `probe/stage1.ts` — the PA check now holds what Stage 148 made true: nothing in the log is cut,
  the PA over its rows and the rest over theirs.
- `client/hud/hud.ts` — the log keeps what the entry cap gave it where no number of entries clears
  the stack. Trimming there loses lines for nothing.
- `probe/stage5.ts` — that case as a check: in a 480 × 270 window the wake's stack reaches 209
  while the log's anchor is at 182, so nothing clears and the log keeps all five lines.
- `probe/stage10.ts` — and the other case, where one row does fit: at 480 × 270 the campaign's
  shorter panel leaves the log one row, and it keeps that one — the newest — clear of the stack.
- `probe/stage11.ts` — the Audit page is read at 960 × 540. Its check looks for the `AUDIT · STACK
  & PHAGE` line in the event log, and a log with room for one line is not where you read that.

**Proof.** vitest 810/810. The probes CI failed, all green on the same tree: `npm run probe` 19/19,
`probe:campaign` 43/43, `probe:endgame` 16/16, `probe:mobile` 39/39, and `probe:wake` 27/27 with
both short-window readings — `480×270: 5 of 5 entries · log 112–182 with the stack ending 222,
which nothing clears` in the wake's scene, and `1 of 5 entries · log 168–182 with the stack ending
156` in the campaign's, where one row fits. And the whole sweep as CI runs it — every probe, the
four lints, build and smoke — green: look 18/18, net 23/23, arsenal 32/32, file 19/19, city 45/45,
cityLife 21/21, mastery 23/23, identity 25/25, counter 16/16, crawl 10/10, ship 9/9, run 25/25,
harden 9/9, frame 6/6, persist 7/7, tps 50/50, body 20/20, smoke 7/7.

Mutation A, the log dropping lines where dropping buys nothing: `probe:wake` 26/27 — `480×270: 1 of
5 entries · log 168–182 with the stack ending 222, which nothing clears`. Mutation B, the log back
to cutting its lines: `npm run probe` 18/19 — `2 rows in 380 px · overflow 388/0 px · in the box
false`. And the check the timing fix touched still guards what it guarded: with the HUD no longer
handing the alert the phone's row, `probe:mobile` is 38/39 — `alert 98–112 · crosses [row,tabs]` —
so waiting for the lit frame made the check reliable without making it lenient.

The method's own lesson: these three failures all came from probes this session did not run. A
change to shared HUD code is a change to every frame the game draws, and the probe list in
`.github/workflows/verify.yml` is the list of things that read those frames.

## Stage 150 — The file's own name line was cut on every screen

**Goal.** The status panel's first line is the file's own: `▲ BLANK · DEBT COLLECTOR · DRAINAGE
YARD (MAGENTA) · 2 ONLINE`. It was `nowrap` with an ellipsis in a 330 px box, and Stage 135 had
already given the line under it a short form for exactly this reason while leaving this one alone.

Walked through the HUD with the game's own monikers — and a moniker is earned in the first match a
file plays — the line wants 435 px with `DEBT COLLECTOR`, 428 with `LEASE-BREAKER`, 399 with
`FULL WAKE`. So it was cut at every width this game has ever been drawn at, 1920 included, and the
player lost the room's count and the end of the house. At 960 the cut ate into `(MAGENTA)`; at 800,
where the panel's box is 233 px, it ate `YARD (MAGENTA) · 1 online` and the district's name went
with it.

**What changed.**

- `client/hud/hud.ts` — the line's parts are separable spans: the district, the house in its
  parentheses, the room's count. The layout pass measures what each form wants once per change of
  what the line says, and picks a form every pass, because the box moves with the window.
- `client/hud/layout.ts` — `statusHead`: the ladder. The room's count goes first, then the house,
  then the district. The name and the moniker are what a header line is for and are never shed.
- `client/hud/hud.css` — the three forms.
- `tests/layout.test.ts` — the ladder, at the box's own numbers.
- `probe/stage60.ts` — the check that used to say "where the header line does not fit, the cut is
  an ellipsis rather than a hard edge" now says it fits. And every moniker the game can give a file
  is walked through the line at 1280, 960 and 800, failing if any is cut or if the name or the
  moniker is what goes.

**Proof.** vitest 810/810. `npm run probe:tps` 50/50: the header line `318 px of text in 318 px`,
and the walk reading what is actually drawn at each width — `1280×720: box 330 px · 20 monikers ·
0 cut, 0 losing the name · last "WERN CASE -> BLANK · WERN CASE DRAINAGE YARD (MAGENTA)" ·
960×540: box 318 px · 0 cut · last "... DRAINAGE YARD" · 800×450: box 238 px · 0 cut · last
"BLANK · WERN CASE"`. The ladder in one line: the room's count goes at 1280, the house at 960, the
district at 800, the name never. Regressions `probe:mobile` 39/39, `probe:campaign` 42/42,
`probe:run` 25/25 and `probe:wake` 26/26; build, smoke 7/7.

Mutation A, the HUD picking a form as though every form measured nothing — so it always draws the
full line: `probe:tps` 48/50, `header line 330 px of text in 318 px` and `20 cut` at every width,
`"UNLISTED" wants 385 of 330 px`, which is the defect as it stood. Mutation B, the last rung of the
ladder shedding the moniker rather than the district: `probe:tps` 49/50 — caught only at 800 × 450,
`0 cut, 13 losing the name`, because that is the only width where the last rung is reached.

## Stage 149 — Both readouts counted the room and always said one

**Goal.** Two places on the HUD tell you how many files are in the district with you. The file's
own header line ends `· 1 online`, and the right-hand band under the area map reads `▸ ONLINE (1)`.
Both numbers were typed into the HUD's markup at the first stage and never written again by any
code: no setter, no caller, nothing in the client so much as reads those two spans.

So the run probe's own frame shows ALPHA in a room with BRAVO — the event log beside it reading
`FILE #2 (BRAVO) ENTERED DRAINAGE YARD` — over a band that says `ONLINE (1)`. And offline, where
there is no room at all, both still said one file was online in it.

**What changed.**

- `client/net/netclient.ts` — `files`: the room's size from the thing that knows it. The snapshot's
  player list is everyone but the recipient, so the room is the remotes plus me, and 0 when not
  joined.
- `client/hud/room.ts` — `roomLabel(linked, files)`, so both readouts say the same words: `OFFLINE`
  with no room, `N ONLINE` with one, and never fewer files than the one reading it.
- `client/hud/hud.ts` — `setRoom`, writing both spans when the label changes, and the markup's two
  claims replaced by the label's own starting value.
- `client/game.ts` — the call, beside the rest of the per-frame HUD work.
- `tests/roomlabel.test.ts` — the rule, including the count that cannot be less than one file.
- `probe/stage14.ts` — the run probe already has ALPHA and BRAVO in one room and an offline page.
  It now reads both readouts on all three and fails unless they say two, two and offline.

**Proof.** vitest 805/805. `npm run probe:run` 25/25, read from the drawn frames: `ALPHA: header
"· 2 ONLINE" · band "2 ONLINE" · BRAVO: header "· 2 ONLINE" · band "2 ONLINE"`, and on the
offline page `linked false · header "· OFFLINE" · band "OFFLINE"`. Regressions `probe:net` 23/23,
`probe:campaign` 42/42, `probe:mobile` 39/39 and `probe:tps` 49/49; build, smoke 7/7.

Mutation A, the HUD asking the rule for one file however many are in the room: `probe:run` 24/25 —
`ALPHA: header "· 1 ONLINE" · band "1 ONLINE" · BRAVO: header "· 1 ONLINE" · band "1 ONLINE"`,
which is what the markup had been saying. Mutation B, the rule calling no room one file online:
`tests/roomlabel.test.ts` 1 failed and `probe:run` 24/25 — `linked false · header "· 1 ONLINE" ·
band "1 ONLINE"`.

A note on the method, from this stage's own mistake: the first version of the unit test was written
to `tests/room.test.ts`, which already held the match room's fourteen gatekeeper tests, and
overwrote them. The full suite reported 791 rather than 805 and that ten-test hole is what caught
it. `git status` says `M` for a file you meant to create; read it.

## Stage 148 — The log cut the line that says what to do

**Goal.** The event log at the bottom left is where the game tells you what it wants: `» OBJECTIVE
3 · HOLD THE TERMINAL WHILE THE FILE DECRYPTS`. Every entry but the city's PA was drawn on one
row, `white-space: nowrap`, `text-overflow: ellipsis`, in a box 380 px wide. Stage 133 had already
made the PA read in full and left the objectives cut.

Walked through the HUD's own log, four of the fifty objective lines the campaign can print do not
fit. The worst is mission six's: `OBJECTIVE 3 · HOLD UNTIL THE UPLINK CLOSES — THE LEASE FILE IS
GOING OUT WITH IT` wants 553 px of 380, so a player is told to hold until the uplink closes and
never told that the lease file — the thing the whole arc is about — is going out with it. The
others are mission one's terminal hold (384 px), mission five's variant (506) and mission six's
tower (418).

**What changed.**

- `client/hud/hud.css` — every entry reads in full. The `.pa` exception goes with it, because it is
  now the rule.
- `client/hud/layout.ts` — `logClears`: a log that reads in full grows upward from its anchor with
  what it says, so it needs a bound rather than a blade. The bound is the stack above it.
- `client/hud/hud.ts` — the layout pass keeps where the stack ends, and `push` drops the log's
  oldest entry until the log clears it. A log of very long lines shows fewer of them; it does not
  climb into the frame, and it does not cut a word of what it does show.
- `tests/layout.test.ts` — the bound, at the gap and a pixel inside it, with the stack's bottom
  rounded up.
- `probe/stage10.ts` — the campaign probe walks all fifty objective lines through the real log and
  fails if any is clipped, reading the drawn width against the box. And it pushes five entries far
  too long for the frame to prove the bound bites: the log drops its oldest rather than climb.

**Proof.** vitest 801/801. `npm run probe:campaign` 42/42: `50 objective lines through a 380 px
log · 0 cut · tallest entry 24 px · log 382–452 under a stack ending 75`, and the bound biting,
`3 of 5 entries kept · log 122–452 under a stack ending 75 · oldest cut false`. Regressions
`probe:mobile` 39/39, whose phone log keeps its three entries, `probe:wake` 26/26, `probe:tps`
49/49 and `probe:run` 23/23; build, smoke 7/7.

Mutation A, the ellipsis back in the stylesheet: `probe:campaign` 40/42, naming what a player
loses — `4 cut: "OBJECTIVE 3 · HOLD THE TERMINAL WHILE THE FILE DECRYPTS" needs 384 of 380 px ·
"OBJECTIVE 2 · PUT OUT THE FOUR LATTICE NODES (THE FEEDS ALREADY TOOK TWO)" needs 506 of 380 px …`
Mutation B, the log no longer dropping its oldest: `probe:campaign` 41/42 — `5 of 5 entries kept ·
log -98–452 under a stack ending 75`, a log that has climbed off the top of the frame.

## Stage 147 — The alert's floor could only ever fire by printing over something

**Goal.** The alert — `◆ INTEGRITY 30`, the line that tells you you are being hit — hangs under the
mission panel, the node line and the searchlight warning. Its rule carried a floor as well: *never
lower than 160 px, so it stays in the top band whatever the panel does.* Read the arithmetic and
that floor is only ever reached when it is higher on the screen than the seat under the row above
it. It could not do anything but put the alert into that row's gap, or through the row.

Which it did, in two frames a player gets:

- A 480 × 270 window, where the mission panel takes its second row under the status panel and
  spans 84–175: the alert sat at 160–173, thirteen pixels inside the panel. At 640 × 360 it
  crossed the panel by 4 px and the node line by 3.
- A phone, with no node line up — the file away from every node, which is most of a round. The
  phone's shift, the thing that carries the whole stack under the slot-and-tab row, was applied to
  the floor and to nothing else. With the floor not binding, the alert hung under the mission
  panel alone and printed at 98–112, across a row of 98–144.

**What changed.**

- `client/hud/layout.ts` — `alertTop` is a gap under whatever is above it, and nothing else. The
  floor is gone, and with it the `shift` argument: the phone's row is something above the alert,
  so it is handed in as such rather than folded into a constant.
- `client/hud/hud.ts` — the layout pass keeps the phone's row (or the touch legend under it) as
  `stackUnder`, and the alert's seat is taken from the lowest of the node line, the lit warning and
  that row. On the desktop `stackUnder` is null and the seat is what it was.
- `tests/layout.test.ts` — the rule as a property: over every panel and every row above it, the
  alert's top clears both. Plus the two frames' own numbers, and the old floor's cases rewritten.
- `probe/stage5.ts` — the wake probe, already standing the file on node B with the line up, raises
  the alert at 1280 × 720, 640 × 360 and 480 × 270 and fails if it is inside the panel or the line.
  The third-person probe's scene was tried first and could not hold the rule: its mission panel is
  one line, so the old floor landed a single pixel under the node line and crossed nothing.
- `probe/stage32.ts` — the phone probe walks the file off every node, so the node line goes down,
  and reads the alert against the row.

**Proof.** vitest 798/798. `npm run probe:wake` 26/26: with the file on node B and the alert lit,
`1280×720: alert 128–141 · clear of the panel · 6 px under the line · 640×360: alert 198–211 ·
clear of the panel · 6 px under the line · 480×270: alert 209–222 · clear of the panel · 6 px
under the line`. `npm run probe:mobile` 39/39, the off-node frame reading `row ends 144, legend
ends 170 · alert 176–190 · crosses []`. Regressions `probe:tps` 49/49, `probe:campaign` 40/40 and
`probe:run` 23/23; build, smoke 7/7.

Mutation A, the floor put back into the rule: `tests/layout.test.ts` 4 failed and `probe:wake`
25/26 — `640×360: alert 160–173 · INSIDE the panel · INSIDE the line · 480×270: alert 160–173 ·
INSIDE the panel · -43 px under the line`, the defect as it stood. Mutation B, the HUD no longer
handing the alert the phone's row: `probe:mobile` 38/39 — `node line down · row ends 144 · alert
98–112 · crosses [row,tabs]`, and no unit test can see that one, which is why the phone reads it
from the drawn frame.

## Stage 146 — The node line printed through the panel it hangs under

**Goal.** The centred stack under the mission panel has three rows: the node line (what is
happening to the node under your feet), the searchlight warning, and the alert. Two of them are
seated by measurement — the warning hangs under the node line's measured bottom (Stage 116), the
alert under whichever of the two ends lower (Stage 120). The first row was not: `.nodefoot` took
its 92 px straight from the stylesheet, while the panel above it grows with what it says.

So in every wake round the panel ended at 94 px and the line began at 92: the two borders crossed,
in every window this game has ever drawn. And in a window narrow enough for the panel to take its
second row under the status panel — 640 × 360, which is the size the netcode probe and the live
watcher play at — the panel spans 84–164 and the line still began at 92, printing 72 px straight
through the objective and the cell line. At 480 px it was 83.

**What changed.**

- `client/hud/layout.ts` — the stack's seat is one rule now, `stackSeat`, and `nodeFootTop` is the
  first row's use of it: the stack's own top, or a gap under the mission panel's measured bottom
  where the panel reaches lower. `flagTop` is the same rule on the row below, unchanged in
  behaviour and in signature.
- `client/hud/hud.ts` — `placeFlag` seats the node line before it reads its bottom, from the
  mission panel's bottom measured in the same layout pass. The phone's branch no longer seats the
  line itself: its shift already carries the stack under the slot-and-tab row, which Stage 140
  seats under the panel, so the shared rule gives the phone exactly what it had.
- `tests/layout.test.ts` — the rule: the seat with no panel above it, the gap under the wake's own
  94 px panel, the second-row panel at 164 and 175, the phone's shift, and that the warning still
  seats under the line.
- `probe/stage5.ts` — the wake probe already stands the file on node B mid-pull with the line up.
  It now reads where the panel and the line actually are, in a 1280 × 720 window and in a 640 × 360
  one where the panel drops to its second row, and fails if they cross.

**Proof.** vitest 794/794. `npm run probe:wake` 25/25, read with the file standing on node B
mid-pull and the line up: at 1280 × 720 the panel ends at 94 and the line runs 100–122, 6 px
clear; at 640 × 360 the panel takes its second row at 84–164 and the line runs 170–192, 6 px
clear. Regressions `probe:mobile` 38/38, whose stack the shared rule now seats, `probe:tps` 49/49
and `probe:run` 23/23; build, smoke 7/7.

Mutation A, the node line put back on its stylesheet seat — the HUD asking for the seat with no
panel above it: `probe:wake` 24/25, `1280×720: panel 14–94 · line 92–114 · CROSSING it by 2 px ·
640×360: panel 84–164 (second row) · line 92–114 · CROSSING it by 72 px`, which is the defect as
it stood. Mutation B, the rule itself ignoring the panel: `tests/layout.test.ts` 3 failed — the gap
under the 94 px panel, the second-row panel, and the phone's shift — and `probe:wake` 24/25 with
the same two crossings.

## Stage 145 — The phone was told to press keys it does not have

**Goal.** Stage 137's picture of the FILE book on the phone has `[TAB] CLOSE` in its header, and
the same is true of the graph's `[G] CLOSE`, the contracts desk's `[C] CLOSE`, the district
panel's `[M] CLOSE` and THE RUN's `SAFE ZONE · [TAB] MARKET`. Every one of those markers already
closes on a click, so a thumb has always worked; what they said was wrong, on frames a phone
reaches by tapping. Stage 138 fixed the fixer's terminal this way; these are the rest, and the
phone probe's keyboard-legend check had been a list of the particular words seen so far rather
than a rule.

**What changed.**
- `client/hud/keyhint.ts` — `closeHint(key, touch)` and `openHint(key, what, touch)`: the key on
  a keyboard, the gesture on a phone.
- `client/hud/hud.ts` — a `touch` getter, the district panel's marker and the run strip's market
  hint by the rule.
- `client/file.ts` — the book's and the graph's markers by the rule.
- `client/campaign.ts` — the desk's marker by the rule.
- `tests/keyhint.test.ts` — both rules, and that no bracketed key survives on a phone.
- `probe/stage32.ts` — the legend check is now the rule: any bracketed key anywhere on the phone
  HUD fails it, and it names what it found; the desk's and the book's own markers are read as
  they are opened; and THE RUN's strip, which the phone probe never runs a room for, is handed a
  safe-zone view of its own and read where a player would see it.

**Proof.** vitest 789/789. `npm run probe:mobile` 38/38: no bracketed key anywhere on the phone's
HUD, the desk and the book both read `TAP TO CLOSE`, and THE RUN's strip, drawn on the phone,
reads `◈ CARRYING 0 · BANKED 3 · TODAY 0/200 · OWED 0 UNITS · GATE SAFE ZONE · TAP MARKET · 4
CLAIMS OUT`. Regressions `probe:run` 23/23, `probe:campaign` 40/40 and `probe:tps` 49/49, whose
desktops keep the keys; build, smoke 7/7.

Mutation A, the phone given the keyboard's words: `tests/keyhint.test.ts` 2 failed, the gesture and
the no-bracket rules, and `probe:mobile` 37/38, the desk reading `[C] CLOSE` and the book
`[TAB] CLOSE`. The legend rule does not catch those two, because a marker inside a
closed frame is not on the screen when that check reads the HUD's text; the frames' own check is
what covers them. Mutation B, the run strip keeping `[TAB] MARKET` on the phone: `probe:mobile`
37/38, the strip reading `… GATE SAFE ZONE · [TAB] MARKET · 4 CLAIMS OUT`. The first attempt at
that mutation was caught by nothing — `probe:run` 23/23, because it plays on a desktop, where the
key is right — so the phone probe now draws the strip itself and reads it.

## Stage 144 — The guard called a picture of the menu a picture of the game

**Goal.** `probe/shot.ts` refuses a shot with full-screen chrome over it, and its cover list is
`#crawl` and `#menu`. Its own comment says a cover that is the shot's subject is named in
`mustShow` instead, but the naming did nothing: the subject was concatenated onto the covers and
checked as one of them, so `shot(page, "stage32-pause.png", "#menu")` returned `is a picture of
#menu, not of #menu`. Stage 142 worked around it with a bare `page.screenshot`, which is what
Stage 33's lint forbids, and `tests/probeshot.test.ts` has been red ever since.

**What changed.**
- `probe/shot.ts` — the selector named as the subject is not a cover.
- `probe/stage32.ts` — the pause picture goes back through the guard, keeping Stage 142's claim
  on the menu's drawn box as a check of its own.

**Proof.** vitest 785/785, `tests/probeshot.test.ts` green again. `npm run probe:mobile` 36/36:
`stage32-pause.png shows #menu, nothing over it`, beside the other four phone artifacts, and the
menu's drawn box still reads panel 43–801 × 82–309 with its four choices either side of the
shutter.
Regressions `probe` 19/19 and `probe:ship` 9/9, whose own pictures go through the same guard;
build, smoke 7/7.

Mutation, the subject counted as a cover again: `probe:mobile` 35/36, refusing the picture with
the sentence this stage is named for, `stage32-pause.png is a picture of #menu, not of #menu`.

## Stage 143 — The phone could only ever throw one grenade

**Goal.** The desktop throws with G and cycles the type with Q, and the HUD lists `FRAG 2 ·
SMOKE 1 · EMP 1` with the selected one lit. The touch build hides that list, with the comment
"the NADE pad carries the selected one", and nothing on the phone emits the cycle at all: a
phone was stuck on whichever type it spawned with, could never throw smoke or EMP, and could not
see how many it had left. The pad said `NADE`.

**What changed.**
- `client/hud/grenadepad.ts` — `nextGrenade(sel, count)`, the cycle the sim performs, and
  `grenadePad(sel, counts, names)`, the two pads' words: the throw pad names what it throws with
  its count, the cycle pad what the next tap selects with its count. An empty type is named, not
  skipped, because the sim does not skip it.
- `client/touch.ts` — a cycle pad beside the throw pad, emitting the same button the desktop's Q
  does; `setGrenades` writes both labels when the words change.
- `client/game.ts` — the pads are fed from the frame's own player view.
- `client/hud/hud.css` — the cycle pad's seat, a thumb's width, beside the throw pad.
- `tests/grenadepad.test.ts` — the cycle and the labels, including the empty type and no list.
- `probe/stage32.ts` — the labels read from the frame against the file's own grenade list, two
  taps on the cycle pad walking FRAG to SMOKE to EMP with the labels following, and a tap on the
  throw pad spending an EMP rather than a frag.

**Proof.** vitest 784 passed, 1 failed: `tests/probeshot.test.ts`, which
has been red since Stage 142 wrote its picture with a bare `page.screenshot`, not from anything
this stage touches; Stage 144 is the fix. `npm run probe:mobile` 35/35: the pads read `FRAG 2` and `▸SMOKE 1`,
both 46 × 46 px, against the file's own list `FRAG 2 / SMOKE 1 / EMP 1` with the first selected;
two thumbs on the cycle pad walk the selection to SMOKE then EMP with both labels following; a
thumb on the throw pad takes the EMP to 0 and leaves the frags alone.
Regressions `probe:arsenal` 32/32 (the desktop's G and Q untouched) and `probe:tps` 49/49;
build, smoke 7/7.

Mutation A, the cycle pad emitting nothing: `probe:mobile` 33/35, the selection stuck at FRAG
through both taps and the throw spending a frag. Mutation B, the labels never written: `probe:mobile` 33/35, the pads
reading `NADE` and `NADE +` while the selection moved under them.
Mutation C, the labels skipping an empty type:
`tests/grenadepad.test.ts` 1 failed | 4 passed.

## Stage 142 — The menu's picture was a claim about state

**Goal.** Stage 141 took `stage32-pause.png` plainly, because the shot helper counts `#menu`
among the covers a game picture must not have, and claimed it by reading
`window.__game.menu().screen` either side of the shutter. That is the state, not the pixels: the
same string is set before the menu's box is laid out, and a menu that never drew — hidden,
zero-sized, empty of its choices — would pass the check while the picture showed the game.
Stage 33's rule is that a picture is a claim, and the claim has to be read from the frame.

**What changed.**
- `probe/stage32.ts` — the picture's claim is the menu's own drawn box: not hidden, displayed,
  visible, opaque, covering the view, its panel above 100 × 40 px, and its four choices in it
  with RESUME first — read either side of the shutter.

**Proof.** `npm run probe:mobile` 32/32: at the shutter the menu is drawn, covering the view, its
panel at 43–801 × 82–309 px, its rows `▸RESUME / SETTINGS / FILE / QUIT TO MENU`, and the same
after it. Build, smoke 7/7.

Mutation, the menu's box held down (`pause()` sets the screen and then hides the root) while the
check reads the state alone, as Stage 141 did: `probe:mobile` 31/32, and the picture's check
PASSED with the menu never drawn, its panel 0 × 0 px; the failure is the later RESUME tap, which
cannot reach a menu that is not on screen. The same held-down menu against the
check as written: `probe:mobile` 30/32, the picture's check FAILED on
`drawn false covers false panel 0–0 × 0–0`, which is what the frame showed.

## Stage 141 — The phone could not pause

**Goal.** The pause menu (RESUME / SETTINGS / FILE / QUIT TO MENU, Stage 13) opens when the
pointer lock is lost, which is what Escape does on a desktop. A phone never holds a pointer
lock, and the touch build had no other way in: once in play a phone had no pause, no settings,
and no way back to the menu but the browser. Its RESUME, had it been reached, asked the canvas
for a pointer lock.

**What changed.**
- `client/touch.ts` — a PAUSE pad among the thumb controls; a tap on it fires `onPause`.
- `client/main.ts` — the pad opens the pause menu on the same terms as the lost lock (in play,
  no book open, no crawl); on the phone RESUME asks for no pointer lock.
- `client/hud/hud.css` — the pad's seat: a 44 px pad left of the area map, under nothing.
- `probe/stage32.ts` — a page with the menu on, put into play: the pad is inside the view and a
  thumb's width clear of the map, the mission panel, the file's header and the ONLINE readout;
  a thumb on it opens the pause menu (its picture), and a thumb on RESUME returns to play.

**Proof.** vitest 780/780. `npm run probe:mobile` 32/32: the pad at 688–732 × 12–56 reading
`PAUSE`, inside the view, within 8 px of nothing, the smallest control on the phone now 44 px;
the menu hidden in play; a thumb on the pad opens the pause menu, its picture is of the menu up
either side of the shutter, and a thumb on `▸RESUME` returns to play. Regressions `probe:ship` 9/9 (the
desktop's menu flow), `probe:tps` 49/49; build, smoke 7/7.

Mutation A, the pad's tap doing nothing: `probe:mobile` 30/32, the menu still hidden after the
thumb and the picture of no menu. Mutation B, the pad not wired to the menu: `probe:mobile` 30/32, the same two. The stage's first phone
run drew the pad 28 px tall and Stage 32's rule (no control under a thumb's 44 px) caught it;
and the shot helper counts the menu among the covers a game picture must not have, so the
menu's picture is taken plainly with its claim read either side of the shutter.

## Stage 140 — The phone's mission panel sat on the tab strip

**Goal.** Stage 139's picture of the wake on the phone: the mission panel, which in the wake
carries a third line (`CELL ONE 15 · CELL TWO 0 · YOU: ONE`) and the hex strip, ends at 92 px,
and the phone's slot-and-tab row begins at 72; the strip's hexes sat on the tabs' top border.
And the phone's log, five entries at 300 px wide with the PA wrapping to three rows, reaches
176 px from the top when full, into the alert's seat (Stage 139); with the row moved down the
stack ends at 218, and a log of four such entries (166–318) still crossed it.

**What changed.**
- `client/hud/layout.ts` — `phoneRowTop(base, missionBottom)`: the row's own seat, or a gap
  under a mission panel that reaches lower; `logLines(touch)`: five entries, three on the phone.
- `client/hud/hud.ts` — on the phone the layout seats the row by the rule (its own seat read once
  before it is moved), and the log keeps its entries by the rule.
- `client/hud/hud.css` — the phone's log is 420 px wide, so the PA wraps to two rows, not three.
- `tests/layout.test.ts` — both rules.
- `probe/stage32.ts` — on the wake page the row sits a gap under the mission panel; six PA lines
  pushed leave three entries, and the full log stays under the lit alert.

**Proof.** vitest 780/780 (both rules in `tests/layout.test.ts`). `npm run probe:mobile` 29/29: the
mission panel at 14–92 and the row at 98–144 under it; the stack under the row (legend 150–170,
node line 176–198, alert 204–218); six PA lines pushed leave three entries at 240–318, clear of
the lit alert; the PA still reads in full, in two rows now; the picture shows the row under the
panel. Regressions `probe` 19/19, `probe:tps` 49/49, build, smoke 7/7.

Mutation A, the row at its own seat whatever the panel: `tests/layout.test.ts` 1 failed | 28
passed, and `probe:mobile` 28/29, the row at 72–118 across the mission panel's 14–92. Mutation B, five entries on the phone too: the layout test
1 failed | 28 passed, and `probe:mobile` 28/29, five entries at 188–318 across the alert at 204–218. The stage's first phone run kept four entries at
300 px and read the full log at 166–318, across the alert at 204–218: a fourth entry, and the
PA in three rows, were more than the phone's middle band holds; the log took a 420 px width and
three entries. The container was restarted during that run; the tree survived and the
verification was run again from the start.

## Stage 139 — The phone's wake was printed over its row

**Goal.** A read of the wake on the phone viewport, on the tree as of Stage 138: the node line
(`NODE D · VANTAGE · NOBODY IS PULLING`) at 92–114 px, over the stance line the phone keeps in
its slot-and-tab row, and the wake's alert (`◆ THE WAKE BEGINS — PULL THE NODES OFF THE MODEL`)
at 120–134 across the tab strip; the touch legend at 62–82 across the row's top. The seats were
the desktop's (Stages 116, 120): 92 px, which the phone's row occupies. No probe had run the wake
on the phone.

**What changed.**
- `client/hud/layout.ts` — `stackShift(underBottom)`: how far the phone moves the stack down,
  to under the row or under the legend under it; `flagTop` and `alertTop` take the shift, the
  alert's floor with it.
- `client/hud/hud.ts` — on the phone the layout seats the legend under the row, the node line
  under whichever is lowest, and passes the shift to the warning's and the alert's seats.
- `client/hud/hud.css` — the phone draws no stance line, so its row is one line; its log sits
  under the stack, narrower and above the weapon pad.
- `tests/layout.test.ts` — the shift, and the seats carrying it.
- `probe/stage32.ts` — the phone's row is one line with no stance line (in place of Stage 132's
  stance-line seat); a second page with the wake on reads the stack before the first tap (legend,
  node line, alert, each under the last, crossing neither the row, the tabs, the log nor a pad)
  and on a node after it (`PULL IT`); a picture of the node line.

**Proof.** vitest 778/778 (the shift and the seats in `tests/layout.test.ts`). `npm run
probe:mobile` 27/27: no stance line and the row at 72–118 (46 px, one line); before the first
tap the legend at 124–144, the node line at 150–172 and the alert at 178–192, crossing neither
the row, the tabs, the log nor a pad; on node D the line reads `PULL IT` at 150–172 with the
alert under it; the picture shows the stack. Regressions `probe:tps` 49/49 and `probe:wake` 24/24 (the desktop's seats,
shift 0), build, smoke 7/7.

Mutation A, the stance line back on the phone: `probe:mobile` 26/27, the stance line drawn and the row
two lines, 72–158, 86 px tall. Mutation B, no shift (`stackShift` 0):
`tests/layout.test.ts` 1 failed | 26 passed, and `probe:mobile` 25/27, the node line at 92–114 across the row and the tabs, the alert at
120–134 across the tabs, on the yard and on the node alike. The first two phone runs
of this stage died inside the wake read on named arrow helpers (`__name is not defined`, the
probe build's keep-names shim, the trap noted at Stage 136); the helpers were inlined and the
runs repeated.

## Stage 138 — The phone could not answer the fixer

**Goal.** The mobile probe's last frame, since Stage 32: the creation terminal up over the yard —
`YOU WOKE UNLISTED. THREE HOUSES WILL WANT TO KNOW WHY. WHO DO YOU ANSWER TO?`, three houses,
`[1–4] CHOOSE`. The terminal was played from the keyboard alone (Enter or Space to read on,
1–4 to choose; nothing on it answered a pointer), so on a phone the campaign's first question
had no answer, and the box itself sat at the desktop's place, under the phone's slot-and-tab
row and the NADE pad. The mobile probe had never opened a terminal.

**What changed.**
- `client/hud/terminal.ts` — `terminalFooter(hasChoices, touch)`: the keys on a keyboard, a tap
  on a phone; `terminalSeat(rowBottom, leftPadsRight, padsLeft, viewWidth, viewHeight)`: under
  the row, short of the nearest pad on either side (the weapon pad at the bottom left, the action
  pads on the right), inset from the bottom.
- `client/hud/hud.ts` — a tap or a click on the terminal reports a choice row's index, or −1 for
  reading on; on the phone the layout seats the terminal by the rule; the footer by the rule.
- `client/campaign.ts` — the tap is wired beside the keys.
- `client/hud/quiet.ts` — on the phone a terminal silences the event log as well: the phone's
  terminal is seated where the log is drawn, and the log's lines had printed across its first
  choice.
- `client/hud/hud.css` — the phone's terminal rule, and thumb-sized choice rows.
- `tests/terminal.test.ts`, `tests/quiet.test.ts` — the footer's words, the seat, the log.
- `probe/stage32.ts` — the terminal read from the drawn frame: under the row, short of every
  pad, inside the view, each choice row what a thumb meets at its centre, `TAP A LINE TO
  CHOOSE`, three rows at least 24 px tall; its picture; a thumb on THE WAKE CELLS reads on to the
  cells' node, and thumbs on the terminal read the script to its close, with the cells written
  as the file's house. The phone's keyboard-legend check now counts `[ENTER]` and `[1–4]` as
  keyboard words.

**Proof.** vitest 776/776. `npm run probe:mobile` 24/24: the terminal at 70–618 ×
166–367 with the row ending at 158, under no pad, the log silenced, `TAP A LINE TO CHOOSE`, three
rows 27 px tall
each met by a thumb at its centre; the picture shows it; a thumb on THE WAKE CELLS reads on to
the cells' node, and two more thumbs close the script with the cells as the file's house. `npm run probe:campaign` 40/40 and
`probe:tps` 49/49 (run before the seat's left bound and the log rule, both phone-only). Build,
smoke 7/7.

Mutation A, the tap not wired: `probe:mobile` 22/24, twelve thumbs and the node still `wake`, no
house. Mutation B, the desktop's seat on the phone: 23/24, the terminal at 12–485 × 0–201, under
the row. Mutation C, the keyboard's footer on the phone: `tests/terminal.test.ts` 1 failed | 3
passed, and `probe:mobile` 23/24 with `[1–4] CHOOSE`. Mutation D, the log kept under the phone's
terminal: `tests/quiet.test.ts` 1 failed | 14 passed, and `probe:mobile` 23/24 with the log drawn at 14–394 ×
264–302, across the terminal. (The first read of that mutation passed: each row was "met by a
thumb" at its centre, but the HUD's chrome takes no pointer, so hit-testing skips the log; the
log's box is now read outright.). The stage's first phone run read the terminal at 12–618 × 166–367 under the WPN
pad and the house still null after the choice: the seat had cleared the right-hand pads alone,
and the house is written at the script's end, not at the choice; the seat took a left bound and
the check reads the node the choice leads to, then taps on to the close. The picture of that run
showed the log's PA printed across the first choice; hence the log rule.

## Stage 137 — The phone's book was half off the screen

**Goal.** A one-off read of the reader frames on the phone viewport (844×390, the mobile probe's):
the FILE book, laid edge to edge by the phone's stylesheet, sat at −397…397 px: the desktop
seat of Stage 119 writes `translateX(-50%)` inline on every frame, the phone's rule overrides
the box's edges and not its transform, and a full-width book shifted by half its width shows
its right half. The contracts desk, with no phone rule of its own, sat at 71–376 px under the
phone's slot-and-tab row (72–158) and under all seven thumb pads, which are drawn over it and
take the taps meant for it. Neither frame had ever been opened on the phone by a probe.

**What changed.**
- `client/hud/hud.ts` — the desktop seat is not written on the phone.
- `client/hud/hud.css` — the graph and the desk take the book's edge-to-edge rule on the phone,
  which now clears the desktop's transform and its 94vw cap; the `thumbs` group hides the pads,
  and on the phone the slot-and-tab row goes with them under a frame (the desk precedes the row
  in the DOM and was drawn under it, its first rows covered).
- `client/hud/quiet.ts` — `thumbs` is a chrome group, silenced by the frames that cover the
  screen (the desk, a card, the ledger) and kept by a terminal and a closed file.
- `tests/quiet.test.ts` — the group's rule.
- `probe/stage32.ts` — the desk and the book are opened on the phone and read from the drawn
  frame: inside the view, no pad shown, the row not across the desk, the desk scrolling inside;
  the pads back when the book closes; a picture of the book.

**Proof.** vitest 772/772 (the group's rule in `tests/quiet.test.ts`). `npm run probe:mobile`
20/20: the desk at 0–844 × 0–390 in 844×390, no pad shown, the row off it, scrolling inside; the
book at 0–844 × 0–390, no pad shown, seven pads back after the close (on the runner's phone
frames, a second apart, the close takes a frame to lift the silence; the read waits for it);
the picture shows the book edge to edge.
Regressions (run on the first pass of the stage, before the phone rule's two CSS fixes, which
touch the phone alone) `probe:tps` 49/49, `probe:campaign` 40/40; build, smoke 7/7 on the final
tree.

Mutation A, the desktop seat written on the phone too: `probe:mobile` 18/20, both frames at
−422…422 px, half a view off the screen. Mutation B, the pads outside the frames' silence
(`thumbs` off `ALL_GROUPS`): `tests/quiet.test.ts` 1 failed | 12 passed, and `probe:mobile`
18/20 with seven pads shown over both frames and the row back over the desk. Two earlier runs of this stage read the frames at −422…422 × −195…195: with the inline
seat gone the desktop rule's own `translate(-50%, -50%)` had come through the phone's rule, which
had never cleared it; the phone rule now does, and plainly, not with `!important`, so an inline
seat written on the phone still breaks it and mutation A still fails.

## Stage 136 — The desk ran under the row

**Goal.** The campaign probe's contracts frame at 960×540, on the tree as of Stage 135: the desk
begins under the file's header at 85 px (Stage 119) and ends at 526, the view's bottom inset,
while the bottom row (the slots, the foot line, the tab strip) begins at 474 and is drawn over
it. The last gig on the desk (`SENSOR SABOTAGE · LEASE ROW`) and the `EXPLORE` line sat behind
the slots, with `1 · BLANK · 0.0 m/s · AIR` printed across them. Stage 119 seated the frames
under the header and left the row where it was; the ledger book, content-short, never reached
it, and the desk did.

**What changed.**
- `client/hud/layout.ts` — `frameSeat(statusBottom, viewHeight, rowTop)`: where the bottom row
  is drawn under the frame its top less the gap is the frame's floor, else the view's inset.
- `client/hud/hud.ts` — the seat reads the row's top (the foot line's when it is lifted above
  the row); the phone, whose row is at the top left, passes none.
- `tests/layout.test.ts` — the floor at the row, at a fraction, at a row below the inset, and
  with no row.
- `probe/stage10.ts` — at the contracts frame the desk ends above the row with a gap, neither
  the row nor the foot line crosses it, and what does not fit scrolls inside it.
- `probe/stage60.ts` — the book's and the graph's seats are judged against the row, not the view.

**Proof.** vitest 770/770. `npm run probe:campaign` 40/40: the desk sits at 84–466 px with the row from 474
and the foot line from 501, neither crossing it, and its overflow scrolls inside it; the frame
shows the last gig and the `EXPLORE` line clear of the slots. `npm run probe:tps` 49/49: the
header ends 76 px down, the book and the graph sit at 84–466 with the row from 474.
Regressions `probe:mobile` 17/17, `probe:file` 19/19, build, smoke 7/7.

Mutation, the seat's floor back at the view's inset: `tests/layout.test.ts` 1 failed | 24
passed; `probe:campaign` 39/40 with the desk at 84–526 px, the row from 474 and the foot line
from 501 both drawn over it; `probe:tps` 48/49 with the book and the graph at 84–526, under the row from 474. The first campaign run of the new check died on
a named arrow helper inside `page.evaluate` (`__name is not defined`, the probe build's
keep-names shim); the helper was inlined and the base run repeated.

## Stage 135 — The money was the first thing to go

**Goal.** THE RUN's frame at 960×540: the run strip (`CARRYING 1 · BANKED 0 · TODAY 0/200 · OWED
0 UNITS · PVP ZONE · 4 CLAIMS OUT`) holds the mission panel at 480 px and the status panel at its
floor, and the status panel's second line read `LV 50 · XP 524708/∞ · ¢ 200…`. The one figure a
file carrying claims looks at, its scrip, was the one the ellipsis took; the XP into the depth,
which the FILE book shows in full, kept its place ahead of it.

**What changed.**
- `client/hud/layout.ts` — `statusLineFit(room, need)`: the full line where the box holds it,
  the short one where it does not.
- `client/hud/hud.ts` — the XP is its own segment of the line; the layout measures the full line
  when its text changes and marks the panel `tight` when the box cannot hold it.
- `client/hud/hud.css` — a tight panel hides the XP segment.
- `tests/layout.test.ts` — the rule at 330, at the line's own width, at 216 and at 180.
- `probe/stage14.ts` — with the strip up at 960 the second line ends `¢ N · ◆ N`, the scrip's
  figure whole inside the panel, no overflow, the XP gone.
- `probe/stage60.ts` — at the panel's full width the XP is up and the line fits.

**Proof.** vitest 769/769. `npm run probe:run` 23/23: with the strip up at 960 the line's box is
218 px and the line ends `¢ 20000 · ◆ 0`, overflow 0 px, the scrip whole, the XP gone; the frame
reads `LV 50 · ¢ 20000 · ◆ 0`. `npm run probe:tps` 49/49: at the panel's full width the line
reads `LV 50 · XP 524708/∞ · ¢ 20000 · ◆ 0`, overflow 0 px.
Regressions `probe` 19/19, `probe:mobile` 17/17, build, smoke 7/7.

Mutation A, always the full line: `tests/layout.test.ts` 1 failed | 23 passed, and `probe:run`
22/23 with the full line 49 px over its 218 px box and the XP still up, the frame back to `¢
200…`. Mutation B, always the short line: the layout test 1 failed | 23 passed, and `probe:tps`
48/49, the XP hidden with 330 px of room for it.

## Stage 134 — The proof frame was of a closed file

**Goal.** CI runs #157, #158 and #159 (Stages 128–130) were red on one check, `artifact:
stage2-bravo.png — does not show #hud .ammo — the panel was not up when the shutter opened`, and
the run reproduced it here at 21/22. The net probe gives ALPHA a 32 s kill plan for its hit-light
read and takes BRAVO's frame 1.2 s after the window closes, while ALPHA is still firing: BRAVO is
closed, in the three seconds of its re-lease, and since Stage 128 a closed file's HUD has no ammo
count to show. The frame's name claims a living file's HUD; the probe took it of a corpse.

**What changed.**
- `probe/stage2.ts` — ALPHA is stood down when the window closes, and BRAVO's shutter waits for
  its re-lease: health above zero and the ammo panel drawn, polled every 50 ms for up to 10 s,
  read as a check of its own before the picture.

**Proof.** `npm run probe:net` 23/23: BRAVO re-leased 150 ms after ALPHA stood down, health 70,
and both frames show `#hud .ammo`; the BRAVO picture is of a standing file with `LEASE-BREAKER
30 / 30` drawn. Build, smoke 7/7.

Mutation, no wait (`BACK_POLLS` 0): 21/23, BRAVO at health 0 when the shutter opens and
`stage2-bravo.png` without its ammo panel, the same failure as CI #157–#159 and the local run
before the fix (four of four).

## Stage 133 — The city was cut off mid-word

**Goal.** Every frame of this session's probes, desktop and phone, carried the same line at the
foot of the event log: `» VANTAGE PA · VANTAGE ADVISES DRAINAGE YARD: LEASE REN…`. The log's
lines are one row each with an ellipsis, right for a kill line or a node flip, and the city's
PA is the one thing in it written to be read to the end: eight lines of copy, the longest
`…LEASE RENEWAL IS AUTOMATIC. THANK YOU FOR YOUR CONTINUED COMPLIANCE.`, and none of them had
ever been readable past the district's name in a 380 px log.

**What changed.**
- `client/hud/hud.css` — a log line marked `pa` wraps inside the log's box, no ellipsis; every
  other line keeps its single row.
- `client/game.ts` — the PA is pushed with that mark.
- `probe/stage1.ts` — at tick 330, once the first PA is in the log and before the fight fills
  it, the line's text range is read: two or more rows, all inside the log's box, no overflow,
  ending on the copy's last word, while every other line is single-row with its ellipsis.
- `probe/stage32.ts` — the same on the phone after the walks, and the taller log crosses no
  thumb pad.

**Proof.** vitest 767/767. `npm run probe` 19/19: at tick 330 the PA is 3 rows in the 380 px
log, overflow 0/0 px, every row inside the box, ending `…CONTINUED COMPLIANCE.`, the one other
line single-row with its ellipsis; the frame shows it read to the end. `npm run probe:mobile`
17/17: 3 rows, the log at 264–302 px, under no pad.
Regressions `probe:tps` 48/48, build, smoke 7/7.

Mutation A, the wrap rule deleted from the CSS: `probe` 18/19 with the PA one row overflowing
its box by 388 px and outside it; `probe:mobile` 16/17, 384 px over. Mutation B, the PA pushed
without its mark (`"am"` again): `probe` 18/19, the same 388 px. The restore step of the first
script copied back files saved before the edits were made, so the tree lost the stage for that
script's regression, build and smoke; the edits were re-applied and those three were run again
on the true tree, and the numbers above are that run's.

## Stage 132 — The phone paid for the desktop's fixes

**Goal.** The mobile probe's frame after Stages 118 and 129: `1 · BLANK · 0.0 m/s · STAND`
printed across the file's header, over its bars, and the map's footer wrapped, `▲ AHEAD · 70 M
/ ACROSS`, in a box 78 px wide. Stage 118 lifted the foot line above the bottom row when the
slots and the tab strip leave it no room — a rule about the desktop's row, and the phone lays
that row out at the top left, wrapping, so "above" was into the header. Stage 129 wrote a
footer for a 108 px box; the phone's is 78.

**What changed.**
- `client/hud/hud.ts` — the foot line's row rule is the desktop's: on the touch HUD the line
  stays where the phone seats it.
- `client/hud/radar.ts` — `mapFooter(across, compact)`: the phone's form is `▲ 70 M WIDE`, the
  arrow alone saying heading-up; the desktop keeps `▲ AHEAD · 70 M ACROSS`.
- `client/hud/hud.css` — the footer never wraps.
- `tests/radar.test.ts` — the compact form.
- `probe/stage32.ts` — on the phone the foot line's text box keeps clear of the header and sits
  below it; the map's footer is one line, inside the map, with no overflow.

**Proof.** vitest 767/767 (the compact form in `tests/radar.test.ts`). `npm run probe:mobile`
16/16: the foot line's text box sits at 93–104 px, below the header's end at 63, crossing nothing,
reading `1 · BLANK · 0.0 m/s · AIR`; the map's footer is `▲ 70 M WIDE`, one line box, 0 px
overflow, inside the map. Regressions `probe:run` 22/22, `probe:tps` 48/48 (the desktop's footer
still `▲ AHEAD · 70 M ACROSS`), build, smoke 7/7. The first run of the new footer check read
`NaN line(s)`: it had divided the box height by a computed `line-height` of `normal`; the check
now counts the text range's client rects, one per line box, which is what the eye counts.

Mutation A, the row rule applied on the phone too (the `touch` test removed from the foot-row
toggle): `probe:mobile` 15/16, the line back at 47–58 px over the header ending at 63, crosses
true. Mutation B, no compact form (`compact && false` in `mapFooter`): `tests/radar.test.ts`
1 failed | 13 passed, and `probe:mobile` 15/16 with `▲ AHEAD · 70 M ACROSS` overflowing its box
by 25 px, held to one line by the CSS. Both restored by copy; the tree diffs clean against the
saved files.

## Stage 131 — Every district was the yard

**Goal.** The first wake was the drainage yard, and the wake's lines were written for it: `◆
ROUND OVER — CELL ONE WOKE THE YARD`, `◆ FULL WAKE — THE YARD IS OFF THE MODEL`, `FILE #3
(CHARLIE) ENTERED THE YARD`. Lease Row, the Deadletter Docks and the Repo Depot came after, and
the lines went on saying the yard in all of them, while the mission panel beside them said
`THE WAKE — LEASE ROW`.

**What changed.**
- `client/hud/district.ts` — `districtName(level)`: the district's name as the HUD's title prints
  it; `roundOverLine`, `fullWakeLine`, `enteredLine`, `wakeBeginsLine`: the wake's lines with the
  district in them.
- `client/game.ts` — the five lines, offline and online, read the district from the level. The
  online wake-begins line takes the offline wording, which says what to do.
- `tests/district.test.ts` — the name, each line, and that none says the yard of a district that
  is not one.
- `probe/stage5.ts` — the round-over line read after the clock runs out names DRAINAGE YARD.

**Proof.** `npm test` 766 tests (four new); `npm run probe:wake` 24/24 — after the clock runs
out the alert reads `◆ ROUND OVER — CELL ONE WOKE DRAINAGE YARD`; `npm run build` and `npm run
smoke` 7/7.

**Mutation.** The round-over line says the yard again: two unit tests fail and the wake probe
fails its new check, 23/24 (`… WOKE THE YARD`); every other check passes.

## Stage 130 — The tutorial never left

**Goal.** At the foot of every desktop frame since the first HUD: `WASD · HOLD CLICK fire · R
reload · SPACE jump · CTRL slide · SHIFT sprint`. For a file on its first minute it is the right
line. For a file that has just slide-jumped onto a gantry and closed two files it is a line about
which key is which, drawn under the kill it just made, and it was never going to go.

**What changed.**
- `client/hud/keys.ts` — `learn(seen, read)`: what this frame teaches, from the file's own state
  (speed, shots, a reload in progress, jumps, slides, a sprint), and a lesson once seen stays
  seen; `keysLine(seen)`: the line for what is still to learn, empty once everything has been done.
- `client/hud/hud.ts` — the update learns from the file each frame and rewrites the line only when
  a lesson lands; the line is hidden once it is empty.
- `tests/keys.test.ts` — the full line, the drops in order, the empty line, the reads, no
  forgetting.
- `probe/stage1.ts` — before the bot's plan the line teaches everything; after the plan (sprint,
  slide, slide-jump, mantle, a kill) only `R reload` is left, or nothing if a reload happened.

**Proof.** `npm test` 762 tests (five new); `npm run probe` 18/18 — before the plan the line
reads `WASD · HOLD CLICK fire · R reload · SPACE jump · CTRL slide · SHIFT sprint`, after it
`R reload`; `npm run probe:tps` still 48/48; `npm run build` and `npm run smoke` 7/7.

**Mutation.** The line teaches everything forever: two unit tests fail and the first probe fails
its new check, 17/18 — the full line after the run; every other check passes.

## Stage 129 — The map said tap to walk

**Goal.** Under the area map, in every frame since the first HUD, on a desktop and on a phone:
`tap to walk`. Nothing handles a tap or a click on the map; there is no walking to a point. A
player who tries it gets nothing, and learns that the chrome says things that are not so.

**What changed.**
- `client/hud/radar.ts` — `mapFooter(acrossMetres)`: what the map is — heading-up, the file's view
  up the screen, and how many metres it spans.
- `client/hud/hud.ts` — the footer is written from the same scale the radar is drawn at (the
  level's bounds plus the margin), so it cannot drift from the picture; `mapAcross` for the probe.
- `tests/radar.test.ts` — the wording, and that it promises no tap, click or walk.
- `probe/stage60.ts` — the footer read from the frame names the metres the map spans and carries
  no such promise.

**Proof.** `npm test` 761 tests (two new); `npm run probe:tps` 48/48 — the footer reads
`▲ AHEAD · 70 M ACROSS` on a map that spans 70.0 m; `npm run build` and `npm run smoke` 7/7.

**Mutation.** The footer says `tap to walk` again: both radar tests fail and the tps probe
fails its new check, 47/48 (`footer "tap to walk"`); every other check passes.

## Stage 128 — The dead file kept its gun

**Goal.** A file is closed: the camera swings onto whatever closed it (Stage 96), the line says
who, and for three seconds the screen re-leases. Through those three seconds the HUD went on
drawing the reticle, `LEASE-BREAKER 30 / 30`, the rack, the grenade slots and the hit arrows — a
gun on a file that has none. The HUD had never read whether the file was alive; the only thing
that did was the shield's broken mark.

**What changed.**
- `client/hud/quiet.ts` — a closed file is a frame of its own: `dead` takes the gun's chrome (the
  reticle, the rack, the ammo, the grenades, the arrows, the tutorial and the node line) and leaves
  what a dead file reads — the closed-by line, the log, the map, the mission. A terminal's and a
  death's silences add up; a card over a dead file is still the card's.
- `client/hud/hud.ts` — the update reads the file's life and re-applies the rule on the change,
  so the gun goes on the frame the file closes and is back on the frame it is re-leased.
- `tests/quiet.test.ts` — the dead set, the union with a terminal, the card winning.
- `probe/stage60.ts` — on the frame that shows the closed file the gun's groups are silenced and
  the ammo block and the reticle are not displayed, with the alert, the log and the map kept; back
  on the ledger nothing is silenced.

**Proof.** `npm test` 759 tests (two new); `npm run probe:tps` 47/47 — on the closed file's frame
the silenced groups are `ammo, arrows, nades, nodefoot, prompt, rack, reticle`, the ammo block and
the reticle are not displayed, the alert, the log and the map are not among them, and back on the
ledger nothing is silenced; `npm run probe:campaign` still 39/39 (the desk, the terminal and the
card as before); `npm run build` and `npm run smoke` 7/7.

**Mutation.** A death silences nothing (`open.dead && false`): the quiet test fails (1 of 11)
and the tps probe fails its new check, 46/47 — `silenced: · ammo display block · reticle display
block`, the gun drawn on a closed file; every other check passes.

## Stage 127 — The warning had gone out before the alert was read

**Goal.** CI runs #151 and #154, red on Stage 120's check with the geometry right: `alert 120–133
px under line ending 114 and warning ending 144 · crosses warning true`. The searchlight warning
is lit for 0.4 s of HUD time. On the runner's frames it had gone out between the check raising it
and the check reading the alert's seat, so the alert was right to sit under the node line alone —
and the check measured it against the box of a warning that was no longer there. Runs #152 and
#153 passed the same check by timing. A check that passes by timing is not a check.

**What changed.**
- `probe/stage60.ts` — the check reads whether the warning is lit at the instant the alert's seat
  is read, and counts the warning's box only then; and it then waits for the warning to go out and
  reads the alert's seat again, so both states are judged on every machine: lit, the alert under
  the warning; out, the alert up under the node line, above where the warning was.

**Proof.** `npm run probe:tps` 45/45 — with the warning lit the alert sits at 150–163 under it
(ending 144); once the warning goes out the alert is at 120, under the node line ending 114 and
above where the warning was; with the line gone it is at 63. Both states are read on this
machine as they would be on the runner.

**Mutation.** Stage 120's rule with the stack ignored (`seat = ceil(missionBottom)`): the
hardened check fails, 44/45 — `alert 63–76 px … (lit) · warning out: alert at 63`, above the
line in both states; every other check passes. The guard is the same one either way the frames
fall.

## Stage 126 — The round was over and the guns were not

**Goal.** Stage 121 gave the results phase a card that silences the chrome — the reticle, the
rack, the ammo — for fifteen seconds. The sim never knew: damage carried on through the results
phase as through any other, so a file reading the score with no reticle on the screen could be
shot, closed, and re-leased into the warm-up. The round is settled when the phase turns; the
guns should be too.

**What changed.**
- `shared/sim/world.ts` — `applyDamage` drops any damage to a player while the wake's phase is
  `results`, whoever deals it and however. The warm-up keeps its guns, and the dummies and the
  cast are not covered, as in a safe zone. The rule is in the shared sim, so the client's
  prediction and the server agree on it.
- `tests/results.test.ts` — damage lands in the wake and the warm-up, not on a file in results by
  shot, explosion or beam, and still on a dummy.
- `probe/stage5.ts` — with the phase at results a 30-point round into the file changes nothing;
  in the warm-up after it the same round lands.

**Proof.** `npm test` 757 tests (three new; one earlier run under load lost a test to a
timeout and passed on both reruns); `npm run probe:wake` 23/23 — with the phase at results a
30-point round leaves the file at 70, and in the warm-up the same round takes it to 40;
`npm run probe` still 17/17 and `npm run probe:run` 22/22 (the safe-zone rule beside this one);
`npm run build` and `npm run smoke` 7/7.

**Mutation.** The gate dead (`&& false`): the results test fails (1 of 3) and the wake probe
fails its new check, 22/23 — `results: 70 → 40 after a 30 round · warm-up: 40 → 10`; every other
check passes.

## Stage 125 — The round card covered the receipt

**Goal.** The counter-ledger probe's rig frame: `◆ ROUND OVER — NO ONE WOKE DRAINAGE YARD` in
the mission panel and the Ledger Entry receipt open under it, `MATCH 0001 · LEASED … [ENTER]
SIGN`. Online the receipt is printed at the settle, which is the moment the round ends — the
same fifteen seconds Stage 121 gave to the round card, and the card is the later sibling in the
HUD, drawn over everything at nine-tenths black. Every online match would now have ended with
the receipt printed behind a card the player could not see through.

**What changed.**
- `client/hud/hud.ts` — while the receipt is open the wake pass holds the round card down; when
  the receipt is signed the card comes back for what is left of the results phase. The receipt is
  the ledger's own frame and takes precedence.
- `probe/stage5.ts` — with the round card up, a receipt printed by hand hides the card; signing it
  brings the card back with its title.

**Proof.** `npm test` 754 tests; `npm run probe:wake` 22/22 — with the round card up, a receipt
printed by hand leaves the receipt showing and the card down; signed, the receipt goes and the
card is back with `ROUND OVER`; the Stage 121 and 124 checks still pass; `npm run build` and
`npm run smoke` 7/7.

**Mutation.** The card ignores the receipt: the wake probe fails its new check, 21/22 — `receipt
open: card true, receipt true`, both up and the card on top; every other check passes.

## Stage 124 — The round ended with the KERNEL's pulse

**Goal.** Every phase change of the wake — the warm-up ending, the round beginning, the round
ending — played the same sound offline: the KERNEL's pulse, the low throb that means VANTAGE has
just drained a node. The biggest moment of a match sounded like the thing that happens every 75
seconds of it. Online, the same events played nothing at all.

**What changed.**
- `client/audio.ts` — `wakeBegins()`: a rising four-note figure; `roundOver(outcome)`: a resolving
  figure over a long low tone when your cell woke the district, a falling one when the other cell
  did, a level one when no one did.
- `client/game.ts` — the phase event, offline and online, plays the wake's start and the round's
  end in their own voices; the KERNEL's pulse is the warm-up's, the model taking the district back.
- `probe/stage5.ts` — the clock run out for real and the warm-up after it: one round-over cue
  and no pulse at the end, one wake-begins cue and no pulse at the start.

**Proof.** `npm test` 754 tests; `npm run probe:wake` 21/21 — the clock run out lands in
`results` with one round-over cue and no pulse, the warm-up run out lands in `wake` with one
wake-begins cue and no pulse, and the round card of Stage 121 still reads as before; `npm run
build` and `npm run smoke` 7/7.

**Mutation.** The round's end plays the KERNEL's pulse again: the wake probe fails its new
check, 20/21 (`clock out → results: roundOver 0, pulse 1`); every other check passes. The
online path has no probe of its own and carries the same three lines as the offline one.

## Stage 123 — The log called the gun by its id

**Goal.** The tps probe's closed frame, in the log: `» BLANK → DUMMY-04 · LEASE_BREAKER · TTK
1.23s`. The rack says LEASE-BREAKER, the receipt says LEASE-BREAKER, the manifest says
LEASE-BREAKER; the kill line printed the weapon's id in capitals, underscore and all — and REPO
HAMMER as REPO_HAMMER, STACK SMG as STACK_SMG — on every kill since Stage 1.

**What changed.**
- `client/hud/kill.ts` — `weaponName(id)`: the manifest's name for the id, and for an id the
  manifest does not know the id spelt out with its underscores as spaces.
- `client/game.ts` — the kill line reads it.
- `tests/weaponname.test.ts` — every weapon in the manifest, and the fallback.
- `probe/stage1.ts` — the kill line read from the frame after the bot's kill names LEASE-BREAKER
  and carries no underscored id.

**Proof.** `npm test` 754 tests (two new); `npm run probe` 17/17 — the kill line reads `» BLANK
⟶ DUMMY-01 · LEASE-BREAKER · TTK 0.80s`; `npm run build` and `npm run smoke` 7/7.

**Mutation.** The kill line prints the id again: the probe fails its new check, 16/17 (`» BLANK
⟶ DUMMY-01 · LEASE_BREAKER · TTK 0.80s`); every other check passes. The unit tests read the
helper and cannot see the line that bypasses it, which is why the probe reads the frame.

## Stage 122 — The log said MANTLE

**Goal.** The wake probe's frames, read down the left: `» NODE D PULLED OFF THE MODEL — CELL
ONE`, `» VANTAGE PA · …`, `» MANTLE`, `» NODE A PULLED OFF THE MODEL — CELL ONE`. The event log
holds five lines — kills, nodes taken, the PA, a wasp live, the ledger — and since Stage 1 every
ledge climbed had pushed a bare `MANTLE` into it, and every slide-jump a bare `SLIDE-JUMP`, and
a line that mattered off the bottom each time. A file that moves well moves through a lot of
ledges. Both moves already have their cues.

**What changed.**
- `client/game.ts` — the mantle and the slide-jump play their cues and write nothing to the log.
- `probe/stage1.ts` — after the bot's slide-jump and its climb onto the deck: at least one of
  each, at least one mantle cue, and neither word in the log read from the frame.

**Proof.** `npm test` 752 tests; `npm run probe` 16/16 — after the bot's slide-jump and its climb
the log reads `» VANTAGE PA · …` and `» BLANK ⟶ DUMMY-01 · LEASE_BREAKER · TTK 0.80s` and nothing
else, with one mantle cue heard; `npm run build` and `npm run smoke` 7/7.

**Mutation.** Both pushes put back: the probe fails its new check, 15/16 — the log reads
`» SLIDE-JUMP / » MANTLE / » VANTAGE PA · … / » BLANK ⟶ DUMMY-01 …`, the two words ahead of the
lines that matter; every other check passes.

## Stage 121 — The round ended with a line

**Goal.** A wake ends — a cell holds all eight nodes for fifteen seconds, or the clock runs out —
and the game has fifteen seconds of results phase to say so. It said `◈ ROUND OVER — CELL ONE
WOKE DRAINAGE YARD` in the mission panel's title and `◆ ROUND OVER — CELL ONE WOKE THE YARD` in
the alert, for four seconds, and went on drawing the reticle and the ammo count over a round that
was over. No score laid out, nothing about what you did in it, no word on when the next one
starts: the campaign's contracts close on a card, and the wake's rounds closed on a line.

**What changed.**
- `client/hud/round.ts` — `roundWinner(w)`: the full wake's winner, else the cell ahead on the
  score, else nobody; `roundCard(w, myTeam, zone, stats)`: nothing outside the results phase,
  otherwise the card — `ROUND OVER`, who woke the district (or no one), the score, your own line
  (cell, kills, deaths, pulls, seconds on nodes) when you are on a cell, and `NEXT ROUND IN Ns`;
  cyan when your cell woke it, magenta when the other did, amber otherwise. Its key changes as the
  countdown ticks so the HUD re-renders only then.
- `client/hud/hud.ts` — the wake pass shows the card while the phase is `results` (the card the
  campaign already had, with its quiet rule: a card silences the chrome), re-renders it on its
  key, and takes it down when the phase moves on. The wake state now carries the winner, and the
  file's stats come with it.
- `client/game.ts` — the winner is read from the sim offline and from the match record online.
- `tests/round.test.ts` — the winner, the lines, the colours, the key, a clock past zero.
- `probe/stage5.ts` — the wake put into results by hand and read from the drawn frame: the card,
  each line, the chrome silenced; then the warm-up, and the card gone with nothing silenced.

**Proof.** `npm test` 752 tests (seven new); `npm run probe:wake` 20/20 — with the wake put into
results the card is up in cyan: `ROUND OVER` / `CELL ONE WOKE DRAINAGE YARD` / `CELL ONE 40 ·
CELL TWO 12` / `YOU · CELL ONE · 3 KILLS · 1 DEATHS · 2 PULLS · 41 s ON NODES` / `NEXT ROUND IN
13s`, twelve chrome groups silenced, and after the warm-up the card is gone with nothing
silenced; `npm run probe:tps` still 45/45; `npm run build` and `npm run smoke` 7/7.

**Mutation.** Two, each failing its own guard alone. The results phase is no card (`roundCard`
returns nothing): four unit tests fail and the wake probe fails, 19/20 (`card open false`). The
warm-up never takes the card down (the close branch dead): the probe fails, 19/20 — the card
still up after the warm-up with twelve groups silenced, a round card over the next round. Every
other check passes under each.

## Stage 120 — The alert printed through the node line

**Goal.** The arsenal probe's fourth-slot frame, a wake with the node hexes in the mission panel:
`NODE A · CELL ONE ▬ PULL IT` and `▲ INTEGRITY -5` through each other at 100 px. Stage 97 hung
the alert a gap under the mission panel's measured bottom, and Stage 116 seated the searchlight
warning under the node line; the alert knew nothing of either. A three-line mission panel ends
near 90 px, the node line sits at 92, and the alert went between them, onto the line.

**What changed.**
- `client/hud/layout.ts` — `alertTop(missionBottom, underBottom)`: the alert's seat is a gap
  under the lower of the mission panel and whatever the centred stack ends with — the node line,
  or the searchlight warning under it — and `ALERT_FLOOR` rises from 120 to 160 so the stack of
  panel, line and warning fits above it.
- `client/hud/hud.ts` — the stack is placed as one: the layout pass, the node line showing or
  hiding, and the warning turning on or off all re-seat the warning and then the alert.
- `tests/layout.test.ts` — the stacking, the floor, a line that ends higher than the panel.
- `probe/stage60.ts` — with the node line, the warning and an alert all up, the alert crosses
  neither and sits at least 4 px under the lower; when the line goes it moves up, and under the
  warning if the warning is still lit.
- CI run #145 (Stage 116) was red on that stage's own check with the geometry right: `warning
  120–144 px (on false)`. The warning is lit for 0.4 s of HUD time and two frames on the runner
  outlasted it. The check now reads the warning's state the instant it is raised and its
  rectangle after the frames, and the new check reads the warning's state again after the line
  goes rather than assuming it.

**Proof.** `npm test` 745 tests (one new); `npm run probe:tps` 45/45 — with the node line at
92–114 and the warning at 120–144 the alert sits at 150–163 and crosses neither, and with the line
gone (and the warning expired on these frames) it is back at 63 under the panel;
`npm run probe:campaign` still 39/39; `npm run build` and `npm run smoke` 7/7.

**Mutation.** The alert ignores the stack (`seat = ceil(missionBottom)`): the layout test fails
(1 of 22) and the tps probe fails its new check, 44/45 — `alert 63–76 px under line ending 114
and warning ending 144`: not through them at this mission panel's height, but above them, the
order the rule exists to keep; the arsenal frame's three-line panel is what put it through. Every
other check passes.

## Stage 119 — The book covered the file's name

**Goal.** The run probe's ledger frame: the Counter-Ledger book open, and behind its top-left
corner `▲ ALP` and `LV 50 · X`, the file's header cut through a translucent panel. Stage 95 made
the status line the one piece of chrome every frame keeps — who you are and what you are worth —
and the reader frames (the ledger book, its graph, the contracts desk) were centred at up to
92 % of the view's height, which on a 540 px view put their top edge over it. Kept, and covered.

**What changed.**
- `client/hud/layout.ts` — `FRAME_GAP` 8, `FRAME_INSET` 14, `frameSeat(statusBottom, viewHeight)`:
  the frame's top a gap under the header's measured bottom, its height what is left above the
  bottom inset.
- `client/hud/hud.ts` — the layout pass seats the book, the graph and the desk by that rule; the
  stylesheet's centring is overridden inline.
- `client/hud/hud.css` — the three frames are border-box, so the seat's height is the whole box.
- `tests/layout.test.ts` — the seat and the floor.
- `probe/stage60.ts`, `probe/stage10.ts` — with the book, the graph and the desk open, each begins
  at least 4 px under the header and ends at least 8 px above the view's bottom.

**Proof.** `npm test` 744 tests (two new); `npm run probe:tps` 44/44 — the header ends 76 px
down and the book and the graph run 84–526 px in a 540 px view; `npm run probe:campaign` 39/39 —
the desk the same, 84–526; `npm run build` and `npm run smoke` 7/7. The first reading had the book
ending at 548 px: the frames were content-box and carried their padding and border outside the
seat's height, which is why they are border-box now.

**Mutation.** The seat ignores the header (`top = FRAME_GAP`): the layout test fails (2 of 21),
the tps probe fails its new check, 43/44 (`book 8–526`), and the campaign probe fails its own,
38/39 (`desk 8–491`); every other check passes.

## Stage 118 — The foot line wrapped onto three lines at 640

**Goal.** The run probe's gate frame at 640 px wide: `1 · BLANK / · 0.0 m/s / · STAND`, three
lines crammed between the four slots and the five-tab strip. The bottom row is a flex line with
the slots on the left, the tab strip on the right and the foot line between them, and at 640 the
two ends leave the middle 67 px; the line needs about 170. Stage 111 gave the top band a second
row at this width; the bottom row had no such rule.

**What changed.**
- `client/hud/layout.ts` — `FOOT_GAP` 8, `footRow(room, need)`: `beside` when the room between
  the slots and the strip holds the line with a gap either side, `above` when it does not.
- `client/hud/hud.ts` — the layout pass measures the slots' right edge, the strip's left edge and
  the line's own width (kept on one line by `white-space: nowrap`) and lifts the line above the
  row when the rule says so.
- `client/hud/hud.css` — `.center` no longer wraps; `.center.above` sits centred just above the
  row.
- `tests/layout.test.ts` — the rule at the boundary either side.
- `probe/stage14.ts` — at 640 and at 960 the line is one line tall and clear of the slots and the
  strip; at 640 it is above the row, at 960 in it.

**Proof.** `npm test` 742 tests (two new); `npm run probe:run` 22/22 — at 640 the line is
11 px tall at 275–286 px, above the slots (top 300) and the strip, and at 960 it is 11 px tall
in the row (top 501, slots from 480); `npm run probe:tps` still 43/43; `npm run build` and
`npm run smoke` 7/7. The probe reads the line's text box, not its padded box: the first reading
took 14 px of bottom padding for a second line.

**Mutation.** `footRow` always says `beside`: the layout test fails (1 of 19) and the run probe
fails its new check, 21/22 — at 640 the line, kept to one line by `nowrap`, sits in the row at
216–390 px and pushes the tab strip to begin at 390, off the right edge of a 640 px view. Every
other check passes.

## Stage 117 — The foot line said STAND at a sprint

**Goal.** The tps probe's sprint frame: `1 · BLANK · 7.2 m/s · STAND`. The line under the file's
name printed the sim's stance, and the sim's stances are stand, crouch, slide and mantle — it has
no word for running or for being in the air, so a file at a full sprint, or a metre off the
ground, read STAND. The speed beside it said otherwise.

**What changed.**
- `client/hud/stance.ts` — `motionWord(stance, grounded, speed)`: the sim's own stances first
  (MANTLE, SLIDE, CROUCH), then AIR for a standing file off the ground, then SPRINT at or above
  `SPRINT_READ` (6.2 m/s, midway between the walk and the sprint), WALK above `WALK_READ`
  (0.5 m/s), STAND below it.
- `client/hud/hud.ts` — the foot line reads that word.
- `tests/stance.test.ts` — every branch and both thresholds.
- `probe/stage60.ts` — read from the drawn frame mid-run and again once stopped: SPRINT at the
  sprint, STAND at rest.

**Proof.** `npm test` 740 tests (three new); `npm run probe:tps` 43/43 — mid-run at 7.2 m/s
with the sim's stance still `stand` the line reads SPRINT, and at 0.1 m/s once stopped it reads
STAND; `npm run build` and `npm run smoke` 7/7.

**Mutation.** The foot line prints the sim's stance again: the tps probe fails its new check,
42/43 (`running at 7.2 m/s (stance stand): "STAND"`); every other check passes. The unit tests
read the pure function and cannot see this one, which is why the probe reads the drawn frame.

## Stage 116 — The searchlight warning printed over the node line

**Goal.** The arsenal probe's aftermath frame, read closely: `NODE E · FLAGGED — VANTAGE
SEARCHLIGHT · 7 m`, two strings through each other. The node line (Stage 92's readout of the node
you are near) and the searchlight warning (the repo mech has you in its light) both sat at 92 px
from the top of the HUD, centred, and a mech lighting you at a node is the ordinary case, not a
corner. Neither could be read.

**What changed.**
- `client/hud/layout.ts` — `FLAG_TOP` 92, `FLAG_GAP` 6, `flagTop(nodeFootBottom | null)`: with
  the node line up the warning hangs a gap under its measured bottom, never above its own seat;
  with the line hidden it keeps the seat.
- `client/hud/hud.ts` — `placeFlag()` runs in the layout pass and whenever the node line is shown
  or hidden, so the warning moves with the line in the same frame.
- `tests/layout.test.ts` — the seat, the gap, the floor.
- `probe/stage60.ts` — raises the node line and the warning directly and judges the rectangles:
  no overlap, a gap of at least 4 px, and the warning back at 92 px once the line goes.

**Proof.** `npm test` 737 tests (three new); `npm run probe:tps` 42/42 — with the node line up
at 92–114 px the warning sits at 120–144 px, no overlap, and with the line gone it is back at
92 px; `npm run build` and `npm run smoke` 7/7.

**Mutation.** `flagTop` returns its seat whatever is under it: the layout test fails (1 of 17)
and the tps probe fails its new check, 41/42 — `node line 92–114 px · warning 92–116 px · crosses
true`, the frame from the aftermath picture; every other check passes.

## Stage 115 — The objective sounded like a contest

**Goal.** In the campaign an objective completing raises its line and plays `contest` — the wake's
two-note square that means a hex is being pulled from under you. The same sound, in the same
game, for "you did the thing" and "someone is taking your node". Stage 94 gave the alt-fires their
own voices and Stage 101 the run's money moments; the campaign's own beat was still borrowed.

**What changed.** An objective ticking over has its own voice — a rising three-note figure in
the campaign's register, not the wake's — and the contest cue is the wake's again. The line and
the log entry are as they were.

**Proof.** `npm test` 734 tests; `npm run probe:campaign` 38/38 — the first fixer's terminal
resolving advances the objective, and the audio ledger reads the objective cue up by one and the
contest cue unmoved (`objective 1 → 2 · contest 0 → 0`); `npm run build` and `npm run smoke` 7/7.

**Mutation.** The objective plays `contest()` again: the campaign probe fails its new check,
37/38 (`objective 0 → 0 · contest 1 → 2`); every other check passes.

## Stage 114 — The ticker's clock assumed even frames

**Goal.** CI run #139, red on the city-life probe: `4 redraws over 7 drawn frames in 1.9 s
(wanted ≥ 5.0)`. The ad tickers are throttled to 12 Hz, and the check said "12 Hz, or every drawn
frame, whichever is rarer" — true when frames are evenly spaced, and a 3.7 fps runner does not
space them: it draws a stall of most of a second and then a burst of 30 ms frames, and a 12 Hz
throttle fed that burst redraws once for the stall and then waits. The check was measuring a
pacing the runner never had. Reading the throttle itself turned up the thing a player would
notice on an ordinary machine: it dropped the remainder on every redraw, so at 20 ms frames the
tickers ran at 10 Hz and at 33 ms at 10 Hz — "12 Hz" only at exactly 60 fps.

**What changed.**
- `client/render/ticker.ts` — the throttle as a pure step: `TICKER_HZ` 12, `tickerStep(acc, dt)`
  carries the remainder forward and caps the carry just under one period, so the average is 12 Hz
  at any frame rate and a hitch is one redraw plus one, never a burst at frame rate;
  `tickerRedraws(dts, acc0)` folds a sequence of frame times.
- `client/render/life.ts` — `HoloAds.update` steps that throttle; the copy line advances against
  the time of the last redraw rather than an assumed period; the panel keeps a ring of the last 600
  frame times it was fed, `fed`, and `carry` (probes).
- `client/main.ts` — `state().life` carries `adFed`, `adCarry`, `adFrames`.
- `probe/stage9b.ts` — the oracle is the throttle run over the frame times the tickers were
  actually fed, from the same starting carry: the count must match exactly, whatever the pacing.
  The airship's drift is its own check.
- `tests/ticker.test.ts` — the step, the carry, the cap, 24 redraws in 2 s of 20 ms frames (the
  dropped remainder gave 20), every frame when frames are slower, the stall.

**Proof.** `npm test` 734 tests (nine new); `npm run probe:cityLife` 21/21 — on this machine's
headless frames (six to eight in 2.4 s, the longest capped at 500 ms) the count matches the
throttle run over those frame times exactly, and fed a hundred 20 ms frames by hand the panels
redraw 24 times (25 when the carry left by the last drawn frame rounds up), where the dropped
remainder gave 20; the airship drifts; `npm run build` and `npm run smoke` 7/7. The old check would
have wanted ≥ 5 of 6 and been satisfied by a ticker that skipped every third frame; the new one
wants the exact count.

**Mutation.** Three, each on `client/render/ticker.ts` alone. The remainder dropped again
(`acc: 0` on redraw): five unit tests fail and the probe's hand-fed check fails, 20 redraws over
100 × 20 ms; on the drawn frames alone it also failed once by a frame (7 of 8) and would pass on a
run where every frame was slower than a period — which is why the hand-fed check exists. The
ticker at 6 Hz: four unit tests fail and the hand-fed check fails at 12 redraws. The tickers never
redraw: eight unit tests fail and the drawn-frame check fails, 0 redraws against an oracle of 8.
Every other check passes under each mutation. One correction along the way: the hand-fed check
first assumed the throttle started empty and read 24 with the carry at a full period by luck;
it now reads the carry it starts from and derives the count.

## Stage 113 — The alert had no place in a frame

**Goal.** The campaign's closed-file frame, read after Stage 112: the card up, the chrome silenced
as Stage 95 says — and `◆ FILE CLOSED — RE-LEASING IN 3s` jammed against the top edge of the
screen, half clipped, six pixels down. Stage 97 hung the alert under the mission panel's measured
bottom; a frame that silences the mission panel leaves it with no rectangle, and an anchor at
nothing put the alert at the top. The first fix hung it from the status panel instead — and the
tps probe's ledger check caught the consequence at once: the alert, re-anchored, hung over the
open book, the one overlap left on it. The alert is chrome. It had escaped Stage 95's list only
because, off the top of the screen, it happened not to overlap anything.

**What changed.** `alert` joins the chrome groups: the frames that cover the screen — the desk, a
card, the ledger — silence it with the rest, and a terminal, which is usually the objective, keeps
it. The anchor stays what Stage 97 made it; the mission panel is never hidden outside a frame, so
the case that put the alert at the top no longer draws it at all. A fallback anchor that could
only ever be exercised where the alert is silenced would have been a guard nobody can observe,
and it is gone.

**Proof.** `npm test` 725 tests; `npm run probe:tps` 41/41 — the ledger check now raises
`◆ INTEGRITY 30` for six seconds before opening the book and reads `alert` among the silenced
groups (before Stage 113 it read only what happened to overlap, and the alert, off the top of the
screen, never did); `npm run probe:campaign` 37/37 — with the card up an alert raised is silenced
with the rest of the chrome, and a terminal keeps it; `npm run build` and `npm run smoke` 7/7.

**Mutation.** `alert` removed from the chrome groups again (`ALL_GROUPS` ends at `diag`): the
campaign probe fails its new check, 36/37 (`card true · alert shown true · silenced: …diag`), and
the tps ledger check fails, 40/41 (`silenced: …diag`, no `alert`). A first run of the tps guard let
this mutation through by timing — the alert it had watched had expired before the book opened —
which is why the check raises its own. Every other check passes under the mutation.

## Stage 112 — The ledger was not a frame either

**Goal.** The run probe's ledger frame, read after Stage 111: the FILE book open over the yard —
aliases, presets, the counter-ledger, the market — and the weapon rack, the ammo count, the log
and the mission strip drawing straight through it, `30 / 30` at its right edge and five log lines
poking out from under its left. Stage 95 made the desk, the terminal and the closing card frames
that silence the combat chrome; the ledger book and its graph, opened from the tab bar and by Tab
and G in every mode, were never on that list. A frame with a gun's ammo count printed over it is
not a frame, whichever mode it opened in.

**What changed.**

- **The ledger book and its graph silence everything but the status line**, exactly as the desk
  does: prompt, reticle, rack, ammo, grenades, arrows, log, map, mission, node foot and the
  diagnostics — and the gun comes back the frame they close.
- **The HUD watches for them.** Both panels live inside the HUD root but open and close from
  `file.ts`, so the HUD reads their state on the frame it changes and applies the rule then; no
  new coupling between the two.
- `quietFor` in `client/hud/quiet.ts` gains the `ledger` modal, pure and unit-tested; the ledger
  wins over a terminal open under it.

**Proof.** `probe:tps` 41/41, two new, read as Stage 95 reads the desk: with the book opened by
the tab's own key no visible chrome overlaps it and the silenced groups are all eleven; closed,
none are silenced; the graph reads the same. `tests/quiet.test.ts` 7. 723 tests, build and
typecheck clean.

Two mutations, both failing the two new checks and nothing else, 39/41 each. With the rule not
knowing the ledger, nothing is silenced and seven pieces of chrome overlap the open book — the
reticle, the mission panel, the map, the side, the log, the ammo — and two of the seven unit tests
go with it. With the HUD never looking at the panels, the rule is intact and all seven unit tests
pass, and the probe reads the same seven overlaps: the wiring has no unit test and the probe is
its guard.

## Stage 111 — The band was too narrow for three

**Goal.** BRAVO's frame from the run probe, 640 px wide, read after Stage 110: the status panel
at its 180 px floor ends at 214, the map takes the last 138, and the mission panel's narrowest
useful width is 240 — 214 + 240 + 138 and the gaps is more than 640, and the panel ran over the
file's header a third time. Stage 107 let the status give way, Stage 110 gave the panel a ceiling;
neither can make three things fit where two do.

**What changed.** Where the band cannot hold the panel beside the status panel at its minimum,
the panel takes a second row: under the status panel, gap kept, centred, bounded by the map alone.
The status panel then keeps its full width, and the alert (Stage 97) follows the panel down as it
always has. `missionRow` joins `client/hud/layout.ts`, pure and unit-tested; the layout pass
decides the row before it measures anything.

**Proof.** `probe:run` 21/21, one new, measured at 640 px on the carry frame: the status panel
keeps its full width, 14–364, and ends 76 px down; the mission panel spans 160–480 from 84 px down
— the second row, gap kept — and the map begins at 500. The 960 and 800 bands read exactly as
Stage 110 left them. `tests/layout.test.ts` 14. 721 tests, build and typecheck clean.

One mutation for the one rule, with the panel never taking the second row: at 640 it stays in
the band at 200–440 from 14 px down, the status panel squeezed to its floor at 214 and run over
by fourteen pixels; the check fails on that alone, 20/21, with the one layout test that asks for
the second row. The 960 and 800 checks read as before.

## Stage 110 — The run strip pushed the panel onto the name

**Goal.** THE RUN's own frame at 960 px, read after Stage 109: the mission panel carries the run
strip — `◆ CARRYING 1 · BANKED 0 · TODAY 0/200 · OWED 0 UNITS · PVP ZONE · 4 CLAIMS OUT` — on
one unwrapping line, which made the centred panel 630 px wide, from 165 to 795. Stage 107 lets
the status panel give way to the panel, but not below its 180 px floor, and the floor ends at
214: the file's header ran under the strip's panel by fifty pixels, the same fault Stage 107
closed for the wake's panel, opened again by a wider one.

**What changed.**

- **The mission panel has a ceiling.** Centred, it may grow until it would meet the status panel
  at its floor on the left or the map on the right, whichever is nearer, and no further — at 960
  px that is 516 px. Past it, its lines wrap: the run strip is two lines now, and says the same.
- **The status rule then holds**: with the panel at its ceiling the status panel sits at its
  floor beside it, gap kept, and the alert (Stage 97) follows the taller panel down.
- `missionMaxWidth` joins `client/hud/layout.ts`, pure and unit-tested with `statusWidth` against
  it; the layout pass caps the panel before it measures it for the status and the alert.

**Proof.** `probe:run` 20/20, one new, measured on the carry frame with the strip up: the status
panel ends at 232, the mission panel spans 240–720 (its lines wrapped to 480 px, under the 516
ceiling), the map begins at 820, and the strip is 41 px tall — two lines — where it had been one
line and 630 px. And the same band at 800 px wide, where the ceiling is what holds: the status
panel at its floor ends at 214, the mission panel spans 222–578 — the ceiling's 356 px with the
8 px gap — and the map begins at 660. `tests/layout.test.ts` 12. 719 tests, build and typecheck
clean.

A note on which rule did what. An absolutely placed panel at `left: 50%` shrinks to fit the half
of the view its left edge leaves it, so at 960 the wrap alone held the panel to 480 px and the
ceiling of 516 never bound; the first mutation run passed for exactly that reason. The ceiling
binds only where the status floor plus its gap is more than a quarter of the width — under about
890 px — which is why the check now measures at 800 as well.

One mutation for the one rule, with the panel given no ceiling: at 960 the band reads exactly as
before — the wrap alone holds it there — and at 800 the panel grows to the half-view, 200–600,
over a status panel that ends at 214; the check fails on the 800 clause alone, 19/20, and three
of the twelve layout tests go with it.

## Stage 109 — The rack called the DIRECTIVE "THE"

**Goal.** Two real frames read after Stage 108, and both carried `7 THE 12` on the weapon rack.
The rack labels each slot with the first word of the weapon's name, which names seven of the
eight — LEASE-BREAKER, REPO, STACK, LONGWAVE, PHAGE, SHOCK, CLOCKEATER — and for THE DIRECTIVE,
in every frame since the campaign weapons arrived in Stage 10, gave the article and kept the
name. A label is the word that names the thing.

**What changed.** `client/hud/rack.ts`: the rack's one-word label is the first word that is not
an article, pure and unit-tested against the whole manifest; the rack uses it.

**Proof.** `probe:tps` 39/39, one new, read from the rack's own text: `1 LEASE-BREAKER | 2 REPO |
3 STACK | 4 LONGWAVE | 5 PHAGE | 6 SHOCK∞ | 7 DIRECTIVE | 8 CLOCKEATER`, no slot labelled by an
article. `tests/rack.test.ts` 4. 715 tests, build and typecheck clean.

One mutation for the one rule: with the first word taken whatever it is, the rack reads `7 THE`
again and only that check fails, 38/39, with two of the four unit tests going with it.

## Stage 108 — The reticle did not know the cone

**Goal.** The REPO HAMMER throws eight pellets in a cone 0.055 rad wide; choked, one slug in
0.008. The STACK SMG's cone halves when braced. The reticle drew the same four-armed cross for all
of it — a point, for a gun that fires an area — so the one thing a shotgun player needs to see,
how much of the file in front of them the cone covers, was nowhere on the screen; and racking the
choke changed a word in the corner (Stage 94 gave it a sound) and nothing at the reticle. Stage 78
had already made the case that a reticle must say what the round does.

**What changed.**

- **The cone is a ring at the reticle**, the size of the spread the next round actually leaves
  in, projected through this frame's camera: the sim's own rule — the weapon's spread, times the
  alt's multiplier when an optic, a brace or a choke is on, times the firmware's spread stat —
  and the screen's own scale, the tangent of the half-angle against the tangent of half the field
  of view. Zooming an optic draws the same cone larger, as it should.
- **A cone too small to draw is not drawn.** Under three pixels of radius the ring would claim a
  precision the eye cannot use; the LEASE-BREAKER's 0.004 rad is a pixel and shows nothing.
- `client/hud/spread.ts` is the rule, pure and unit-tested against the weapon manifest.

**Proof.** `probe:arsenal` 32/32, one new, the ring measured against the number computed from
the sim's own definition inside the same frame: with the REPO HAMMER in hand the ring is 47.0 px
wide against 2 × 23.6 from spread 0.055 at 80.0° in a 720 px view; choked it is 7.0 px against
2 × 3.5 (the slug's cone, just over the floor at this height); with the LEASE-BREAKER the ring is
off. The first run measured 49.0: the ring's own border sat outside its width, so it is drawn
border-box now. `tests/spread.test.ts` 7. 711 tests, build and typecheck clean.

Two mutations, each failing its own guard alone. With no cone ever read the ring is `none` at
0.0 px for the HAMMER, 31/32, and three of the seven unit tests go with it. With the choke ignored
the open HAMMER still reads 47.0 px and the rifle still nothing, but choked it reads 47.0 where the
slug's 7.0 belongs — 31/32, with the two unit tests that ask for the alt's multiplier.

## Stage 107 — The mission panel sat on the file's name

**Goal.** A real frame at 960 px wide, read after Stage 106: the file's own header — `▲ BLANK ·
DRAINAGE YARD (MAGENTA) · 1 online` — ran under the mission panel and was cut at its edge, and the
panel's bars ran on beneath it. Measured rather than eyeballed: the status panel spanned 14–364 px,
the mission panel began at 345, nineteen pixels of one chrome on top of another, and the header
line was 337 px of text in a 330 px box with a hard clip. Stage 97 kept the rack out of the play
and the alert out from behind the panel; nobody had kept the panel off the name.

**What changed.**

- **The status panel gives way to the mission panel**: its content width follows the panel's
  measured left edge, eight pixels short of it, and never narrower than a name. The bars go with
  it, since they are inside it. A hidden panel is nothing to keep clear of.
- **Where the header does not fit, the cut is an ellipsis**, not a hard edge — the line says it is
  longer than the room.
- `statusWidth` joins `client/hud/layout.ts`, pure and unit-tested; the HUD's layout pass measures
  and applies it every frame beside the alert's placement.

**Proof.** `probe:tps` 38/38, two new, measured on the frame: the status panel now ends at 337 px
with its bars at 327, the mission panel begins at 345, gap 8; the header line is 337 px of text in
303 px with `text-overflow: ellipsis`. `stage60-closed.png` is the frame: `· 1 …` where the cut
is, the bars inside the panel, the alert under the panel. `tests/layout.test.ts` 8. 704 tests,
build and typecheck clean.

Two mutations, each failing its own guard alone. With the status panel never giving way it ends
at 364 px against a panel beginning at 345, gap −19, and the ellipsis check still passes — 37/38,
with two of the eight layout tests going with it. With the ellipsis dropped the panel still ends at
337 with its gap and only the second check fails, `text-overflow clip` — 37/38.

## Stage 106 — The charge was a number in the corner

**Goal.** The LONGWAVE charges: hold the trigger for nine tenths of a second and the round that
leaves is the one that pierces. The client has said `CHARGE 64%` in the weapon's name line since
Stage 4 — in the corner, where nobody is looking while they hold a shot on a moving file — with a
rising ping every six ticks and a full-charge cue. The reticle, where the eyes are, said nothing;
the same argument Stage 100 made for the magazine and the reload.

**What changed.**

- **The charge is the ring on the reticle**: the reload's own ring (Stage 100) in the charge's
  magenta, filling as the charge does, and the whole ring lit yellow the frame it tops out.
- **It goes with the shot.** The sim never charges and reloads at once, so the ring is one or the
  other; the release fires and the ring is gone.
- `chargeRead` joins `client/hud/ammo.ts`, pure and unit-tested: off when nothing is charging,
  the fraction while it is, full only at the top, clamped.

**Proof.** `probe:arsenal` 31/31, one new, from the reticle's own classes and style on drawn
frames: with the LONGWAVE in hand the trigger is held for 140 ticks; the charge begins 23 ticks in
(the swap), 18 ticks later the ring is displayed at 0.35 against the sim's 0.35 and not full, 45
ticks after that it reads 1.00 and full against the sim's 1.00, and after the release it is gone
with the magazine one round lighter. `tests/ammo.test.ts` 11. 701 tests, build and typecheck clean.

Two mutations, each failing its own guard alone. With the ring never coming up the check reads
`ring none` at both reads while the sim charges 0.35 → 1.00 underneath, 30/31, and two of the
eleven unit tests go with it. With the top never marked the ring fills to 1.00 exactly as before
and only `full false` at the top fails, 30/31, with the one unit test that asks for the top.

## Stage 105 — The shutter opened on the flip

**Goal.** Run #129 (Stage 100) was red on one check, `lease_row/node: reads like the clip`: mean
luma 0.265 against the 0.24 ceiling, with green at 52% of the neon. Stage 100 touched the ammo
counter and nothing in rendering, and the same frame was green on the commits either side. The
check's own comment records this frame reading 0.22 from one arrival and 0.24 from another, and
Stage 70 pinned the camera to the spot for it — but the number kept its variance, because the
variance was never the position.

**What it was.** The frame is taken eight metres from a node the bot has just flipped, and a flip
puts a liberation ring on the node — `WakeFx.flip` — that expands and fades over 1.4 s of the
wake's own clock. That clock advances only with rendered frames. Between the flip and the shutter
the probe drives the sim by hand, with few frames, so at the shutter the ring's age was however
many frames the machine had managed: on a fast machine most of a second and a faint wide ring; on
the runner, slower frames and a young bright one filling the street with green. The check was
measuring the frame rate.

**What changed.** The node frame waits for the ring to die: a fresh pulse is staged on the node
deliberately, and the shutter opens only once the wake has no pulses left. Staging it means the
wait is exercised on every run rather than only on a slow one, and removing the wait fails on any
machine, which is what a guard should do. No rendering changed; the settled node is the honest
frame, and the pulse that follows a flip is the game's to keep.

**Proof.** `probe:city` 45/45 with the wait in place, and the three node frames now read
0.163, 0.176 and 0.158 (green 30–41%) where the same frames had read 0.213, 0.208 and 0.197 on
this machine before — the old "good" readings had been carrying the tail of the ring too. Two
plain runs before the change read 0.213 and 0.208 for `lease_row/node`; the runner's 0.265 was the
same frame with a younger ring.

With the wait removed — the staged pulse at the shutter — the same three node frames on this
machine read 0.224, 0.233 and 0.241 with green at 43–58% of the neon, and `repo_depot/node` fails
the 0.24 ceiling: 44/45. That is #129's failure reproduced on a fast machine, smaller here because
the shutter's own 300 ms had let the ring fade further than the runner's frames had.

## Stage 104 — The map never heard the shot

**Goal.** Stage 81 gave every gun in the street a voice from its muzzle, panned and delayed by
where it was fired from; the map in the corner drew none of it. A shooter in every game leaves a
mark on the minimap where the gun went off — the one read that turns "somewhere to the left" into
a place to go or a place to leave — and this map drew the nodes, the range's dummies and the
contract's spots, and nothing that moved. The position was already in hand: both shot paths
compute the gun cue from the muzzle, so the ping is the same point the ear was given.

**What changed.**

- **A gun heard going off is a mark on the map where it went off**: magenta for a file's, amber
  for a wasp's, fading over a second and a half as the sound does. Off the map, it is pinned to
  the rim on its bearing — the same placement the contract's spots use (Stage 92).
- **Twelve at most**, oldest first out: a street full of guns is a street full of guns, not a wall
  of dots.
- **On the map's own clock.** The HUD sums the frame times it is given and the pings fade on
  that, so the fade is the player's second and a half, not the simulation's tick count and not a
  stopwatch.
- `client/hud/ping.ts` is the rule, pure and unit-tested: what is remembered, for how long, and
  where it lands.

**Proof.** `probe:arsenal` 30/30, one new, read from the map's own pixels — magenta is a file's
ping and nothing else on this map is magenta: 0 such pixels before; a file's shot injected
fifteen metres to the right through the client's own shot handler puts 16 on the next drawn
frame, centred at x 38 of 54 (the middle is 27); and 2.4 s of the map's clock later there are 0.
`tests/ping.test.ts` 6. 698 tests, build and typecheck clean.

Two mutations, each failing its own guard alone. With no ping ever drawn the map reads 0 magenta
pixels after the shot, 29/30, and four of the six unit tests go with it. With the ping placed at
the listener instead of the muzzle it lands under the file's own green mark at the centre and the
map again reads 0, 29/30, with three unit tests — the ones that place a shot ahead, to the right
and on the rim — going with it.

A third mutation was tried first and passed the probe: pruning and the marks' own age gate both
removed, so a ping was remembered for ever. Its two unit tests caught it and the pixel read did
not, because the draw had a 5 % alpha floor — a ping past its life was still drawn, as a ghost
too faint to read as magenta and not too faint for a player. The floor is gone: a faded ping draws
nothing. The two gates are deliberately redundant (the game prunes, the marks filter again), so a
mutation of either alone is masked by the other; the fade is guarded by the unit tests on each and
by the probe's read after the map's clock has run.

## Stage 103 — What you put into the mech

**Goal.** A VANTAGE mech is four hundred points of health and the client showed nothing of what a
round did to it: a spark (Stage 89) and the same spark on the next one, with no way to tell a mech
at ninety percent from one at nine. A wasp is forty and dies in two, but a mech is a decision —
keep pouring rounds in, or go — and the number that decides it was on the wire the whole time: the
room has sent every wasp's health and every mech's (halved to fit the byte) since Stage 4, and
offline the sim has them in hand. Nothing read them.

**What changed.**

- **The body my last round landed on reads under the reticle**: `WASP-01 ▮▮▮▮▮▯▯▯ 60%` — its
  name, eight blocks, the fraction — for two seconds after the round, then gone. It follows the
  reticle and goes quiet with it.
- **VANTAGE only.** Not a bar over every enemy, and not for files: another player's integrity is
  theirs, and the close-book (Stage 91) already says what a kill was.
- **From the sim's own number.** Offline the wasp's or mech's health; online the entity record's
  — a wasp's whole, a mech's doubled back — and a dead body reads empty.
- `client/hud/target.ts` is the rule, pure and unit-tested: which body (the freshest VANTAGE hit
  in the close-book, files and dummies passed over), for how long, and what the read says.

**Proof.** `probe:arsenal` 29/29, one new: a wasp staged three metres out at head height and
EMP-sagged so it sits still and does not shoot back, one round in the magazine — the round lands
at tick 2, the wasp reads 24/40, and the reticle's own text reads `WASP-01 ▮▮▮▮▮▯▯▯ 60%` against
the sim's 60%; 2.7 s of drawn frames later the read is gone. The staging took three tries, and the
shot's own endpoints settled each: at six metres the round ended in a wall at (0, 1.6, −8); at
three metres and 0.6 m up it ended in the crates on the range floor at y 1.2; at head height it
landed. `tests/target.test.ts` 6. 692 tests, build and typecheck clean.

Two mutations, each failing its own guard alone. With no body ever read the round still lands
and the wasp still reads 24/40 in the sim, but the reticle's text is `""`; 28/29, and two of the
six unit tests go with it. With the hold never expiring the read comes up exactly as before —
`WASP-01 ▮▮▮▮▮▯▯▯ 60%` — and is still up after 2.7 s of frames, so only the "gone" clause fails;
28/29, and the one unit test that times the hold goes with it.

## Stage 102 — The shield broke in silence

**Goal.** Every file carries thirty points of shield over seventy of integrity: the shield soaks
damage first and grows back four seconds after the last hit, fifteen points a second. The moment it
breaks is the moment the fight changes — the next round is integrity — and the client marked it
with nothing: the cyan bar in the corner went to zero and the `▲ INTEGRITY` alert read the same as
any other hit. The moment it is whole again is when the file can push, and that was silent too.
The low-health pulse has said "until the shield is back" in a comment since Stage 13; nothing
ever said it to the player.

**What changed.**

- **The break is heard**: an electrical crack and the hum dropping out from under it, and
  `◇ SHIELD DOWN` in magenta. Once — a second hit on the bare file is a hit, not a second break.
- **The bar says which state it is in**: its frame goes magenta and blinks while the shield is
  down, and clears when it is back.
- **The return is heard**: a rising hum settling into a tick, and `◇ SHIELD BACK`, on the frame
  the shield reaches full from below. Not on a respawn, which is a spawn and has its own voice.
- `client/shieldcue.ts` is the rule, pure and unit-tested — two views of the file and the edges
  between them — read frame to frame the way the run's money (Stage 101) and the magazine's last
  quarter (Stage 100) are.

**Proof.** `probe:arsenal` 28/28, two new, read from the cue counts, the bar's own class and the
log on drawn frames, with the Stage 98 wasp stood down so its rounds stop resetting the regen
gate: forty points into a thirty-point shield leaves shield 0 and integrity 60, the bar reading
`bar cy shield broken`, one break and `◇ SHIELD DOWN`; five more points leave integrity 55, still
one break and no return; and the shield is whole again after exactly 360 ticks — the 240-tick gate
and 120 ticks of regen — with one return, `◇ SHIELD BACK`, and the bar's frame clear.
`tests/shieldcue.test.ts` 6. 686 tests, build and typecheck clean.

Two mutations, each failing only what it breaks. With `shieldMoments` reading nothing both new
checks lose their cues and lines (`break ×0`, `back ×0`, `""`) while the bar — driven from the
state, not from the moment — still reads `broken` and then clear; 26/28, and two of the six unit
tests go with it. With the bar never told, the break is still heard once with its line and only
the bar clause fails (`bar cy shield` where `broken` should be), 27/28 — the return check, which
asserts the frame is clear, passes on a bar that never marked itself.

## Stage 101 — The claims fell without a sound

**Goal.** THE RUN has three money moments and the client borrowed or skipped every one of them.
Picking a claim up played the wake's node-flip — the sound that means a hex changed hands in a
different mode — and said nothing in the log. Banking was a stamp and a line online, and a stamp
with no line offline, where the same sim runs. And the drop — a death in the PvP zone with claims
carried, everything you had falling to the street for anyone to take — was silent everywhere,
offline and online. That is the loudest moment in the mode: the one the player most needs to hear,
and the one the street's other files are listening for.

**What changed.**

- **A claim taken has its own voice** — a bright double tick going up — and a line:
  `◈ CLAIM +3 · CARRYING 5`. The node flip is the wake's again.
- **The drop is heard as the fall it is**: a tone dropping away and the units scattering left and
  right, and `◈ 5 UNITS DROPPED WHERE YOU FELL` in magenta. It plays on the death that emptied
  your hands, offline and online alike.
- **Banking says so in both worlds.** The stamp stays; the line the online path had is now the
  offline path's too.
- `client/runcue.ts` is the rule, pure and unit-tested: the wire carries the run's state rather
  than its events, so the moments are read from two consecutive views — a rise in carried is a
  pickup, a rise in banked is a bank, and a fall in carried is a drop only for the part the bank
  does not account for. Both sync paths call the one function.

**Proof.** `probe:run` 19/19, one new, on the offline yard where the same sim runs: the bot walks
onto a claim and the client counts one claim cue and no node flip, with `◈ CLAIM +1 · CARRYING 1`
in the log; then the file is killed where it stands and the client counts one fall, logs
`◈ 1 UNITS DROPPED WHERE YOU FELL`, carries nothing, and the run's view shows a dropped claim lying
on the street. `tests/runcue.test.ts` 6. 680 tests, build and typecheck clean.

Two mutations, each failing its own guard alone. With `runMoments` reading nothing the check
reads `claim cue ×0 … fall ×0` with no line for either, 18/19, and four of the six unit tests go
with it — and, with no cue to wait on, the file has respawned by the time the check reads it. With
the drop heard as the bank's stamp the pickup and its line, the drop's own line, the empty hands
and the claim on the street all read as before and only the fall is missing, `fall ×0`, 18/19.

## Stage 100 — The magazine that ran out without a word

**Goal.** The ammo count is a number in the bottom-right corner, and in a fight nobody is looking
there. The first anyone knew of an empty magazine was the dry click, and the reload after it
showed `--` in the corner for a second and a half with nothing to say how long was left — on a
game whose reload has a seat point you can cancel from, which the count never showed either. The
simulation keeps all of it: the round count, the reload timer and its total, whether the magazine
is in. The HUD read one of the four.

**What changed.**

- **The corner says where the magazine is.** Amber on the last quarter, magenta with a blinking
  `▼ RELOAD [R]` when it is empty and nothing is in flight; the bar goes amber with it.
- **The reload is a ring on the reticle**, where the eyes are: it fills clockwise as the magazine
  goes in, amber until the seat and cyan once the rest can be cancelled — the same seat the Stage 4
  reload-cancel has always had, now visible. No canvas: a conic gradient under a ring mask, driven
  by one custom property.
- **The last quarter is heard, once**, on the round that crosses into it: two small ticks. Not on
  every round under the line, not on a reload coming back up through it, and not on the empty
  click, which is the dry fire's own. A magazine of one has no last quarter to warn about.
- `client/hud/ammo.ts` is the rule — the low line, the four states, the reload fraction, the one
  edge — pure and unit-tested; the HUD draws what it says and the game plays it.

**Proof.** `probe:arsenal` 26/26, two new, read from the HUD's own classes and computed styles on
drawn frames: an empty magazine with nothing in flight reads `ammo empty` with the prompt shown;
nine rounds fired down to eight read `ammo low` with the cue heard once; firing the rest into the
held-trigger reload, the ring is displayed at 0.00 and at 0.13 fifteen ticks later with the corner
reading `--` under `ammo reloading`; two hundred and forty ticks on the ring is gone, the corner
reads plain `ammo` at 30 rounds, and the cue is still at one. `tests/ammo.test.ts` 8. 674
tests, build and typecheck clean.

Two mutations, each failing only what it breaks. With the last quarter never read as low the
corner stays plain `ammo` at eight rounds while the cue is still heard once and the ring check
passes untouched — 25/26 — and one of the eight unit tests goes with it. With the crossing silenced
the corner still goes `ammo low` and the ring still fills, and both checks fail on their cue
clause alone, `cue ×0` — 24/26 — because both of them assert that the cue was heard exactly once.

## Stage 99 — The round that missed you

**Goal.** The simulation has always known how close every shot came: `castRay` measures each
ray's closest approach to every other file and calls it `nearMiss`, and the netcode probe has been
reporting it in metres since Stage 2. Nobody in the game ever heard it. Stage 81 gave every gun in
the street a voice from its muzzle, so a round passing a hand's width from your ear sounded exactly
like one aimed thirty degrees wide of you from the same doorway: the same crack from the same
place. In any shooter the difference between those two is the loudest thing in the fight — the
snap of a round going past is how you know you are the one being shot at, before anything lands.

**What changed.**

- **A round going past is heard where it was nearest**, at the ear it went past: a short bright
  crack with no body, louder the closer it came, panned by the side, and on you rather than to a
  side when it all but parted your hair.
- **Nothing new crosses the wire.** The shot event already carries where the round started and
  where it stopped; the client takes the closest point on that flight to its own head. A round that
  stopped in a wall three metres short of you did not pass you; one into the wall beside your head
  did.
- **A hit is a hit.** A round that landed on this file is heard as the hurt it was, never as a
  miss as well; and your own shots are your own.
- `client/nearmiss.ts` is the rule, pure and unit-tested: the closest approach on the segment, the
  reach, the side (the damage wedges' own bearing), the near zone. `passedBy` in `game.ts` feeds it
  from both shot paths, offline and net, so a wasp's round and a remote file's round are heard the
  same way.

**Proof.** `probe:arsenal` 24/24, one new, driven through the client's own event handler (the
path every wasp and remote shot takes): a round half a metre right of the head snaps once at pan
1.00 and 0.50 m; one four metres wide and one that landed on the file leave the count where it was;
all three are still heard as guns. The count read 1 before the staged shots: the Stage 98 wasp had
already put a real round past the head during its chase. `tests/nearmiss.test.ts` 7. 666
tests, build and typecheck clean.

Two mutations, each failing its own guard alone. With `shotPass` never hearing anything the check
reads `snaps 0 → 0 → 0 → 0 · 3 guns heard` — the guns from the muzzle are untouched, the round is
silent — and six of the seven unit tests go with it. With the landed round no longer excluded the
ear and the wide shot read as before and the third moves the count (`177 → 177 → 178`), so only
that clause fails; and its baseline of 176 against the real run's 1 is the mutation in play — every
wasp round that landed on the file through the earlier sections had been heard as a miss as well.
Both leave the probe at 23/24 with the other 23 unmoved.

## Stage 98 — The wasp that found you

**Goal.** A VANTAGE wasp on patrol sees a file and turns to chase it. Its light goes from amber to
a hot orange — a point light on a drone half a metre long, very often behind you, in the rain — and
that is the whole announcement. The first thing most players hear of it is its gun. A mech that
flags you gets a two-tone and a HUD flag; a wasp that acquires you gets nothing, and it is the one
that shoots first.

**What changed.**

- **A wasp going live is heard**, from the side it is on: a rising blip in the wasp's own register,
  louder the closer it is, and `◆ WASP LIVE` in the log.
- **Once per acquisition.** A wasp loses its target after three seconds and finds it again a moment
  later, so a wasp that has cued in the last five seconds does not cue again — the room can be loud
  without becoming a klaxon.
- **It claims a wasp gone live near you, not on you**: the wire carries each wasp's state and not
  whose target it has, and the line says exactly what the client knows.
- `client/vantage.ts` is the edge rule, pure and unit-tested — the edge into chase, a wasp first
  seen already chasing, the reach, the cooldown, the bearing (the damage wedges' own) — and it
  reads the same per-frame wasp list the renderer already receives, offline and online.

**Proof.** `probe:arsenal` 23/23, one new, staged on a live wasp: a VANTAGE unit set to patrol nine
metres off the player's right shoulder turns to chase two ticks after release; the cue count reads 2
before the acquisition, 3 on the frame after it and 3 two seconds of chasing later; and the log's
latest line is `» ◆ WASP LIVE · 9 M RIGHT`. `tests/vantage.test.ts` 8. 659 tests, build and
typecheck clean.

Two mutations, each failing its own guard alone. With `waspLocks` returning nothing the check
reads `cues 0 → 0 at the lock → 0` and five of the eight unit tests go with it; with the log line
dropped the cue still lands (`2 → 3 → 3`) and only the line part fails, `""` where the WASP LIVE
line should be — the same probe stays 22/23 either way and the other 22 do not move.

The first three runs of the check failed with the cue count flat at 2, and each was the harness:
the baseline read after the acquisition; no drawn frame between staging the patrol and the chase,
so the client saw chase → chase and no edge; and the cooldown on the render clock, which in a
hand-driven probe barely moves, so an earlier hunt's cue was still "five seconds ago". The
cooldown now runs on the sim clock, which is the clock the wasp's own state changes on.

## Stage 97 — The chrome crossed the play

**Goal.** Two things in a real third-person frame at 960 px wide, both the HUD reaching into the
part of the screen the game is played in. The weapon rack is anchored to the right edge but eight
slots wide, so it ran left across the file's own body and the lane ahead — where the ground and
everyone's feet are. And the alert line sat at a fixed 58 px, straight under a mission panel that is
two lines tall in every contract, so INTEGRITY 30 printed half-hidden behind the objective.

**What changed.**

- **The rack keeps to the right band.** The rack and its ammo may take a fixed share of the width
  from the right edge and no more; at 960 px the eight slots wrap into two rows on the right instead
  of crossing the middle. At 1920 px nothing changes, because nothing needed to.
- **The alert sits under the mission panel**, wherever the panel actually ends — measured each
  frame, because the panel's height changes with what it says — and never below the top band.
- `client/hud/layout.ts` is the rule, pure and unit-tested, including a `crossesPlay` that shares
  its band edge with the width function to the integer, because `1 − 0.44` is not `0.56` in floating
  point and a rack that fills the band exactly is on the line, not over it.

**Proof.** `probe:tps` 36/36, two new, judged as plain geometry rather than by the rule's own
arithmetic: the rack now spans 538–946 px of 960 in two rows, 34 px tall, where it had spanned
325–946; and with an alert up its top sits at 63 px under a mission panel that ends at 57 px. `tests/layout.test.ts` 5. 651 tests, build and typecheck clean.

Two mutations, each failing its own guard alone. With the band opened to the whole width the rack
runs 327–946 px in one row again and only the rack check goes red. With the alert pinned back at its
fixed 58 px, only the alert check goes red — but not at first. The first version of that check
accepted "touching" as "under": this scene's panel ends at 57 px, the old constant cleared it by a
single pixel, and the mutant passed. The claim is a visible gap, so the check now requires one of at
least 4 px, where the rule gives 6 and the mutant gives 1. A guard that a mutation does not fail is
not a guard, and this one was caught by running the mutation rather than by assuming it.

## Stage 96 — The respawn was a cut

**Goal.** A file that has just been closed is looking at whatever closed it — Stage 83 turned the
camera onto the killer over about a second. Then the simulation puts it back on the ledger, and on
that frame the camera cuts: a new place, the old heading, no fade, no sound, no line. The world
jumps and the player works out where they are from the buildings. Every death in the game has ended
in that jump, and the client's own handler for the moment was a bare `break`.

**What changed.**

- **The picture comes into focus rather than cutting**: the CRT comes up heavy and settles and the
  lens starts pulled in and opens out, over a second, with the cut itself a tear.
- **The CRT weight is a multiplier on the settings' own level**, not an absolute: a player who
  turned the CRT off gets a spawn-in with no grain in it, which is what they asked for. The post
  chain now keeps the setting and the boost apart and re-applies both.
- **It is said and heard**: `◆ BACK ON THE LEDGER · <district>` in the log, and a rising two-note
  under the CRT's hiss.
- `client/render/spawn.ts` is the rule, pure and unit-tested: the curve is eased out — steep at the
  start, flat at the end — exactly nothing at and after its second, and the edge that starts it is
  the one frame a dead file is alive again. Nothing touches the simulation or the aim.

**Proof.** `probe:tps` 34/34, two new, read on the frame that shows the file back: alive after 180 ticks, the aberration at 3.39e-3 on the first live frame and 1.60e-3 a second later, the lens at 73.8° opening to 80.0°, the spawn clock 0.03 s → 1.00 s; and the line `◆ BACK ON THE LEDGER · DRAINAGE YARD` with the cue heard exactly once.
`tests/spawn.test.ts` 5. 646 tests, build and typecheck clean.

Two mutations, each failing its own guard alone. With the curve returning nothing — the respawn a
cut again — the aberration reads 1.60e-3 on both frames and the lens 80.0° on both, and only the
focus check goes red while the line and the cue still land. With the client back to saying nothing
on the respawn, the picture still comes into focus and only "said and heard" goes red, at zero cues
and no line.

## Stage 95 — The desk was not a frame

**Goal.** The contracts desk, the fixer's terminal and the closing card are the campaign's frames —
the places the game stops being a firefight and becomes a conversation. Since Stage 10 the combat
chrome has gone on drawing straight through them. In the real frame the CLICK TO WAKE banner lies
across the crew invite, the weapon rack runs along the desk's foot, LEASE-BREAKER 30/30 sits over
the EXPLORE line, and the reticle hangs in the middle of a fixer's testimony. A frame with a gun's
ammo count printed over it is not a frame.

**What changed.**

- **A frame silences the chrome that has no business on it.** The desk and a card take everything
  but the status line; a terminal takes the gun, the tutorial and the arrows and keeps the objective
  and the map, because a terminal is usually the objective.
- **The gun comes back the moment the frame goes**, the timed closes included: every open and every
  close, the card's own timer among them, re-applies the rule from what is open right now.
- `client/hud/quiet.ts` is the rule, pure and unit-tested: which groups each modal silences, and
  the wider frame winning when two are open at once. The HUD toggles one `q-<group>` class per
  group on its root and the stylesheet does the hiding — the same shape as the `touch` and `safe`
  states it already had.

**Proof.** `probe:campaign` 36/36, three new, measured as geometry rather than as class names
alone: with the desk open no visible piece of chrome overlaps its box and the gun and the tutorial
are silenced; with a fixer's terminal open the same, with the objective line still showing; and
once the terminal resolves nothing is silenced and the ammo block is back. `tests/quiet.test.ts` 5.
641 tests, build and typecheck clean.

Two mutations, each failing its own guard alone. With the rule silencing nothing, the desk check
names the real intruders — `xh, mission, map, side, prompt, ammo` — and the terminal check names
`prompt, ammo`, while "the gun comes back" still passes. With the terminal's open path alone no
longer applying the rule, only the terminal check goes red, at `prompt, ammo` again.

The first run found two overlaps the frame had not shown me: `side`, the ONLINE / FPS diagnostics
readout, which really was sitting over the desk's right-hand column and is now silenced; and
`bottom`, the tab bar, which is the frame's own furniture — the CONTRACTS tab that opened the desk
and closes it — and is exempted the way the status line is.

## Stage 94 — The alt-fire sounded like the primary

**Goal.** Every alt-fire in the arsenal has sounded exactly like its primary. A choked slug barked
like the eight-pellet spread it replaced, a rail quickshot like the charged shot it is not, a sticky
like the phage round it is not — and choking the REPO HAMMER, which changes what the next trigger
pull does entirely, made no sound at all. The simulation has said which round it was since Stage 4:
the `fire` event carries `alt`, and the choke emits `altToggle`. The client dropped both on the
floor with a bare `break`.

**What changed.**

- **The slug, the quickshot and the sticky have voices of their own**: one deep round with a ring
  off the choke where the spread was eight; a snap where the charged shot is a howl; a thunk and a
  metallic tick as the charge leaves the tube armed.
- **The choke is heard racking on and off**, a two-part click pitched by which way it went.
- **An optic and a brace keep the primary's bark**: they change where the round goes, not what the
  gun is. `client/voice.ts` is the naming rule, pure and checked against the manifest so a new alt
  kind cannot slip through unnamed.
- The trigger pull names the round by *tick*, not by reading the weapon's state a frame later: the
  `fire` event arrives ahead of the shot events it produced, in the same tick, and the shot handler
  reads it back from there.

**Proof.** `probe:arsenal` 22/22, one new, heard through the audio's own cue counts: rack the choke
on, fire, rack it off, fire — `alt_on` and `alt_off` each once, the slug voice on the choked shots
and not on the spread's. `tests/voice.test.ts` 4, agreeing with the manifest about which alts are a
different round. 636 tests, build and typecheck clean.

Two mutations, each failing its own guard alone: with the alt flag dropped from the shot the slug
voice goes to 0 of 9 while both racks are still heard; with the rack made silent again the slug
voice stays and the racks go to 0 and 0.

The check took three tries to drive, all of them the harness and none the game: a fire step presses
nothing in its last twelve ticks, so a three-tick rack never pressed; and a fire step presses nothing
until its view has settled on its target, so a rack that was also asked to aim never pressed either.
The event trace — `swap, altToggle/on, fire/alt, altToggle/off, fire` — is what settled it, not a
fourth guess.

## Stage 93 — The charge at your feet

**Goal.** A frag lands beside you while you are looking the other way and the game says nothing at
all. The thing is drawn in the world — a small object on the ground, behind you, in the dark, in the
rain — and that is the whole warning. Four and a half metres of blast and a hundred damage arrive out
of a silence the player had no way to read. Everything needed to warn them has been on the client
since Stage 4: the wire carries every live projectile's kind and where it is, and what a kind does
when it goes off is a constant the rule reads out of the simulation itself.

**What changed.**

- **A live charge is pointed at**: an arrow at its bearing, pulled in and brightened as the blast
  owns more of the ground you are standing on, and red and pulsing once you are inside it.
- **It will not count down.** The fuse is not on the wire, so a countdown would be a guess dressed as
  a fact. What is honest — and what the mark says — is how close you are to the middle of a blast
  that is coming.
- **Smoke and EMP are left out**: they carry no damage, and a warning that cries for a smoke grenade
  is a warning nobody reads the next time. Whose charge it is does not come into it either — the
  wire does not say, and your own frag at your feet kills you exactly as dead.
- The blast comes from `createProjectile`, the simulation's own single answer for every kind, so a
  change to a blast moves the warning with it. An unknown kind is not a threat rather than a guessed
  one.

**Proof.** `probe:arsenal` 21/21, two new, read off the HUD after a frame that actually drew it: a
frag thrown four metres straight ahead puts the arrow up (−0.00 rad) at full brightness and marked
inside the blast, and a quarter turn to the right — yaw 0 looks toward −z, so yaw −π/2 looks east —
swings it to −1.58 rad, off the left shoulder, which is where a thing you were facing ends up.
`tests/threat.test.ts` 9 on the rule: the blast read out of the simulation, the reach, the fall from
1 to 0, the height of one on a roof, the bearing turning with the file, and the worst first. 632
tests, build and typecheck clean.

Two mutations, each failing its own guard alone: with the frag withheld from the warning both checks
lose the arrow; with the arrow no longer rotated only the direction check goes red.

Two things the first version of the check got wrong, both mine rather than the game's. It read the
HUD after a stopwatch rather than after a drawn frame, and photographed the frame before the one
with the arrow on it — the same fault as Stage 90, in a new place. And it expected a right turn to
swing the arrow right; turning right puts what was ahead of you on your left.

## Stage 92 — The map did not know where you were going

**Goal.** The campaign has put its objective in the world since Stage 10 — the place to reach, the
body to escort, the things to destroy — and the map in the corner has never drawn a single one of
them. Stage 88 taught that map the wake's nodes and fixed the rotation it had been getting wrong
since Stage 1; the contract was still invisible on it. Seven missions and a dozen gigs in which the
game says REACH THE ESCROW TERMINAL AT B and the player finds out which way that is by turning on
the spot.

**What changed.**

- **The contract is on the map**: the goal as a ring in the terminal's cyan, the escort in amber,
  each destroy target in magenta — through the same placement the nodes use, so one past the edge is
  pinned to the rim along its own bearing rather than clamped round a corner onto the wrong street.
- **And the objective line says how far**: `⌖ ESCROW TERMINAL AT B  33 M`. A distance is the
  difference between "go to the substation" and knowing whether to sprint there or take the long way
  round.
- **A closed contract comes off the map.** The marks are cleared when the mission completes or
  fails, so a finished goal does not hang there through the results card and into whatever is next.

**Proof.** `probe:campaign` 33/33, two new, asked of the map itself rather than of the code that
draws it: with the file looking straight at B the goal's mark sits 15.8 px above the middle and
within a pixel of the centre line, and after a quarter turn it swings 14.8 px to the right — which
is where a thing you were facing ends up when you turn left of it. And the objective line reads
`33 M` against a goal 33.0 m away. `tests/radar.test.ts` 11, four new on placement, rim pinning at a
heading that is not due north, and the kinds. 623 tests, build and typecheck clean.

Two mutations, each failing its own guard alone: with the goal withheld from the map the check finds
zero pixels of it at both headings; with the range dropped from the objective line only the distance
check goes red.

## Stage 91 — Every kill read the same

**Goal.** A headshot at forty metres with the last round in the magazine put up the same four words
as a point-blank baton swing. A training dummy in the range put up those same four words as another
file in a live match — KILL CONFIRMED, and a ledger line either way. The game knew better on both
counts the whole time: it has the zone, the range and the weapon of every round that lands, and it
has always known a dummy from a file.

**What changed.**

- **The receipt says what closed it**: under the stamp, the zone, the range and the weapon of the
  round that did it — `HEAD · 41 M · LEASE-BREAKER`.
- **And the range is not the ledger.** A target says TARGET DOWN in amber and takes no ledger line;
  a file says FILE CLOSED and does.
- **It only claims what it can know.** The server credits the kill without saying which round closed
  the file, so the client keeps the last round it actually landed on each body and names it only if
  it landed in the moment that body went down. A grenade that finishes someone shot ten seconds ago
  must not put a headshot on the receipt — there the line is simply absent, which is the honest
  answer. The book is keyed by kind *and* id, because a dummy's id and a file's id are the same
  small numbers in this simulation.

**Proof.** `probe` 15/15, two new: the receipt reads `BODY · 5.2 M · LEASE-BREAKER` and the range it
claims is checked against the killing round's own geometry — the shot event's `from` and `to` — to
within 0.6 m, not against a number typed into the check; and the dummy's receipt says TARGET DOWN
with no ledger line. `tests/kill.test.ts` 13 on the attribution, including the stale-hit case and the
dummy-versus-file collision. 619 tests, build and typecheck clean.

Three mutations, each failing its own guard alone: attributing a hit regardless of age fails three
unit tests; making every kill read KILL CONFIRMED again fails only the range check; dropping the
detail line fails only the receipt check.

## Stage 90 — The check waited for a stopwatch and assumed a hit

**Goal.** Run #118 went red on both of Stage 89's new checks. They were right to fail: nothing had
lit. But nothing had been *shot*, either — ALPHA spent the whole twelve-second window firing at a
file that had died twice since the engagement ended and respawned at (15.0, 19.7), across the yard
and out of the only lane in the level where the two of them can see each other. The checks measured
a feature that was never exercised.

This is the sixth time this session a check has waited for one thing and assumed another, and the
first time it has cost a red run on work that was correct.

**What changed.**

- **The window waits for a round to land, not for a stopwatch.** It puts BRAVO back in the lane the
  way the engagement loop does — along the nav mesh, re-pathed whenever it strays — and closes as
  soon as the shooter's own tally of server-confirmed hits has moved.
- **The sample is its own check.** "Rounds landed on BRAVO while ALPHA was rendering" passes or
  fails separately from what the body did, so a run where nothing was fired can no longer read as
  the feature being broken. Under the reverted feature it now reads: 34 of 49 rounds landed, and
  only the two body checks go red.
- **The count comes from the shooter, not the room.** Under a 3× CPU throttle the room's per-client
  record went missing from a single `/stats` reply and the delta came back **−29** while the body
  was lighting perfectly. The client's own `myHits` only ever goes up.
- **Only ALPHA renders during the window.** Both pages drawing SwiftShader for half a minute on a
  throttled box dropped BRAVO's socket out of the room in two of five runs at CPU=2 — ALPHA left
  online, synced, drawing, with `remotes: 0` and nothing to shoot at. BRAVO now stays dark until its
  own screenshot.
- **And the failure says which of the two it was.** The check prints what ALPHA could see when the
  window closed — online, synced, its draw calls, and where it had BRAVO — because this check can
  only fail through the link or through the driver, and a bare count says neither.

**Proof.** `probe:net` 22/22 (one new), and 22/22 on all three runs at `CPU=3`, closing the window in 3.2–5.7 s
where it used to burn the full thirty. The Stage 89 mutation re-run against the repaired harness now
separates cleanly: the sample check passes at 34 of 49 rounds landed while both body checks fail. No
game code changed in this stage.

## Stage 89 — Nothing happened when you hit them

**Goal.** A shot that hit a body looked exactly like a shot that hit nothing. The impact spark was
drawn for world hits only, so a round into another file's chest ended in mid-air; the body did not
light, did not flinch, and over the wire did not so much as blink. The one exception was a training
dummy, which flashed. In the mode the whole game is built around, the entire confirmation that a
round landed on a player was a sound on the shooter's own client — and every bystander watching a
firefight across the street saw two people pointing lights at each other.

The pose rig has been able to take a hit since Stage 74: `hurt` and `hurtFrom` bend the chest and
turn the head away from whatever arrived. Only the local file was ever given them. Every remote body
in the game's history has been posed with `hurt: 0` on every frame of its life.

**What changed.**

- **A hit lands on the body it hit**: a spark at the impact point, sized by what the round was worth,
  and the body lit above its resting glow — on another file, on a dummy, on a wasp or a mech.
- **And the body bends away from the muzzle**, at last using the flinch the rig has carried unused
  for fifteen stages, by the same bearing rule `takeHit` uses for the local file.
- **Every client runs it, for every shot in the room**, not only for its own: a firefight across the
  street reads as rounds landing rather than as lights going off.
- The read is the simulation's own arithmetic — `client/hit.ts` shares the server's `falloff` curve
  and the weapon's own zone multipliers — so it cannot drift from the shot. It is what the round was
  *worth*, never a claim about what the victim has left: the client is not told anyone else's
  integrity and this does not guess at it.
- The fade is by elapsed time. The dummies' flash had been stepped by a fixed amount **per frame**
  since Stage 1, which makes a hit linger four times as long on a phone as on a desktop — the same
  mistake Stage 85 found in the node clock, in the other direction.

**Proof.** `probe:net` 21/21, two new, read off ALPHA's own view of BRAVO while ALPHA is drawing and
still firing: the cloak peaks at 1.056 against a resting 0.025 and comes back to rest afterwards, and
at the hardest flinch the body bends from a bearing **0.01 rad** off the one ALPHA was standing on,
twenty metres away. `tests/hit.test.ts` 11 — the damage half checked against the simulation's own
expression over every weapon at five distances and three zones, not against numbers typed into the
test. `probe:body` 20/20, `probe:tps` 32/32, `probe:wake` 19/19, `probe` 13/13, `smoke` 7/7, 606
tests, build and typecheck clean.

Both guards mutation-checked, and they fail for their own separate reasons: with the player branch
taken out the body stays at 0.025 over 1166 samples and both checks go red; with the impact bearing
reversed the light still peaks at 1.056 and only the direction check fails, at 3.13 rad out.

## Stage 88 — The map was turning the wrong way

**Goal.** The map in the corner has drawn two things since the first stage: the dummies, and the file
at its middle. In THE WAKE — the mode the game is named for — it has never drawn the nodes. The strip
at the top says who holds each of the eight and says nothing about where they are, so a player
crossing the yard with a node coming free has no way to know which way to run.

Building that turned up something worse.

**What changed.**

- **The map draws the nodes**: a disc per node in its owner's colour — VANTAGE's violet, each cell's,
  amber while contested — with its label, a ring around the one being pulled, and anything past the
  edge pinned to the rim *along its own bearing* rather than clamped per axis, which would slide it
  round the corner and point at a street the node is not on.
- **And the map turns the right way now.** It had been rotating by `+yaw` where the file's own basis
  is `−yaw`, so at every heading but due north and due south the marks were mirrored through the
  forward axis: facing west put what was behind you at the top of the map. That has been wrong since
  Stage 1 and nothing caught it, because the only thing the map drew was dummies and no check ever
  asked where a dummy appeared. Both the nodes and the dummies go through `toMap` now, which is the
  file's own `yawRight` and `viewDir`.

**Proof.** `probe:wake` 19/19 — one new, reading the map's own pixels: a node ten metres east of the
file is 6 px to the right of the middle while the file looks north, and 6 px *above* the middle when
it turns to look east, in the cell's green rather than the dummies' amber. `tests/radar.test.ts` 7 on
the placement rule. `probe:look` 18/18, `probe:city` 45/45, `probe:tps` 32/32, `probe:identity`
25/25, `probe:campaign` 31/31, `probe:mobile` 14/14, `smoke` 7/7, 595 tests, build and typecheck
clean.

**And the check needed sharpening before it was worth anything.** The first version of it stood the
file due south of a node, looked north, then turned round to look south — the two headings at which
the old transform and the right one agree exactly. It passed with the rotation reverted *and* with
the nodes not drawn at all, because the pixel it found was a dummy's amber. It now looks north and
then east, where a map turning the wrong way puts the node below instead of above, and it will only
accept the cell's green. Both mutations fail it: the old rotation finds nothing above the middle
looking east, and drawing no nodes finds nothing at all.

## Stage 87 — The KERNEL is coming

**Goal.** VANTAGE brakes the wake on a fixed cadence: every seventy-five seconds of the round it
takes half the hold off whichever node is held most weakly, and re-leases it outright if that empties
it. The game announced this *after* it happened — a banner, a sting, a node already gone. A scheduled
threat you cannot see coming is not a threat, it is weather.

**What changed.**

- **The strip counts down to it**, beside the score: `KERNEL 0:47`, in VANTAGE's violet, turning
  amber with a mark under ten seconds. A player can now be standing on the weak node when it lands.
- **Nothing new goes on the wire.** The cadence is fixed and the round clock is already sent, so one
  mark — the clock reading at the round's start, or at the last pulse the client actually saw — places
  every pulse after it exactly. `kernelIn` in `client/hud/node.ts` is that arithmetic, on a clock that
  runs backwards.
- **A stale mark says nothing rather than lying.** If a pulse goes by unseen (a dropped event, a
  join mid-round), the countdown would be counting to a moment that has passed, so it hides until the
  next pulse re-marks it.

**Proof.** `probe:wake` 17/17 — one new: after a pulse lands, the strip reads `KERNEL 0:47`, and the
next pulse comes **47.2 s later** — 0.18 s out, which is the second the readout truncates.
`tests/node.test.ts` 13 (three new on the countdown, including the stale mark and the moment itself).
`probe:net` 19/19, `probe:campaign` 31/31, `probe:run` 18/18, `probe:mobile` 14/14, `smoke` 7/7, 588
tests, build and typecheck clean. Two guards mutation-checked: the pulse leaving no mark (no countdown
at all) and the cadence set wrong (17 s against 47.2 s).

## Stage 86 — Sixty hertz of the time it was given

**Goal.** Run #114 went red on the oldest check in the repository: *fixed-timestep sim runs at 60 Hz
independent of render fps*. It read `47.9 ticks/s over 2.01s while rendering at 8.4 fps`.

**What changed.** The check, not the loop. The loop's rule has always been a fixed timestep **with
long hitches dropped rather than simulated**: a frame that takes more than half a second is a tab
switch or a stall, and simulating it would fire half a second of the game in one go. On a loaded
runner at eight frames a second, some frames cross that line, the loop drops them by design, and the
sim's tick count over wall time falls below sixty — which the check called a failure of the timestep
when it was the drop rule doing exactly what it says.

The claim is now stated as the loop actually makes it: sixty hertz for every second it was *given*.
The check reads the loop's own `droppedTime` at both ends and measures against the wall clock minus
what was dropped — and requires the dropping to stay the exception, under a third of the window,
because a loop that dropped most of a window and ran the rest at sixty has not shown anything.

**Proof.** `npm run probe` 13/13 — `60.4 ticks/s over 2.00s of 2.00s (0.00s dropped as hitches)
while rendering at 30.6 fps` here, where CI's slower runner will now account for its hitches instead
of failing on them. Two guards mutation-checked, and the second is the reason the bound is there:
capping the catch-up at one tick a frame reads 20.5 Hz and fails, and dropping everything past a
hundredth of a second reads a perfect 60.0 Hz — over 0.35 s of a 2.00 s window — and fails on the
drop bound. 585 tests, typecheck clean. No game code changed.

## Stage 85 — The node under your feet

**Goal.** The wake strip at the top of the screen says who holds each of the eight nodes, in eight
hexes the size of a word. Standing on one, a player needs the other question answered — is this going
my way, and how long until it turns — and nothing said. The hold moved a hex's colour at the top of
the screen and that was the whole readout, in the mode the game is named for.

**What changed.**

- **A line under the strip for the node you are on**, or walking up to: which node, who holds it, how
  far the pull has got, and the countdown — `NODE B · VANTAGE ▮▮▮▮▯ CELL ONE PULLING · FLIP IN 1.7s`.
  It colours itself by whose way it is going and says `CONTESTED` when both cells are on it, which in
  this simulation means nothing is moving at all.
- **The countdown is measured, not modelled.** `client/hud/node.ts` watches the hold the server is
  publishing and measures how fast it is moving. That is exact whatever the reason — extra files on
  it, the spread bonus from the nodes next door, a phage burst, a mastery multiplier — and needs
  nothing new on the wire, which matters because the wire does not carry other files' cells at all.
- **Measured against the simulation's clock, not the frame's.** A hold moves per tick; dividing by
  the frame time reads ten times too slow on a machine that draws several frames per tick, which is
  exactly what the first version did (the check caught it: 17.0 s for a flip that took 1.7 s).
- **A node changing hands starts the measurement again**, or the first moment of a new owner's hold
  carries the old owner's rate and the line reads `FLIP IN 0.0s` on a node that has just flipped.
- The simulation's flip rate is now one exported function, `flipRate`, which `stepWake` calls. The
  readout does not use it — it measures instead — but the formula having one home is the point.

**Proof.** `probe:wake` 16/16 — one new, and it is the claim itself: with a file pulling node B, the
HUD says `FLIP IN 1.7s` at 0.72 hold, and the flip then takes 1.7 s — **0.00 s out** —
with `stage5-nodefoot.png` taken while the countdown is live rather than after it. `tests/node.test.ts`
10. `probe:tps` 32/32, `probe:net` 19/19, `probe:run` 18/18, `probe:campaign` 31/31, `probe:mobile`
14/14, `smoke` 7/7, 585 tests, build and typecheck clean. Two guards mutation-checked: the frame
clock put back (18.2 s against 1.7 s) and the panel never fed (no line at all).

## Stage 84 — Two checks that started somewhere else

**Goal.** Runs #110 and #111 were red on two different probes, and one of them is a regression I
wrote in Stage 75.

**What changed.**

- **The slide gets its run-up back.** Stage 75 stopped the body probe's sway section as soon as the
  hem settled instead of waiting for its bot script to finish — which fixed a thirty-second wait and
  left the file standing wherever that happened rather than back where the walk started. When that
  spot falls inside the slide section's own `goto` radius, the goto completes instantly, the slide
  fires from a standstill, and there is no slide: CI read `no slide frame sampled — stances seen:
  crouch,stand · top speed 2.6` (crouch pace) twice. The section puts the file back at the start
  before the run-up now. The failure reproduces exactly by dropping the file on the slide's target
  first — same message, to the word — and the fix passes from that same adversarial start.
- **The chain-down check waits for both files.** It asks for two settlements in the room, and waited
  for ALPHA's and then four hundred milliseconds. On a fast machine the second lands after that
  pause, so the check read one settlement and failed a room that was working perfectly. It waits for
  the count it is checking.

**Proof.** `probe:body` 20/20 (and 20/20 from the start position that used to break it, against
18/20 without the fix), `probe:counter` 16/16 with `settlements 2`, 575 tests, both typechecks
clean. No game code changed.

Both are the same mistake in different clothes, and it is the one this series keeps meeting: a check
that waits for one thing and then assumes another. The first waited for the hem and assumed the
position; the second waited for one file and assumed the other.

## Stage 83 — The file that closed you

**Goal.** Dying was one line that named nobody. The camera went on looking wherever your hand had
left it — often at the wall you were backing into — and who did it, and from where, was a question
for the kill feed. Stage 74 gave being shot a direction; a death is the shot that mattered most and
had none.

**What changed.**

- **The camera turns onto whatever closed the file.** `lookYawPitch` in `client/render/feel.ts` is
  the rule — the yaw and pitch that look from one point at another, in the simulation's own
  convention — and the renderer eases onto it with a smoothstep over about a second, so it starts
  and ends still. The body keeps the facing it fell with; this is the camera's turn, not the
  corpse's.
- **The line says who.** `◆ FILE CLOSED BY VANTAGE-04 · 12 m — RE-LEASING IN 3s`, resolved from the
  wire's remote views online and the world's own cast offline, with the distance.
- **A death with nobody to name holds the look it had** — a fall, a hazard, your own grenade — and
  a file back on the ledger has its camera back on the next frame.
- The offline path had no death line at all: `case "death"` was a no-op in the simulation's own
  event handler, so a campaign death printed nothing. Both paths go through one place now.

**Proof.** `probe:tps` 32/32 — two new: another file closes this one from twelve metres behind it,
the camera is 3.14 rad from the killer when the shot lands and 0.000 rad off it when the swing
settles, with the line naming VANTAGE-04 and `stage60-closed.png` as the picture; and a re-leased
file's camera follows its aim again within a fiftieth of a radian. `tests/feel.test.ts` 9 (three new
on the look itself). `probe:body` 20/20, `probe:net` 19/19, `probe:campaign` 31/31,
`probe:identity` 25/25, `probe:wake` 14/14, `probe:mobile` 14/14, `smoke` 7/7, 575 tests, build and
typecheck clean. Three guards mutation-checked: the swing unwired (3.139 rad off), the killer never
named (the line loses the name and the camera never turns), and the alive test dropped from the
camera's early return, which leaves a re-leased file staring at where it died.

A note on the picture: the killer in it is a file the probe added to the offline world to be the
attacker, and the offline renderer draws only the local body — so the street the camera turns to
look down is empty. The angle is the claim; the emptiness is the probe's construction, not the
game's.

## Stage 82 — A rejoin is not a pause

**Goal.** Run #108 went red on `probe:net`, on a check nothing in Stage 79 touched: *rejoin restores
the same file and state*. The numbers it printed were `kills 6→7`.

**What changed.** The check read ALPHA's kill count, *then* stopped its bot, then pulled the link.
The engagement is still running at that point, so in the round trip between the two calls ALPHA
landed one more kill — and the check, which asserted the count was unchanged across the reconnect,
called that a failure. It was asserting that the match paused while the link came back, which it
does not and should not.

The bot stops first now, and the probe waits for whatever is already in flight to land before
reading the counters. The claim is also stated properly: the file survives the link, so the id and
the token must be identical and the kill count may only ever go *up* — and it has to have something
in it for that to mean anything, which the check now requires too.

**Proof.** `probe:net` 19/19, and the guard still has teeth: with the room's rejoin-by-token branch
disabled, the reconnecting client comes back as a different file — `id 1→3, kills 3→0`, three
players in a two-player room, no inputs applied — and the check fails. 572 tests, typecheck clean.
No game code changed.

## Stage 81 — The loudest thing in the street

**Goal.** Stage 80 gave the street footsteps, which raised the question of what the street already
did with the loudest sound in it. Two answers, both wrong. Online, every shot in the room arrived at
the same volume from nowhere in particular: a rail fired sixty metres away sounded exactly like one
at your shoulder, which is worse than silence for working out where the danger is. Offline, against
VANTAGE, another file's gun made no sound at all — only your own and a wasp's did.

**What changed.**

- **`client/gunfire.ts` is the rule**, pure and unit-tested: how loud a shot is from where you are
  standing (falling off more slowly than a footstep — a gunshot is still worth hearing at the far
  end of a district, and nothing past a hundred and twenty metres), which side it is on, and two
  things that are not volume at all. **Sound takes time**: a shot from ninety metres arrives a
  quarter of a second after its flash. And **distance eats the top of a crack** long before it eats
  the body of it, so a far shot is a dull thump where a near one is a snap.
- **A muzzle at arm's length is not a hard-left sound.** Under four metres the pan eases back toward
  the middle, because a gun that close is all around you.
- **Both paths go through it** — the wire's events and the offline simulation's — so the campaign's
  AI files are as audible as a player, and the wasp's own shot gets a position too.
- The bearing is `hud/damage.ts`'s, as the wedges' and the footsteps' are: one answer in this client
  to "where is that, relative to where I am looking", and it reads the live mouse angle when the
  pointer is locked, for the reason Stage 73 gives.

**Proof.** `probe:net` 19/19 — one new, on two real clients over a lossy 150 ms link: BRAVO stands
eleven metres to ALPHA's right and fires past it, and ALPHA hears four shots at pan 1.00, arriving
33 ms behind the flash, which is what sound covers 11.3 m in. `tests/gunfire.test.ts` 6 on the rule.
`probe:tps` 29/29, `probe:arsenal` 19/19, `probe:campaign` 31/31, `probe:wake` 14/14, `smoke` 7/7,
572 tests, build and typecheck clean. Five guards mutation-checked: the pan negated, the travel time
removed, the range removed, the near-pan ease removed, and the wiring reverted to the old
everywhere-at-once shot (the check reads zero).

**And a check that was measuring the wrong thing, again.** Stage 80's earshot check required the
walking file's *slowest* sampled speed to clear a floor. It paces between waypoints and slows for a
tick at each turn, so the check was really asking where the turn landed — it went red on a correct
tree one run later. It counts the samples in which the file was walking now, and asks for all but
four of them.

## Stage 80 — The street has other footsteps

**Goal.** The file has heard its own boots since the first stage and nobody else's. Another player
could cross the street behind it at seven metres a second in silence. Stage 74 gave being shot a
direction; this is the half that comes before it — the sound that says someone is there at all, and
roughly where, while there is still time to turn around.

**What changed.**

- **`client/steps.ts` is the rule**, pure and audio-free: which steps land this tick (on a stride
  the body walks, not on a timer), how loud (falling off with the square of the distance, nothing
  past twenty-six metres), and which side they are on. A body that is standing, airborne, sliding,
  mantling or dead makes none, and one that stops mid-stride does not bank a step to fire the
  moment it moves again.
- **Crouching is quiet** — thirty per cent, on a shorter stride — so moving slowly is a real choice
  rather than a slower way to arrive.
- **The bearing is `hud/damage.ts`'s**, the same rule the damage wedges use: one answer in this
  client to "where is that, relative to where I am looking". The listener's look is the live mouse
  angle when the pointer is locked, for the same reason the reticle is (Stage 73).
- The wire already carried everything this needs — position, velocity, footing, stance — so nothing
  new is sent, and the simulation is untouched.

**Proof.** `probe:net` 18/18 — two new, on two real clients over a lossy 150 ms link: a file walking
the length of ALPHA's right-hand side is heard six times out of six *from the right* (pans 0.85 down
to 0.61 as it passes), and the same file pacing thirty metres out at no less than 2.1 m/s is heard
zero times. `tests/steps.test.ts` 8 on the rule. `probe:tps` 29/29, `probe:body` 20/20,
`probe:arsenal` 19/19, `probe:campaign` 31/31, `probe:identity` 25/25, `probe:mobile` 14/14,
`probe:frame` 6/6, `smoke` 7/7, 566 tests, build and typecheck clean.

Five guards mutation-checked — and one of them mattered: the earshot check as first written let
BRAVO walk out to thirty metres and *stop*, so it passed with the range rule removed entirely. A
body that has stopped is silent at any distance. It now measures while BRAVO paces, and records the
slowest it was seen moving, so the silence is the range and not the legs. The others: the pan
negated (six of six on the wrong side), the crouch made as loud as a walk, the crouch's stride made
as long as a walk's, and a stop made to bank its stride.

## Stage 79 — The camera has a body

**Goal.** Keep looking at the frames. The legs have compressed on landing since Stage 63 and the
camera took none of it: a drop off the gantry ended with the view perfectly level, which reads as the
ground arriving rather than the file arriving. And the slide — which rolls the first-person view by a
fixed amount the moment it starts, and snaps it back the moment it ends — rolled the camera behind
the body not at all.

**What changed.**

- **A landing lands.** `client/render/feel.ts` is the rule: how hard the touchdown was, from the
  downward speed on the frame *before* it (on the frame itself the simulation has already stopped
  the file), and the shape of the dip — twenty per cent of it down, the rest standing back up, zero
  at both ends, twenty-two centimetres at the hardest. A jump on the flat is worth about a third of
  that; a step off a kerb is worth nothing, which is the point: a camera that lurched every time the
  file left a kerb would be worse than one that never moved.
- **Both views take it**, and the camera behind the body leans into a slide the way the eye always
  did — eased in and out now, rather than snapping on with the stance.
- The reticle is projected through the camera *after* all of it, so the mark stays on the ray it
  claims through the whole dip.

**Proof.** `probe:tps` 29/29 — three new: a nine-metre drop puts 0.149 m in the camera (0.059 m
below the anchor the shoulder cast put it on) and is level again ten frames later; a 0.35 m step puts
0.000 m in it; a slide leans the view 0.050 rad across ninety frames and comes back level.
`tests/feel.test.ts` 6 on the rules themselves. `probe:body` 20/20, `probe:look` 18/18, `probe:city`
45/45, `probe:cityLife` 19/19, `probe:frame` 6/6, `probe:mobile` 14/14, `probe:crawl` 10/10, `smoke`
7/7, 558 tests, build and typecheck clean. Three guards mutation-checked: the dip removed (0.000 m
on the drop), the lean removed (0.000 rad through ninety frames of sliding), and the floor dropped to
zero — which makes the kerb a landing and fails the check that says it is not.

## Stage 78 — The round that falls

**Goal.** The last item from the camera review's deferred list, and the one a player meets every time
they pick up the launcher: the reticle marked the end of a straight ray for every weapon. That is the
truth for a bullet and a lie for a round that arcs. The phage leaves at forty metres a second under
twelve of gravity, so at sixteen metres it is already sixteen pixels under the mark, and lobbed over
a wall it lands somewhere the reticle never pointed at.

**What changed.**

- **A new pure module, `client/render/ballistic.ts`.** `arcPoint` walks the arc the simulation
  integrates — the same launch (direction times speed, plus half the file's ground speed and a third
  of its climb), the same Euler step at the simulation's own tick, the same order of tests, bodies
  before boxes — and returns where the round stops, how long it was in the air, and whether it
  stopped on a body. When the fuse runs out first it says so and marks where it bursts, because a
  round thrown over a roof at a steep angle really does go off in the air.
- **Both views mark it.** Third person casts the arc instead of the ray; first person, whose
  crosshair is pinned to the centre of the screen because the eye's ray is, now projects the same
  landing point. Stage 76's rule holds: the two views are one game.
- **And the mark says what it is** — a ring where the round lands rather than a cross where the
  weapon is pointed, so a mark that arrives a second later on a curve does not claim to be a bullet.

**Proof.** `probe:tps` 26/26 — three new: the launcher's mark sits on the end of its own arc and
15.7 px below the straight ray at sixteen metres with the ring on the HUD; *firing it puts the burst
0.30 m from the mark* (a straight-ray mark is 6.11 m out, which is what the mutation reads); and a
rifle gets the ray's mark back. `stage60-arc.png` is the ring sitting on the burst. `tests/ballistic.test.ts`
9: no gravity is the straight ray, the drop matches half g t squared, a lob lands on the ground, a
high lob burns its fuse in the air, a body stops it, a body behind cover in the same step of the walk
does not, the shooter's own speed is carried, and the whole trace matches a hand-stepped Euler walk.
`probe:arsenal` 19/19, `probe:campaign` 31/31, `probe:body` 20/20, `probe:frame` 6/6, `probe:mobile`
14/14, `smoke` 7/7, 552 tests, build and typecheck clean. Four guards mutation-checked: the ray put
back for the launcher, the shooter's carried speed removed, the fuse removed, and a body left marked
when a box is nearer in the same step.

## Stage 77 — Sprinting reads as speed

**Goal.** Another look at real frames rather than at checks. Holding sprint down the middle of the
drainage yard looked exactly like walking down it: the same lens, the same framing, the hem dragging
and nothing else. The number in the corner said 7.2 m/s and the picture said nothing.

**What changed.**

- **The lens widens with the speed.** `speedPush` in `client/render/tps.ts` is the rule, pure and
  unit-tested: nothing at a walk, one at a sprint, and up to one and a half in a slide, because a
  slide is faster than a sprint and should read as faster. Seven degrees of field of view at a full
  sprint. It eases in at five a second and back out at three, so the street opens as the file
  accelerates rather than snapping, and closes as it stops.
- **The camera drifts back with it**, thirty-five centimetres at a sprint, along the same segment
  the wall cast produced — so a sprint into a doorway still pulls in immediately, the way it did.
- **Down the sights, none of it happens.** Sights are a promise about the framing and a
  magnification that widened as you ran would be a scope that lies. `speedPush` returns zero for any
  zoom, at any speed.

The reticle is projected through the camera *after* the lens moves (Stage 66's ordering), so it
stays on the ray it marks through the whole ease — the `probe:tps` reticle checks run unchanged.

**Proof.** `probe:tps` 22/22 — two new: the lens goes 79.9° → 86.9° and the camera 2.95 m → 3.34 m
while sprinting at 7.2 m/s and both come back when it stops, with `stage60-sprint.png` taken mid-run
(the probe drives the simulation by hand, so between two advances the file is frozen at speed and
the HUD in the picture reads 7.2 m/s) — `tests/tps.test.ts` 14 (three new on the rule itself),
`probe:look` 18/18, `probe:city` 45/45, `probe:cityLife` 19/19, `probe:body` 20/20, `probe:frame`
6/6, `probe:mobile` 14/14, `probe:arsenal` 19/19, `smoke` 7/7, 543 tests, build and typecheck clean.
Four guards mutation-checked: the widening removed (the lens reads 80.0° at a sprint), the drift
removed (3.00 m), the sights' exemption removed, and the slide capped at a sprint — each fails the
check that claims it.

## Stage 76 — One weapon, not two

**Goal.** The adversarial review of the camera and presentation work finished: eighty-four agents,
five lenses finding and three skeptics verifying each finding, twenty-six raised and seven surviving.
Five of the seven were the ones Stage 73 had already fixed, reported twice over by different lenses —
the unsmoothed shoulder, the reticle on the simulation's tick, the filament going out with the body.
These are the two that were left, and they are the same mistake in two places: a thing written for
the camera's own space kept its camera-space behaviour after being moved into the world.

**What changed.**

- **The reticle carries the recoil the camera carries, and not the pattern.** Recoil is split sixty
  forty (`RECOIL_VIEW_SHARE`): sixty per cent moves the view, and the forty the simulation adds to
  the shot on top of that is the pattern — the climb a player learns by watching where the tracers
  go. Stage 66 built the third-person reticle from `yaw + kickYaw + patX`, which is exactly the
  direction the shot leaves along, so in third person the pattern was solved and in first person it
  still had to be learned. The same weapon had two skill floors depending on a camera setting. The
  reticle is cast along the camera's own aim now, which is what a first-person crosshair marks.
- **The filament stops being an overlay when it stops being on the camera.** Its strands are drawn
  with `depthTest: false`, which is right for geometry parented to the camera and painted over the
  first-person weapon. Stage 69 hung that same group on the body's hand, three metres out in world
  space, where ignoring depth paints it through whatever wall is between the body and the camera.
  The test flips with the host. The material also stops writing depth, which an additive overlay
  should never have done.

**Proof.** `probe:tps` 20/20 (the recoil check is now two: mid-burst the reticle is 10.5 px off the
shot the pattern bends and on the camera's ray, and with a burst's kick put on the weapon by hand it
moves 20 px off the bare aim with it; both filament checks now read the depth state), `probe:body`
20/20, `probe:campaign` 31/31, `probe:arsenal` 19/19, `smoke` 7/7, 540 tests, build and typecheck
clean. Both guards mutation-checked: the pattern added back to the aim puts the reticle on the shot
and 10.4 px off the camera's ray, and the depth test inverted fails both filament checks.

## Stage 75 — Two waits that measured the machine

**Goal.** Run #102 was red on two checks, in two probes, for the same reason each time: a wait whose
length is set by how fast the machine draws rather than by the state it is waiting for. Both had
survived on this box precisely because it is slow.

**What changed.**

- **The Debt picture waits for the paint, not for the class.** `.debt.on` is set the instant the
  banner is raised, and the class runs a half-second four-step reveal whose first step holds opacity
  at zero for 125 ms. The watch tested the class; the shutter tests computed opacity. On a runner
  that round-trips in twenty milliseconds the class was true and the panel still invisible, so the
  picture was of nothing; here a round trip is longer than the first step, so it passed. The watch
  now tests opacity, the way the dossier's and the rite's watches already did.
- **The body probe stops the run it is finished with.** The sprint sampling ends as soon as the hem
  settles — Stage 68's fix for the opposite failure — which on a fast machine is a fraction of a
  second into a bot script whose two `goto` steps can run 900 ticks each. Waiting for that script to
  reach its `hold` is waiting up to thirty seconds, and thirty seconds is exactly what the wait
  allowed. It sets the bot to hold and waits for the body to actually be standing, which is the
  state the next section measures from.

**Proof.** `probe:identity` 25/25 and `probe:body` 20/20 with the fixes, 540 tests and typecheck
clean. No game code changed: both are checks that were measuring the runner.

## Stage 74 — Getting shot has a direction

**Goal.** Look at the real frames rather than the checks. Taking a hit produced a sound, a red
number on the integrity bar and nothing else: no way to know which way to turn. Third person widened
what is visible and did nothing at all for what is not — half the street is still behind the camera,
and being shot from it was a guess.

**What changed.**

- **A hit is a bearing, and the HUD draws it.** Four wedges on a ring around the reticle, each
  rotated to where the shot came from relative to where the camera is looking, faded over 1.4 s and
  widened by how hard the hit landed. They are CSS arcs — a conic gradient through a radial mask —
  so the indicator costs no draw call and nothing in the frame budget. The maths is
  `client/hud/damage.ts`, pure and three-free; the HUD only draws the answer, and the bearing is
  recomputed every frame against the live look, so turning toward a shooter walks the wedge to the
  top of the ring.
- **The wire carries the attacker.** The hurt effect's position fields had been three zeros since
  the protocol was written. They carry the attacker's position now — a player, a dummy, a wasp, a
  mech — with no change to the message's shape or size. All zeros still means the room could not
  name a source, a fall or a hazard, and there is no direction to point at.
- **The body flinches away from it.** The pose takes `hurt` and `hurtFrom` and shoves the chest and
  head back, unblended, swinging the shoulder away from the bearing: a flinch that eases in is not a
  flinch. It decays over about a third of a second, and the rest pose is exactly where it was.

**Proof.** `probe:tps` 19/19 (one new: a wedge points at whatever hit the player, from behind and
from the right, at two different facings, with `stage60-hit.png` as its artifact), `probe:body`
20/20, `probe:net` 16/16, `probe:identity` 25/25, `probe:mobile` 14/14, `probe:frame` 6/6,
`probe:look` 18/18, `smoke` 7/7, 540 tests, build and typecheck clean. Six guards mutation-checked:
the bearing negated (the screen and the sim run opposite ways round), the fade removed, the cap
removed, the flinch's swing removed, the flinch left permanently on, and the wire's attacker
position put back to zeros — each fails the check that claims it. The HUD wiring is mutation-checked
through the probe: with `setDamage` unwired, the wedge check reports none.

## Stage 73 — The reticle the mouse is holding

**Goal.** A fresh adversarial review of the camera and presentation work (five lenses, three
skeptics each) found something no check in this repository could have caught, because no check ever
drives the path it lives on: a bot never locks the pointer.

**What changed.**

- **The reticle follows the live look.** With the pointer locked the camera is drawn along the live
  mouse angles rather than the simulation's last tick, because mouse look has to feel immediate.
  The reticle was left on the simulation's angles, so through every flick it trailed the camera —
  eighty-two pixels at a quarter-turn, on the only path where the two can disagree. A bot drives the
  other branch, so every probe in the suite passed while a player would have seen it in the first
  second of play. The check for it locks the pointer itself.
- **The reticle reaches as far as the weapon does.** It cast a fixed eighty metres for everything.
  The stack SMG's rounds die at thirty, so it marked bodies twice as far as the shot could travel;
  the rail reaches two hundred and sixty, so it stopped short of what the shot would hit; a melee
  weapon reaches 1.6 m and the mark was down the street. The cast now ends at the weapon's own
  range.
- **The filament falls back with the light.** Stage 69 moved the muzzle flash to the camera when the
  body is not drawn and left the Kernel's strands hosted on the body's hand, so they went out with
  it. Both follow the weapon being drawn now.
- **The shoulder eases.** The anchor is a cast result, and a wall it clears returns it 0.78 m
  sideways in a single frame. It eases back out the way the distance does: immediate when a wall
  takes it, smooth when the wall is gone.
- **The stun roll is part of the camera the reticle is projected through**, rather than applied
  after the projection.

**Proof.** `probe:tps` 17/17 (one new: with the pointer locked the reticle is on the live ray and
eighty-two pixels from the simulation's), `tests/tps.test.ts` 11 (one new: the aim reaches as far as
the weapon and no further, for an SMG, a rail and a fist), `probe:body` 20/20, `probe:net` 16/16,
`probe:arsenal` 19/19, `probe:city` 45/45, `probe:frame` 6/6, `probe:mobile` 14/14, `smoke` 7/7, 530
tests, build and typecheck clean. Both wiring guards mutation-checked: the reticle left on the
simulation's tick lands 99 px away, and the filament hosted on the view rather than on the body
being drawn stays on the hand while the body is hidden.

**Open.** A projectile weapon's round arcs under gravity and the reticle marks a straight ray, so
for the launcher the mark is where the round is pointed rather than where it lands. That is a
ballistic trace and a stage of its own.

## Stage 72 — The HUD holds still for the photograph

**Goal.** Runs #99 and #100 were red on three checks between them, all of the same shape: a panel
that lives for a second or two of the HUD's own clock, and a probe reaching in from outside that
spends fifty to two hundred milliseconds per round trip. Polling faster does not fix a race whose
window is shorter than the poll.

**What changed.**

- **The HUD's flash panels can be held open.** `setFlashHold` stops the three flash timers — the
  pre-match dossier, the Debt banner, the Chapter rite — from expiring. The panel and its text are
  the real ones, raised by the real event; only the expiry waits for the shutter. The probe holds
  the panels before the round starts, photographs the dossier and the Debt banner when they come up,
  and lets go.
- **The panels count their raisings.** A check that polls can miss a panel; a counter cannot. The
  dossier's check now also asserts it was raised, whatever the shutter caught.
- **The Debt picture must be the banner it is named for.** The watch matched any Debt banner, so the
  artifact could have been the OWED banner from the round before. It matches the cleared text now.
- **The sway check waits for the hem to settle.** It sampled eight sprinting frames, which on a
  machine that draws quickly is a tenth of a second — a quarter of the way through an ease at 10/s.
  CI read 0.053 of the 0.06 it asks for. It now waits for the sway to stop rising.

**Proof.** `probe:identity` 25/25 (two new: the dossier was raised, and holding the panels keeps the
dossier up past its own life and lets go cleanly), `probe:body` 20/20, `probe:ship` 9/9,
`probe:mobile` 14/14, `probe:crawl` 10/10, `smoke` 7/7, 529 tests, build and typecheck clean.

**What the mutation test could and could not say.** Removing the hold does not fail the two picture
checks here, because this machine's HUD clock runs at a fifth of wall time and the panels linger
anyway — the very asymmetry that made CI red and this box green. So the hold has a check of its own
that does fail without it: held, the dossier is still up ninety frames later, and it closes once
released. That one is local and mutation-sensitive; the pictures' safety is CI's to confirm.

## Stage 71 — A clip comparison is a claim about a view

**Goal.** The `deadletter_docks/node` frame in the city probe sat a hundredth of a unit under its
brightness threshold and moved between runs, flagged in Stage 66 and left alone. This is the reason
and the fix.

**What changed.** The frame is taken after the bot walks back down the street to look at the node it
just flipped, and the walk ends anywhere inside its 0.8 m radius. How much of a lit node that puts
in frame moves the brightness of the whole picture: the same build read 0.207 from one arrival and
0.243 from another, against a threshold of 0.24. The camera now stands on the exact spot, facing
the exact way, before the shutter opens — a clip comparison is a claim about a view, so the view is
fixed rather than approximately arranged.

**Proof.** `probe:city` 45/45 twice, reading 0.217 and 0.207 where it used to range 0.207 to 0.243:
the spread halved and the margin to the threshold doubled. `probe:cityLife` 19/19, `probe:wake`
14/14. The residue is the rain and the node's own pulse, which are the picture rather than the
aim.

## Stage 70 — Two shutters and a threshold

**Goal.** Runs #97 and #98 each failed on one check, in two probes this series had not reached.
Both are the same two lessons: a picture taken when the thing it is named for has gone, and a
number that was a guess about one machine.

**What changed.**

- **The Debt banner is photographed while it is up.** The banner shows for three and a half seconds
  of the HUD's own clock — which on a machine that draws quickly is three and a half seconds of wall
  time, and on the software renderer here is closer to twenty. The probe waited for the social
  message announcing the clear, then took the picture; on CI the banner had gone. The duel that
  clears the Debt now carries a watch, and the picture is taken on the first tick where the panel is
  actually up, with a second chance after the duel if the kill landed between two ticks.
- **Aiming down sights is compared, not measured against a guess.** The check asked for a camera
  between 0.9 m and 1.6 m back. Where the ground is behind the camera at that pitch is the yard's
  business, and a floor that pulls the camera in further is the camera doing its job: CI read 0.75
  where this machine read 0.92. It now measures the hip-fired framing from the same spot and the
  same aim, and asks that sights bring the camera at least 0.8 m closer than that.

**Proof.** `probe:identity` 23/23, `probe:tps` 16/16, `probe:body` 20/20, 529 tests, typecheck
clean. The ADS check now reads 0.92 m aiming against 2.59 m from the hip, which is a comparison
rather than a constant.

## Stage 69 — The weapon in the hand is the weapon that fires

**Goal.** The remaining confirmed findings from the Stage 60 review are all the same oversight from
a different angle: the first-person weapon kept its effects when the camera moved behind the body,
and the body's weapon got none of them. What the player watches now is a weapon that does not flash
when it fires, does not dip when it is swapped, and does not shake while it charges — while all of
that happens to a viewmodel nobody can see.

**What changed.**

- **The muzzle flash follows the weapon being drawn.** The hand's light is a child of the body, and
  three skips a hidden subtree entirely — so with the camera pulled in against the body there was no
  flash at all, which is exactly the moment (a doorway, a corner) when a player most needs to see
  they are firing. The flash now falls back to the camera's light whenever the body is not drawn.
- **So does the charge glow**, which was lighting the camera while the held weapon charged in the
  dark.
- **The Kernel's filament hangs on the weapon.** Its strands were written in the camera's space,
  over the first-person weapon; behind the body they hung in mid-air between the camera and the
  player. It is parented to the hand in third person and to the camera in first.
- **The swap dip and the charge shake are in the pose.** Both were written to the hidden viewmodel,
  so a new weapon appeared in the body's hand with no motion and a charging one sat dead still. They
  are pose inputs now. The shake is applied after the easing, like the recoil: a 60 rad/s tremor
  written to an eased target is filtered away to nothing before it reaches a bone.

**Proof.** `probe:tps` 16/16 (2 new: the flash is on the body's weapon with the filament on it and
the camera's light dark, and with the body hidden the flash falls back to the camera), `probe:body`
20/20, `probe:net` 16/16, `probe:campaign` 31/31, `probe:arsenal` 19/19, `probe:mobile` 14/14,
`smoke` 7/7, 529 tests, build and typecheck clean. Guards mutation-checked: leaving the filament on
the camera puts it 3 m from the hand, and tying the flash to third person rather than to the body
being drawn puts it out when the camera is pulled in — and on the pose side, dropping the swap dip
leaves the socket at rest, and moving the shake back before the easing filters it to a third of a
millimetre.

**A measurement that measured the wrong thing.** The body's draw-call cost is a difference between
two frames, and the burst the new checks fire leaves tracers and sparks alive that expire between
them — the body read as nine calls instead of five. The check now waits for the effects to go out
before it measures. It is the Stage 64 lesson once more: a difference of two counts is only about
the thing that changed if nothing else did.

## Stage 68 — The last two fixed windows

**Goal.** CI run #96 was green everywhere Stage 67 had reached, and red on one check it had not:
the cloak's sway. The same two lines of reasoning apply, and this closes the last of them in the
body probe.

**What changed.**

- **The sprint check sprints first.** It sampled sixteen frames and kept those above 6 m/s. On a
  fast machine those frames are the acceleration, not the run: one frame qualified, and the hem had
  not had time to drag. The bot now sprints a round trip and the probe samples until it has eight
  frames of real sprinting or six hundred frames have passed.
- **The recoil check watches for the shove.** It took ten frames after a burst began and kept the
  highest socket position. The shove decays in about a fifth of a second, so which frames land
  inside it is the frame rate's business. It now watches until the shove lands, with a cap.

**Proof.** `probe:body` 20/20, `probe:tps` 14/14, `smoke` 7/7, 528 tests, build and typecheck
clean. Every check in the body probe now waits for the state it measures; none of them counts
frames.

## Stage 67 — Counting strides instead of frames

**Goal.** CI run #93 was red on two more checks of the same kind Stage 64 dealt with, in places
Stage 64 had not looked: a walk check that counted frames, and a menu check that read a value one
round trip after finding it.

**What changed.**

- **The walk counts strides, not frames.** The check sampled sixty frames and asked for two swaps
  of the leading leg. How much of a stride a frame carries is the frame rate's business, and CI
  draws several times faster than the software renderer here, so the same walk gave one swap
  instead of three. The bot now walks a longer round trip and the probe samples until the legs have
  alternated three times or nine hundred frames have passed, which is the thing the check is about.
  The same treatment went to the remote's walk, whose stride advances per frame for the same
  reason.
- **The card is read where it is found.** The menu check waited for a title card to be up and then
  read it in a second call. Cards come and go, and that second call landed between two of them
  often enough for CI to catch it. The text now comes back from the wait itself.

**Proof.** `probe:body` 20/20, `smoke` 7/7 (the card reads "You woke free."), 528 tests, typecheck
clean. The walk check now stops after 28 frames here and will take more on a faster machine, which
is the point.

## Stage 66 — What the camera stands in, and what the reticle points at

**Goal.** The adversarial review of Stage 60 (six lenses, three skeptics each) confirmed fifteen
findings about the third-person camera and its reticle. Two were the loudest, and both are about a
claim the stage made and did not keep: that the camera never has anything between it and the
player, and that what the reticle covers is what a shot hits.

**What changed.**

- **The shoulder is a segment, and it is cast now.** The camera anchor sits 0.78 m to the side of a
  capsule 0.4 m wide, so it is outside the player's own column: with a wall on the right, the
  anchor was already inside the masonry and the cast that runs from it returned nothing. The
  offset is cast from the eye like any other segment, and the anchor stops short of what it finds.
- **A wall the camera backs into beats the minimum distance.** The minimum keeps the camera out of
  the player's head; it was also overriding the wall behind, placing the camera past the face of
  the box that pulled it in. A hit closer than the minimum now wins.
- **The eased distance runs along the line that was cast.** Letting the camera back out scaled the
  whole offset toward the eye, sweeping it along a line nobody had cast — through the edge of the
  very box that pulled it in. It now eases along the segment from the shoulder.
- **The reticle marks the shot, recoil and all.** The sim fires along the aim plus the recoil it is
  carrying (`shotDirs` in `shared/sim/weapons.ts`). The reticle was cast from the bare aim, so
  through a burst it sat still while the shots climbed away from it. It now carries the same
  recoil.
- **The reticle tests bodies, not just walls.** It was cast against the level's boxes alone, so
  aiming at an enemy put the mark on the wall metres behind them — and with the camera over the
  shoulder, that parallax is metres wide at close range. `aimPoint` now also tests the capsules the
  hitscan tests, with the same radii and heights, and reports whether the ray ends on a body.
- **The lens moves before the frame is drawn.** The ADS zoom eased the field of view after the
  frame was placed and the reticle projected, so for the half second of a zoom the reticle was
  drawn through the previous frame's projection.

**Proof.** `tests/tps.test.ts` 10 (4 new); `probe:tps` 14/14 (3 new: the shoulder moved in by a
wall beside the player, the ray stopping on the body rather than the wall behind it, and the
reticle carrying the recoil mid-burst); `probe:body` 20/20, `probe:net` 16/16, `probe:arsenal`
19/19, `probe:city` 45/45, `probe:frame` 6/6, `probe:mobile` 14/14, `probe:ship` 9/9, `smoke` 7/7,
528 tests, build and typecheck clean. Four guards mutation-checked: not casting the shoulder leaves
the anchor 0.78 m out and inside the wall, restoring the old clamp puts the camera 15 cm behind the
wall face, dropping the bodies from the cast makes the aim miss them, and casting the reticle from
the bare aim fails the mid-burst check.

**Noted, not fixed.** One city clip-comparison frame (`deadletter_docks/node`) sits close to its
luma threshold and failed once in five runs here, passing on the re-run with the same colours. It
is the Stage 64 pattern — a measurement taken at whatever moment the capture landed on — and it is
a candidate for the same treatment.

## Stage 65 — The rest of what the review found

**Goal.** The adversarial review of the Stage 63 body (five lenses finding, three skeptics per
finding, 84 agents) raised 26 defects and 13 survived verification. Two were fixed in Stage 64 — the
body that never died past 40 m, and the departing player who disposed every other player's name
tag. This is the rest of them.

**What changed.**

- **A file laid down rested 41 cm under the floor.** The death drops the hips half a metre and
  swings the legs out; eased apart, the left boot went through the ground and stayed there for the
  whole second the corpse is on screen. Both legs are now planted by the same rule the slide uses,
  generalised to account for the hips' lean: the leg's angle is taken from where the hips actually
  are this frame, so the boots rest on the floor at every frame of the fall rather than at the end
  of it. The legs splay about the vertical instead, which does not lift them.
- **A held position is not a direction.** The renderer takes a remote's travel direction from its
  frame-to-frame displacement. When the interpolator repeats a sample that displacement is exactly
  zero, and `atan2(-0, -0)` is not zero but −π: the legs faced backwards for as long as the sample
  repeated. The direction is now only taken when the body actually moved.
- **Running directly backwards swung the legs across the body.** +π and −π are the same direction,
  and clamping them puts the legs on opposite sides: a travel angle dithering around the back swung
  them over and back. Near the back the legs now keep the side they are already on.
- **One frame with no time in it poisoned a remote's speed forever.** Two frames can share a
  timestamp; the speed estimate divided a displacement by that zero, and an Infinity there never
  washes out of the smoothing. The interval is floored.
- **The headline check on the hands could not fail.** `wristErr` compared the arm solver's answer
  to the arm solver's own target, which says the arithmetic closed and nothing about the skeleton.
  It is now measured through the written bones — the end of the forearm in world space — so writing
  a solution to the wrong bone fails it. It does: the mutation that swaps the left arm's target
  fails both wrist checks, where before it failed neither.
- **A claim about a transient was tested at rest.** The crouch guard said the legs fold as fast as
  the hips drop, which is a statement about the blend, and then read the settled frame. It reads
  every frame of the blend now, at three depths.

**Proof.** 525 tests (5 new); `probe:body` 20/20, `probe:tps` 11/11, `probe:net` 16/16, `smoke`
7/7, build clean, typecheck clean on both configs. Every new guard was mutation-checked: restoring
the old corpse legs puts a boot 36 cm under the floor, removing the hysteresis flips the leg side,
and mis-writing the arm fails the wrist checks — each the exact number or sign its test now
forbids.

**Not taken.** Thirteen of the 26 findings were refuted by two or more skeptics and are not fixed:
among them a claimed leak of the per-slot cloak geometry (the caches are marked shared), a mantle
whose hands cannot reach (they can), and several complaints about check names rather than checks.
One refuted finding was fixed anyway — the shared sprite geometry in Stage 64 — because the
mutation test disagreed with the skeptics: dropping the mark drops the geometry count, which is
three's own sprite geometry going out from under every other tag. A verdict from reading loses to a
number from running.

## Stage 64 — What a check measures when the machine is faster

**Goal.** CI run #92 was red on three steps that pass here: `probe:cityLife`, `probe:body` and
`smoke`. None of them was the product. All three were checks that timed something in wall
milliseconds or counted frames, on a machine that draws frames several times faster than the
software renderer here does — so the same code gives different numbers and the assertions fell off
their thresholds. A check that only holds at one frame rate is not a check. While pulling them
apart, two real defects in the Stage 63 body turned up and are fixed here too.

**The checks.**

- **`smoke`: the sim advances.** The first frames of a level pay the graphics driver's shader link
  — over a second under SwiftShader, with the JavaScript thread idle and the simulation's catch-up
  timer unable to run through it. Timing the sim from the moment of joining measured that link, not
  the simulation, and where the stall fell inside the window was luck: 118 ticks one commit, 28 the
  next, with the same loop. The window now opens once the level is drawing and requires 30 ticks of
  progress from there (it gets 94).
- **`probe:body`: the slide and the jump.** Both counted on a rendered frame landing inside a short
  physical state. A slide lasts a quarter of a second; at 6 frames a second that is five frames and
  at 60 it is fifteen, and the eased pose is still moving through all of them. Both now freeze the
  simulation as soon as it is in the state, let the pose settle, and read that — the same trick the
  proof frames already use, and it makes the reading independent of the frame rate rather than
  merely likelier to work.
- **`probe:cityLife`: the monorail's whoosh.** Whether a car crossed earshot during the phases
  before the check was a lottery the frame rate decided, since the city runs on the render clock.
  The check now primes a car just outside the radius and waits for real frames to carry it in,
  however many that takes.

**The defects.** An adversarial review of the Stage 63 diff (six lenses, three skeptics each)
converged from four directions on the first of these:

- **A body past the pose hold never died.** Beyond 40 m the pose holds — the read at that range is
  the silhouette, not the stride — but the hold skipped the line that sets visibility too. A player
  who died out there stayed standing, with their name tag over them, until they came close enough
  to be posed again. The hold now covers the stride only: a body whose last pose no longer matches
  what the wire says is posed at any range.
- **A player leaving disposed every other player's name tag.** three gives every `Sprite` the same
  module-level geometry, and releasing a departing body walked into it. The probe's leak check read
  the resulting fall in the geometry count as proof of a clean exit, which is exactly backwards; the
  geometry is marked shared, and the check now requires that count to hold steady.

**Proof.** `probe:body` 20/20 (one new check: a body at 85 m dies, is taken, and stands again on
respawn), `probe:cityLife` 19/19, `smoke` 7/7, `probe:tps` 11/11, `probe:net` 16/16,
`probe:city` 45/45, `probe:frame` 6/6, 520 tests, typecheck clean on both configs. Both new guards
were mutation-checked together: restoring the old hold leaves the far body standing after death,
and dropping the shared mark drops the geometry count by one — the exact numbers the checks now
forbid.

## Stage 63 — The silhouette walks

**Goal.** Stage 60 put the camera behind the player and found a capsule there: the body was the
rigid hooded shell the remotes had worn since Stage 2, sliding over the ground with its feet
still. A third-person game is judged on what that body does, every frame, in the middle of the
screen. This stage gives it a skeleton and a pose.

**What changed.**

- **A pose is a pure function.** `client/render/pose.ts` takes what the renderer already knows —
  speed, the direction of travel against the facing, footing, stance, the capsule's height, pitch,
  the reload, the ADS, the recoil kick, whether the file is alive — and returns where every bone
  goes. It is three-free and holds nothing but its own eased values, so idle, walk, sprint, crouch,
  slide, air and corpse are arithmetic a unit test can read rather than something only a screenshot
  can judge. `twoBoneIK` in the same file is the arm solver.
- **Ten bones, two meshes, five draw calls.** `client/render/rig.ts` builds the cloak and its trim
  as two `SkinnedMesh`es on one ten-bone skeleton, with `skinIndex`, `skinWeight` and a `sway`
  weight baked per vertex. The hem's drag and flap are a vertex-shader patch with its own program
  cache key, so the cloak moves for no CPU per vertex and no extra call. The weapon hangs on a
  root-level socket bone that takes the aim's pitch exactly — the Stage 60 reticle contract, kept —
  and both arms are solved to the grip and the fore-end by IK, so the hands are *on* the weapon at
  any pitch rather than near it.
- **Remotes get the same body from the wire.** `RemoteBodyView` carries fields the wire already
  sends — position, velocity, footing, stance, pitch, weapon slot — and every remote is posed by
  the same `poseBody`. A held sample (a stale packet repeating a velocity) is caught by taking the
  lesser of the wire's speed and what the position actually did, so a frozen remote's feet stop
  instead of running on the spot. Bodies past 40 m stop posing; one leaving takes its skeleton,
  its geometry and its tag texture with it.
- **The crouch is the sim's capsule, not the eye.** The local view now carries the sim's capsule
  height and the crouch is driven by it, so the hood comes down under the low capsule a shot tests
  instead of 5 cm above it — what a crouching player looks like and what a shot at them hits are
  the same volume again.
- **The lead boot stays on the ground through a slide.** The hips drop half a metre while the lead
  leg swings out; eased apart, the two put the boot 10 cm through the floor halfway into the entry
  whatever their end points are. The leg's angle is taken from the hips' height instead, so the
  boot is planted at every frame of the blend rather than only at its end.
- **The warm-up compiles the programs the frame can use.** A program's cache key carries the output
  it was compiled for, and the scene is drawn into the post chain's buffer, not the canvas.
  Compiling against the canvas built programs (sRGB out, tone mapping on) that the first frame
  could not use and compiled again. The warm-up now binds the buffer the scene is actually drawn
  into, and keeps the sprite material alive afterwards, because disposing a material releases the
  very program being warmed. A remote joining now compiles nothing, and booting a level compiles
  29 programs where it used to compile 41.

**Proof.** `probe/stage63.ts` (`probe:body`, in the verify chain and CI) drives the real game and
reads the live skeleton: the body is skinned, on ten bones, and costs five draw calls (81 with it,
76 with it hidden); a remote joining compiles no shader program; a remote walks from the wire's
fields alone — legs alternating, socket at its pitch, its slot's weapon in its hand, four
drawables — and a stale packet stops its feet; a remote leaving leaks no geometry or texture; the
socket takes the aim's pitch exactly and both wrists reach the weapon within a millimetre looking
up and looking down; walking alternates the legs at the stride with the boots on the ground and
the chest ahead of the hips; standing again, the legs hang; sprinting drags and flaps the hem in
the shader, with the cloak and trim on one set of uniforms; a crouch fits the hood under the
1.15 m capsule; a slide leans back with the lead boot flat; a jump splits the legs and lifts the
hem; a shot shoves the socket back; a death lays the file down and dims its strip-light, takes the
body after a second and a fifth, and a respawn stands it up. Both proof frames freeze the sim in
the state they are named for, so the picture labelled "slide" is a slide. 19/19.

**Acceptance.** `probe:body` 19/19; `npm test` 520 (24 across the pose and the rig, 3 new);
typecheck clean on both configs; `probe:tps` 11/11, `probe:net` 16/16, `probe:city` 45/45,
`probe:cityLife` 19/19, `probe:frame` 6/6, `probe:mobile` 14/14, `probe:look` 18/18,
`probe:counter` 16/16, `probe:ship` 9/9, `probe:campaign` 31/31, `probe` 13/13, build and smoke
pass. Every new guard fails when its rule is reverted: the crouch depth, the leg fold, the walk's
lean, and the slide's planted boot each have a mutant that reproduces the exact number the test
now forbids.

## Stage 61 — The settings probe counts the settings

**Goal.** CI run #90 was red on one step: `probe:ship` asserted that the SETTINGS screen lists
exactly eight entries, and Stage 60 added a ninth (FIRST-PERSON VIEW). A literal count is a claim
about a table it does not read; the check now takes the count from `DEFAULT_SETTINGS` itself, so
the next setting will not fail it and a missing entry still will. `probe:ship` was not in the set
of probes Stage 60 ran before its push — the menu flow did not look like a thing a camera could
break, and the settings list is where it did. 9/9.

## Stage 60 — Third person, like the trailer

**Goal.** The owner asked for the game to be a third-person shooter, as the trailer shows it. Until
now the camera sat in the head and the only body the player ever saw was everyone else's.

**What changed.**

- **The camera stands behind the body.** `client/render/tps.ts` is the rule, pure and three-free:
  the pivot is the eye the sim fires from; the camera sits behind it over the right shoulder, and
  the segment from the shoulder to the wanted position is cast against the level's boxes so a wall
  behind the player pulls the camera in (with a gap kept from the wall) rather than putting the wall
  between camera and player. Pulling in is immediate; letting back out is eased. Aiming down sights
  is the same rule with the camera closer and tighter. `tests/tps.test.ts` pins the framing, the
  wall, the minimum distance and the ADS opts.
- **The body is the city's silhouette.** `client/render/body.ts` builds the hooded shape remote
  players have worn since Stage 2 — cloak, hood, a strip of trim, and a hand — and both the remotes
  and the local rig use it now. The hand holds one weapon per slot, built by the same
  `buildViewmodel` the first-person rig uses, so a worn skin's tint and plate reach it the same way
  (`skinBound` counts the held weapons too). The cloak went near-black in the same stage: up close
  and under the rig lights the remotes' emissive read as a lit pillar, which the trailer's
  silhouettes never are. The body faces the aim, its hand turns with the pitch, it crouches and
  slides as the remotes do, and it is hidden when the camera is pulled in against it.
- **The reticle marks what the shot hits.** The sim is untouched: a shot leaves the eye along the
  aim's yaw and pitch, as it always did. In third person the camera is offset from that ray, so the
  reticle is drawn where the eye's ray lands on screen — on the first box it reaches, or a point
  far along it — rather than at the screen's centre. What the reticle covers is what a shot hits,
  at any range; near a wall it moves, at range it settles. Tracers leave the held weapon's muzzle.
- **First person is a setting** (`FIRST-PERSON VIEW`, and `?view=first` for the probes): the
  viewmodel comes back, the body goes, the reticle returns to the centre.

**The probe.** `probe/stage60.ts` (`npm run probe:tps`, in the verify chain and CI): the body is
drawn and the camera is 3.0 m behind the eye along the aim; backed against the yard's south wall
the camera pulls in to 0.48 m with the wall still behind it; aiming down sights pulls it in; the
reticle is the eye's ray on screen to within a pixel and a half, off the centre because the camera
is over the shoulder, and sits on a street dummy's chest at 12.7 m within the bot's own aim
tolerance; a burst through it takes the dummy from 100 to 36; first person restores the viewmodel
and drops the rig's drawables to zero; the body costs five draw calls, read as the same frame with
the body hidden. Two proof frames. The probe reads the view only after a rendered frame — the
first draft read the previous frame's camera after teleporting the player, and every "wall" and
"first person" check reported the old frame.

**The budget.** The body is one mesh per material (`mergeByMaterial`: the parts' transforms baked
into their geometry, the parts that share a material one mesh), drawn once — the wet floor's mirror
does not see the rig — so it costs five calls, and the training dummies went the same way, four
meshes to two. What could not be merged away is the camera: three metres behind the eye it takes in
about ten more calls of street than the eye did (lease_row, north from the spawn: 202 first person,
207 third with the body hidden, 212 with it). The city probe's line moves from 180 to 190 by that
measured cost and no more; lease_row reads 182 on it. `probe:frame` is measured in first person,
because its claims are about the renderer's pools and the frame-time tail, and a dummy patrolling
into the wider frame read as eight calls of leaked effects; the city probe's clip-comparison frames
are taken from the eye too, since the clip is eye-level footage and a walkway's near rail was
filling the foreground.

**What it is not yet.** A capsule in a hood. The trailer's silhouettes have limbs; this one has a
strip. The framing, the camera's manners and the reticle are the stage; a body with arms is art,
and art waits for a surface it can hang on (`docs/DECISIONS.md` §4).

## Stage 59 — The schedule on the chain

**Goal.** The last open item in the security review that was code rather than an engagement:
"the emission schedule is enforced in code, not only published — what is still trusted there is
the poster." The settlement's arithmetic bounds a day; nothing on the chain bounded what the poster
key could fund. Building the bound found that the arithmetic was wrong first.

1. **The schedule's year was counted from 1970.** `dailyEmissionBudget(day)` took a day index —
   days since the Unix epoch — and divided by 365, so every real date fell in "year 56", clamped to
   the last year of the eight. A live settlement on any date would have paid the final year's
   budget from the first day: 35,474 $CAPITAL a day where the schedule says 265,753. The model's
   own test pinned day zero of 1970 as year one, and `probe:economy` projects from `runPot(0)`, so
   nothing measured the day the settlement actually runs on. `LAUNCH_DAY` is the schedule's day
   zero (2026-09-17 as a day index; set it to the launch date at mainnet deploy), `scheduleYear`
   counts from it, and the model test now asserts that today is year one.
2. **The vault holds the poster to the schedule.** `PrizeVault` carries a channel per epoch kind
   (Audit, season, THE RUN — an epoch id is `kind × 1,000,000 + period`, as it always was) with a
   cap per schedule year, and `post` refuses `OverSchedule` before a token is drawn. THE RUN's caps
   are the day's pot per year, rounded up; the boards' are their pools. A kind with no channel
   cannot be posted at all, and only the treasury — the steward, a multisig on a real network — can
   move a channel; the poster never can. `shared/economy/schedule.ts` computes the same numbers,
   the deploy passes them to the constructor, and `tests/schedule.test.ts` holds the contract's
   `capOf` to the model's `epochCap` for run days across the years and before launch, for Audit
   weeks and for seasons. The ledger reads the cap before posting, so an over-schedule total is a
   named refusal in the cron's log rather than a reverted transaction paid for. What a leaked
   poster key can now do is fund one period's schedule per period; whether a day's root was built
   from real banking remains its word (`docs/SECURITY.md` §3.2).
3. **The nonce is the file's.** Issuing a SIWE nonce replaced the file's in-flight one, and the
   ask took a bare id, so anyone could keep a victim from ever finishing a link. The ask now takes
   the file's secret on both hosts (the client already held it); an anonymous file adopts nothing
   on the ask.
4. **A shadowed route made the Workers throw on any file that had not joined.** The Durable Object
   had a bare `/file` route from Stage 6 that matched any method and answered `null` for a file not
   in its storage, never reading D1; the POST `/file` route Stage 28 added below it — the one the
   counter and campaign Workers load through — was never reached. Any request on the money route or
   the campaign route for a file not yet in that object's storage threw a 500, and a file whose
   storage was cold read as absent. The shadow is gone; the read reaches the row and a file nowhere
   is a placeholder with its id. Found by the nonce test, which asked for a file that had never
   joined.

**Tests.** `tests/schedule.test.ts` (7), the model's day-zero case, the nonce route, the cold read;
the security suite's raw posts moved onto run-day epochs (a bare id has no schedule now) and its
allowance case onto a run day, where the allowance is the guard that speaks. 489 tests. Each new
guard fails its case when reverted, the contract's with a recompile.

## Stage 58 — The review, part five: Stages 1–14

**Goal.** The last pass, over the fourteen stages that built the game before the money: the sim,
the netcode, the file, the campaign, the endgame and the first counter-ledger. Ten findings against
that snapshot. Five were closed by later stages (the file secret of 26–29 and 56, the input credits
of 56, the room-closed contract of 27, the whole-file row of 54) and are noted here so the next
reader does not re-find them. Five were live.

1. **A match overwrote every write made to the file meanwhile.** The room holds a copy of the file
   from join to leave and saved it whole on every bank, settlement and stamp. On the Workers host
   that copy is a snapshot, so a payout from the FILE panel, a node bought at the desk, a contract
   claimed or a Rewrite during a match was replaced by the room's next save — and a payout undone
   that way was paid again. The Durable Object's header promised that two rooms could never race a
   write; it serialised the writes and the last one won. A save now carries the copy the writer
   started from (`server/merge.ts`): what the writer did not touch keeps the stored value, numbers
   it moved are moved by the same amount, sets keep both sides' additions and removals, the ledger
   appends, and a field it replaced is replaced. The room measures each save from the last one.
   Pinned on the merge, through the real Durable Object, and on the room's saves.
2. **Two payouts in flight both read the same "owed".** The money route loads, asks the chain and
   saves, with nothing between two concurrent requests for one file. On the Workers host the file's
   Durable Object now hands out a lease (one at a time by construction; it expires if the holder
   dies) and the counter Worker holds it across the link and counter routes, answering 409 to a
   second caller. The Node host takes a per-file lock in process for the same routes.
3. **An EMP and a baton stun ignored the safe zone.** The zone gated damage and nothing else: a
   grenade from the street zeroed the shield and the weapon of a file in the market, and a lunge
   from the street stunned it. Both keep the damage rule now, in both directions.
4. **A cold load re-inserted the whole ledger.** A file whose Durable Object storage was gone
   loaded from its D1 row and was not written back, so the next save compared its ledger against
   nothing and inserted every line again. The row is written back on load, and every save reads
   its "previous" the same way. Pinned through the real object over a D1 shaped on SQLite.
5. **The day's contracts were measured from the wrong base.** The daily view rolled the day in
   memory and dropped it, and the room never rolled it at all, so a file's first claim after a
   match snapshotted the base from the post-match counters and the match counted for nothing.
   The room rolls the day at join, before the match moves anything, and the view's roll is kept.

**Not changed.** The reconciliation walks every linked file rather than the day's table, by
design: the table is the record being checked, so it cannot also be the index into it.

**Count.** 479 tests. Every new guard fails its case when reverted (the cold-load case needs both
of its two guards removed, which is the point of having two).

## Stage 57 — The review, part four: Stages 15–24

**Goal.** The fourth pass, over the ten stages that built the money: the prize vault, the binding
emission schedule, the nightly settlement, the sinks, the treasury split and the reconciliation.
Ten findings. One (the unauthenticated `/prizes/post`) was already closed by Stage 28's admin key;
one (the reconciliation walks every linked file rather than the day's table) is the design, and
stays — the table is the record being checked, so it cannot also be the index into it. The other
eight are fixed here, and four of them are the kind that pay someone twice.

1. **The direct withdrawal paid twice.** THE RUN's withdrawal paid everything the file said it was
   owed, and the room carries unpaid units from one day onto the next file — so units banked on
   Monday, carried to Tuesday, were paid on Tuesday's button and again by Monday's epoch. The
   withdrawal now pays only what the day's own row still holds, and a store with no row holds
   nothing (every store drops spent rows from the day's view — the first draft of the fix fell back
   to the file's word, and the test caught it paying the carried units on a second press).
2. **And it paid at the ceiling, before the pot was known.** The schedule Stage 17 built the
   settlement around was bypassed by a button that paid at the per-unit maximum. On a real chain
   the withdrawal is now refused: THE RUN pays once, at the night's settlement. The devnet keeps it
   so the probes can move money on demand. Both pinned; removing either guard fails a case.
3. **A missing store row funded an epoch every night.** `postEpoch` drew the epoch's total into the
   relayer before posting, and refused only on the store's say-so. Restore the store from a backup
   that lost an epoch row and every retry drew the money, posted, reverted with `EpochExists`, and
   left the draw in the hot key. The chain is asked first: an epoch that is on the chain and not in
   the store is refused as a store to repair. Pinned: the relayer's balance does not move.
4. **The reconciliation erased a real debt.** A file that banked but had no wallet when its day
   settled is skipped by the epoch and keeps what it is owed — until the reconciliation ran with
   `fix`, read the day as settled, called the debt "stranded" and cleared it as paid. Stranded now
   means the epoch has a leaf for the file; a settled day with no leaf is a new drift kind,
   `unpaid`, reported and never cleared. Pinned on the day walk and the backlog walk.
5. **The season prize was never postable.** The roll reset the contributors in place, and every
   read rolls first, so the cron that posts the season's prizes read a fresh season with an empty
   map and an index equal to its own. The roll now keeps the closed season and its contributors
   until the next roll; the cron posts that, guarded by the epoch it would create.
6. **A settlement the RPC failed was never retried.** The cron settled yesterday and nothing else.
   The nightly decisions are now pure functions (`server/chain/cron.ts`): yesterday always, and any
   unsettled day in the past week that has units; epochs old enough, worth something, and not yet
   swept; the closed season. All three are unit-tested off the clock.
7. **The sweep was sent for every old epoch every night, forever.** A reclaim records `sweptAt` on
   the stored epoch and the selector skips it.
8. **A bad percent-escape threw out of all three Workers.** `decodeURIComponent` on the request
   path, uncaught: a 500 for a malformed URL. Decoded through one helper that answers null, and a
   null is a 404. Pinned on all three Workers.

**Also.** Two older payout tests set what a file was owed without banking it on the day's table,
which the room always does; they now bank it, because under the new rule the table is the record.

**Count.** 457 tests. Every new guard fails its case when reverted.

## Stage 56 — The review, part three: Stages 25–34

**Goal.** The third pass of the same review, over Stages 25 to 34. Ten findings, all real, and
four of them break only the production host — the Workers — while the Node host the probes run
on hides them. That is its own lesson: every probe drives the dev host, and the dev host answers
synchronously, gates every file route the same way, and never sees a stale bundle.

1. **A wrong secret admitted a Promise as the player's file.** The room's guest fallback cast the
   store's answer to an account. On the Durable Object store that answer is a promise, so on the
   production host a join with a wrong or stale secret played a `Promise` as its file — no name, no
   wallet, and a throw at the first settlement. The fallback now takes the same asynchronous path
   the ordinary join does. Pinned with an asynchronous store: the guest is a real file.
2. **The daily contracts view returned NOT YOUR FILE in production.** The Durable Object listed
   `/daily` among the secret-gated routes; the Worker forwards a plain GET with only the id, and the
   dev host never gated it. Every file with a secret — every file after its first mutation — got a
   403 on the endgame panel. `/daily` is read-only and is its own route now, pinned through the
   Worker's GET.
3. **The protocol version had not moved with the wire.** Stage 34 changed the input record and the
   snapshot layout at version 9. A stale bundle would have passed the gate and been kicked for
   "malformed message". The version is 10 and `tests/wire.test.ts` holds a fingerprint of the
   encoders' bytes against it: change the wire and the test fails until the version moves too.
4. **A ghost could be written to any file from its published id.** The Durable Object's `/ghost`
   route took a bare id; the dev host gated it. It takes the secret now.
5. **A rejected input filled its gap twice.** The gap fillers were queued before the input was
   validated; a rejected input left the last sequence behind, so the next accepted one filled the
   same ticks again — extra sprint ticks the client never predicted, the residue Stage 31 removed,
   in the other direction. The gap is filled on the accepted path only: a rejected input followed
   by an accepted one fills four ticks once, and the queue holds nothing twice.
6. **The campaign lint crashed on the mistake it exists to report.** A `requires.after` naming no
   mission was recorded and then dereferenced on the next line. The order check is its own function
   now and can be handed a broken arc; it reports both violations and throws nothing.
7. **An adopted secret was kept only when the request succeeded** on the Workers' routes. A file's
   first request being a purchase it could not afford left the file still unowned, for anyone with
   the published id to adopt next. The Durable Object, the counter Worker and the campaign Worker
   save on adoption whether or not the operation succeeded, as the dev host already did.
8. **The delta encoder was quadratic in the entity count**, once per client per snapshot on the
   room's hot path: a linear search of the baseline per element. The baseline is indexed once per
   encode and once per decode.
9. **Every authenticated join wrote the file** whether or not it had changed. A join writes only
   when it adopted a secret.
10. A dead discriminator on the lint's gate list, never produced and never read, is gone.

**Acceptance.** `npm test` 443 (8 new); typecheck clean on both configs; `probe:net` 16/16,
`probe:harden` 9/9, `probe:counter` 16/16, `probe:run` 18/18, `probe:campaign` 31/31, `smoke`
7/7 on the built site at protocol 10.

## Stage 55 — The review, part two: Stages 35–44

**Goal.** Stage 54's review of this session's code found seven real defects, so the same review
ran over the previous session's — Stages 35 to 44. Six findings, all real; the first is the kind
this whole document exists to catch.

1. **The skin plates were never drawn.** Stage 43 built the asset pipeline and Stage 44 ran all
   four plates through it; `probe:counter` waited for the plate to *load* — `skinMap true` — and
   nothing ever assigned the texture to a material. Every wear paid the download and the rig
   looked exactly as it had before Stage 43: tint only. The claim "the file wears it" was proved
   for a texture in memory, not a texture on screen. The plate is now bound to every viewmodel's
   strip material, `skinBound()` answers whether every strip is drawing it, and the probe waits for
   that instead. Mutation-tested by loading and not binding: the probe fails.
2. **A bank on D1 was two statements.** The ledger row and the gross record were written one
   after the other; a failure between them logged the bank as lost while the units were in the
   ledger, left the telemetry short for good, and a retry would have credited the ledger twice. One
   batch now, and one transaction on SQLite. Pinned through the real store over a D1 shaped on
   Node's SQLite: a bank is one batch and zero standalone runs.
3. **The nightly cron loaded every linked file twice.** A standalone pass over yesterday ran
   first, then the backlog walk, which already covers yesterday. The standalone pass is gone.
4. **A repair inflated the economy's telemetry.** The reconciliation's repair restored lost units
   through `add`, which since Stage 38 also increments the gross record the economy measures
   `capUse` from — a repaired file read as having banked twice what it banked. `restore` now exists
   on every store and writes the ledger only; the settle test asserts the gross record is unchanged
   across a repair. Mutation-tested by sending the repair back through `add`.
5. **Three import-graph walkers with three sets of rules.** The bundle, asset and Kernel Protocol
   quarantines each carried a copy, and an import form one understood could slip past another.
   One walker in `tests/helpers/imports.ts` now, with the one real difference (type imports count
   or do not) as an option; the fake D1 the Durable Object tests use moved to a helper the same way.
6. **A parked room was never let go.** The Node host's parking bookkeeping held every room it had
   ever ticked, so an expired private room kept its whole simulation alive for the life of the
   process. A room nothing names any more is dropped when it parks, and the idle-park interval is
   one shared constant on both hosts instead of a literal on each.

**Acceptance.** `npm test` 435 (2 new); typecheck clean on both configs; `probe:counter` 16/16
now asserting the plate is bound; `probe:run` 18/18; `probe:harden` 9/9; `probe:persist` 7/7;
`smoke` 7/7.

## Stage 54 — The review: seven findings in nine stages of new code

**Goal.** With the plan and the decisions shipped, the most valuable next thing was not another
feature but an adversarial read of what Stages 45–53 added. A code review over that commit range
returned seven findings. All seven were real. Each is fixed here with a test or a probe check that
fails on the old code.

1. **RUN WITH A CREW launched solo when clicked.** The desk's click dispatcher resolved a click to
   the nearest `[data-act],[data-launch],…` ancestor, and the crew span sits *inside* the launch
   row — so the click reached the row and launched the contract alone. The probe had driven the
   hook, never the DOM. The selector now lists `[data-crew]` first, and `probe:campaign` starts its
   crew by clicking the span as a player would: "span found true · target R3H5YM67 mode=campaign".
2. **A full file stopped persisting its ledger.** The room caps a file's ledger at 200 lines by
   dropping the oldest; both hosts computed the lines to write as "everything past the count saved
   last time", which is empty forever once the file is full — every BANKED line after the
   two-hundredth was lost on restart, on D1 and on SQLite alike. `freshLedgerLines` now finds the
   new lines as what remains after the longest prefix of the current ledger that is a suffix of the
   saved one; the trim only removes from the front, so that overlap is exact. Pinned against the
   real Durable Object and the SQLite store; mutation-tested by restoring the slice-by-count, which
   fails three cases.
3. **An edge error page could become the offline shell.** The service worker cached every
   navigation response as the shell; a 502 or a challenge page would have been what an installed app
   opened to until the worker itself changed. Only `res.ok` is cached now, inside `waitUntil`.
4. **One GET could take the whole host down.** The crew lookup decoded its path segment with
   `decodeURIComponent`, which throws on a malformed escape; thrown inside Node's request listener
   with nothing to catch it, that was the process, every room and the ledger gone from one
   unauthenticated request. A code is plain `[2-9A-Z]{8}` and needs no decoding; `probe:persist`
   now sends the bad escape and checks the host is still up to refuse it, and the Worker's route is
   pinned the same way.
5. **A failed chunk load was a session-long "no ledger".** One transient failure of the dynamic
   import left the counter permanently null; every LINK and BUY silently did nothing afterwards.
   The failed attempt is forgotten so the next open retries.
6. **The frame monitor kept every frame forever** and sorted the whole history twice a second, on
   the very device it was measuring. It keeps a minute at 60 fps now.
7. **The deploy guard checked the relayer and the bank but not the signer.** A deploy naming the
   published dev signer's address passed the guard and spent gas on contracts that trust an
   attestor the Worker refuses to run with. The guard now derives the dev addresses and refuses the
   signer and the treasury from that set too.

**What the review says about the method.** Every stage here shipped with its own tests and
probes, and every one of these seven still got through — because each test proved the path it
was written for and not the path a player takes (1), or the state a long session reaches (2, 6),
or the input nobody sends on purpose (3, 4, 5, 7). A check that passes on the code as written is
one instrument; a reader trying to break the code is another, and the second found what the first
was not built to see.

**Acceptance.** `npm test` 433 (5 new); typecheck clean on both configs; `smoke` 7/7;
`probe:persist` 7/7 (1 new); `probe:campaign` 31/31 (1 new).

## Stage 53 — The decisions

**Goal.** `docs/PLAN.md` ended with a list of things that were the owner's to decide rather than
stages to build. The owner asked for them decided. `docs/DECISIONS.md` records each one — what was
decided, why, what changed, and what only the owner can still do — and this entry is the part
that changed code, because a decision that changed nothing checkable is a preference.

**The Forge: closed, and struck from the projection.** No player uploads; the pipeline stays the
studio's, as `docs/TOKENOMICS.md` §3.5 already said. The projection had carried the Forge as a
specified-but-unbuilt sink worth 150,000 $CAPITAL a month since Stage 19, printed on every run of
`probe:economy` under "specified but unwritten". A sink with no path to being built is not a
projection line; it is a wish with a number on it — the very thing Stage 19 removed the season
buyout for. It is gone from `SINKS` and from the model's inputs; the "unbuilt" line now reads
*none* and names the decision. The published burn ratio never counted it, so no published number
moved. `tests/sinks.test.ts` pins that every sink the model carries is built.

**No cap per cosmetic id.** Scarcity stays a policy, never a promise the contract makes: a cosmetic
worth holding because nobody else can get one is the softest form of what the no-wagering rule
keeps out, and a cap once promised cannot be withdrawn. Nothing to change; closed as *no*.

**The placeholder cannot be the key.** The rotation — real signer and relayer keys, the Cloudflare
token, the multisig — is the owner's and no code here can do it. What code can do is make the
published dev keys unable to run anywhere real, so a forgotten rotation is a refusal at boot rather
than a live ledger on a key anyone can read in the repository:

- `server/chain/dev-keys.ts` holds the dev keys (out of the devnet boot, so the Workers can import
  it) and `isDevKey`.
- The counter Worker answers `DEV KEY ON A REAL CHAIN` on every chain route and skips its cron with
  either key a dev key — told apart from `CHAIN NOT CONFIGURED`, so an operator knows which state
  they are in. Mutation-tested by letting the Worker stop checking: the case fails.
- The Node host on a real chain refuses a dev key at boot, exit 2, by name.
- The deploy CLI requires the treasury address — it used to default to the relayer, which on a
  real network would have minted the whole supply to the hot key — refuses a treasury that *is* the
  relayer, and refuses a dev relayer key, all before any gas is spent.

**No further credits on art.** Every cosmetic sold has a plate; nothing else the renderer draws has
a surface for a generated image yet. Spend resumes when a surface exists. Zero credits.

**Proof.** `tests/keys.test.ts`: every dev key in any casing; the Worker's two refusals told apart;
the deploy guard's five cases. `probe:persist` starts the host on a real chain with a dev signer
and reads the refusal. `probe:economy` runs with the projection's unbuilt line at none.

**Acceptance.** `npm test` 428 (4 new, 1 rewritten); typecheck clean on both configs;
`probe:persist` 6/6; `probe:economy` 15/15; `lint:economy` 0 violations.

## Stage 52 — The guest is not a spectator

**Goal.** In a crew the guest saw "THE HOST IS AT THE TERMINAL" and waited. Co-op dialogue was a
solo experience with company: the host read the script, chose, and the guest learned the outcome
from the objective line. `docs/PLAN.md`'s fourth item: the terminal mirrors to every crew member as
it plays. Choices stay the host's — one testimony per contract, and the settlement already keys on
it — but the guest reads the same screen and sees which line the host took.

**One message, text only.** The host sends where its terminal is, node by node: the script, the
node, the choice texts on its screen and the text of the pick that led there. The co-op room takes
it from the host only, injects it into the mission's event stream — the same stream the objective
and wave events already ride, so nothing new is broadcast — and the guest renders the node's lines
from its own copy of the script with the host's choices under them and a footer that says whose
turn it is: THE HOST IS CHOOSING, or THE HOST READS ON. A pick flashes as an alert. The guest's
own dialogue state stays null, so no key of its own does anything. The message carries text and
never a resolution; a resolution is still the choice message, still the host's.

**A late joiner.** The first run of the probe failed: the guest's mirror was empty at the host's
first terminal. The host had joined, the room had put it at the terminal, and the terminal event
had gone out — before the guest's socket existed. The room now keeps the host's open terminal and
hands it to a joiner with its first mission message; a closed terminal is handed to nobody.
Mutation-tested by taking the resend out: the late-joiner case fails.

**Proof.** `probe:campaign`: while the host is at the first terminal, the guest's mirror is waited
for and then compared — the same script and node, the same choices, the terminal shown, the footer
naming the host, no dialogue of the guest's own; at the end of the contract the guest's log holds
the text of the line the host took at the file, and its terminal closed when the host's did.
`tests/terminal.test.ts` pins the wire bounds and drives the real co-op room with three
connections: the host's terminal reaches everyone, a guest's goes nowhere, a late joiner gets an
open terminal and not a closed one.

```
mirror m1_intro:a vs host m1_intro:a · choices [] · terminal shown true · footer "THE HOST READS ON"
host's picks as the guest saw them ["KEEP IT. Evidence is a weapon."] · mirror null · terminal shown false
```

**Acceptance.** `probe:campaign` 30/30 (2 new); `npm test` 424 (2 new); typecheck clean on both
configs.

## Stage 51 — One server that remembers

**Goal.** You asked whether all of this could run on one server. `server/node-host.ts` has been
the whole stack in one process since Stage 2 — rooms, co-op, files, the endgame, the
counter-ledger — and every store behind it was a Map, so a restart wiped every file. This is
`docs/PLAN.md`'s third item: the same host with a memory.

**Five stores on the schema that already existed.** `server/sqlite.ts` implements the account,
endgame, run, wallet and prize store interfaces on Node's built-in SQLite (`node:sqlite`, no
dependency) against `server/schema.sql`, the schema the Workers' D1 already uses — the run, wallet
and prize stores are the D1 ports' SQL made synchronous, and the file row is the Durable Object's
row. Two tables are new, for the endgame the Workers keep in a Durable Object: `audit_entry` and
`season`, in both schema files so the parity test holds. `MELTDOWN_DB=meltdown.sqlite` (or
`--db`) puts the host on them; without it, it is the memory-only dev host it always was, and the
boot banner says which.

**The hot copy.** A room holds the Account object it loaded and mutates it; a route loads the same
id and mutates it too. The memory store handed both the same object, so nothing was ever lost
between them. The SQLite account store does the same — one object per id, written through on
save, the ledger appended from where the last save left it — which is exactly the PlayerFile
Durable Object's model, and the reason a "load from disk every time" store would have been wrong.

**A real chain, on one box.** With `CHAIN_RPC`, `CHAIN_ID`, `CONTRACTS`, `SIGNER_KEY` and
`RELAYER_KEY` set, the host builds its counter-ledger exactly as the counter Worker does and the
devnet-only routes (the JSON-RPC proxy, the faucet, the outage drill) say so. It refuses to start
on a real chain without all four, and refuses without a database: wallet bindings and posted
epochs must outlive the process, and a ledger the host would forget is worse than no ledger.

**What the D1 path was losing.** Reading the Durable Object's row mapping to mirror it turned up
that its `extras` column carried three fields — mastery, stamps, counters. The file's secret, its
campaign save, its wallet link and its cosmetics were only ever in Durable Object storage; a cold
load from D1 would have come back without them. `extras` is now the whole account minus the
ledger, on both hosts, from one function. `tests/filerow.test.ts` drives the real Durable Object
against a D1 shaped over Node's SQLite: save from one object, load from a fresh one with no
storage, compare — mutation-tested by putting the three fields back.

**And what the memory store was doing that D1 does not.** Driving the run store with one script
against both implementations found one answer that differed: a second `markSettled` for a day
already settled *replaced* the row in memory and was refused on D1 (`ON CONFLICT DO NOTHING`).
The interface says a settled row exists "so a second settlement of the same day is refused rather
than paid"; the settlement itself checks `settled(day)` first, so the overwrite was only reachable
from a test that cleared the map by hand — but a record of what a day paid must not be one a later
write can change, and the memory store now refuses as the durable ones do.

**Proof.** `probe:persist` (`probe/stage51.ts`), in the verify chain and CI: a file is made and
changed over HTTP — a node bought, a house chosen, a secret adopted — the host is killed, a new
process opens the same database, and the file is what it was, with the secret still refusing a
request that lacks it. Then the control: the same host with no database forgets the same file,
which is what makes the first result mean something. And a real chain without a database is
refused at boot, by name.

```
bought slipfile (ok) · scrip 5000 → 4600 · after restart: owned has it true · faction cells · scrip 4600
the control: after restart: owned has it false · faction null · scrip 5000 (was 5000)
```

`tests/sqlite.test.ts` drives each store with the same script as its memory twin, requires the
same answer, closes the database, reopens it from disk and requires the answer again — the case
the memory store cannot pass.

**What one box gives up.** Durable Object scaling, and the process boundary between the match
host and the money keys that the three-Worker deployment keeps. `docs/DEPLOY.md` §6 says how to
run it and says that.

**Acceptance.** `probe:persist` 5/5; `npm test` 422 (8 new); typecheck clean on both configs;
`probe:counter` 16/16 and `probe:run` 18/18 still on the memory host, unchanged.

## Stage 50 — The phone measures itself

**Goal.** Every frame-time number in this document comes from software GL on a CI runner. That
measures whether a frame allocates, not how long it takes on a mid-range Android, and a device can
only be measured by the device. This is `docs/PLAN.md`'s second item: the instrument, so that a
phone opened on the deployed site produces a row I can read without holding the phone.

**The instrument.** A page opened with `?perf=1` builds a frame monitor; any other page never
constructs it and pays nothing. On, it costs one subtraction per rendered frame — hidden-tab timer
ticks are not frames and are not counted — and draws the percentiles on the HUD twice a second:
fps, p50 / p95 / p99 / max, draw calls, triangles, the post chain's internal scale, the GPU's
unmasked renderer string when the browser gives it, the viewport and pixel ratio. After
`?perfAfter=` seconds (default 30) with at least sixty frames it posts one report to the ledger
host and says REPORTED, or says why not. `GET /perf` lists the newest fifty: memory on the Node
host, a `perf_report` table on the Worker, in both schema files so the parity test holds.

**What a host will store.** The route is open, so `validReport` bounds every field: string lengths,
numeric ranges, at least `MIN_FRAMES`, percentiles in order, and `touch` read as a strict boolean.
A frame longer than 500 ms is a tab switch or a debugger, not a frame, and is left out of the
statistics rather than averaged in as a slow one — the same excess the game loop already drops.
Mutation-tested by counting it: the tab-switch case fails.

**Out of the simulation's reach.** The report module imports nothing; nothing under `shared/` or
`server/` imports the client, so the sim cannot see the monitor, the HUD, or anything else the page
owns. Both are pinned.

**Proof.** `smoke` opens the built site with `?perf=1&perfAfter=3`, waits for the report to post,
reads it back from the host by user agent and viewport, and posts garbage to see it refused:

```
posted true after 3 s · frames 61 · p50 … p95 … ms · listed 1 · mine SwiftShader… 640x360 · garbage refused "not a frame report"
```

**The reading is yours to take.** Open the deployed site on the phone with `?perf=1`, play for
thirty seconds, and the row appears at the match Worker's `/perf`. The stage ships the instrument,
not the number, and the number is the one that decides whether Stage 32's internal scale and
mirror cut were enough.

**A check that read the flag too early.** The first smoke run reported `posted true · listed 0`:
the monitor set `posted` the moment the request *left*, the probe read it, asked the host, and
found nothing there yet. The same mistake as Stages 33, 35 and 47, one function long. `posted`
now means the host said yes, with a separate in-flight guard, and a probe that reads it and then
asks the host finds the row.

**And a refusal that had to say why.** With that fixed the check failed one run in three with the
host answering only "not a frame report". The validator now names the field, both hosts pass the
name through, and the next failure read `frames: 59 outside 60..`: the monitor decided to post
when it had sixty *samples*, but the statistics drop any sample over 500 ms, so one long load
frame under SwiftShader left the kept count a frame short and the host was right to refuse. The
gate now counts the frames the statistics will keep. An instrument that refuses without saying
what it refused is a second instrument to debug.

**Acceptance.** `npm test` 414 (8 new); typecheck clean; `smoke` 7/7 on the built site twice running after the gate fix;
`probe:mobile` 14/14; `probe:frame` 6/6 run alone — a first run with the unit suite on the same
cores tripped its hitch ratio at 4.1×, which is the probe measuring the machine, not the change.

## Stage 49 — A crew: the co-op campaign gets a door

**Goal.** The co-op campaign has been playable on the server since Stage 10 — the mission runtime
steps on the room, the first file in is the host, completion settles on every file — and no player
could reach it. The client entered co-op only from a hand-typed URL. This is the first item of
`docs/PLAN.md`: a way to start a contract with a friend and a way for the friend to find it.

**A crew is an invite code naming a co-op room.** `shared/net/crew.ts` makes the code with the
private rooms' alphabet (Stage 20), names the room `crew-<CODE>`, and builds the page a crew member
travels to: the contract's district, co-op mode, the mission, and the room's socket on the campaign
host. The code is the access control, as it is for a private room. A crew nobody is in for a while
stops existing on either host, which is what a Durable Object and the Node host's room map already
do.

**On the desk.** Every launchable contract gets **RUN WITH A CREW** beside launch: the same
`canLaunch` gate as solo, then a code, then travel. A **CREW** section takes a typed code, looks it
up on the campaign host (`GET /crew/<code>` answers with the contract, its district, who is in it
and where it stands) and travels to it; a code the alphabet could not have made is refused before
any network, a code nobody opened is refused by the host, and a crew whose contract is already
closed says so. In a crew, the desk and the HUD's objective line both carry the code, so the host
can read it out.

**Asking about a crew must not create one.** The campaign Worker's room is a Durable Object that
comes into being when fetched. The lookup route reaches it with `/info`, and the object answers
"no such crew" without building a room when it has none — mutation-tested by letting the lookup
build the room first, which fails the case.

**Proof.** `probe:campaign`'s co-op leg no longer starts from a URL. The host starts the contract
from the desk, the guest looks the code up and joins with it typed in lower case, and every check
that followed — both see the contract and their crew's code, the host holds the terminal, the
room completes and settles on both files with the host's testimony — runs against the room the
code named:

```
code GHZ9NKGF · lookup {"ok":true,"mission":"m1_wake_unlisted","level":"lease_row","players":1,"status":"running"}
· bad code "no such crew" · typo "that is not a crew code" · unknown "no such crew"
· guest joins the same socket true
```

`tests/crew.test.ts` pins the pure parts (naming round-trips, the travel URL carries what the page
needs and drops what would fight it, a typed code is normalised or refused) and the two hosts'
answers against a real campaign room and a real in-process Durable Object.

**What a guest can and cannot get.** A guest may join a contract their own file has not reached.
That was already the room's business: settlement refuses out-of-arc completion per file, so the
guest plays and earns nothing until their own arc is there. Kernel Protocols in a crew are each
file's own, as the co-op room has applied them since Stage 10.

**A test the calendar decided.** Running the suite after the last edit turned up three failures
in `tests/private.test.ts` that had nothing to do with a crew: the public-room cases read a room
with nobody in it. They failed on the previous commit too. The fixture built its public room with
`currentAudit()` — the real week's playlist — and on Monday the rotation reached STACK & PHAGE,
which admits three weapons and not the fixture's kit, so the join was refused at the door and
`Math.max()` over no players quietly produced a player id that matched nothing. The suite was green
on 11 September under HEAVY AIR and red on the 15th with no change to the code: a test whose answer
depends on the day it is run measures the calendar. The playlist is pinned to one that admits the
kit, that fact is asserted so the pin cannot drift, and the fixture now throws on a refused join
rather than returning an empty room. Mutation-tested by pinning this week's playlist instead: the
guard case fails and says why.

**Acceptance.** `probe:campaign` 28/28 (1 new) twice running; `probe:endgame` 16/16 this week;
`npm test` 406 (6 new); typecheck clean on both configs.

## Stage 48 — The phone's first download carried the chain client

**Goal.** Stage 45 made the site installable and Stage 46 made it boot offline, so the question
became what a phone actually downloads before it can draw a frame. The answer was one 1.3 MB
script, and the build had been warning about it since Stage 11b. This stage measured what was in
it and moved the part a player does not need to wake, walk and shoot out of the way.

**The measurement first.** No new dependency: the production source map already says which
source went into the bundle, and a forty-line script grouped its `sourcesContent` by package:

| share | source | what |
| --- | --- | --- |
| 51.4% | 2049 KB | three |
| 18.0% | 717 KB | viem |
| 5.5% | 218 KB | ox |
| 4.5% | 180 KB | `shared/sim` |
| 3.6% | 145 KB | `client/render` |
| 2.8% | 111 KB | @noble/curves |
| 1.2% | 48 KB | @noble/hashes |
| 0.9% | 37 KB | abitype |

Three is the renderer and stays. viem, ox, the noble curve and hash libraries and abitype are the
chain client — a quarter of the source — and every byte of it was there for one file,
`client/counter.ts`, which links a wallet, buys a skin and writes a name. The sim never touches it;
the room never touches it; a player who never opens the ledger never calls it.

**One static import became a dynamic one.** `client/file.ts` built the counter client in its
constructor. It now builds it in `ensureCounter()`, behind `import("./counter")`, the first time the
ledger is opened, asked about through the game hook, or acted on — and a file with no shop
(offline) never loads it at all. Every panel action and every `window.__game` counter hook goes
through that one gate, so nothing changed for the probes that drive the ledger: `probe:counter`
16/16, `probe:run` 18/18, `probe:harden` 9/9, untouched.

**The numbers.** Vite emitted the chain client as its own chunk:

| | before | after |
| --- | --- | --- |
| first script, raw | 1,318,366 B | 932,196 B |
| first script, gzip | 372,496 B | 265,078 B |
| chain client chunk, raw / gzip | in the above | 386,632 B / 107,647 B, on demand |

The first download is 29% smaller by either measure, and the part that moved is fetched by the
players who use it, when they use it. The service worker's install-time precache (Stage 46) reads
the shell's references, so the offline boot still carries exactly what booting needs and nothing
it does not.

**Pinned twice.** `tests/bundle.test.ts` walks the static *value*-import graph from the client
entry — `import type` lines skipped, since they are erased at build time and `file.ts` keeps one
for the client's type — and asserts it never reaches a module that imports viem, ox, abitype or
noble, while the dynamic edge is really there and the walk really reaches the sim and the renderer.
Mutation-tested by restoring the static import: the graph test fails. And `smoke` proves the same
fact on the built site, as a phone would see it: booting and joining a room requested no counter
chunk; asking for the ledger requested exactly one.

**Acceptance.** `npm test` 400 (3 new); typecheck clean; `smoke` 6/6 on the built site;
`probe:counter` 16/16, `probe:run` 18/18, `probe:harden` 9/9.

## Stage 47 — The probe walked past the room: probe:campaign failed CI at Stage 44

**Goal.** CI run #74 (Stage 44) was red on one step, `probe:campaign`, and the failure reproduced
locally at once: "co-op: the contract completes on the room and settles on both files" reported the
room still *running*. Stage 44 touched nothing in the campaign, the room or the sim, and the same
commit passed 27/27 in a clean worktree, as did Stage 42 and Stage 43. Eight runs of the same code
gave three failures. That is not a root cause, so this stage found one.

**What the failures looked like.** The check's detail was made to print the room's objective and
where both Blanks stood when the window closed. The failures were not one thing:

```
room running at "TAKE THE FILE FROM THE CABINET AT E" (reach)
room running at "GET OUT THROUGH THE PLAZA" (reach)
  · A at (33.7,-9.1) hp 70 bot done false · B at (-27.9,27.9) hp 70 bot done false
```

Both alive, both mid-walk, both far from the plaza, the room one objective from done. Nothing in the
game had failed. The co-op leg was a *script*: walk to B, wait up to 30 s for the hold, wait up to
30 s for the reach, walk to E, wait up to 30 s for the terminal, walk to A, wait up to 30 s for
complete. Every window closed on its own clock and the script moved to the next leg whether or not
the room had. A walk that overran its window — a re-leased Blank respawns at a spawn point and has
to be walked back; a slow machine walks slower — left the bots being sent to A while the room was
still waiting at E, and the final window found exactly that. The same shape as Stages 33, 35, 36,
39 and 42: a check that stopped waiting before the thing it asserts about had happened.

**The fix is to follow the room, not a script.** The leg now reads the room's current objective
from the host's stats, looks its spot up in the mission definition, sends both Blanks there, plays
the terminal when the objective is a dialogue, and re-routes a Blank that is done, was re-leased,
or has not moved in four seconds. It stops when the room says *complete* or one overall deadline
passes. There is no leg the probe can be at that the room is not.

**And the number that says how close it runs.** Each leg's duration is printed:

```
legs [reach the escrow 4.5s, hold the terminal 20.1s, take the file 6.1s, the file 0.7s, get out through 3.7s]
legs [reach the escrow 4.5s, hold the terminal 20.1s, take the file 19.1s, the file 0.7s, get out through 4.1s]
```

The walk to E ran from 6 s to 19 s across three clean runs on the same machine — a re-lease during
the wave at B is the difference — against a window that used to be 30 s and was shared with the
terminal. The old check was one bad wave from failing on any machine, and did.

**Acceptance.** `probe:campaign` 27/27 three times running, and once more under three busy loops
on a four-core box, where the E leg ran 13.6 s and the plaza leg 10.7 s; typecheck clean. Run #74
was red on this step alone; runs #75 (Stage 45) and #76 (Stage 46) were green throughout, this
step included, which is what an intermittent failure looks like from CI.

## Stage 46 — "The shell opens offline" was a sentence; a first visit could not boot

**Goal.** Stage 45's entry says the service worker is there "so the shell opens offline", and its
smoke check proved the shell was *cached*. Those are different claims. This stage makes the smoke
probe test the one that matters — a player's actual first visit, then no network — and the first
run of that check failed.

**The measurement before the fix.** A fresh browser context with no worker in it, one online load,
the worker seen to install and take the page, then the preview server *killed* — not emulated
away, so nothing but the worker's caches can answer — and a navigation to the game:

```
installed on first visit true · origin down · page loaded true · game ready false · tick 0
· 2 failed: net::ERR_FAILED /assets/index-Dkjj_Csx.js | net::ERR_FAILED /assets/index-D2tVcnYE.css
```

The shell came from the cache. Every bundle under it failed, and the game never booted. The cause
is the order of a first visit: `index.html`'s `<script>` and stylesheet are requested before the
worker controls anything, so they were never routed through it, and install had cached `/` alone.
An installed app with nothing in it but its front door.

**An earlier draft of the check passed, and was wrong.** The first version ran the offline
navigation in the *same* context the earlier checks had used. It passed at once — because those
checks' own page loads, made after the worker took control, had pulled the bundles through the
stale-while-revalidate path on their way past. That proved the *second* visit could boot offline,
which no player installing from a first visit gets. The check moved to a fresh context with exactly
one online load before the origin goes down.

**Fix one: install precaches what the shell references.** The install step now fetches `/`, reads
every `/assets/` and `/icons/` reference out of the HTML, and `addAll`s them into the runtime cache
before install completes. `sw.js` stays a static file that knows nothing about Vite's hashed names;
it reads them from the page it just cached.

**Fix two, found only because fix one was measured.** With the cache demonstrably full — a
diagnostic dumped the runtime cache after one visit and both bundles were in it — the bundles still
failed. The origin answers with `Vary: Origin`, and a module `<script>` request carries an `Origin`
header that the install-time fetch did not, so the Cache API refused to match the entry the install
step had just stored. The lookup now passes `ignoreVary: true`: the bundles are content-hashed and
no request header changes their bytes. Had the first fix been declared done on the strength of the
cache being populated, the shipped worker would have been exactly as broken as before.

```
installed on first visit true · origin down · page loaded true · game ready true · tick 57
· 0 failed: none
```

**Acceptance.** `smoke` 5/5 on the built site, the fifth being the first-visit-then-offline boot;
`npm test` 397 (1 new, pinning the precache step and the `ignoreVary` lookups); typecheck clean.
The before/after above is the mutation test: the same check red on the Stage 45 worker and green
on this one.

## Stage 45 — Installable: a phone can put MELTDOWN on its home screen

**Goal.** Stage 32 made the game playable on a phone and Stage 34 kept it fair there; a phone
still had to reach it through a browser tab, with the address bar taking a strip of a screen that
Stage 32 measured to the pixel. This makes the built site a Progressive Web App: a manifest the
browser will offer to install, a service worker so the shell opens offline, and a standalone
landscape window with no chrome. Nothing about the game changes; this is the wrapper the phone
needs to treat it as one.

**What the worker is allowed to touch, and the test that says so.** A service worker sits between
the page and the network, and this game's network carries money. So `public/sw.js` is hand-written
rather than generated, and it is short enough to read: it returns before doing anything for a
request that is not a same-origin GET, or that is a websocket upgrade, so the room sockets, the
ledger host and the chain RPC never pass through it. Navigations are network-first with the cached
shell as the fallback, so a connected player always gets the newest build; only `/assets/` and
`/icons/` are served stale-while-revalidate. `tests/pwa.test.ts` pins each of those rules and one
more: the worker's *code* names none of the hosts the money or the match lives on.

That last test was mutation-tested and the first version did not fail. The check strips comments
before matching, because the worker's header comment says in words what it avoids; the stripper
treated the `//` in `https://` as a line comment and deleted the very URL the mutation had planted.
A comment now opens only at the start of a line or after whitespace, and the same mutation fails
the test. A check that cannot fail is not a check, and the only way to know is to make it fail.

**Registered in production only.** `client/pwa.ts` registers the worker under `import.meta.env.PROD`
and nothing else, so the dev server and every headless probe run exactly as before, with no cache
between them and the code they measure. `window.__game.pwa()` reports whether the worker is
supported, registered and controlling the page, which is how the smoke probe reads it.

**Proved on the built site, not the source.** `npm run smoke` serves `dist/` and now asserts the
whole chain end to end: the manifest is served with status 200 and names the app; both icons
exist; `navigator.serviceWorker.ready` resolves, the page is controlled, and the shell cache is
populated:

```
manifest 200 "MELTDOWN" standalone 2 icons · sw ready true registered true controlled true
· caches [meltdown-shell-v1, meltdown-runtime-v1]
```

Cloudflare Pages reads `public/_headers`: the worker is sent `Cache-Control: no-cache`, because a
browser-cached worker is one an update cannot reach, and the manifest gets its own content type.

**Icons for nothing.** The two PNGs the manifest requires are drawn procedurally by
`tools/icon-make.ts` in the Chromium that Playwright already installs (`npm run icons:make`): black
ground, the cyan M with a melt, the magenta rule, scanlines. 4.2 KB and 14.8 KB, zero credits, and
`tests/pwa.test.ts` reads each PNG header to check the file on disk is the size the manifest claims.

**A note on the first typecheck.** The registration call was inserted by a script that looked for
the `window.__game =` object and the next `};`, and the next `};` closes an arrow function *inside*
that object. The call landed mid-literal and the typecheck caught it before anything ran. The
lesson is the one from Stage 44 with a shorter loop: run the check after the last edit, every time.

**Acceptance.** `npm test` 396 (7 new); typecheck clean; `smoke` 4/4 on the built site with the
worker controlling the page; `probe:mobile` 14/14, `probe:frame` 6/6, `probe:counter` 16/16,
`probe:net` 16/16; `dist/` carries `manifest.webmanifest`, `sw.js`, `_headers` and both icons. The
host-name test was mutation-tested with a `workers.dev/rpc` URL planted in worker code.

**Still open for mobile.** Frame times on real phone silicon: every number above comes from
software GL on a runner, which says whether the frame allocates, not how long it takes on a
mid-range Android. That measurement needs a device.

## Stage 44 — Four skins, four plates, and a check that the lint cannot make

**Goal.** Stage 43 built the pipeline and ran one texture through it. This runs the other three, so
every on-chain cosmetic the game sells has a plate rather than one having a plate and three having
a tint — and adds the one check a disk-side lint cannot make.

**Six credits, priced before spending.** PHOSPHOR TRIM, KERNEL PLATE and DEADLETTER WHITE, one batch
on `nano_banana_pro` at the 2-credits-a-still rate preflighted in Stage 43. The ledger shows exactly
three −2 entries for it. Each came back at roughly 6 MB, each went through `tools/asset-add.ts` to
256², and each landed between 107 and 140 KB: the manifest is now four assets at 542.7 KB of the
4 MB budget, and the bytes and hashes in it were printed by the tool rather than typed.

**The check the lint cannot make.** `lint:assets` reads the PNG header and the hash. A file that is
corrupt past the header, or that the GPU path rejects, passes the lint — and because the loader
fails soft by design, nothing downstream would complain either. The rig would just show a tint.
`probe:counter` now loads every declared asset through the real pipeline in a real browser and
asserts each one decoded:

```
every declared asset decodes in the browser (4 in the manifest) — 4/4 decoded
```

Stage 43 had proved this for the one plate a skin happened to wear. That is a fact about one file;
this is a fact about the manifest.

**A correction to Stage 43, and the test that made it.** Stage 43's CI run (#73) failed. Its
`npm run test` step went red on `tests/verify.test.ts › no step can skip the ones after it` — the
check Stage 30 wrote after thirty-nine runs skipped eighteen steps — and it was right. The
`lint:assets` line had been inserted *between* `lint:campaign` and its `if: !cancelled()` guard, so
the new step took the guard and `lint:campaign` was left without one. Exactly as Stage 30 predicted,
the red test step then caused GitHub to **skip `lint:campaign` entirely**: a check quietly not run,
which is the one outcome that gate exists to prevent.

Stage 43's entry reported "`npm test` 389; typecheck clean" and that was true of the tree it was
measured on — the suite was run *before* the workflow file was edited, and not again after. A
verification that does not cover the last edit is not a verification of the commit. The guard is
restored here, the verify test is green, and the whole suite was run after the final edit this time.

**Acceptance.** `lint:assets` 4 assets, 542.7 KB, 0 violations; `lint:economy` 0 violations;
`npm test` 389 with `tests/verify.test.ts` 5/5; typecheck clean; `probe:counter` 16/16,
`probe:mobile` 14/14, `probe:frame` 6/6, `probe:file` 19/19, `probe:net` 16/16, `smoke` 3/3; the
four plates ship in `dist/assets/`.

## Stage 43 — Somewhere to put a picture

**Goal.** Forty-two stages in, MELTDOWN had **no source art at all**. Every texture is a
`CanvasTexture` drawn at runtime, the audio is synthesised, the geometry is Three.js primitives —
seventy image files in the repo and all seventy of them proof screenshots under `docs/proof/`. That
is why Stages 21–22 could measure the frame budget so exactly, and it is why `docs/ECONOMY.md` §6.1
has counted the Forge at zero since Stage 19. The blocker was never the pictures. It was that there
was nowhere to put one, and no rule about what putting one there would be allowed to change.

**The rule first, because it is the one with teeth.** `AssetDef` has an id, a file, a size, a byte
count, a hash and a line of provenance. No damage, no speed, no cooldown, and no room to add one:
`tests/assets.test.ts` pins the key set and then walks the static import graph — the same walk
`tests/quarantine.test.ts` uses for the Kernel Protocols — to prove that `shared/sim/world.ts`,
`server/room.ts` and `server/worker.ts` cannot reach the registry at all. An asset that the
simulation cannot see cannot change a shot, a hitbox or a hash, whoever authored it.

**Everything is optional.** The loader returns `null` on a miss, a 404 or a decode failure, and every
caller keeps the procedural path it had before. Delete the whole manifest and the game runs exactly
as it did at Stage 42. An art pipeline that can take the build down would be a downgrade.

**The budget is declared, not discovered** — and it bit immediately, which is the point. The texture
this was built around came back from the generator at **2048² and 8.7 MB**: sixteen times the
per-asset ceiling, twice the edge limit, and on its own over the whole-project budget. The lint
reported all three:

```
✗ raw_probe [per-asset-budget] 8734868 bytes over the 524288 ceiling
✗ raw_probe [texture-edge]     2048 over the 1024 edge, which is GPU memory rather than download
✗ (all)     [total-budget]     8899876 bytes over the 4194304 budget
```

So something has to do the reducing, and doing it by hand is how a manifest drifts from the files it
describes. `tools/asset-add.ts` centre-crops, resizes to a power of two and re-encodes — in the
Chromium Playwright already installs for the probes, rather than adding an image dependency — then
prints the `bytes` and `sha256` for the manifest. At 512² the result was 636 KB, still over the
ceiling; **the asset moved to 256², not the budget to 636 KB.** 161 KB, inside both limits.

**Proved end to end, not just declared.** RUST LEASE is the first cosmetic to name a texture, and
`probe:counter` buys it on chain, wears it, and waits for the plate to arrive:

```
the worn skin's plate texture loads from the asset pipeline: requested, loaded, none failed
  — skinMap true · requested 1 loaded 1 failed 0
```

That check exists because fail-soft is exactly the behaviour that lets a broken pipeline look fine:
`skinMap` stays null, the tint still applies, and nothing complains. Waiting for the texture and
asserting it is the difference between a pipeline and a promise.

**What this does and does not unblock.** §6.1 needed three things — uploads, moderation, and an
asset pipeline. This is the third. The first two are the part no amount of code here supplies: who
may add an asset, and who says yes.

**Acceptance.** `npm test` 389 (15 new); typecheck clean; `lint:assets` 1 asset, 161.1 KB of
4096.0 KB, 0 violations, and wired into `verify` and CI; `probe:counter` 15/15, `probe:frame` 6/6,
`probe:mobile` 14/14, `probe:file` 19/19, `probe` 13/13, `probe:net` 16/16, `smoke` 3/3; the asset
ships in `dist/assets/`. The lint was mutation-tested against a drifted byte count, a changed file,
a wrong declared size and the raw generator output.

## Stage 42 — The check accused the game of something the game cannot do

**Goal.** `probe:mastery` failed on CI run #70 — the probe Stage 39 had just fixed — with a line that
should not exist:

```
FAIL  sim: the firmware patches the held weapon and chip mods apply only while it is held
  — LB burst {"count":3,"rpm":900} … · swapped true · SMG burst {"count":3,"rpm":900} range ×1.03
```

`swapped true`, and the SMG carrying the rifle's burst and the rifle's chip mods. Read plainly, that
is a firmware leaking onto a weapon it was never fitted to — a fairness bug, in a game whose PvP pays
$CAPITAL.

**It is not, and the sim can prove it.** Both accessors are pure functions of the held slot:

```ts
export const weaponDefOf = (p, slot = p.weapon.slot) => p.kit.defs[slot] ?? stockDefOf(slot);
export function modsFor(p, slot = p.weapon.slot) { const chip = p.kit.mods[slot]; … }
```

There is no cache between the slot and either of them, so "slot is 3 but the numbers are slot 1's" is
not a state the game can be in. A failure with that shape has only ever had one possible cause: the
slot was not 3 when the numbers were read.

**Stage 39 fixed half of it and left the other half open.** It stepped until the swap landed instead
of assuming a fixed forty ticks — correct — and then advanced twenty more ticks and sampled in a
*second* `page.evaluate`. The page is joined to a room, so a snapshot from a server that has not yet
seen the input can reconcile the slot back inside that gap. Confirming a precondition and then
sampling later is the same mistake as never confirming it, just harder to see. One evaluate now, with
the slot asserted beside the numbers it governs, so a rollback fails saying the slot went back.

**And the property moved to where it belongs.** A rifle firmware not reaching another weapon is a
fact about the sim, not about a networked browser page: it needs no client, no server and no clock.
`tests/mastery.test.ts` now holds it directly — the rifle's slot carries the burst and the mods,
*every other weapon's slot* carries neither (not just the one the probe happens to switch to), and
moving the held slot moves which numbers apply with nothing left over. Mutation-tested by making the
accessors fall back to the first fitted kit instead of the held slot — the actual leak the check is
named for — which fails three cases including the one Stage 7 wrote.

The probe check stays. It is worth knowing the whole stack agrees. But it is no longer the only thing
standing between a fairness bug and the build, and it no longer fails on a two-core runner for a
reason that has nothing to do with weapons.

**Acceptance.** `npm test` 374 (3 new); typecheck clean; `probe:mastery` 23/23 three times running,
now reporting `holding slot 3 · SMG burst null range ×1 move ×1`.

## Stage 41 — The sweep that returns the money had never been run

**Goal.** `docs/ECONOMY.md` §6 item 4, open since Stage 24:

> **Reclaimed emission goes to the treasury, not back to the pot.** That is what the contract does
> and it is defensible, but a day whose prizes went unclaimed arguably under-emitted and should be
> able to make it up.

That is a design question, so it wanted deciding rather than building. Going to answer it turned up
something else first.

**The `reclaim` path had no test at all.** Two cases existed — "too early" and "no such epoch" — and
both of them are guards in *front* of the sweep. The branch where money actually moves back to the
treasury had never executed in a test, because the dev chain could not reach the vault's ninety-day
deadline: `server/chain/devnet.ts` took its block timestamps straight from `Date.now()`. anvil and
hardhat both expose `evm_increaseTime` for exactly this; the devnet has it now, and the path the
treasury depends on is covered — the full sweep, a partial one where the only file claimed first and
nothing is left to take, no late claim afterwards, and a second sweep that takes nothing.

**The decision: it stays retired.** Re-issuing reclaimed emission would stop the schedule being a
ceiling, which is the whole point of Stages 17–19. And it would pay the players who are still here
for the ones who left: the more files walk away without claiming, the more the remainder earn.
Churn should not be a revenue source. A day that under-emits stays under-emitted.

**Made enforceable, after a first attempt that was not.** The obvious test — settle a day, reclaim
it, settle the next day, assert nothing changed — is close to vacuous, and the mutation test said
so by not failing. `runPot` is pure, so a comparison of it with itself moves together under any
change; and at test scale the per-unit ceiling sets the rate, which hides the pot entirely. What can
actually fail is the pot's *definition*:

```ts
expect(runPot(day)).toBe(dailyEmissionBudget(day) * RUN_EMISSION_SHARE);
```

No other term, on any day. That is what fails if someone wires the reclaimed balance in. The
end-to-end case is kept alongside it and now states what it does *not* show, rather than implying it
shows more.

**And a number, because "it went back to the treasury" was a log line.** `PrizeVault.reclaimed`
counts what came back and `treasury()` reports it on its own line — not folded into `burned`, since
the tokens are in the treasury rather than destroyed, and not into emission either.

**Acceptance.** `npm test` 371 (4 new); typecheck clean; `lint:economy` 244 items 0 violations;
`probe:counter` 14/14, `probe:run` 18/18, `probe:endgame` 16/16, `probe:harden` 9/9.
Mutation-tested both ways: dropping the `reclaimed` counter fails the sweep case, and an extra term
in the pot fails the definition case.

**A near miss worth recording.** Rewriting the §6.4 block by slicing to the file's last `});`
swallowed the four backlog tests Stage 40 had appended after it. The test count going 23 → 20 while
the block under edit still listed all six of its own cases is what caught it. Restored from `HEAD`
and verified at 24.

## Stage 40 — The backlog walk, and why the loop everyone imagined was the wrong shape

**Goal.** `docs/ECONOMY.md` §6 has carried this since Stage 24:

> **The reconciliation only walks one day.** Running it over a backlog is a loop the caller has to
> write; nothing walks the history looking for old drift.

The nightly cron reconciles the day it just settled. Drift older than that has no way of being
noticed: the file still says it is owed, the night has moved on, and nothing walks back.

**The loop the note imagines does not work.** A file's counter carries exactly one run day —
`counter.run.day` — so a file can only ever be drifted on *that* day. `for (day of last30)
reconcileRunDay(day)` re-loads every linked file thirty times to find drift that can only be in one
place per file, and it still misses anything older than whatever window the caller picked. The
window is the bug, not the missing loop.

**Driven off the files, it is one pass with no window at all.** Each file names its own day; days are
read once each however many files share them; nothing older is out of reach because nothing is out of
range. `reconcileRunBacklog` is O(linked files), not O(files × days).

**Today is skipped by default,** and that is the part with money in it. An `unrecorded` repair adds
the missing units back to the banking table, and a bank whose D1 write is still in flight is
indistinguishable from one that was lost — repairing it would pay for the same units twice.
Yesterday and earlier are finished; today is not. `includeToday` exists for a caller who knows
better, and the case that holds the default is the one worth reading.

**One definition of the rules.** `reconcileRunDay` and the backlog walk both need the unrecorded /
stranded pair, and two copies would drift apart — which, in this file, would be a poor joke. They
share `driftOf`, and the day-walk's four existing cases still pass unchanged, which is what says the
extraction was behaviour-preserving.

**A line removed because a mutation test did not fail.** The walk cached each day's banking rows and
updated that cache after a repair, commented as keeping a second file on the same day from reading a
stale row. Deleting the line broke nothing — correctly, because the cache is keyed by *file* and
every file is visited once, so nothing in the pass ever reads that row again. The comment was wrong
and the line was dead. Both are gone.

**What the probe can honestly show.** `probe:run` runs the walk on a live host after its settlement
and asserts it finds nothing — a repair pass that reports drift where there is none is worse than no
pass at all:

```
the backlog walk runs over every linked file on a live host and reports nothing on a healthy one
  — 1 linked file(s) walked · 0 drift · 0 day(s) with a balance · 0 left for today
```

What it deliberately does **not** do is manufacture drift. A lost D1 write has no player-facing path,
and adding a "strand this file" op to the counter endpoint would put a test-only backdoor into the
money. The repair itself is proved in `tests/settle.test.ts` against a real devnet ledger, including
a file stranded a fortnight back and found without anyone naming the day.

**Acceptance.** `npm test` 367 (4 new); typecheck clean; `probe:run` 18/18, `probe:counter` 14/14,
`probe:endgame` 16/16. Mutation-tested: dropping the today guard fails the case named for it.

## Stage 39 — Three checks that read the answer before it arrived

**Goal.** CI run #66 failed three probes at once — `probe:mastery`, `probe:identity` and
`probe:harden` — where the first two had been green the run before. None of them was a timeout this
time. All three were checks reporting a fact about the game that was not true.

```
FAIL  sim: the firmware patches the held weapon (THREE-COUNT bursts)
      — LB burst {"count":3,"rpm":900} range ×1.030 move ×1.015 · SMG burst [object Object] range ×1.03 move ×1.015
FAIL  kill-confirm audio: a mastered file (rank 30) hears the tier-3 stamp
      — ALPHA kills 1 · kill_t3 0 · kill_t0 0
FAIL  the counter-ledger rate limit: past 30 requests a minute a file gets 429
      — limited 0 of 34 · first at #0
```

They look unrelated. They are the same mistake three times: **the check sampled the system before the
thing it asserts about had happened**, or measured a rate through a stopwatch it did not control.

**The firmware check read the rifle's numbers and called them the SMG's.** Look at the two halves of
that first line: `range ×1.030 move ×1.015` on the left, `range ×1.03 move ×1.015` on the right. They
are the same numbers, which is the tell — nothing had switched weapons, so the check was comparing
the rifle to itself. `advance(n)` is a deterministic loop of n ticks, which made a fixed forty look
safe; it is not, because the page is joined to a room. The client predicts the slot change and a
snapshot from a server that has not yet seen the input reconciles it away. It now steps until the
swap has landed, bounded, and asserts that it did — so a swap that never happens fails saying so
rather than blaming the chip mods for leaking across weapons.

**The stamp had not been played yet.** `duel` returns on the *server's* kill count. The kill-confirm
stamp is a client-side sound played when the kill event reaches the client, so reading the counter in
the next breath is a race the server always wins. `ALPHA kills 1 · kill_t3 0` is exactly that: the
kill had happened and the sound had not landed. Both stamps now wait for their own counter, bounded,
before the check reads it.

**The rate limit outlived its own window.** Thirty-four requests sent one awaited call at a time,
against a limiter whose window is sixty seconds from the first of them. On a runner where a round
trip takes two seconds the loop outlasts the window, the count resets, and nothing is ever refused —
`limited 0 of 34`, on a limiter working perfectly. Sent together they cannot outrun it, whatever the
machine is doing:

```
limited 4 of 34 in 0.1 s (window 60 s) · "RATE LIMITED: the counter-ledger takes 30 requests a minute per file"
```

The elapsed time is asserted alongside the count, so a burst that ever does exceed the window says
so instead of quietly measuring something else.

**The pattern is worth naming, because this is the fourth stage to hit it.** Stage 33 found nine
screenshots taken before the thing they were named for was on screen. Stage 35 found a probe reading
a DOM flag one frame after the state flipped, and another asserting on a counter that could not
distinguish the two outcomes. Stage 36 found a join budget measured against two pages fighting for a
core. Now three more. A check that samples on a fixed delay is not testing the game, it is testing
the machine — and it only ever fails on the machine you are not sitting at.

**Acceptance.** `npm test` 363; typecheck clean; `probe:mastery` 23/23, `probe:identity` 23/23,
`probe:harden` 9/9, plus `probe` 13/13, `net` 16/16, `run` 17/17, `campaign` 27/27, `wake` 14/14,
`file` 19/19 and `arsenal` 19/19.

## Stage 38 — The two numbers the whole projection rests on could not be measured

**Goal.** `docs/ECONOMY.md` §6 has carried the same admission since Stage 19:

> **`capUse` and `runnerShare` are guesses.** Every projection in §1 rests on them. They are the
> first thing to replace with telemetry, and the model takes them as parameters for exactly that
> reason.

Nothing was collecting the telemetry. That much was known. What was not: **nothing could have.**

**The day's gross banking was recorded nowhere.** `run_day.units` is decremented by `spend` every
time a file takes the direct withdrawal, and `run_settled.units` is only the part the night
actually settled. Between them they record what is owed and what was paid, which is what the money
needs — and neither is the day's gross, which is what `capUse` is a fraction *of*. There was also no
record at all of the denominator `runnerShare` needs: how many eligible files played and did not
run. Two parameters that every published figure rests on, and the game had no way of answering
either.

**`run_day_stat`, which nothing subtracts from.** One row per file per day: units banked gross, and
whether that file was past the run's Depth gate. `add` increments it alongside `run_day`; a new
`seen(day, file, eligible)` marks a file that finished a match, idempotent per day, so a file that
plays nine rounds counts once. The Room calls it where it already calls `applyMatch` — at
settlement, not at join, because a file that connects and leaves has not played a day.

**Pooled, not a mean of daily ratios.** The model multiplies `runners × cap × capUse`, so the
estimator it needs is total units over total runner-days. Averaging per-day ratios weights a day
with four runners the same as a day with four thousand, which is not the quantity the projection is
about — `tests/telemetry.test.ts` holds that with a two-day sample where the two disagree by 3×.

**And it refuses.** This is the part that matters. An estimate off nine runner-days is not worth
more than the documented guess it would replace, and it is worth considerably *less* if it carries
the authority of a measurement. Below `MIN_DAYS` / `MIN_RUNNER_DAYS` / `MIN_ELIGIBLE_DAYS` the
parameter comes back `null`, the stated assumption stands, and `summarise` prints which is which:

```
inputs:     capUse assumed · runnerShare assumed — no telemetry supplied
```

A `capUse` above 1 is likewise reported rather than clamped: the room refuses to bank past
`RUN_DAILY_CAP`, so a figure above it is a broken record and clamping would hide it.

Two things the arithmetic turned up on the way. Runners are a subset of the eligible, so
eligible-days can never be the smaller number and the two floors are not independent — any sample
rich enough for `capUse` already clears `runnerShare`'s denominator. And days with no play are
dropped rather than counted as zeros, or a quiet fortnight would drag the estimate down as if
nobody had banked when in fact nobody had played.

**Proved on a live host, both halves.** `probe:run` banks real units through a real room and then
reads `GET /economy` back:

```
the day's banking is recorded gross for the economy, and a sample of one day is declined
rather than published as a measurement
  — gross 2 units over 1 runner-days · capUse assumed · runnerShare assumed
    (1 of 7 days; 1 of 200 runner-days; 1 of 200 eligible-days)
```

**Acceptance.** `npm test` 363 (14 new); typecheck clean; `lint:economy` 244 items 0 violations;
`probe:run` 17/17. Mutation-tested both ways — removing the sample floors fails six cases, and
letting `spend` touch the gross record fails the one named for it. `tests/room.test.ts`'s
schema-parity check caught the new table missing from the Durable Object's self-healing copy, which
is exactly what it is for.

## Stage 37 — Three terminals asked a question and did not listen to the answer

**Goal.** The campaign lint has printed the same three notes since Stage 25:

```
note  testimony m1:lease:     written by a choice and read by no gate
note  testimony m5:lattice:   written by a choice and read by no gate
note  testimony m6:broadcast: written by a choice and read by no gate
```

Three of the seven missions stop the player at a terminal, offer two answers with real weight to
them — burn the evidence or keep it, blind the whole lattice or spare the docks, broadcast the fire
or redact it — write the answer to the file, and then never read it again. The arc could be played
twice, answered differently at three of its seven terminals, and come out identical. That is the
difference between a branching campaign and a campaign with branching-shaped dialogue.

The lint was right to report rather than enforce: a choice that is only characterisation is a
designer's call. This stage makes the call.

**`m1:lease` — burn it, or keep it as evidence.** Keeping it costs and pays, which is what makes it a
choice rather than a reward. The model knows a copy walked out of Lease Row, so DEADLETTER RUN
carries two more wasps hunting whoever is holding it. Then at TRIAL BY DATA that same file is the
proof the broadcast can attach, and a city shown the paper believes faster than one only told: the
closing hold drops from thirty seconds and two waves to fifteen and one. Burning it is the quiet run
and the long trial.

**`m5:lattice` — blind everything, or spare the docks.** Blind everything and SENSOR SABOTAGE · DOCKS
leaves the board: those posts are already dark, and a gig to break them is a gig with nothing to
break. Spare the docks and the model keeps its eyes there, so WAKE-CELL RESCUE · DOCKS is walked
under two extra wasps. One branch costs work, the other costs contracts.

**`m6:broadcast` — full, or redacted.** The last choice before the white office, so it lands where a
last choice should: on how the arc can end. Two hidden endings, mutually exclusive by construction,
one opened by each answer — THE CITY THAT READ THE FIRE, where they wake all at once and frightened
and the ledger burns by morning; and THE QUIET WAKING, where they wake one lease at a time, it takes
a decade instead of a night, and everyone lives through it.

**Held by tests, not by the note count.** `tests/campaign.test.ts` gained a block that asserts each
consequence directly — the extra patrol, the shorter hold, the gig that closes, the gig that hardens,
and each ending opening for its own answer and not the other. Mutation-tested one at a time: removing
any single consequence fails its own case, and removing all of them fails seven.

`probe:campaign` now plays the arc through with the broadcast answered, so the white office proves it
in the running game rather than in a unit:

```
the endings open follow the testimony — including the broadcast the arc chose
  — wasps 0 · objective "APPROACH THE DESK" · endings [wipe, chair, wipe_fire]
```

That line read `[wipe, chair]` before, whichever way the question had been answered.

**Acceptance.** `npm run lint:campaign` — 7 missions, 12 gigs, 6 endings, 9 testimony keys, **0
errors and 0 notes**, the first time it has had nothing to report. `npm test` 349 (7 new); typecheck
clean; `probe:campaign` 27/27.

## Stage 36 — The second page was the cost, and queueing made it worse

**Goal.** `probe:harden` timed out on CI three runs running — #61, #64 and #65 — always at the same
step, always with a different symptom: a socket stuck at `connecting`, then a client joined and
silent, then joined and silent again. It passed locally every time. Stage 35 guessed at it twice.

**What the diagnostic finally said.** Stage 35 added the clock to that timeout's dump, and run #65
paid it back immediately:

```
join state: {"status":"joined","synced":false,"snapshots":0,"joinMs":46451,
             "target":"ws://127.0.0.1:8814/room/audit-h?audit=1&ai=0&level=lease_row"}
[audit-h] player 1 (ALPHA) joined ...   17:11:12
[audit-h] player 2 (BRAVO) joined ...   17:11:57
```

Forty-six seconds from opening the socket to processing the welcome, against a forty-second budget —
while the host had logged that same join forty-five seconds earlier. Nothing was broken anywhere. The
page's main thread was not being scheduled, on a two-core runner carrying two software-GL contexts.

**The obvious fix is the wrong one, and a measurement said so.** Booting the two pages one at a time
looks like the answer to contention. It is twice as bad:

```
both booted together:      ALPHA joins in 4.3 s   BRAVO in 7.1 s    (wall 11.1 s)
BRAVO booted after ALPHA:  ALPHA joins in 1.1 s   BRAVO in 40.1 s   (wall 50.2 s)
```

A page that has finished booting and is rendering the district every frame is a far heavier
neighbour than one that is still starting. Queueing them does not remove the contention, it points
it at whichever page goes second. That change was written, measured, and reverted before it shipped.

**So the saving comes from drawing less.** Only ALPHA is ever screenshotted here
(`stage15-prizes.png`); BRAVO exists to occupy the room. `norender=1` gives it the whole simulation
and none of the software GL — the trade `probe:net` already makes for both of its clients:

```
both drawn        CPU=1  ALPHA 4.4–5.1 s  BRAVO 6.8–8.3 s      CPU=6  ALPHA 5.1–5.9 s  BRAVO ~5.9 s
only ALPHA drawn  CPU=1  ALPHA 0.8–0.9 s  BRAVO 0.04 s         CPU=6  ALPHA 1.6–1.7 s  BRAVO ~0.2 s
```

ALPHA's own join is about four times faster once nothing is competing with it, which is the whole
margin the forty-second budget was missing.

**Checked before generalising, and there was nothing to generalise.** Four probes boot two clients
the same way. `probe:run` and `probe:counter` screenshot *both* of their pages; `probe:endgame` and
`probe:identity` already give their non-photographed pages a 320×180 viewport. `probe:harden` was the
only one carrying a full-size rendered page that no check ever looks at.

**A correction to Stage 35.** That stage found the dev host stepping every room it had ever created
at 60 Hz for the life of the process, and stopped it — the Worker host has parked idle rooms since
Stage 13, and the log showing `[neochina-lease_row]` still running wasp kills forty seconds after its
sockets closed is real. It is recorded here as a genuine leak that was **not** the cause of this
timeout: run #65 carried that fix and `probe:harden` timed out anyway. The cost was in the page, not
the host.

**Acceptance.** `npm test` 342; typecheck clean; `probe:harden` 9/9 with the audit round, the Deep
Wake contributor, the rate limit and the kiosk all still passing, plus `probe` 13/13, `net` 16/16,
`run` 16/16, `endgame` 16/16, `counter` 14/14, `identity` 23/23, `campaign` 27/27, `crawl` 10/10 and
`ship` 9/9.

## Stage 35 — The clock ran backwards, and the check watched the wrong player

**Goal.** Run #62 was the first fully green CI run this branch has had. Runs #60, #61, #63 and #64
each failed a *different* probe — `probe:crawl` and `probe:run`, then `probe:harden`, then
`probe:net`, then `probe:net` and `probe:harden` together. Four probes failing one at a time across
five runs is not four coincidences. All four passed locally, every time.

**`probe:crawl`: a state the code could not produce.** CI read the skip hint hidden while the crawl
was still typing and still skippable:

```
FAIL  after the first view the crawl is skippable
      — seen true skippable true · hint false "[SPACE] SKIP"
```

The hint is hidden in exactly one place, the branch that raises the title, and that branch only runs
at the title — where `done` is true and `skippable` is therefore false. Both at once is impossible,
so the crawl had to have *been* at the title and left again. The only clock that runs backwards is
one fed a negative `dt`, and `OpeningCrawl.frame` took its `dt` straight from the rAF timestamp,
which is the start of the frame in progress and can predate the `performance.now()` the constructor
stored a moment earlier. `seek()` had clamped its clock to zero since Stage 12; the frame loop never
did.

One negative frame put `t` below zero, and `crawlAt`'s fallback for "no segment matches" handed back
the **last** segment — the title. The damage outlived the frame: the hint latched hidden, because the
branch is edge-triggered and fires on both transitions but only ever sets the hint to hidden; and the
title branch wrote the "seen" flag, marking a first-time player's opening as already watched.

Three fixes, at three layers: `dt` is clamped to zero, a `t` before the first keystroke resolves to
the beginning rather than the end, and the hint is derived every frame instead of latched.
`tests/crawlclock.test.ts` (6) holds the schedule against any `t` a caller can produce, including
that the far-edge fallback still works — the guard was added, not removed. Mutation-tested: reverting
the schedule fix fails four of the six.

**`probe:run`: the assertion was wider than the claim above it.** The check named
`inside the safe zone no damage lands` also asserted that the shooter's whole kill tally did not
move. drainage_yard's training dummies stand in the street — dummy 3 a little under 9 m from the
gate — so a round from a spray aimed past BRAVO clipped one and the check called it a safe-zone leak:

```
FAIL  inside the safe zone no damage lands — health 70 → 70 · ALPHA kills 0 → 1
```

The detail line could not settle it either way, which is the worse half: `BASE_HEALTH` is 70, so
"70 → 70" reads identically for a player who was never touched and one who died and respawned at
full. It now watches BRAVO's own death count, which can tell those apart.

`world.ts` carried the same overreach in a comment — "nothing inside one takes damage, and nothing
inside one deals it". The code protects **players**, which is the rule the game means, and the wider
one was never true: two levels route a wasp patrol straight through a gate. The comment now says what
is guarded and why the hole is deliberate, and `tests/safezone.test.ts` (7) pins both.

**`probe:harden`: a room nobody was in, simulating forever.** Two timeouts, two different stall
points — a socket stuck at `connecting`, and a client that joined and never received a snapshot. The
host's own log gave it away: forty seconds after the matchmaking check closed its eight sockets,
`[neochina-lease_row]` was still logging wasp kills and respawns while the next check waited for a
client to sync in a different room.

The Worker host has parked idle rooms since Stage 13. The dev host — the one every probe runs
against — never did, and stepped every room it had ever created at 60 Hz for the life of the process.
On a CI runner sharing two cores with two software-GL browsers that is not free. It now parks a room
ten seconds after its last socket leaves and restarts it on the next connection, matching production.

**`probe:net`: the sample, not the netcode.** The failure was `12/13` and `11/12` — 92% hit
registration with nothing clamped, and red because the check wanted 20 shots. Healthy netcode, red
gate. It reproduced here at once: four runs gave 26, 13, 20 and 26 shots against that floor.

The stall was Stage 34's own doing, and it is the more interesting half. That stage stopped the
driver firing into cover, correctly — a shot the level eats measures geometry, not hit registration.
But `goto` walks in a straight line, not a path, and from the north spawn the line to the lane runs
into the upper deck. BRAVO wedged there at about (0, −14.5), out of sight, and ALPHA held fire for
the rest of the run with seventeen rounds still in the magazine. The old harness had exactly the same
fault and could not see it: it fired through the deck instead, and every one of those shots came back
a blocked miss — which is the "every miss was blocked" signature Stage 34's investigation kept
running into without ever explaining.

The engagement now waits for a *sample* rather than a stopwatch, walks BRAVO back along the nav mesh
from wherever it actually respawned, and reports why it stopped in the driver's own terms (alive, in
front, visible — and the magazine). The floor and the hit-rate bar are two checks now, because they
fail for unrelated reasons. Six consecutive runs: 24–30 shots, 16/16 each, against 4-of-6 with stalls
at 13 before.

**Acceptance.** `npm test` 342 (13 new); typecheck clean over both configs; all sixteen probes green
in one sweep — `probe` 13/13, `look` 18/18, `net` 16/16, `arsenal` 19/19, `wake` 14/14, `file` 19/19,
`run` 16/16, `harden` 9/9, `identity` 23/23, `campaign` 27/27, `counter` 14/14, `endgame` 16/16,
`ship` 9/9, `crawl` 10/10, `mobile` 14/14, `frame` 6/6.

## Stage 34 — The slow client, made reproducible

**Goal.** `probe:net` has been green by hand and red on CI since Stage 2. Stages 30, 31 and 33 each
touched it; it was red on CI runs #42, #43 and #45 and green on #41. Every previous attempt reasoned
about the difference from a distance, because there was no way to produce it here.

**The reproduction.** `CPU=<n>` throttles the browser's main thread through CDP
(`Emulation.setCPUThrottlingRate`). `CPU=8` looked at first like it reproduced the CI failure on this
machine — the claim is withdrawn further down this entry, and the numbers below are kept only as the
reading that prompted it:

```
CI  (run #45):  12/60 hits (20%) · misses avg 0.12 m max 0.22 m
CPU=8 locally:   9/60 hits (15%) · misses avg 0.12 m max 0.25 m
CPU=1 locally:  21/24 hits (88%) · misses avg 0.00 m max 0.00 m
```

That is the artifact this failure has been missing for four stages. `CPU=1` is the default and
changes nothing, so the gate is unaffected until someone asks for a slow client.

**What the CI artifact settled first.** Downloading run #45's `stage-proof` and reading `stage2.json`
rather than inferring from the summary line: **Stage 31's fix is green on CI** —
`max error ALPHA 0.00e+0 m / BRAVO 0.00e+0 m over 1151 samples · gaps filled 0`. The check that held
the gate shut for thirty-nine runs passes. The two that fail are the hit-registration pair, and they
are a different fault.

**A real defect, which was not the one causing it.** `NetClient.remoteViews()` poses remotes at a
*continuous* view time `serverTickNow() - INTERP_DELAY_TICKS` and the player aims at what it drew;
`NetClient.viewTick()` reports `Math.floor` of that same quantity, and `Room.rewindFor` rewound to
exactly that integer snapshot. So the server reconstructed every target up to one whole tick before
the position the shooter was looking at — half a tick on average, and one tick at a sprinting strafe
is ~12 cm. `tests/subtick.test.ts` pins that: half a tick of travel at the mean, zero on a tick
boundary, worst just before the next one, and closed exactly by interpolating the rewind.

The client now sends the fraction it threw away and the server interpolates between the two
snapshots it already holds — the ones the client itself interpolated between — clamped so it can
never reach outside the rewind window.

**And it did not fix the hit registration.** Under the same `CPU=8` reproduction: 15% → 17%, misses
0.12 m → 0.13 m. That is inside the run-to-run noise. The sub-tick gap is real, provable and worth
closing on its own terms, but it is not what costs a slow client its shots, and it is recorded here
as a correction rather than a fix.

**A bisect that proved only that the measurement is too noisy.** Biasing the rewind by whole ticks
to look for a systematic skew gave:

```
bias -2: 49%   bias -1: 17%   bias 0: 17%   bias +1: 88%   bias +2: 57%
```

A real one-tick skew would be a smooth unimodal curve. This is variance: one 60-shot engagement, in
which a kill ends the engagement early, cannot resolve a one-tick effect. An earlier reading of the
first two rows as "two ticks back nearly triples the hit rate" was a conclusion drawn from noise,
and is withdrawn here rather than quietly dropped.

**The reproduction is a bias, not a switch.** A later `CPU=8` run passed outright at 90%. So the
throttle raises the failure rate — it does not reproduce the failure on demand, and the commit that
introduced it said so more strongly than the evidence supports. Corrected here.

**The cause: lag compensation has a ceiling, and the supported link nearly fills it.**

`Room.rewindFor` refuses to reach further back than `MAX_REWIND_TICKS = 12` — 200 ms at 60 Hz. A
shot's rewind demand is not a player's choice, it is arithmetic: the input takes half the round trip
to reach the server, and the client was already rendering remotes `INTERP_DELAY_TICKS = 6` behind
live. At the **150 ms RTT this probe advertises as supported** that is `4.5 + 6 = 10.5` ticks of a
12-tick budget — 88% of the ceiling spent before anything goes wrong, leaving **25 ms** of headroom,
which one dropped frame at 30 fps overruns.

Past the ceiling the shot is not compensated at all: it resolves against a world newer than the one
the shooter was looking at, and it silently misses. Under load the collapse tracks the clamp count
exactly:

```
clamped  0-2 of 25   88% hit-reg   rewind avg 10.9   misses avg 0.10 m, all inside the capsule
clamped  7   of 34   50% hit-reg   rewind avg 11.7   misses avg 0.23 m
clamped 70   of 70    9% hit-reg   rewind avg 22.8   misses avg 0.93 m, none inside the capsule
```

`tests/rewindbudget.test.ts` pins the arithmetic with no runtime noise in it, including the RTT at
which a perfectly smooth client cannot be compensated at all: **~200 ms**, an ordinary
transcontinental link.

**The second cause, and it was the bot.** `Bot.sample` fired whenever its crosshair was within
0.015 rad of the target — with no line-of-sight test, though `canSee` has existed in `shared/sim/ai.ts`
for the wasp AI the whole time. So the driver would happily shoot a silhouette standing behind a
kerb, and the server would record exactly what it should: a miss, blocked by level geometry. That is
why **every** miss in every run measured — the healthy 88% ones and the collapsed 20% ones alike —
came back `blocked`, and why the check's result depended on where the two bots happened to be
standing. Requiring line of sight before firing makes the run repeatable: two consecutive runs at
23/26 (88%) against a previous spread of 20, 50, 54, 88 and 90 per cent.

**Clamping is *a* cause and not the only one.** A later failing run came in at 20% hit registration
with **`clamped 0`**, a healthy 10.7-tick average demand, and all 51 misses inside the target's
capsule and blocked by level geometry. So there are at least two ways this check goes red: the
rewind ceiling under load, and an engagement in which the bot ends up shooting through scenery.
Saying "the cause" of the second, on the evidence of the first, would be the same mistake this stage
has already made three times.

**What the misses turned out to be.** Every miss in every run measured — healthy or collapsed — is
`blocked`: the ray struck level geometry before reaching the target, and `nearMiss` is not censored,
so those numbers were always real. On a healthy run the ray passes *inside* the target's own 0.4 m
capsule (0.10 m from its centre) and a kerb eats it. On a collapsed run it passes 0.93 m away,
because it was aimed where the target had been. The mean near-miss was never a statement about aim,
which is why four stages of reasoning from it went nowhere.

**A per-shot diagnostic that did not work, and how that was established.** An earlier attempt
replayed each miss against pose history either side of the reported tick and recorded the best-fitting
whole-tick offset. It clustered at +9..+11 on failing runs — suspiciously equal to the average rewind
depth. Running it where there is no bug settled it: at `CPU=1` with 88% hit registration it reads
`10:1 11:1`, **the same place**. A number identical whether the netcode is healthy or broken measures
the scenario's geometry, not the fault. Removed rather than kept behind a caveat, because it twice
looked like an answer.

**Three hypotheses eliminated by measurement, and two of my own readings withdrawn.**

1. *The sub-tick floor* — real, fixed, unit-tested, and worth 15% → 17%, inside the noise. Shipped on
   its own merits and labelled as not the fix.
2. *A whole-tick skew* — the bias sweep was variance. An earlier reading of two of its rows as
   "rewinding two ticks back nearly triples the hit rate" was a conclusion drawn from noise.
3. *The extrapolation branch* — holding instead of extrapolating: 17%, same cluster, no effect.

Also withdrawn: "`CPU=8` reproduces the CI failure". It failed 4 of 6 early runs and then 0 of 6 —
the difference was how busy the machine was, not the throttle. The reliable reproduction is the
throttle **plus** contention, which is what a shared CI runner is.

**The check now names its own cause.** `probe:net` asserts that fewer than 10% of shots ask to
rewind past the cap, and prints the demand against the budget. A probe reporting "15% hit-reg" with
no explanation cost four stages; this one says `70/70 shots asked to rewind past the 12-tick cap ·
avg demand 22.8 ticks, and 150 ms RTT alone costs 10.5`.

**The other budget, measured at the size the game sells.** `probe:net` asserts
`< 12 KB/s per client downstream` and measured it in a room of **two**. Matchmaking fills a public
room to **eight** before rolling to the next shard. The number the budget is about had never been
measured at the size the product runs.

It is now, over **eight real sockets** to the host — not browser pages, because downstream volume is
a function of who is moving and eight SwiftShader contexts is how `probe:mastery` came to time out:

```
2 clients (the old check)   10.49 KB/s per client
8 clients (the room cap)    14.70 KB/s per client · 117.6 KB/s off the shard
```

**22% past its own budget at the size matchmaking fills**, and all of it snapshots — 30 a second at
489 bytes each. That check is the authority on this number.

**Two corrections to how it was arrived at, both worth keeping.**

The first socket reading was **21.01 KB/s** and was wrong: the raw clients passed `ackTick: 0`, and
`rec.ackTick` is what selects a delta baseline server-side, so every snapshot came back *full* and
the figure described a protocol the game does not ship.

The in-process harness in `tests/bandwidth.test.ts` had the same fault plus a second one pulling the
other way — it drives a `Room` with `warmupSeconds: 0`, so the match never reaches its live phase and
the snapshots carry no wake nodes, no dummies, none of the entity payload a real round sends. With
both fixed it reads **3.16 KB/s** at eight players against the socket's 14.70, and its 2→8 ratio is
1.175× against the socket's 1.40×. So it does not predict the socket's level *or* its slope. Its
earlier extrapolations appeared to bracket 14.70; that was luck from two compensating errors and the
claim is withdrawn. The file is kept for the shape — per client linear in the others described, per
room quadratic — and now says so.

**The first cut, made and measured.** Entities and dummies now carry a mask against the acked
baseline, exactly as players already did — `E_POS`/`E_STATE`, `D_POS`/`D_STATE`. On the socket at the
room cap:

```
before   14.70 KB/s per client · 117.6 KB/s off the shard
after    13.00 KB/s per client · 104.0 KB/s off the shard   (two clients: 10.49 → 8.82)
```

**1.70 KB/s recovered, and still 8% over the budget.** The estimate going in was ~3.0, and the
shortfall is instructive: a wake node's *position* never moves, but its `hold` value changes every
tick while anyone is pulling it, so `E_STATE` fires anyway and only the 6 position bytes are saved.
Dummies are the same once they start taking damage. The saving is real and it is half what a static
reading of the encoder suggested.

`probe` 13/13 and `probe:wake` 14/14 confirm the nodes and dummies the delta touches still behave.

**And then under it.** Two more cuts, both measured on the socket at the room cap.

*The local authoritative block.* `LOCAL_FLOAT_KEYS` is forty-two fields written as `f64` — 336 bytes
at 15 Hz, about 5.0 KB/s of the 13.0 a client was receiving. Thirty-nine per cent of the budget in
one block, most of it timers sitting at zero. It is **deltaed, not narrowed**: these are the values
the client replays its prediction from, and Stage 31 spent a stage earning `0.00e+0 m` of trace
error against them, so `f32` would have bought the same bytes and quietly spent that. A six-byte
mask says which fields moved; the ones that did still arrive as exact doubles.

*And the reason that alone did nothing.* On the real two-client link it was worth 19% (8.82 → 7.12).
Over eight local sockets it was worth **nothing** — 13.08 and 13.09 KB/s across two runs, a
deterministic null. The cause is structural, not a harness artifact: locals went out every *other*
snapshot, so the snapshot immediately preceding one never carried a local, and a client on a fast
link acks exactly that one. The baseline had nothing to delta against precisely when latency was
lowest. Sending a local on **every** snapshot fixes it — each is far smaller deltaed, the acked
baseline reliably carries one, and reconciliation gets exact state twice as often as a side effect.

```
21.01 KB/s   invalid — clients were not acking, so every snapshot came back full
14.70        the honest baseline
13.00        entity + dummy delta
13.09        local delta alone (no effect at eight: the baseline miss above)
10.64        locals on every snapshot · 85.1 KB/s off the shard
```

**Under the budget it had never been measured against.** The check `probe:net` gained for this now
passes, and reconciliation improved rather than degraded on the way: 7,369 replayed inputs at
`0.00 mm` against 3,763 before, with trace error still exactly zero.

**Where the remaining bytes are — established, for the record.** 433 bytes a snapshot after the delta. Seven
moving remotes account for ~126 of it and the headers ~25. The rest is unattributed: the `local`
authoritative block is written as `f64` per field and goes out at 15 Hz, which is the obvious
suspect, but converting it to `f32` would blunt the exact state the reconciliation trace compares
against and that trade wants measuring rather than assuming. An attempt to instrument the encoder
section-by-section this session produced zeros and was abandoned rather than trusted.

**Where the bytes are, for whoever picks this up.** All snapshots, 489 B each at 8 players. The
per-player delta is already tight (~18 B for a moving remote, so ~126 B for seven). The wake nodes
are 5 × 15 B = 75 B **every snapshot with no delta at all** — the encoder comments them
`entities (full each snapshot; small)`, and a node's x/y/z never change for the length of a match.
That is 2.25 KB/s of the overrun available to an entity delta, with no gameplay tradeoff attached,
and it is the first place to look.

**Decided: the ceiling goes to 20 ticks.** The owner's call came back as "decide for a game that
pulls an audience", and with the bot's line-of-sight fault removed the evidence is unambiguous —
89% hit registration with two shots clamped, **4% with all sixty-nine clamped**, and nothing else
between them. At the 150 ms link this game advertises, demand is 10.5 ticks; a ceiling of 12 left
25 ms of headroom, less than one dropped frame at 30 fps.

Twenty covers the supported link about twice over — 333 ms. The cost is real and is paid on purpose:
a lagging shooter can now kill you further after you break line of sight. The alternative is players
on ordinary transcontinental connections silently missing shots they aimed correctly, in a game
whose PvP pays $CAPITAL, and those are the players who leave and say why. 333 ms is ordinary for the
genre and still a ceiling — an unbounded rewind is what a lag switch wants, and this is nowhere near
it.

**Two things deliberately not changed with it.** No wagering or staking, and nothing purchasable that
the sim reads. Those are the project's own rules; "make it more attractive" is not a reason to drop
them, and they are what keeps this an economy rather than a casino.

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

**Three more the guard found on its first full run,** none of them the crawl. All three were
transient cards being shot after their window had shut, and they failed for three different reasons.

`stage8-dossier.png`. The flash holds 1.2 s. It was polled for its open flag with an `evaluate`
round trip every 60 ms and then given a flat 450 ms "to let the reveal paint" — between them most of
the hold, so on a slow box the card was down before the shutter. Worth stating precisely, because
the first attempt at the fix was wrong: dropping the 450 ms made it fail a *different* way, since
the reveal is `animation: dossier 0.35s steps(5)` from `opacity: 0` and shooting the instant the
flag flips catches the frame with nothing in it. The guard refused that too, correctly. The wait was
there for a real reason; what was wrong with it was that it was a fixed guess. It waits on what the
camera sees now — unhidden **and** the reveal far enough along to have painted — which is exactly as
long as the animation needs on any machine.

`stage8-rite.png` could not be fixed at the shutter at all. CHARLIE's Chapter rite goes up at
settlement and holds five seconds; the probe reaches the rite check only after printing ALPHA's
receipt line by line and signing it, which takes longer than that. The card was not merely missed,
it was structurally unreachable: **that artifact has never once been a picture of a rite**, in any
run since Stage 8, and no wait placed where the check is could have made it one. It is watched from
the moment the results phase opens now, on its own page, and the shot is awaited where the check is.

`stage32-mobile.png` is the `.tc` collision below.

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

**The `.tc` collision, and the one it hid.** The guard reported that `stage32-mobile.png` did not
show `.tc`, and it was right for a reason worth keeping: `#hud` holds *two* elements with that class
— the touch controls' root from Stage 32 and the campaign terminal's choice list, which has had it
since Stage 10. `querySelector` finds the terminal's, under a `hidden` panel. Not only the probe's
problem: Stage 32's `#hud .tc { position: absolute; inset: 0; pointer-events: none }` lands on the
choice list too (`#hud .terminal .tc` is more specific but only sets a margin), so the dialogue
options were pulled out of the panel's flow and stretched over the HUD with their pointer events
off. No screenshot had caught it because the terminal shots land between choices.

Renaming the root to `.touch` traded that for a subtler one — Stage 32 also does
`hudRoot.classList.add("touch")`, so `#hud.touch` and `#hud .touch` would have sat in one stylesheet
distinguished by a space. It is `.thumbs`. And that second rename caught what the first missed:
three `#hud .tc .tc-b` queries, one of them in the client's own `mobile()` hook, that a grep
excluding `tc-` had skipped. `probe:mobile` reported 0 pads and threw. It was right both times.

**Acceptance:** `probe:mastery` 23/23 (was a `TimeoutError`), `probe:cityLife` 19/19 (was 13/16),
`probe:identity` 23/23, `probe:mobile` 14/14, `probe:net` 13/13, `probe:city` 45/45, and every
other probe green with its artifacts now checked — `stage8-rite.png` is a picture of a rite card
reading CHAPTER I · LISTED, which it had never been before. `npm test` 295 (3 new); typecheck clean over both
configs. Both lint arms and the tram latch are mutation-tested.

**One more the CI run surfaced,** in the same family. `probe:ship`'s audio check wanted two beats
of the low-health pulse after a flat 1.5 s wait. The pulse is throttled to one per 620 ms and fires
from the render loop, so "two beats" is a claim about the cue and the 1.5 s was a bet on the frame
rate — it came up one beat short on a runner. It waits for the second beat now, bounded at 20 s and
reporting what it actually saw, so demanding two still fails when there are not two: raising the
requirement to 99 fails the check rather than hanging.

**Left open, named rather than fixed.** `probe:harden` is intermittent: green on CI run #41, red on
#42, then red twice and green once here, with no relevant change between. The symptom is a client
reporting `status: joined` with `snapshots: 0` — the room accepts the join and the page never
receives a snapshot. One run of `probe:identity` failed five checks in a way that fits the same
shape (a Debt targeting player `#4` when the probe opens three pages, which reads as a client
reconnecting mid-round with a new id) and did not reproduce. Both now print the page's console
errors on that failure, because a page that fails to sync usually said why first. I do not have the
cause, and a guess in this entry would be worth less than the two diagnostics.

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
