/**
 * Meltdown's chain is Robinhood Chain (Stage 727).
 *
 * The published parameters are chain 46630 on the testnet and 4663 on mainnet.
 * Clearing either chain id fails this once. The live worker is still unconfigured:
 * wrangler keeps CHAIN_ID 0 until the contracts exist on the testnet.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isConfigured, ROBINHOOD_CHAIN, ROBINHOOD_CHAIN_TESTNET } from "../shared/economy/chain";

describe("Robinhood Chain", () => {
  it("names the published testnet and mainnet, and leaves the worker unconfigured", () => {
    expect(ROBINHOOD_CHAIN_TESTNET.chainId).toBe(46630);
    expect(ROBINHOOD_CHAIN_TESTNET.testnet).toBe(true);
    expect(ROBINHOOD_CHAIN_TESTNET.rpcUrl).toBe("https://rpc.testnet.chain.robinhood.com");
    expect(ROBINHOOD_CHAIN_TESTNET.explorerUrl).toBe("https://explorer.testnet.chain.robinhood.com");
    expect(ROBINHOOD_CHAIN_TESTNET.nativeCurrency.symbol).toBe("ETH");
    expect(ROBINHOOD_CHAIN.chainId).toBe(4663);
    expect(ROBINHOOD_CHAIN.testnet).toBe(false);
    expect(ROBINHOOD_CHAIN.rpcUrl).toBe("https://rpc.mainnet.chain.robinhood.com");
    expect(ROBINHOOD_CHAIN.explorerUrl).toBe("https://robinhoodchain.blockscout.com");
    expect(ROBINHOOD_CHAIN.nativeCurrency.symbol).toBe("ETH");
    expect(isConfigured(ROBINHOOD_CHAIN_TESTNET)).toBe(true);
    expect(isConfigured(ROBINHOOD_CHAIN)).toBe(true);
    const wrangler = readFileSync(new URL("../wrangler.counter.toml", import.meta.url), "utf8");
    expect(wrangler).toMatch(/CHAIN_ID = "0"/);
    expect(wrangler).toMatch(/CHAIN_RPC = ""/);
  });
});
