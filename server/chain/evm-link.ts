/**
 * Verify an EVM wallet link (SIWE). The signature proves the address.
 * When the ledger's chain id is 0, any chain id on the message is accepted:
 * the host has published no chain, and a wallet cannot sit on chain 0.
 * Verification binds an address. It does not mint, grant, or transfer.
 */
import { verifyMessage, type Hex } from "viem";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";

export interface EvmLinkCheck {
  message: string;
  signature: string;
  accountId: string;
  statement: string;
  /** 0: the ledger has published no chain, so the wallet's own chain id is enough. */
  chainId: number;
  now?: number;
  takeNonce(account: string, nonce: string): boolean | Promise<boolean>;
}

export async function verifyEvmLink(o: EvmLinkCheck): Promise<{ ok: true; address: Hex } | { ok: false; reason: string }> {
  let parsed: ReturnType<typeof parseSiweMessage>;
  try {
    parsed = parseSiweMessage(o.message);
  } catch {
    return { ok: false, reason: "malformed SIWE message" };
  }
  if (!parsed.address || !parsed.nonce) return { ok: false, reason: "malformed SIWE message" };
  if (parsed.statement !== o.statement) return { ok: false, reason: "wrong statement: the link signs nothing else" };
  if (o.chainId !== 0 && parsed.chainId !== o.chainId) return { ok: false, reason: `wrong chain: expected ${o.chainId}` };
  if (!validateSiweMessage({ message: parsed, time: new Date(o.now ?? Date.now()) })) return { ok: false, reason: "SIWE message expired or not yet valid" };
  if (!(await o.takeNonce(o.accountId, parsed.nonce))) return { ok: false, reason: "stale nonce" };
  const signature = o.signature.startsWith("0x") ? (o.signature as Hex) : null;
  if (!signature) return { ok: false, reason: "bad signature" };
  try {
    if (!(await verifyMessage({ address: parsed.address, message: o.message, signature }))) return { ok: false, reason: "bad signature" };
  } catch {
    return { ok: false, reason: "bad signature" };
  }
  return { ok: true, address: parsed.address };
}
