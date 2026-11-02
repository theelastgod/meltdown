/**
 * A dark ledger can bind an EVM address. The signature proves the address.
 * Chain 0 accepts the wallet's own chain. Nothing in this check transfers $CAPITAL.
 */
import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { SIWE_STATEMENT } from "../shared/economy/counter";
import { verifyEvmLink } from "../server/chain/evm-link";

const account = privateKeyToAccount(generatePrivateKey());

function nonceBox(nonce: string) {
  const have = new Map<string, string>([["file", nonce]]);
  return async (id: string, n: string) => {
    if (have.get(id) !== n) return false;
    have.delete(id);
    return true;
  };
}

async function signed(chainId: number, nonce: string, statement = SIWE_STATEMENT) {
  const message = createSiweMessage({
    address: account.address,
    chainId,
    domain: "127.0.0.1",
    nonce,
    uri: "http://127.0.0.1/",
    version: "1",
    statement,
  });
  return { message, signature: await account.signMessage({ message }) };
}

describe("an EVM link while the ledger has no chain", () => {
  it("accepts a BNB signature when the host chain is 0, and a replay does not bind again", async () => {
    const take = nonceBox("nonceone1");
    const { message, signature } = await signed(56, "nonceone1");
    const first = await verifyEvmLink({ message, signature, accountId: "file", statement: SIWE_STATEMENT, chainId: 0, takeNonce: take });
    expect(first).toEqual({ ok: true, address: account.address });
    const again = await verifyEvmLink({ message, signature, accountId: "file", statement: SIWE_STATEMENT, chainId: 0, takeNonce: take });
    expect(again).toMatchObject({ ok: false, reason: "stale nonce" });
  });

  it("a live chain still refuses a signature from another chain, and a bad signature binds nothing", async () => {
    const wrong = await signed(56, "noncetwo2");
    const refused = await verifyEvmLink({ ...wrong, accountId: "file", statement: SIWE_STATEMENT, chainId: 1, takeNonce: nonceBox("noncetwo2") });
    expect(refused).toMatchObject({ ok: false, reason: "wrong chain: expected 1" });
    const take = nonceBox("noncethree");
    const { message, signature } = await signed(56, "noncethree");
    const bad = await verifyEvmLink({ message, signature: `0x11${signature.slice(4)}`, accountId: "file", statement: SIWE_STATEMENT, chainId: 0, takeNonce: take });
    expect(bad).toMatchObject({ ok: false, reason: "bad signature" });
    const spent = await verifyEvmLink({ message, signature, accountId: "file", statement: SIWE_STATEMENT, chainId: 0, takeNonce: take });
    expect(spent).toMatchObject({ ok: false, reason: "stale nonce" });
  });
});
