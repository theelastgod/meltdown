/** Boots a CounterLedger on the in-process devnet (the Node host, tests, the probe). */
import { custom, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, defineChain } from "viem";
import { Devnet } from "./devnet";
import { ARTIFACTS, deployAll } from "./deploy";
import { CounterLedger } from "./ledger";
import { MemoryWalletStore } from "./wallets";
import { MemoryPrizeStore } from "./prizes-store";
import { MemoryRunStore } from "../run-store";
import { dailyEmissionBudget } from "../../shared/economy/model";

/** A week of the emission schedule: what the relayer is trusted with at a time. */
const WEEK_OF_EMISSIONS = dailyEmissionBudget(0) * 7;

/** dev keys (the classic anvil set); never used on a real network */
export const DEV_KEYS = {
  relayer: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex,
  signer: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba" as Hex,
  /**
   * The bank. A separate key from the relayer on purpose, even here: the relayer signs constantly
   * and the treasury holds the whole supply, so if the devnet ran them as one address the tests
   * would never exercise the shape production has to run in (docs/SECURITY.md §3.1). On a real
   * network this is a timelocked multisig and there is no key at all.
   */
  treasury: "0x8166f546bab6da521a8369cab06c5d2b9e46670292d85c875ee9ec20e84ffb61" as Hex,
  /** the probe's and the tests' player wallets */
  player: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a" as Hex,
  player2: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" as Hex,
};

export async function bootDevnetLedger(opts: { now?: () => number; onLog?: (l: string) => void; seedMarket?: boolean; runs?: MemoryRunStore; relayerAllowance?: number } = {}) {
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
  const wallets = new MemoryWalletStore(opts.now);
  const prizes = new MemoryPrizeStore();
  const runs = opts.runs ?? new MemoryRunStore();
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
