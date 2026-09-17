# MELTDOWN — deploy

The client is a static Vite build on **Cloudflare Pages**; the servers are three **Workers**
with Durable Objects and one D1 database. `.github/workflows/deploy.yml` does all of it on a
push to `main` once the repository variable `CF_DEPLOY` is `1` and the secrets are set; the
steps below are the same commands by hand.

## 1. Cloudflare

The D1 database `meltdown-ghostfile` exists (id `fda078bf-052f-48fb-a061-0d5393226bb7`,
already in `wrangler.toml` and `wrangler.counter.toml`) and carries the schema. For a fresh
account:

```sh
npx wrangler login
npx wrangler d1 create meltdown-ghostfile          # paste the id into wrangler.toml and wrangler.counter.toml
npx wrangler d1 execute meltdown-ghostfile --file=server/schema.sql
```

Repository secrets: `CLOUDFLARE_API_TOKEN` (Workers Scripts:Edit, Pages:Edit, D1:Edit),
`CLOUDFLARE_ACCOUNT_ID`. Repository variables: `CF_DEPLOY=1` and the `VITE_*` hosts below.

The Durable Object migrations use `new_sqlite_classes`: the free plan requires the SQLite backend,
and the storage API the objects use is the same on both.

## 2. Workers (in this order — the campaign and counter Workers bind to the match Worker's PlayerFile)

```sh
npx wrangler deploy                                # meltdown-match: rooms, files, the endgame
npx wrangler deploy -c wrangler.campaign.toml      # meltdown-campaign: co-op rooms, the campaign file route
npx wrangler secret put SIGNER_KEY -c wrangler.counter.toml    # the game signer (EIP-712 vouchers)
npx wrangler secret put RELAYER_KEY -c wrangler.counter.toml   # the relayer that sponsors Ghostfile + stamp gas
npx wrangler deploy -c wrangler.counter.toml       # meltdown-counter: the counter-ledger
```

The counter Worker's `[vars]` carry `CHAIN_ID`, `CHAIN_RPC` and `CONTRACTS` (a JSON object of the
six addresses). Until Robinhood Chain's testnet parameters are published these stay empty and the
counter-ledger answers `CHAIN UNREACHABLE` — the game plays; the link, market and names wait.
When they land:

```sh
npm run contracts:build
npm run contracts:deploy -- <rpcUrl> <chainId> <relayerKey> <signerAddress> [treasury]
```

prints the `CONTRACTS` JSON. Before this on a real network, set `LAUNCH_DAY` in
`shared/economy/model.ts` to the launch date (`docs/DECISIONS.md` §6): the vault is deployed with
the schedule counted from it, and only the treasury can retune a channel afterwards.

## 3. Pages

```sh
cp .env.example .env.production   # fill in the three Workers' hosts
npm run build                     # typecheck + vite build → dist/
npm run smoke                     # the built bundle boots, joins a room, renders (headless)
npx wrangler pages deploy dist --project-name meltdown
```

The `VITE_*` values are read at build time (`client/config.ts`). Development needs none of them:
`npm run dev` and `npx tsx server/node-host.ts` are the whole stack, including an in-process EVM
devnet for the counter-ledger.

## 4. Where it runs today

| Piece | URL |
| --- | --- |
| client (Pages) | https://meltdown-45y.pages.dev |
| meltdown-match | https://meltdown-match.wendellphillips.workers.dev |
| meltdown-campaign | https://meltdown-campaign.wendellphillips.workers.dev |
| meltdown-counter | https://meltdown-counter.wendellphillips.workers.dev |

### Measuring a phone

Open the deployed site on the device with `?perf=1` (Stage 50), play for thirty seconds, and the
HUD's PERF panel says REPORTED. The row is at the match Worker's `/perf` (newest fifty), with the
GPU string, viewport, pixel ratio, internal scale, draw calls and the frame-time percentiles.

## 5. What CI checks

`verify.yml` runs the typecheck, the unit suite, every stage probe, the Fairness Lint and the
economy lint, then builds the client and runs the smoke test against the built bundle.
`deploy.yml` deploys the Workers, then builds, smoke-tests and deploys Pages.

## 6. One server instead (Stage 51)

The Node host is the whole backend in one process. On a database it keeps everything:

```sh
MELTDOWN_DB=/var/lib/meltdown/meltdown.sqlite npx tsx server/node-host.ts 8787
```

Rooms, co-op crews, files, the endgame and the counter-ledger all run in that process; files,
boards, the season, the run's days, wallet bindings and posted epochs survive a restart (the
`probe:persist` check kills and restarts it). Put a reverse proxy with TLS in front of `8787`
(WebSocket upgrades on `/room/` and `/campaign/`), and build the client with every `VITE_*` host
pointing at it.

For a real chain, set the same variables the counter Worker takes — `CHAIN_RPC`, `CHAIN_ID`,
`CONTRACTS`, `SIGNER_KEY`, `RELAYER_KEY`, optionally `TREASURY` and `SIWE_DOMAINS` — and the host
runs the ledger against it; the devnet-only routes answer that they are devnet-only. It refuses to
start with a chain and no database, or with a chain and any key missing.

What you give up by choosing this over the Workers: Durable Object scaling (one process, one box),
and the process boundary between the match host and the money keys, which the three-Worker
deployment keeps and `docs/SECURITY.md` §3.1 relies on. The campaign module is still the only
importer of Kernel Protocols and the quarantine tests still say so; the keys are still environment
variables and never in the repo.
