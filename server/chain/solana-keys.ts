/**
 * Dev Solana pubkeys, derived from the published dev seeds, and the reader for a
 * real mint and treasury. The seeds never leave this module. A pubkey from this
 * set is refused on the Worker: the placeholder must not be the bank.
 *
 * These addresses are not accounts on a cluster. Nothing has been airdropped,
 * and nothing here is a mint.
 */
import { ed25519 } from "@noble/curves/ed25519";
import { DEV_KEYS } from "./dev-keys";
import { encodeBase58, isSolanaAddress, solanaRpc, type SolanaPublication } from "../../shared/economy/solana";

function seedOf(hexKey: string): Uint8Array {
  const h = hexKey.startsWith("0x") ? hexKey.slice(2) : hexKey;
  const seed = new Uint8Array(32);
  for (let i = 0; i < 32; i++) seed[i] = Number.parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return seed;
}

function pub(hexKey: string): string {
  return encodeBase58(ed25519.getPublicKey(seedOf(hexKey)));
}

/** Public keys only. The treasury and the relayer are different seeds on purpose. */
export const DEV_SOLANA = {
  relayer: pub(DEV_KEYS.relayer),
  signer: pub(DEV_KEYS.signer),
  treasury: pub(DEV_KEYS.treasury),
  player: pub(DEV_KEYS.player),
  player2: pub(DEV_KEYS.player2),
};

const DEV_SOLANA_SET = new Set(Object.values(DEV_SOLANA));

export const isDevSolanaAddress = (address: string | null | undefined): boolean => !!address && DEV_SOLANA_SET.has(address.trim());

export interface SolanaEnv {
  SOLANA_CLUSTER?: string;
  SOLANA_RPC?: string;
  SOLANA_MINT?: string;
  SOLANA_TREASURY?: string;
}

/**
 * A published mint and treasury. Empty vars are unpublished. A dev pubkey, a
 * mint that is the treasury, or an unknown cluster is unpublished too: the
 * Worker would otherwise name an address that is not a bank.
 */
export function readSolanaConfig(env: SolanaEnv): SolanaPublication | null {
  const cluster = env.SOLANA_CLUSTER?.trim();
  const mint = env.SOLANA_MINT?.trim() ?? "";
  const treasury = env.SOLANA_TREASURY?.trim() ?? "";
  if (!cluster && !mint && !treasury) return null;
  if (cluster !== "devnet" && cluster !== "mainnet-beta") return null;
  if (!isSolanaAddress(mint) || !isSolanaAddress(treasury)) return null;
  if (mint === treasury) return null;
  if (isDevSolanaAddress(mint) || isDevSolanaAddress(treasury)) return null;
  return { cluster, mint, treasury, rpc: solanaRpc(cluster, env.SOLANA_RPC) };
}
