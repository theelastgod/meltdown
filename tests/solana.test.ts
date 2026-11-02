/**
 * Solana addresses, the dev treasury, and a signed link that moves no tokens.
 */
import { ed25519 } from "@noble/curves/ed25519";
import { afterAll, describe, expect, it } from "vitest";
import { bootDevnetLedger } from "../server/chain/boot";
import { DEV_SOLANA, isDevSolanaAddress, readSolanaConfig } from "../server/chain/solana-keys";
import { SOLANA_DEVNET } from "../shared/economy/chain";
import { SIWE_STATEMENT } from "../shared/economy/counter";
import { bytesToHex, decodeBase58, encodeBase58, isSolanaAddress, solanaLinkMessage, SOLANA_SETTLEMENT_LINE } from "../shared/economy/solana";
import { sandboxAccount } from "../shared/progression/account";
import type { Hex } from "viem";

const SYSTEM = "11111111111111111111111111111111";

describe("Solana addresses", () => {
  it("round-trips 32 bytes, including the all-zero system address", () => {
    const zeros = new Uint8Array(32);
    expect(encodeBase58(zeros)).toBe(SYSTEM);
    expect(decodeBase58(SYSTEM)).toEqual(zeros);
    expect(isSolanaAddress(SYSTEM)).toBe(true);
    const mixed = new Uint8Array(32);
    mixed[0] = 0;
    mixed[1] = 255;
    mixed[31] = 7;
    const encoded = encodeBase58(mixed);
    expect(decodeBase58(encoded)).toEqual(mixed);
    expect(isSolanaAddress(encoded)).toBe(true);
    expect(isSolanaAddress("not an address")).toBe(false);
    expect(decodeBase58("0OIl")).toBeNull();
  });

  it("the dev treasury is a Solana address, distinct from the relayer, and refused as a published bank", () => {
    expect(isSolanaAddress(DEV_SOLANA.treasury)).toBe(true);
    expect(isSolanaAddress(DEV_SOLANA.relayer)).toBe(true);
    expect(DEV_SOLANA.treasury).not.toBe(DEV_SOLANA.relayer);
    expect(DEV_SOLANA.treasury).not.toBe(DEV_SOLANA.treasury.toLowerCase());
    expect(isDevSolanaAddress(DEV_SOLANA.treasury)).toBe(true);
    expect(readSolanaConfig({})).toBeNull();
    expect(readSolanaConfig({ SOLANA_CLUSTER: "mainnet-beta", SOLANA_MINT: DEV_SOLANA.player, SOLANA_TREASURY: DEV_SOLANA.treasury })).toBeNull();
    expect(readSolanaConfig({ SOLANA_CLUSTER: "mainnet-beta", SOLANA_MINT: SYSTEM, SOLANA_TREASURY: SYSTEM })).toBeNull();
    const published = readSolanaConfig({ SOLANA_CLUSTER: "devnet", SOLANA_MINT: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", SOLANA_TREASURY: SYSTEM, SOLANA_RPC: "" });
    expect(published).toMatchObject({ cluster: "devnet", treasury: SYSTEM, rpc: SOLANA_DEVNET.rpcUrl });
  });
});

describe("a Solana link on the devnet ledger", () => {
  let b: Awaited<ReturnType<typeof bootDevnetLedger>>;
  afterAll(() => {
    /* the devnet has no handle to close */
  });

  it("binds the address, keeps its case, mints nothing, and refuses a payout", async () => {
    b = await bootDevnetLedger({ onLog: () => {}, seedMarket: false });
    expect(b.ledger.info().solana).toEqual({ cluster: "devnet", treasury: DEV_SOLANA.treasury, mint: null, rpc: SOLANA_DEVNET.rpcUrl });
    const a = sandboxAccount("sol-file");
    const seed = ed25519.utils.randomPrivateKey();
    const address = encodeBase58(ed25519.getPublicKey(seed));
    expect(address).not.toBe(address.toLowerCase());
    const nonce = await b.ledger.nonce(a.id);
    const message = solanaLinkMessage({ address, account: a.id, nonce, cluster: "devnet", statement: SIWE_STATEMENT });
    const signature = bytesToHex(ed25519.sign(new TextEncoder().encode(message), seed)) as Hex;
    const linked = await b.ledger.link(a, message, signature);
    expect(linked.ok).toBe(true);
    expect(linked.reason).toBe(SOLANA_SETTLEMENT_LINE);
    expect(a.counter?.address).toBe(address);
    expect(a.counter?.ghostfile).toBe(0);
    expect(await b.wallets.accountOf(address)).toBe(a.id);
    expect(await b.wallets.accountOf(address.toLowerCase())).toBeNull();
    const wrong = solanaLinkMessage({ address, account: a.id, nonce: await b.ledger.nonce(a.id), cluster: "mainnet-beta", statement: SIWE_STATEMENT });
    expect((await b.ledger.link(a, wrong, bytesToHex(ed25519.sign(new TextEncoder().encode(wrong), seed)) as Hex)).reason).toMatch(/wrong cluster/);
    expect((await b.ledger.payout(a)).reason).toBe(SOLANA_SETTLEMENT_LINE);
    expect((await b.ledger.mintGhostfile(a)).reason).toBe(SOLANA_SETTLEMENT_LINE);
  }, 60_000);
});
