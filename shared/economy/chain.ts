/**
 * Solana cluster configuration. $CAPITAL is an SPL mint when one is published.
 * Gas is SOL. The mint is not the gas token, and it never changes a stat.
 *
 * The public RPCs are the documented cluster endpoints, not a production provider.
 * The published mint and treasury live in wrangler.counter.toml and public/solana.json.
 * CHAIN_ID stays 0: those Solana addresses do not turn on EVM settlement.
 */
export interface ChainConfig {
  name: string;
  cluster: "devnet" | "mainnet-beta";
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  testnet: boolean;
}

export const SOLANA_DEVNET: ChainConfig = {
  name: "Solana Devnet",
  cluster: "devnet",
  rpcUrl: "https://api.devnet.solana.com",
  explorerUrl: "https://explorer.solana.com/?cluster=devnet",
  nativeCurrency: { name: "Solana", symbol: "SOL", decimals: 9 },
  testnet: true,
};

export const SOLANA_MAINNET: ChainConfig = {
  name: "Solana",
  cluster: "mainnet-beta",
  rpcUrl: "https://api.mainnet-beta.solana.com",
  explorerUrl: "https://explorer.solana.com",
  nativeCurrency: { name: "Solana", symbol: "SOL", decimals: 9 },
  testnet: false,
};

export const isConfigured = (c: ChainConfig): boolean => (c.cluster === "devnet" || c.cluster === "mainnet-beta") && c.rpcUrl.length > 0;
