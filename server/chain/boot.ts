/** Boots a CounterLedger on the in-process devnet (the Node host, tests, the probe). */
import { custom, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, defineChain } from "viem";
import { Devnet } from "./devnet";
import { ARTIFACTS, deployAll } from "./deploy";
import { CounterLedger } from "./ledger";
import { MemoryWalletStore, type WalletStore } from "./wallets";
import { MemoryPrizeStore, type PrizeStore } from "./prizes-store";
import { MemoryRunStore, type RunStore } from "../run-store";
import { dailyEmissionBudget } from "../../shared/economy/model";

/** A week of the emission schedule: what the relayer is trusted with at a time. */
const WEEK_OF_EMISSIONS = dailyEmissionBudget(0) * 7;

import { DEV_KEYS } from "./dev-keys";
export { DEV_KEYS };

export async function bootDevnetLedger<R extends RunStore = MemoryRunStore, W extends WalletStore = MemoryWalletStore, P extends PrizeStore = MemoryPrizeStore>(
  opts: { now?: () => number; onLog?: (l: string) => void; seedMarket?: boolean; runs?: R; wallets?: W; prizes?: P; relayerAllowance?: number } = {},
) {
  const relayer = privateKeyToAccount(DEV_KEYS.relayer);
  const treasury = privateKeyToAccount(DEV_KEYS.treasury);
  const devnet = await Devnet.create([relayer.address, treasury.address]);
  const transport = custom({ request: async ({ method, params }) => devnet.rpc(method, params as unknown[]) });
  const chain = defineChain({ id: devnet.chainId, name: "MELTDOWN devnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [] } } });
  const pub = createPublicClient({ chain, transport });
  const wal = createWalletClient({ chain, transport, account: relayer });
  // deployed by the relayer (so it is the poster and the steward, as on a real network before the
  // roles are handed to a multisig), but the supply is minted to the treasury
  const contracts = await deployAll(pub, wal, privateKeyToAccount(DEV_KEYS.signer).address, treasury.address);
  // the stores are the host's when it has durable ones (Stage 51); memory otherwise
  const wallets = (opts.wallets ?? new MemoryWalletStore(opts.now)) as W;
  const prizes = (opts.prizes ?? new MemoryPrizeStore()) as P;
  const runs = (opts.runs ?? new MemoryRunStore()) as R;
  const ledger = new CounterLedger({ chainId: devnet.chainId, transport, signerKey: DEV_KEYS.signer, relayerKey: DEV_KEYS.relayer, contracts, wallets, devnet: true, now: opts.now, onLog: opts.onLog, prizes, runs, treasury: treasury.address });
  // The treasury's standing allowance to the relayer: a week of emissions, which is the doc's own
  // sizing. It is the whole security property — a leaked relayer key cannot take more than this.
  const treasuryWallet = createWalletClient({ chain, transport, account: treasury });
  const allowance = parseEther(String(Math.round(opts.relayerAllowance ?? WEEK_OF_EMISSIONS)));
  await pub.waitForTransactionReceipt({
    hash: await treasuryWallet.writeContract({ account: treasury, chain, address: contracts.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "approve", args: [relayer.address, allowance] }),
  });
  if (opts.seedMarket !== false) await ledger.seedMarket();
  return { devnet, ledger, wallets, prizes, runs, contracts, transport, pub, treasury, relayer, allowance };
}
