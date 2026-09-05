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
| 8 | Identity & rituals | | |
| 9 | Lethe proper: three districts, THE KERNEL horizon, district select, render budget | **done** (pulled ahead at the owner's request: "the game needs to feel and be like it's in a city") | `docs/proof/stage9/` |
| 9b | City life: crowds, monorail, street vistas through sealed gates, ad tickers, sign flicker, steam, skyline blinkers, airship, soundscape + VANTAGE PA | **done** (the owner repeated the note; the district is now inhabited, not just built) | `docs/proof/stage9b/` |
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
