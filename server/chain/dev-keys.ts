/**
 * The dev keys (the classic anvil set). Never used on a real network — and since Stage 53 that is
 * enforced rather than hoped: the counter Worker, the Node host on a real chain and the deploy CLI
 * all refuse a key from this set. A placeholder that still works in production is not a
 * placeholder, it is the key.
 *
 * This module imports only viem's account derivation, so the Workers can import it without
 * dragging the devnet in.
 */
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const DEV_KEYS = {
  relayer: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex,
  signer: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba" as Hex,
  /**
   * The bank. A separate key from the relayer on purpose, even here: the relayer signs constantly
   * and the treasury holds the whole supply, so if the devnet ran them as one address the tests
   * would never exercise the shape production has to run in (docs/SECURITY.md §3.1). On a real
   * network this is a timelocked multisig and there is no key at all.
   */
  treasury: "0x8166f546bab6da521a8369cab06c5d2b9e46670292d85c875ee9ec20e84ffb61" as Hex,
  /** the probe's and the tests' player wallets */
  player: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a" as Hex,
  player2: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" as Hex,
};

const DEV_KEY_SET = new Set(Object.values(DEV_KEYS).map((k) => k.toLowerCase()));

/** true for any key in the dev set, however it is cased */
export const isDevKey = (key: string | undefined | null): boolean => !!key && DEV_KEY_SET.has(key.trim().toLowerCase());

/** the addresses those keys control: a deploy that trusts one of them as signer or bank is a deploy on a published key */
const DEV_ADDRESS_SET = new Set(Object.values(DEV_KEYS).map((k) => privateKeyToAccount(k).address.toLowerCase()));
export const isDevAddress = (address: string | undefined | null): boolean => !!address && DEV_ADDRESS_SET.has(address.trim().toLowerCase());

export const DEV_KEY_ON_CHAIN = "DEV KEY ON A REAL CHAIN: SIGNER_KEY or RELAYER_KEY is one of the published dev keys; replace it before this ledger can run";

/**
 * What the deploy CLI checks before it spends gas on a real network (Stage 53, the signer added in
 * Stage 54): the relayer is not a dev key, the signer and the treasury are not dev addresses, and
 * the treasury is named and is not the relayer. The devnet defaults the treasury to
 * a separate dev key for the same reason; on a real chain there is no default at all.
 */
export function deployGuard(o: { relayerKey: string; relayerAddress: string; signer: string; treasury: string | undefined }): { ok: true } | { ok: false; reason: string } {
  if (isDevKey(o.relayerKey)) return { ok: false, reason: "the relayer key is a published dev key" };
  if (isDevAddress(o.signer)) return { ok: false, reason: "the signer is a published dev key's address: the Worker would refuse to run with its key, so the contracts would trust an attestor that can never sign" };
  if (isDevAddress(o.treasury)) return { ok: false, reason: "the treasury is a published dev key's address" };
  if (!o.treasury) return { ok: false, reason: "a treasury address is required: the supply is minted to it, and the relayer must never be it (docs/SECURITY.md §3.1)" };
  if (!/^0x[0-9a-fA-F]{40}$/.test(o.treasury)) return { ok: false, reason: "the treasury is not an address" };
  if (o.treasury.toLowerCase() === o.relayerAddress.toLowerCase()) return { ok: false, reason: "the treasury is the relayer: the hot key would hold the whole supply" };
  return { ok: true };
}
