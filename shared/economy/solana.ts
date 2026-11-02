/**
 * Solana addresses, the link statement, and the line the ledger uses when a
 * Solana wallet asks an EVM settlement to move $CAPITAL.
 *
 * A Solana address is 32 bytes, base58, case-sensitive. No checksum.
 * Nothing here is a mint or a treasury. Those are published by the operator.
 */
import { SOLANA_DEVNET, SOLANA_MAINNET } from "./chain";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE = 58;

/** Base58 of raw bytes. Leading zero bytes become leading "1", except the last zero, which the digits already carry. */
export function encodeBase58(source: Uint8Array): string {
  if (source.length === 0) return "";
  const digits = [0];
  for (let i = 0; i < source.length; i++) {
    let carry = source[i] ?? 0;
    for (let j = 0; j < digits.length; j++) {
      carry += (digits[j] ?? 0) << 8;
      digits[j] = carry % BASE;
      carry = (carry / BASE) | 0;
    }
    while (carry > 0) {
      digits.push(carry % BASE);
      carry = (carry / BASE) | 0;
    }
  }
  let out = "";
  for (let k = 0; source[k] === 0 && k < source.length - 1; k++) out += "1";
  for (let q = digits.length - 1; q >= 0; q--) out += ALPHABET[digits[q] ?? 0];
  return out;
}

/** Raw bytes of a base58 string, or null when a character is outside the alphabet. */
export function decodeBase58(value: string): Uint8Array | null {
  if (!value) return null;
  const bytes = [0];
  for (let i = 0; i < value.length; i++) {
    const digit = ALPHABET.indexOf(value[i] ?? "");
    if (digit < 0) return null;
    let carry = digit;
    for (let j = 0; j < bytes.length; j++) {
      carry += (bytes[j] ?? 0) * BASE;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let k = 0; value[k] === "1" && k < value.length - 1; k++) bytes.push(0);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[bytes.length - 1 - i] ?? 0;
  return out;
}

/** A Solana public key: 32 bytes, base58. Case is significant. */
export function isSolanaAddress(value: string | null | undefined): value is string {
  if (!value || value.length < 32 || value.length > 44) return false;
  const bytes = decodeBase58(value);
  return !!bytes && bytes.length === 32;
}

/** An EVM address. Solana addresses are not these, and must not be folded to lower case. */
export function isEvmAddress(value: string | null | undefined): value is string {
  return !!value && /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "0x";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function hexToBytes(hex: string): Uint8Array | null {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(h)) return null;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** The first line of a Solana link. The host refuses any other shape. */
export const SOLANA_LINK_HEADER = "MELTDOWN SOLANA LINK";

export interface SolanaLinkFields {
  statement: string;
  address: string;
  account: string;
  nonce: string;
  cluster: "devnet" | "mainnet-beta";
}

/** The bytes the wallet signs. One statement, the address, the file, the nonce, the cluster. */
export function solanaLinkMessage(o: SolanaLinkFields): string {
  return [SOLANA_LINK_HEADER, o.statement, `Address: ${o.address}`, `File: ${o.account}`, `Nonce: ${o.nonce}`, `Cluster: ${o.cluster}`].join("\n");
}

export function parseSolanaLink(message: string): SolanaLinkFields | null {
  const lines = message.split("\n");
  if (lines.length !== 6 || lines[0] !== SOLANA_LINK_HEADER) return null;
  const statement = lines[1] ?? "";
  const address = take(lines[2], "Address: ");
  const account = take(lines[3], "File: ");
  const nonce = take(lines[4], "Nonce: ");
  const cluster = take(lines[5], "Cluster: ");
  if (!statement || !address || !account || !nonce || !cluster) return null;
  if (!isSolanaAddress(address)) return null;
  if (cluster !== "devnet" && cluster !== "mainnet-beta") return null;
  return { statement, address, account, nonce, cluster };
}

function take(line: string | undefined, prefix: string): string | null {
  if (!line?.startsWith(prefix)) return null;
  const value = line.slice(prefix.length);
  return value.length > 0 ? value : null;
}

/** What a Solana wallet hears when it asks the EVM settlement to move tokens. Nothing is sent. */
export const SOLANA_SETTLEMENT_LINE = "SOLANA ADDRESS LINKED. $CAPITAL MOVES WHEN A MINT AND TREASURY ARE PUBLISHED. NOTHING WAS SENT.";

export interface SolanaPublication {
  cluster: "devnet" | "mainnet-beta";
  treasury: string;
  mint: string;
  rpc: string;
}

/** The cluster RPC for a published mint. An empty rpc uses the public cluster endpoint. */
export function solanaRpc(cluster: "devnet" | "mainnet-beta", rpc?: string | null): string {
  const named = rpc?.trim();
  if (named) return named;
  return cluster === "devnet" ? SOLANA_DEVNET.rpcUrl : SOLANA_MAINNET.rpcUrl;
}
