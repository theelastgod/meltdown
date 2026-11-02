/**
 * BNB Smart Chain, the launch chain for $CAPITAL.
 *
 * These are the wallet parameters from the BNB Chain docs (chain id, native coin, public
 * dataseed, explorer). A public dataseed is a wallet endpoint. It is not the counter Worker's
 * RPC, and this module publishes no contract address. CHAIN_ID stays 0 until a real capital
 * address exists. Nothing here sends a transaction.
 */
import { isEvmAddress } from "./solana";

export interface BnbChain {
  id: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  testnet: boolean;
}

export const BNB_CHAIN_ID = 56;
export const BNB_TESTNET_CHAIN_ID = 97;

export const BNB_MAINNET: BnbChain = {
  id: BNB_CHAIN_ID,
  name: "BNB Smart Chain",
  rpcUrl: "https://bsc-dataseed.bnbchain.org",
  explorerUrl: "https://bscscan.com",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  testnet: false,
};

export const BNB_TESTNET: BnbChain = {
  id: BNB_TESTNET_CHAIN_ID,
  name: "BNB Smart Chain Testnet",
  rpcUrl: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
  explorerUrl: "https://testnet.bscscan.com",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  testnet: true,
};

/** 56 or 97. Any other id, including the in-process devnet, is not this chain. */
export function bnbById(id: number): BnbChain | null {
  if (id === BNB_MAINNET.id) return BNB_MAINNET;
  if (id === BNB_TESTNET.id) return BNB_TESTNET;
  return null;
}

export interface EvmNative {
  name: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  explorerUrl: string | null;
}

const ETHER = { name: "Ether", symbol: "ETH", decimals: 18 };

/**
 * The label and gas coin a wallet should show.
 * The in-process devnet keeps its own name and an ETH-like coin. 56 and 97 are BNB.
 * Every other live id stays a plain EVM chain.
 */
export function evmNative(chainId: number, devnet: boolean): EvmNative {
  if (devnet) return { name: "MELTDOWN devnet", nativeCurrency: ETHER, explorerUrl: null };
  const bnb = bnbById(chainId);
  if (bnb) return { name: bnb.name, nativeCurrency: bnb.nativeCurrency, explorerUrl: bnb.explorerUrl };
  return { name: "EVM", nativeCurrency: ETHER, explorerUrl: null };
}

/**
 * What a launch card may say before a contract exists.
 * `contract` is null and `sent` is false. This object never carries an address.
 */
export const BNB_LAUNCH = {
  chainId: BNB_CHAIN_ID,
  name: BNB_MAINNET.name,
  gas: "BNB",
  standard: "BEP-20",
  supply: "1000000000",
  decimals: 18,
  contract: null,
  sent: false,
} as const;

/** Reown project ids are 32 hex characters. Anything else is treated as unset. No id is invented here. */
export function walletConnectProjectId(env: { VITE_WALLETCONNECT_PROJECT_ID?: string } | undefined): string {
  const id = env?.VITE_WALLETCONNECT_PROJECT_ID?.trim() ?? "";
  return /^[0-9a-f]{32}$/i.test(id) ? id : "";
}

/**
 * WalletConnect optional chains. BNB mainnet and testnet only.
 * The in-process devnet id is not a session chain: the provider init rejects an unknown id.
 */
export function walletConnectOptionalChains(): [number, number] {
  return [BNB_CHAIN_ID, BNB_TESTNET_CHAIN_ID];
}

/** Public dataseeds for 56 and 97. A host RPC is written only when that host is one of those two chains. */
export function walletConnectRpcMap(chainId: number, rpc?: string): Record<string, string> {
  const rpcMap: Record<string, string> = {
    [String(BNB_CHAIN_ID)]: BNB_MAINNET.rpcUrl,
    [String(BNB_TESTNET_CHAIN_ID)]: BNB_TESTNET.rpcUrl,
  };
  if (rpc && (chainId === BNB_CHAIN_ID || chainId === BNB_TESTNET_CHAIN_ID)) rpcMap[String(chainId)] = rpc;
  return rpcMap;
}

/** A plain EVM address, or the address at the end of a CAIP-10 account id. Anything else is empty. */
export function plainEvmAddress(raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  const addr = text.includes(":") ? text.slice(text.lastIndexOf(":") + 1) : text;
  return isEvmAddress(addr) ? addr : "";
}

export const WALLETCONNECT_DARK = "WALLETCONNECT HAS NO PROJECT ID ON THIS BUILD";
