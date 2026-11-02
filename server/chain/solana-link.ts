/**
 * Verify a Solana wallet link. The signature is ed25519 over the exact message
 * bytes. The address in the message is the public key that must verify.
 * The nonce is spent once the message has the right shape, same as the SIWE path.
 */
import { ed25519 } from "@noble/curves/ed25519";
import { decodeBase58, hexToBytes, parseSolanaLink, type SolanaLinkFields } from "../../shared/economy/solana";

export interface SolanaLinkCheck {
  message: string;
  signature: string;
  accountId: string;
  statement: string;
  cluster: "devnet" | "mainnet-beta";
  takeNonce(account: string, nonce: string): boolean | Promise<boolean>;
}

export async function verifySolanaLink(o: SolanaLinkCheck): Promise<{ ok: true; address: string; fields: SolanaLinkFields } | { ok: false; reason: string }> {
  const fields = parseSolanaLink(o.message);
  if (!fields) return { ok: false, reason: "malformed Solana link" };
  if (fields.statement !== o.statement) return { ok: false, reason: "wrong statement: the link signs nothing else" };
  if (fields.cluster !== o.cluster) return { ok: false, reason: `wrong cluster: expected ${o.cluster}` };
  if (fields.account !== o.accountId) return { ok: false, reason: "wrong file" };
  if (!(await o.takeNonce(o.accountId, fields.nonce))) return { ok: false, reason: "stale nonce" };
  const pub = decodeBase58(fields.address);
  const sig = hexToBytes(o.signature);
  if (!pub || pub.length !== 32 || !sig || sig.length !== 64) return { ok: false, reason: "bad signature" };
  const ok = ed25519.verify(sig, new TextEncoder().encode(o.message), pub);
  if (!ok) return { ok: false, reason: "bad signature" };
  return { ok: true, address: fields.address, fields };
}
