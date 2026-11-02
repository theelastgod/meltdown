/**
 * $CAPITAL launches on BNB Smart Chain. The chain parameters are real.
 * The contract address is not: nothing in this module is a 20-byte address,
 * and the worker's CHAIN_ID stays 0 until one is published.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BNB_CHAIN_ID, BNB_LAUNCH, BNB_MAINNET, BNB_TESTNET, BNB_TESTNET_CHAIN_ID, bnbById, evmNative, plainEvmAddress, walletConnectOptionalChains, walletConnectProjectId, walletConnectRpcMap } from "../shared/economy/bnb";

describe("BNB Smart Chain", () => {
  it("names mainnet 56 and testnet 97 with the official coin, dataseed, and explorer", () => {
    expect(BNB_CHAIN_ID).toBe(56);
    expect(BNB_MAINNET.id).toBe(56);
    expect(BNB_MAINNET.testnet).toBe(false);
    expect(BNB_MAINNET.name).toBe("BNB Smart Chain");
    expect(BNB_MAINNET.nativeCurrency).toEqual({ name: "BNB", symbol: "BNB", decimals: 18 });
    expect(BNB_MAINNET.rpcUrl).toBe("https://bsc-dataseed.bnbchain.org");
    expect(BNB_MAINNET.explorerUrl).toBe("https://bscscan.com");
    expect(BNB_TESTNET_CHAIN_ID).toBe(97);
    expect(BNB_TESTNET.id).toBe(97);
    expect(BNB_TESTNET.testnet).toBe(true);
    expect(BNB_TESTNET.nativeCurrency.symbol).toBe("tBNB");
    expect(BNB_TESTNET.rpcUrl).toBe("https://data-seed-prebsc-1-s1.bnbchain.org:8545");
    expect(BNB_TESTNET.explorerUrl).toBe("https://testnet.bscscan.com");
    expect(bnbById(56)).toBe(BNB_MAINNET);
    expect(bnbById(97)).toBe(BNB_TESTNET);
    expect(bnbById(1)).toBeNull();
    expect(bnbById(31911)).toBeNull();
  });

  it("keeps the devnet on its own name, and labels 56 as BNB", () => {
    expect(evmNative(31911, true)).toMatchObject({ name: "MELTDOWN devnet", nativeCurrency: { symbol: "ETH" } });
    expect(evmNative(56, false)).toMatchObject({ name: "BNB Smart Chain", nativeCurrency: { symbol: "BNB" }, explorerUrl: "https://bscscan.com" });
    expect(evmNative(97, false).nativeCurrency.symbol).toBe("tBNB");
    expect(evmNative(1, false)).toMatchObject({ name: "EVM", nativeCurrency: { symbol: "ETH" }, explorerUrl: null });
  });

  it("the launch card has no contract and has sent nothing", () => {
    expect(BNB_LAUNCH).toMatchObject({ chainId: 56, gas: "BNB", standard: "BEP-20", supply: "1000000000", decimals: 18, contract: null, sent: false });
    const src = readFileSync(new URL("../shared/economy/bnb.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/0x[0-9a-fA-F]{40}/);
  });

  it("the worker still has no chain and no contract", () => {
    const wrangler = readFileSync(new URL("../wrangler.counter.toml", import.meta.url), "utf8");
    expect(wrangler).toMatch(/CHAIN_ID = "0"/);
    expect(wrangler).toMatch(/CHAIN_RPC = ""/);
    expect(wrangler).toMatch(/CONTRACTS = "\{\}"/);
  });

  it("a WalletConnect project id is 32 hex characters, and nothing else counts", () => {
    expect(walletConnectProjectId(undefined)).toBe("");
    expect(walletConnectProjectId({})).toBe("");
    expect(walletConnectProjectId({ VITE_WALLETCONNECT_PROJECT_ID: "not-a-project" })).toBe("");
    expect(walletConnectProjectId({ VITE_WALLETCONNECT_PROJECT_ID: "abc" })).toBe("");
    const id = "a".repeat(32);
    expect(walletConnectProjectId({ VITE_WALLETCONNECT_PROJECT_ID: ` ${id} ` })).toBe(id);
  });

  it("a WalletConnect session offers only BNB chains, and a CAIP account is the plain address", () => {
    expect(walletConnectOptionalChains()).toEqual([56, 97]);
    const host = "https://example.invalid/rpc";
    expect(Object.keys(walletConnectRpcMap(31911, host)).sort()).toEqual(["56", "97"]);
    expect(walletConnectRpcMap(31911, host)["56"]).toBe(BNB_MAINNET.rpcUrl);
    expect(walletConnectRpcMap(56, host)["56"]).toBe(host);
    const addr = `0x${"ab".repeat(20)}`;
    expect(plainEvmAddress(`eip155:56:${addr}`)).toBe(addr);
    expect(plainEvmAddress(addr)).toBe(addr);
    expect(plainEvmAddress("eip155:56:not-an-address")).toBe("");
    expect(plainEvmAddress(null)).toBe("");
  });
});
