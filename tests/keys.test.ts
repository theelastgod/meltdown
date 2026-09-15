/**
 * The placeholder cannot be the key (Stage 53). The dev keys are published in the repo; every
 * path that could run a ledger on a real chain refuses them, and the deploy CLI refuses a deploy
 * whose bank would be its own hot key.
 */
import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { DEV_KEY_ON_CHAIN, DEV_KEYS, deployGuard, isDevKey } from "../server/chain/dev-keys";
import counterWorker from "../server/counter-worker";

const REAL = "0x1111111111111111111111111111111111111111111111111111111111111111";

describe("isDevKey", () => {
  it("knows every published dev key however it is cased, and nothing else", () => {
    for (const k of Object.values(DEV_KEYS)) {
      expect(isDevKey(k)).toBe(true);
      expect(isDevKey(k.toUpperCase())).toBe(true);
      expect(isDevKey(` ${k} `)).toBe(true);
    }
    expect(isDevKey(REAL)).toBe(false);
    expect(isDevKey("")).toBe(false);
    expect(isDevKey(undefined)).toBe(false);
  });
});

describe("the counter Worker on a real chain", () => {
  const env = (o: Partial<Record<"CHAIN_ID" | "CHAIN_RPC" | "CONTRACTS" | "SIGNER_KEY" | "RELAYER_KEY", string>>) => ({ CHAIN_ID: "31911", CHAIN_RPC: "http://127.0.0.1:1/rpc", CONTRACTS: "{}", SIGNER_KEY: REAL, RELAYER_KEY: REAL, ...o }) as never;
  it("refuses a published dev key in either slot with its own reason, on the link route and in what /counter says", async () => {
    for (const bad of [{ SIGNER_KEY: DEV_KEYS.signer }, { RELAYER_KEY: DEV_KEYS.relayer }]) {
      const r = await counterWorker.fetch(new Request("https://counter/link/nonce", { method: "POST", body: "{}" }), env(bad));
      expect(r.status).toBe(503);
      expect(((await r.json()) as { reason: string }).reason).toBe(DEV_KEY_ON_CHAIN);
      const c = (await (await counterWorker.fetch(new Request("https://counter/counter"), env(bad))).json()) as { reason: string; listings: unknown[] };
      expect(c.reason).toBe(DEV_KEY_ON_CHAIN);
      expect(c.listings).toEqual([]);
    }
  });
  it("still says NOT CONFIGURED when the chain is simply absent, so the two states are told apart", async () => {
    const r = await counterWorker.fetch(new Request("https://counter/link/nonce", { method: "POST", body: "{}" }), env({ CHAIN_RPC: "" }));
    expect(r.status).toBe(503);
    expect(((await r.json()) as { reason: string }).reason).toMatch(/CHAIN NOT CONFIGURED/);
  });
});

describe("the deploy guard", () => {
  const relayer = privateKeyToAccount(REAL as `0x${string}`);
  it("refuses a dev relayer key, a missing treasury, a malformed one, and a treasury that is the relayer; accepts a real, separate bank", () => {
    expect(deployGuard({ relayerKey: DEV_KEYS.relayer, relayerAddress: relayer.address, treasury: "0x000000000000000000000000000000000000dEaD" })).toMatchObject({ ok: false, reason: /dev key/ });
    expect(deployGuard({ relayerKey: REAL, relayerAddress: relayer.address, treasury: undefined })).toMatchObject({ ok: false, reason: /required/ });
    expect(deployGuard({ relayerKey: REAL, relayerAddress: relayer.address, treasury: "not-an-address" })).toMatchObject({ ok: false, reason: /not an address/ });
    expect(deployGuard({ relayerKey: REAL, relayerAddress: relayer.address, treasury: relayer.address.toUpperCase() })).toMatchObject({ ok: false, reason: /is the relayer/ });
    expect(deployGuard({ relayerKey: REAL, relayerAddress: relayer.address, treasury: "0x000000000000000000000000000000000000dEaD" })).toEqual({ ok: true });
  });
});
