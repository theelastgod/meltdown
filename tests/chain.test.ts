/**
 * Meltdown's chain is Solana.
 *
 * Devnet and mainnet-beta are the published clusters. The live worker keeps
 * CHAIN_ID 0 (EVM settlement stays closed) and names the real mainnet mint and
 * treasury. A dev pubkey is still refused.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isConfigured, SOLANA_DEVNET, SOLANA_MAINNET } from "../shared/economy/chain";
import { isDevSolanaAddress, readSolanaConfig } from "../server/chain/solana-keys";
import { isSolanaAddress } from "../shared/economy/solana";

const MINT = "kLtXrN1jJ5YcCmVaGbgD1f65Jfej72xaSWG9fDPpump";
const TREASURY = "3K6kZkUNmQ1CKLAnHMTkrEhmJQcZem6KD71ry6hTtaww";

describe("Solana", () => {
  it("names devnet and mainnet, and publishes the mainnet mint and treasury", () => {
    expect(SOLANA_DEVNET.cluster).toBe("devnet");
    expect(SOLANA_DEVNET.testnet).toBe(true);
    expect(SOLANA_DEVNET.rpcUrl).toBe("https://api.devnet.solana.com");
    expect(SOLANA_DEVNET.explorerUrl).toBe("https://explorer.solana.com/?cluster=devnet");
    expect(SOLANA_DEVNET.nativeCurrency.symbol).toBe("SOL");
    expect(SOLANA_MAINNET.cluster).toBe("mainnet-beta");
    expect(SOLANA_MAINNET.testnet).toBe(false);
    expect(SOLANA_MAINNET.rpcUrl).toBe("https://api.mainnet-beta.solana.com");
    expect(SOLANA_MAINNET.explorerUrl).toBe("https://explorer.solana.com");
    expect(SOLANA_MAINNET.nativeCurrency.symbol).toBe("SOL");
    expect(isConfigured(SOLANA_DEVNET)).toBe(true);
    expect(isConfigured(SOLANA_MAINNET)).toBe(true);
    const wrangler = readFileSync(new URL("../wrangler.counter.toml", import.meta.url), "utf8");
    expect(wrangler).toMatch(/CHAIN_ID = "0"/);
    expect(wrangler).toMatch(/CHAIN_RPC = ""/);
    expect(wrangler).toMatch(/SOLANA_CLUSTER = "mainnet-beta"/);
    expect(wrangler).toContain(`SOLANA_MINT = "${MINT}"`);
    expect(wrangler).toContain(`SOLANA_TREASURY = "${TREASURY}"`);
    const published = JSON.parse(readFileSync(new URL("../public/solana.json", import.meta.url), "utf8")) as { mint: string; treasury: string; symbol: string; decimals: number; cluster: string };
    expect(published.symbol).toBe("CAPITAL");
    expect(published.decimals).toBe(6);
    expect(published.cluster).toBe("mainnet-beta");
    expect(published.mint).toBe(MINT);
    expect(published.treasury).toBe(TREASURY);
    expect(isSolanaAddress(MINT)).toBe(true);
    expect(isSolanaAddress(TREASURY)).toBe(true);
    expect(MINT).not.toBe(TREASURY);
    expect(isDevSolanaAddress(MINT)).toBe(false);
    expect(isDevSolanaAddress(TREASURY)).toBe(false);
    expect(readSolanaConfig({ SOLANA_CLUSTER: "mainnet-beta", SOLANA_MINT: MINT, SOLANA_TREASURY: TREASURY })).toMatchObject({ cluster: "mainnet-beta", mint: MINT, treasury: TREASURY });
  });
});
