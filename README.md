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
`LMB` fire · `RMB` alt-fire · `1–6` / wheel weapons · `R` reload · `G` grenade ·
`Q` cycle grenade.

## Verify

```
npm run typecheck  # strict TS across shared/, client/, probe/, tests/
npm run test       # vitest: collision, movement tech, determinism, TTK
npm run probe      # headless Playwright probe: bot path + kill + screenshot
npm run probe:look # look probe: frames measured against the reference clip's statistics
npm run probe:net  # netcode probe: two clients at 150 ms RTT + 5% loss, rejoin, cheater
npm run probe:arsenal # TTK harness table + every weapon, grenade and VANTAGE unit in the browser
npm run probe:wake # the wake: flips, spread, phage boost, KERNEL pulse; online contest between two cells
npm run lint:fairness -- --quick # Fairness Lint: every candidate build duelled + run through the mobility course
npm run probe:file # Ghostfile: lint injections fail, illegal loadouts refused at spawn, a round settles XP/Scrip
npm run probe:city # Lethe proper: three districts load, bots route the streets and climb the walkway, frames read like the clip, budgets hold
npm run probe:cityLife # city life: crowds walk, the monorail crosses and whooshes, gates seal the exits while vistas continue the city, PA and sirens on the sim clock
npm run certify:firmware # every firmware measured in the TTK harness at its ideal range (must sit in the band)
npm run probe:mastery # Ledger Graph + mastery: lint over nodes/chips/firmwares, chips and firmwares enforced at spawn, ledger shop, stamps un-redact online
npm run probe:identity # identity & rituals: dossier flash, tags, tiered kill audio, Debts, receipt, Chapter rite, leak scan, Deadletter Office + range ghost
npm run verify     # all of the above
```

The probe boots the dev server on port 5179, drives a scripted bot through
sprint → slide → slide-jump → mantle → kill, asserts the stage's acceptance
criteria, and writes `probe/out/stage1.png`, `stage1-action.png`, and
`stage1.json`.

Multiplayer (dev): `npm run host` starts the Node room host on port 8787, then
open `http://127.0.0.1:5173/?net=ws://127.0.0.1:8787/room/yard&name=YOU`.
Optional `&lat=75&jitter=8&loss=0.05` simulates a bad link. The Cloudflare
Durable Object host is `server/worker.ts` (`npx wrangler dev`).

Add `?headless=1` to the URL to start with the simulation paused; the
`window.__game` hook then advances it deterministically.

`?level=lease_row | deadletter_docks | repo_depot | drainage_yard` picks the
district (default Lease Row); **M** or the MAP tab travels between them.
Rooms take the same parameter: `ws://host/room/<name>?level=repo_depot`.

## Layout

```
shared/     pure TS simulation shared by client and (Stage 2) server
  math/     vec3
  sim/      constants, input, box, level (+registry), city (district generator), hub (Deadletter Office), nav (walkability + paths), collision, player, weapons, projectiles, ai, wake, ttk, world
  identity/ glyph (procedural 3-layer mark), monikers + Chapters, identity (what others see + the mechanical-leak scanner)
  weapons/  weapon + grenade manifest
  manifest/ stat sheet, Ledger Graph (48 nodes + keystones), chips, firmwares, loadout validation (one manifest for client, server, CI)
  progression/ Depth/XP curve, currencies, deterministic crafting, weapon mastery + curricula, attestation stamps, the Ghostfile account
  fairness/ the Fairness Lint (simulated duels + mobility course) and its CLI
  campaign/ Kernel Protocols stub — quarantined from PvP by an import-graph test
  economy/  WAKE token constants, Robinhood Chain config, no-paid-power lint
client/     Vite + Three.js presentation: input, renderer (post chain, rain, wet floor, city, life: crowds/monorail/steam/ads/sky, hub), audio, HUD, game loop, ghost (range replays), bot
server/     authoritative room (transport-agnostic), Node host, Cloudflare Durable Object host, PlayerFile DO + D1 schema
probe/      headless acceptance probes (one per stage)
tests/      vitest unit tests for the simulation
docs/       ART_BIBLE.md, STAGES.md, proof/ artifacts per stage
```

See `docs/STAGES.md` for the stage plan, `docs/ART_BIBLE.md` for the
visual ground truth, and `docs/TOKENOMICS.md` for WAKE, the in-game currency
on Robinhood Chain.
