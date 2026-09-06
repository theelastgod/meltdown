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
| 9 | Lethe proper: three districts, THE KERNEL horizon, district select, render budget | **done** (pulled ahead at the owner's request: "the game needs to feel and be like it's in a city") | `docs/proof/stage9/` |
| 9b | City life: crowds, monorail, street vistas through sealed gates, ad tickers, sign flicker, steam, skyline blinkers, airship, soundscape + VANTAGE PA | **done** (the owner repeated the note; the district is now inhabited, not just built) | `docs/proof/stage9b/` |
| 10 | Campaign: three houses and their fixers, 7 missions + 12 gigs on a data-driven runtime, CRT testimony dialogue, Threat Rating, Kernel Protocols behind the PvP wall, weapons 7–8, endings, solo + co-op | **done** | `docs/proof/stage10/` |
| 11 | Endgame loops: daily contracts, weekly Audit playlists with per-week leaderboards, the Deep Wake seasonal district graph, Rewrite prestige + the Wakelight shop (themes, alias and preset slots — never a stat) | **done** | `docs/proof/stage11/` |
| 11b | The Counter-Ledger: $CAPITAL on Robinhood Chain, SIWE wallet link, soulbound Ghostfile + stamp attestations through game-signed vouchers, the Ledger Market, names at Depth 50, an in-process EVM devnet until the testnet parameters land (`docs/TOKENOMICS.md`) | **done** (devnet; testnet is configuration) | `docs/proof/stage11b/` |
| 12 | Opening crawl: cyan monospace on black, typed-then-held paragraphs, scanline flicker, glitch tears, ~34 s, skippable after the first view, hard cut to silence, the MELTDOWN title; original copy until the owner's text lands | **done** | `docs/proof/stage12/` |
| 13 | Polish & ship: the CRT menu flow with the two title cards, settings applied live and kept, the audio pass (buses, UI cues, the card sting, the low-health pulse), Cloudflare Pages + Workers deploy, the smoke test in CI | **done** (deploy is a workflow gated on the Cloudflare secrets) | `docs/proof/stage13/` |
| 14 | THE RUN — $CAPITAL play-to-earn: the token renamed WAKE → CAPITAL, PvP zones with claims, safe zones (no damage in or out, the markets, banking), the day's cap and the Depth gate, the treasury payout to the wallet | **done** (devnet; testnet is configuration) | `docs/proof/stage14/` |

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
  276 → 205 → 169 → 137 → 90 → 68 → 57 characters, the last a single line.
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
crawl runs 34.1 s at 1× and the copy shortens to one isolated line; the
text is `rgb(53, 242, 255)` monospace on `rgb(0, 0, 0)` under a
`crawl-flicker` scanline pass at z-index 1000; the first paragraph's
character count rises monotonically to 276 and holds there; on the first
view SPACE does nothing; a tear frame shows three bands pushed apart with
both ghost layers lit, and six tears for seven paragraphs; after the cut
the text is hidden, the hum is off and MELTDOWN is up with the view now
recorded; the title's click removes the overlay with the game ready
underneath; on the second view the hint shows, SPACE lands in the cut
(silent, no text) and the title follows; `?headless=1` alone boots straight
into the game; no page errors.

## Stage 13 — Polish & ship

**Goal.** The CRT menu flow with the title cards "Every mind in Lethe is
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
- `contracts/CAPITAL.sol` (was `WAKE.sol`: name Capital, symbol CAPITAL),
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

## Stage 9 — Lethe proper (pulled ahead)

**Goal.** The owner's note: *the game needs to feel and be like it's in a
city.* The playable space stops being a yard and becomes a district of
Lethe: streets between building blocks, sidewalks and curbs, alleys with
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
This pass makes Lethe inhabited. Citizens walk the sidewalks under
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
