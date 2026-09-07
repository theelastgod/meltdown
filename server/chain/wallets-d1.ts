/** The wallet index on D1 (server/schema.sql `wallet`, `siwe_nonce`); the counter Worker's store. */
import type { WalletStore } from "./wallets";

export class D1WalletStore implements WalletStore {
  constructor(private db: D1Database, private now: () => number = Date.now) {}
  async issueNonce(account: string): Promise<string> {
    const nonce = Array.from({ length: 16 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
    await this.db.prepare("INSERT INTO siwe_nonce (account, nonce, at) VALUES (?1, ?2, ?3) ON CONFLICT(account) DO UPDATE SET nonce = ?2, at = ?3").bind(account, nonce, this.now()).run();
    return nonce;
  }
  async takeNonce(account: string, nonce: string): Promise<boolean> {
    const row = await this.db.prepare("SELECT nonce, at FROM siwe_nonce WHERE account = ?1").bind(account).first<{ nonce: string; at: number }>();
    if (!row || row.nonce !== nonce || this.now() - row.at > 600_000) return false;
    await this.db.prepare("DELETE FROM siwe_nonce WHERE account = ?1").bind(account).run();
    return true;
  }
  async accounts(): Promise<string[]> {
    const rows = await this.db.prepare("SELECT account FROM wallet").all<{ account: string }>();
    return (rows.results ?? []).map((r) => r.account);
  }
  async accountOf(address: string): Promise<string | null> {
    const row = await this.db.prepare("SELECT account FROM wallet WHERE address = ?1").bind(address.toLowerCase()).first<{ account: string }>();
    return row?.account ?? null;
  }
  async addressOf(account: string): Promise<string | null> {
    const row = await this.db.prepare("SELECT address FROM wallet WHERE account = ?1").bind(account).first<{ address: string }>();
    return row?.address ?? null;
  }
  async bind(account: string, address: string, at: number): Promise<void> {
    const a = address.toLowerCase();
    const other = await this.accountOf(a);
    if (other && other !== account) throw new Error("wallet already bound to another file");
    const prev = await this.addressOf(account);
    if (prev && prev !== a) throw new Error("file already bound to another wallet");
    if (!prev) await this.db.prepare("INSERT INTO wallet (address, account, linked_at) VALUES (?1, ?2, ?3)").bind(a, account, at).run();
  }
  async unbind(account: string): Promise<void> {
    await this.db.prepare("DELETE FROM wallet WHERE account = ?1").bind(account).run();
  }
}
