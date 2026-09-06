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

prints the `CONTRACTS` JSON.

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

## 4. What CI checks

`verify.yml` runs the typecheck, the unit suite, every stage probe, the Fairness Lint and the
economy lint, then builds the client and runs the smoke test against the built bundle.
`deploy.yml` deploys the Workers, then builds, smoke-tests and deploys Pages.
