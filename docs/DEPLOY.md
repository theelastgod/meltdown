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
six addresses). They stay `"0"`, `""`, and `"{}"`. The launch chain is BNB Smart Chain. Wallet
parameters are in `shared/economy/bnb.ts`: mainnet id 56, name "BNB Smart Chain", gas BNB, RPC
`https://bsc-dataseed.bnbchain.org`, explorer `https://bscscan.com`; testnet id 97, name
"BNB Smart Chain Testnet", gas tBNB, RPC `https://data-seed-prebsc-1-s1.bnbchain.org:8545`,
explorer `https://testnet.bscscan.com`. A public dataseed is a wallet endpoint, not the worker
RPC. Do not set `CHAIN_ID` to 56, and do not run the deploy below, until a real capital address
exists. The Solana mint and treasury in the same file are a published balance display. They are
not this contract.

Testnet 97 is the rehearsal. Mainnet 56 is the same bytecode after a claim pays there. The
command refuses a published dev key, a missing treasury, and a treasury that is the relayer:

```sh
npm run contracts:build
npm run contracts:deploy -- <rpcUrl> <chainId> <relayerKey> <signerAddress> <treasury>
```

prints the `CONTRACTS` JSON. `LAUNCH_DAY` in `shared/economy/model.ts` stays 2026-09-17 (day
index 20713) unless the owner changes it before this deploy. The PrizeVault bytecode is built
with that date, and only the treasury can retune a channel afterwards. The relayer key needs
tBNB on 97 and BNB on 56. The worker RPC is a private endpoint the owner supplies.

## 3. Pages

```sh
cp .env.example .env.production   # fill in the three Workers' hosts
# Paste a 32-hex Reown id into VITE_WALLETCONNECT_PROJECT_ID. Leave it empty if you do not have one.
VITE_BUILD="$(git rev-parse HEAD)" npm run build # committed release → dist/
npm run smoke                     # the built bundle boots, joins a room, renders (headless)
npx wrangler pages deploy dist --project-name meltdown --branch main --commit-hash "$(git rev-parse HEAD)"
```

The `VITE_*` values are read at build time as direct `import.meta.env.VITE_*` reads
(`client/config.ts`). A cast through another object does not inline, and a Pages build then
falls back to `127.0.0.1`. Development needs none of them: `npm run dev` and
`npx tsx server/node-host.ts` are the whole stack, including an in-process EVM devnet for the
counter-ledger.

`VITE_WALLETCONNECT_PROJECT_ID` is the Pages slot for WalletConnect. It must match
`/^[0-9a-f]{32}$/i`. No id is committed, and none is invented here. A build without one still
ships. The WalletConnect button then says `WALLETCONNECT HAS NO PROJECT ID ON THIS BUILD` and
does not fall through to `window.ethereum`. The GitHub variable of the same name is the CI
slot (`deploy.yml`). Set it when the owner pastes an id, then rebuild Pages. Do not redeploy
the workers for that.

Set `VITE_BUILD` for a manual production build: its default is `dev`, which makes PLAY use the
development host instead of the campaign Worker. Pages' production branch is `main`; this flag
selects the production deployment and does not change the repository's working branch.

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
`CONTRACTS`, `SIGNER_KEY`, `RELAYER_KEY`, a `TREASURY` that is not the relayer, and
`SIWE_DOMAINS` — and the host runs the ledger against it. On BNB, `CHAIN_ID` is `97` for the
rehearsal and `56` after a claim pays. The devnet-only routes answer that they are devnet-only.
The host refuses to start with a chain and no database, or with a chain and any key missing.

What you give up by choosing this over the Workers: Durable Object scaling (one process, one box),
and the process boundary between the match host and the money keys, which the three-Worker
deployment keeps and `docs/SECURITY.md` §3.1 relies on. The campaign module is still the only
importer of Kernel Protocols and the quarantine tests still say so; the keys are still environment
variables and never in the repo.
