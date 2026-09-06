/**
 * The PrizeVault's Merkle tree: leaf = keccak256(abi.encode(epoch, account, amount)); pairs hashed in
 * sorted order (so a proof needs no side flags); an odd node is carried up. The same bytes
 * PrizeVault.sol hashes.
 */
import { encodeAbiParameters, encodePacked, keccak256, type Hex } from "viem";

export interface PrizeLeaf {
  account: Hex;
  /** wei */
  amount: bigint;
}

export interface PrizeEpoch {
  epoch: number;
  root: Hex;
  total: bigint;
  leaves: { account: Hex; amount: bigint; proof: Hex[] }[];
}

export const leafHash = (epoch: number, account: Hex, amount: bigint): Hex => keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "address" }, { type: "uint256" }], [BigInt(epoch), account, amount]));

const pair = (a: Hex, b: Hex): Hex => (a.toLowerCase() < b.toLowerCase() ? keccak256(encodePacked(["bytes32", "bytes32"], [a, b])) : keccak256(encodePacked(["bytes32", "bytes32"], [b, a])));

export function buildEpoch(epoch: number, leaves: readonly PrizeLeaf[]): PrizeEpoch {
  const kept = leaves.filter((l) => l.amount > 0n);
  if (kept.length === 0) return { epoch, root: `0x${"0".repeat(64)}`, total: 0n, leaves: [] };
  let level: Hex[] = kept.map((l) => leafHash(epoch, l.account, l.amount));
  const layers: Hex[][] = [level];
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? pair(level[i]!, level[i + 1]!) : level[i]!);
    level = next;
    layers.push(level);
  }
  const root = level[0]!;
  const out = kept.map((l, idx) => {
    const proof: Hex[] = [];
    let i = idx;
    for (let d = 0; d < layers.length - 1; d++) {
      const layer = layers[d]!;
      const sib = i % 2 === 0 ? i + 1 : i - 1;
      if (sib < layer.length) proof.push(layer[sib]!);
      i = Math.floor(i / 2);
    }
    return { account: l.account, amount: l.amount, proof };
  });
  return { epoch, root, total: kept.reduce((a, l) => a + l.amount, 0n), leaves: out };
}

/** Verify a proof the way the contract does. */
export function verifyProof(epoch: number, account: Hex, amount: bigint, proof: readonly Hex[], root: Hex): boolean {
  let node = leafHash(epoch, account, amount);
  for (const p of proof) node = pair(node, p);
  return node.toLowerCase() === root.toLowerCase();
}
