/**
 * The wallet ↔ Ghostfile index: one wallet per file, one file per wallet, and the SIWE nonces.
 * The Node host keeps it in memory; the counter Worker keeps it in D1 (server/schema.sql `wallet`).
 */
export interface WalletStore {
  /** a fresh SIWE nonce for this file (valid for ten minutes) */
  issueNonce(account: string): string | Promise<string>;
  /** consume a nonce; false when unknown or expired */
  takeNonce(account: string, nonce: string): boolean | Promise<boolean>;
  accountOf(address: string): string | null | Promise<string | null>;
  addressOf(account: string): string | null | Promise<string | null>;
  /** bind 1:1; throws when either side is already bound elsewhere */
  bind(account: string, address: string, at: number): void | Promise<void>;
  unbind(account: string): void | Promise<void>;
  /**
   * Every linked file. The reconciliation pass needs to walk the files that could be owed
   * $CAPITAL, and only a linked one can be — so this index is the complete set, which the
   * banking table is not (a file whose bank never reached the database is missing from it, and
   * that is precisely the drift worth finding).
   */
  accounts(): string[] | Promise<string[]>;
}

export class MemoryWalletStore implements WalletStore {
  private nonces = new Map<string, { nonce: string; at: number }>();
  readonly byAccount = new Map<string, string>();
  readonly byAddress = new Map<string, string>();
  constructor(private now: () => number = Date.now) {}
  issueNonce(account: string): string {
    const nonce = Array.from({ length: 16 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
    this.nonces.set(account, { nonce, at: this.now() });
    return nonce;
  }
  takeNonce(account: string, nonce: string): boolean {
    const n = this.nonces.get(account);
    if (!n || n.nonce !== nonce || this.now() - n.at > 600_000) return false;
    this.nonces.delete(account);
    return true;
  }
  accounts(): string[] {
    return [...this.byAccount.keys()];
  }
  accountOf(address: string): string | null {
    return this.byAddress.get(address.toLowerCase()) ?? null;
  }
  addressOf(account: string): string | null {
    return this.byAccount.get(account) ?? null;
  }
  bind(account: string, address: string, _at: number): void {
    const a = address.toLowerCase();
    const other = this.byAddress.get(a);
    if (other && other !== account) throw new Error("wallet already bound to another file");
    const prev = this.byAccount.get(account);
    if (prev && prev !== a) throw new Error("file already bound to another wallet");
    this.byAccount.set(account, a);
    this.byAddress.set(a, account);
  }
  unbind(account: string): void {
    const a = this.byAccount.get(account);
    if (a) this.byAddress.delete(a);
    this.byAccount.delete(account);
  }
}
