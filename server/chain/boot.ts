/** Boots a CounterLedger on the in-process devnet (the Node host, tests, the probe). */
import { custom, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, defineChain } from "viem";
import { Devnet } from "./devnet";
import { deployAll } from "./deploy";
import { CounterLedger } from "./ledger";
import { MemoryWalletStore } from "./wallets";
import { MemoryPrizeStore } from "./prizes-store";
import { MemoryRunStore } from "../run-store";

/** dev keys (the classic anvil set); never used on a real network */
export const DEV_KEYS = {
  relayer: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex,
  signer: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba" as Hex,
  /** the probe's and the tests' player wallets */
  player: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a" as Hex,
  player2: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" as Hex,
};

export async function bootDevnetLedger(opts: { now?: () => number; onLog?: (l: string) => void; seedMarket?: boolean; runs?: MemoryRunStore } = {}) {
  const relayer = privateKeyToAccount(DEV_KEYS.relayer);
  const devnet = await Devnet.create([relayer.address]);
  const transport = custom({ request: async ({ method, params }) => devnet.rpc(method, params as unknown[]) });
  const chain = defineChain({ id: devnet.chainId, name: "MELTDOWN devnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [] } } });
  const pub = createPublicClient({ chain, transport });
  const wal = createWalletClient({ chain, transport, account: relayer });
  const contracts = await deployAll(pub, wal, privateKeyToAccount(DEV_KEYS.signer).address, relayer.address);
  const wallets = new MemoryWalletStore(opts.now);
  const prizes = new MemoryPrizeStore();
  const runs = opts.runs ?? new MemoryRunStore();
  const ledger = new CounterLedger({ chainId: devnet.chainId, transport, signerKey: DEV_KEYS.signer, relayerKey: DEV_KEYS.relayer, contracts, wallets, devnet: true, now: opts.now, onLog: opts.onLog, prizes, runs });
  if (opts.seedMarket !== false) await ledger.seedMarket();
  return { devnet, ledger, wallets, prizes, runs, contracts, transport, pub };
}
