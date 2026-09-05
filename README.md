# MELTDOWN

A browser-based multiplayer first-person shooter with a deep RPG progression
layer and a branching campaign, set in **Lethe, the city that forgets you**.

> Every mind in Lethe is leased. You woke free.

## Run

```
npm install
npm run dev        # http://127.0.0.1:5173 — click to wake (pointer lock)
```

Controls: `WASD` move · `Shift` sprint · `Space` jump · `Ctrl` slide/crouch ·
`LMB` fire · `R` reload.

## Verify

```
npm run typecheck  # strict TS across shared/, client/, probe/, tests/
npm run test       # vitest: collision, movement tech, determinism, TTK
npm run probe      # headless Playwright probe: bot path + kill + screenshot
npm run verify     # all three
```

The probe boots the dev server on port 5179, drives a scripted bot through
sprint → slide → slide-jump → mantle → kill, asserts the stage's acceptance
criteria, and writes `probe/out/stage1.png`, `stage1-action.png`, and
`stage1.json`.

Add `?headless=1` to the URL to start with the simulation paused; the
`window.__game` hook then advances it deterministically.

## Layout

```
shared/     pure TS simulation shared by client and (Stage 2) server
  math/     vec3
  sim/      constants, input, level, collision, player, world
  economy/  WAKE token constants, Robinhood Chain config, no-paid-power lint
client/     Vite + Three.js presentation: input, renderer, audio, HUD, game loop, bot
probe/      headless acceptance probes (one per stage)
tests/      vitest unit tests for the simulation
docs/       ART_BIBLE.md, STAGES.md, proof/ artifacts per stage
```

See `docs/STAGES.md` for the stage plan, `docs/ART_BIBLE.md` for the
visual ground truth, and `docs/TOKENOMICS.md` for WAKE, the in-game currency
on Robinhood Chain.
