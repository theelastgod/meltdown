/**
 * The game signer: EIP-712 vouchers for anything the game grants on chain. The key never leaves
 * the host; contracts verify the signer address. Nonces are per-wallet and single-use on chain
 * (Vouchers.sol), so the host draws them from a clock + counter and never reuses one.
 */
import { keccak256, toHex, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { VOUCHER_DOMAINS, VOUCHER_TYPES } from "../../shared/economy/counter";

export const fileIdOf = (accountId: string): Hex => keccak256(toHex(accountId));
export const stampIdOf = (stampId: string): Hex => keccak256(toHex(stampId));
export const nameKeyOf = (name: string): Hex => keccak256(toHex(name));

export interface Voucher<T extends Record<string, unknown>> {
  message: T;
  signature: Hex;
}

export class GameSigner {
  readonly account: PrivateKeyAccount;
  private counter = 0;
  constructor(privateKey: Hex, private chainId: number, private contracts: { ghostfile: Hex; stamps: Hex; names: Hex }, private now: () => number = Date.now) {
    this.account = privateKeyToAccount(privateKey);
  }
  get address(): Hex {
    return this.account.address;
  }
  private nonce(): bigint {
    this.counter = (this.counter + 1) & 0xffff;
    return BigInt(this.now()) * 65536n + BigInt(this.counter);
  }
  private deadline(): bigint {
    return BigInt(Math.floor(this.now() / 1000) + 600);
  }
  async link(wallet: Hex, accountId: string) {
    const message = { wallet, fileId: fileIdOf(accountId), nonce: this.nonce(), deadline: this.deadline() };
    const signature = await this.account.signTypedData({ domain: { name: VOUCHER_DOMAINS.ghostfile, version: "1", chainId: this.chainId, verifyingContract: this.contracts.ghostfile }, types: { Link: [...VOUCHER_TYPES.Link] }, primaryType: "Link", message });
    return { message, signature };
  }
  async stamp(wallet: Hex, accountId: string, stampId: string) {
    const message = { wallet, fileId: fileIdOf(accountId), stampId: stampIdOf(stampId), nonce: this.nonce(), deadline: this.deadline() };
    const signature = await this.account.signTypedData({ domain: { name: VOUCHER_DOMAINS.stamps, version: "1", chainId: this.chainId, verifyingContract: this.contracts.stamps }, types: { Stamp: [...VOUCHER_TYPES.Stamp] }, primaryType: "Stamp", message });
    return { message, signature };
  }
  async name(wallet: Hex, name: string) {
    // EIP-712 hashes the string itself; Names.sol hashes `keccak256(bytes(name_))` into the same struct hash
    const message = { wallet, name, nonce: this.nonce(), deadline: this.deadline() };
    const signature = await this.account.signTypedData({ domain: { name: VOUCHER_DOMAINS.names, version: "1", chainId: this.chainId, verifyingContract: this.contracts.names }, types: { Name: [...VOUCHER_TYPES.Name] }, primaryType: "Name", message });
    return { message, signature };
  }
}
