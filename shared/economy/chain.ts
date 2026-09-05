/**
 * Robinhood Chain network configuration. Robinhood Chain is an Arbitrum Orbit
 * Layer 2 (EVM, Nitro). The numeric parameters below are filled from
 * Robinhood's developer documentation when they are published for each
 * network; until then they are null and the client refuses to connect.
 */
export interface ChainConfig {
  name: string;
  chainId: number | null;
  rpcUrl: string | null;
  explorerUrl: string | null;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  testnet: boolean;
}

export const ROBINHOOD_CHAIN_TESTNET: ChainConfig = {
  name: "Robinhood Chain Testnet",
  chainId: null,
  rpcUrl: null,
  explorerUrl: null,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  testnet: true,
};

export const ROBINHOOD_CHAIN: ChainConfig = {
  name: "Robinhood Chain",
  chainId: null,
  rpcUrl: null,
  explorerUrl: null,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  testnet: false,
};

export const isConfigured = (c: ChainConfig): boolean => c.chainId !== null && c.rpcUrl !== null;
