/**
 * `npm run contracts:deploy -- <rpcUrl> <chainId> <relayerKey> <signerAddress> <treasury>`
 * Deploys the counter-ledger contracts to a real RPC. Chain ids 56 and 97 are BNB Smart Chain
 * (gas is BNB or tBNB). Any other id still deploys, with that chain's own gas coin.
 * Prints the CONTRACTS JSON for wrangler.counter.toml. Do not invent an address.
 *
 * The treasury is required, must not be the relayer, and the relayer must not be a dev key
 * (Stage 53): this CLI only ever targets a real network, and a real network has no default bank.
 */
import { createPublicClient, createWalletClient, defineChain, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { evmNative } from "../../shared/economy/bnb";
import { deployAll } from "./deploy";
import { deployGuard } from "./dev-keys";

const [rpc, chainIdRaw, relayerKey, signer, treasuryRaw] = process.argv.slice(2);
if (!rpc || !chainIdRaw || !relayerKey || !signer) {
  console.error("usage: contracts:deploy <rpcUrl> <chainId> <relayerKey> <signerAddress> <treasury>");
  process.exit(2);
}
const relayer = privateKeyToAccount(relayerKey as Hex);
const guard = deployGuard({ relayerKey, relayerAddress: relayer.address, signer, treasury: treasuryRaw });
if (!guard.ok) {
  console.error(`refused: ${guard.reason}`);
  process.exit(2);
}
const chainId = Number(chainIdRaw);
const named = evmNative(chainId, false);
const chain = defineChain({ id: chainId, name: named.name, nativeCurrency: named.nativeCurrency, rpcUrls: { default: { http: [rpc] } } });
const pub = createPublicClient({ chain, transport: http(rpc) });
const wal = createWalletClient({ chain, transport: http(rpc), account: relayer });
const contracts = await deployAll(pub, wal, signer as Hex, treasuryRaw as Hex);
console.log(JSON.stringify(contracts));
