# MELTDOWN

A browser-based multiplayer first-person shooter with a deep RPG progression
layer and a branching campaign, set in **Neo-China, the city that forgets you**.

> Every mind in Neo-China is leased. You woke free.

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
npm run probe:city # Neo-China proper: three districts load, bots route the streets and climb the walkway, frames read like the clip, budgets hold
npm run probe:cityLife # city life: crowds walk, the monorail crosses and whooshes, gates seal the exits while vistas continue the city, PA and sirens on the sim clock
npm run probe:endgame # endgame: daily contracts, the week's Audit room (rules, gravity, sheet, leaderboard), the Deep Wake, Rewrite + the Wakelight shop
npm run lint:economy  # the one rule over the full manifest: WAKE never touches a stat
npm run probe:counter # the counter-ledger: SIWE wallet link, sponsored Ghostfile + stamps on a real EVM devnet, a market buy on the rig, the name, chain-down drill
npm run probe:crawl   # the opening crawl: typed-then-held paragraphs, scanline flicker, glitch tears, ~35 s, skippable after first view, hard cut to the title
npm run probe:ship    # the menu flow (title cards, WAKE / CAMPAIGN / OFFICE / RANGE / FILE / SETTINGS, pause), settings applied live, the audio buses and cues
npm run probe:run     # THE RUN: $CAPITAL claims in the PvP zone, carried, dropped on death, banked at a safe zone, credited with the Depth gate and the day's cap, paid to the wallet
npx vitest run tests/security.test.ts tests/speedhack.test.ts  # the money paths, adversarially (docs/SECURITY.md)
npm run probe:harden  # hardening: matchmaking shards, the PrizeVault's Merkle epochs (Audit + Deep Wake) with sponsored claims, the rate limit, the safe-zone market kiosk
npm run build && npm run smoke  # the production bundle boots, joins a room and renders (what CI and the Pages deploy run)
npm run certify:firmware # every firmware measured in the TTK harness at its ideal range (must sit in the band)
npm run probe:mastery # Ledger Graph + mastery: lint over nodes/chips/firmwares, chips and firmwares enforced at spawn, ledger shop, stamps un-redact online
npm run probe:identity # identity & rituals: dossier flash, tags, tiered kill audio, Debts, receipt, Chapter rite, leak scan, Deadletter Office + range ghost
npm run probe:campaign # campaign: the contracts desk, a contract played through and settled, Kernel Protocols worn (and stripped at PvP join), Threat, co-op, the white office ending
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
  campaign/ factions, testimony + endings, threat, Kernel Protocols, scripts, missions + gigs, the mission runtime, the save — never imported by the PvP room
  weapons/  weapon + grenade manifest
  manifest/ stat sheet, Ledger Graph (48 nodes + keystones), chips, firmwares, loadout validation (one manifest for client, server, CI)
  progression/ Depth/XP curve, currencies, deterministic crafting, weapon mastery + curricula, attestation stamps, the Ghostfile account
  fairness/ the Fairness Lint (simulated duels + mobility course) and its CLI
  campaign/ Kernel Protocols stub — quarantined from PvP by an import-graph test
  economy/  $CAPITAL token constants, Robinhood Chain config, no-paid-power lint, the full catalog + skins, the counter record
contracts/  CAPITAL (ERC-20), Ghostfile (soulbound 721), Stamps (attestations), Names, Cosmetics (1155), LedgerMarket — solc-js build in contracts/out
server/chain/ the in-process EVM devnet, the deployer, the game signer (EIP-712 vouchers), the CounterLedger service, wallet stores
client/     Vite + Three.js presentation: input, renderer (post chain, rain, wet floor, city, life: crowds/monorail/steam/ads/sky, hub), audio, HUD, game loop, ghost (range replays), bot
server/     authoritative room (transport-agnostic), Node host, Cloudflare Durable Object host, PlayerFile DO + D1 schema
probe/      headless acceptance probes (one per stage)
tests/      vitest unit tests for the simulation
docs/       ART_BIBLE.md, STAGES.md, proof/ artifacts per stage
```

See `docs/STAGES.md` for the stage plan, `docs/ART_BIBLE.md` for the
visual ground truth, and `docs/TOKENOMICS.md` for $CAPITAL, the on-chain currency
on Robinhood Chain.
