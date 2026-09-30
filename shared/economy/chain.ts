/**
 * Robinhood Chain network configuration. Robinhood Chain is an Arbitrum Orbit
 * Layer 2 (EVM, Nitro). Gas is ETH. $CAPITAL is the game token, not the gas token.
 *
 * Parameters are the ones published at https://docs.robinhood.com/chain/connecting
 * (mainnet chain 4663, testnet chain 46630). The public RPCs are rate-limited and
 * are the documented endpoints, not a production provider. The counter Worker
 * stays on CHAIN_ID 0 until the contracts are deployed to the testnet; these
 * values are what that deploy targets. A mainnet cutover is a later deploy,
 * with its own keys, and is not this file.
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
  chainId: 46630,
  rpcUrl: "https://rpc.testnet.chain.robinhood.com",
  explorerUrl: "https://explorer.testnet.chain.robinhood.com",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  testnet: true,
};

export const ROBINHOOD_CHAIN: ChainConfig = {
  name: "Robinhood Chain",
  chainId: 4663,
  rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
  explorerUrl: "https://robinhoodchain.blockscout.com",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  testnet: false,
};

export const isConfigured = (c: ChainConfig): boolean => c.chainId !== null && c.rpcUrl !== null;
