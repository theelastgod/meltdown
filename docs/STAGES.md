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
| 7 | Ledger Graph + weapon mastery | | |
| 8 | Identity & rituals | | |
| 9 | Lethe proper: three districts, THE KERNEL horizon | | |
| 10 | Campaign | | |
| 11 | Endgame loops | | |
| 11b | The Counter-Ledger: WAKE on Robinhood Chain, WalletConnect link, Ghostfile SBT + stamps, market, names (`docs/TOKENOMICS.md`) | | |
| 12 | Opening crawl | | |
| 13 | Polish & ship | | |

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

## Stage 11b — The Counter-Ledger

**Goal.** WAKE (ERC-20 on Robinhood Chain) and the wallet link, built so the
token touches identity, ownership, creation, hosting, and competition, and
never a stat. Spec: `docs/TOKENOMICS.md`. Seed already on main:
`shared/economy/` (manifest shapes, chain config, lint) and
`tests/economy.test.ts`.

**Acceptance (probe):**
- Headless client links a wallet over SIWE using a `viem` local account in
  place of WalletConnect; the Worker verifies and binds it 1:1 in D1.
- Ghostfile SBT and one attestation stamp mint on a local Orbit-compatible
  devnet (anvil) through a Worker-signed EIP-712 voucher with sponsored gas.
- A cosmetic bought on the LedgerMarket appears on the player's rig in the
  next match snapshot as an ID only; the match Durable Object bundle contains
  no economy module (bundle graph assertion).
- `lintEconomy` runs in CI over the full manifest; a priced item with a
  stat fails the build.
- Chain unreachable: equip, match, and progression all still work.

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
