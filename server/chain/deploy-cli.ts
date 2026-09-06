/**
 * `npm run contracts:deploy -- <rpcUrl> <chainId> <relayerKey> <signerAddress> [treasury]`
 * Deploys the counter-ledger contracts to a real RPC (Robinhood Chain testnet once its parameters
 * are published — shared/economy/chain.ts) and prints the CONTRACTS JSON for wrangler.counter.toml.
 */
import { createPublicClient, createWalletClient, defineChain, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deployAll } from "./deploy";

const [rpc, chainIdRaw, relayerKey, signer, treasuryRaw] = process.argv.slice(2);
if (!rpc || !chainIdRaw || !relayerKey || !signer) {
  console.error("usage: contracts:deploy <rpcUrl> <chainId> <relayerKey> <signerAddress> [treasury]");
  process.exit(2);
}
const relayer = privateKeyToAccount(relayerKey as Hex);
const chain = defineChain({ id: Number(chainIdRaw), name: "target", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const pub = createPublicClient({ chain, transport: http(rpc) });
const wal = createWalletClient({ chain, transport: http(rpc), account: relayer });
const contracts = await deployAll(pub, wal, signer as Hex, (treasuryRaw ?? relayer.address) as Hex);
console.log(JSON.stringify(contracts));
