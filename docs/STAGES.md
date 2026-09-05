# MELTDOWN — Stage plan and status

One stage per session / PR. A stage is done only when `npm run verify`
(typecheck + unit tests + headless probe) is green and proof artifacts are in
`docs/proof/stage<N>/`.

| # | Stage | Status | Proof |
| --- | --- | --- | --- |
| 1 | Grey-box FPS core (solo) | **done** | `docs/proof/stage1/` |
| 2 | Netcode early: DO rooms, prediction/reconciliation/interp/lag-comp, 8 players, latency/loss bars | **done** | `docs/proof/stage2/` |
| 3 | The look: lighting rig, neon, GPU rain, wet reflections, fog, post chain, district casts | **done** (pulled ahead of 2 at the owner's request) | `docs/proof/stage3/` |
| 4 | Arsenal: weapons 1–6 + alt-fires + grenades, recoil seeds, reload cancels, VANTAGE AI | | |
| 5 | The wake: hex nodes, flip/contest/spread, KERNEL timer | | |
| 6 | Ghostfile foundation: manifest, Fairness Lint, spawn validation, Depth/XP, currencies | | |
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
