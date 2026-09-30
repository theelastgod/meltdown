# Stage 727 — Robinhood Chain

From https://docs.robinhood.com/chain/connecting

| | Testnet | Mainnet |
| --- | --- | --- |
| Chain ID | 46630 | 4663 |
| RPC | https://rpc.testnet.chain.robinhood.com | https://rpc.mainnet.chain.robinhood.com |
| Explorer | https://explorer.testnet.chain.robinhood.com | https://robinhoodchain.blockscout.com |
| Gas | ETH | ETH |

`wrangler.counter.toml` still has `CHAIN_ID = "0"` and `CHAIN_RPC = ""`. The contracts are not deployed. Public RPCs are rate-limited.

Mutation: `ROBINHOOD_CHAIN_TESTNET.chainId` set to null. `tests/chain.test.ts` failed once: expected null to be 46630.

Restored.
