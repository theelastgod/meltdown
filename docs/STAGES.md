# MELTDOWN — Stage plan and status

One stage per session / PR. A stage is done only when `npm run verify`
(typecheck + unit tests + headless probe) is green and proof artifacts are in
`docs/proof/stage<N>/`.

| # | Stage | Status | Proof |
| --- | --- | --- | --- |
| 1 | Grey-box FPS core (solo) | **done** | `docs/proof/stage1/` |
| 2 | Netcode early: DO rooms, prediction/reconciliation/interp/lag-comp, 8 players, latency/loss bars | next | |
| 3 | The look: lighting rig, neon, GPU rain, wet reflections, fog, post chain, district casts | | |
| 4 | Arsenal: weapons 1–6 + alt-fires + grenades, recoil seeds, reload cancels, VANTAGE AI | | |
| 5 | The wake: hex nodes, flip/contest/spread, KERNEL timer | | |
| 6 | Ghostfile foundation: manifest, Fairness Lint, spawn validation, Depth/XP, currencies | | |
| 7 | Ledger Graph + weapon mastery | | |
| 8 | Identity & rituals | | |
| 9 | Lethe proper: three districts, THE KERNEL horizon | | |
| 10 | Campaign | | |
| 11 | Endgame loops | | |
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
