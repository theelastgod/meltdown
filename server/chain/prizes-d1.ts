/** Posted prize epochs on D1 (server/schema.sql `prize_epoch`); the counter Worker's store. */
import type { PrizeStore, StoredEpoch } from "./prizes-store";

export class D1PrizeStore implements PrizeStore {
  constructor(private db: D1Database) {}
  async list(): Promise<StoredEpoch[]> {
    const rows = await this.db.prepare("SELECT json FROM prize_epoch ORDER BY epoch").all<{ json: string }>();
    return (rows.results ?? []).map((r) => JSON.parse(r.json) as StoredEpoch);
  }
  async get(epoch: number): Promise<StoredEpoch | null> {
    const row = await this.db.prepare("SELECT json FROM prize_epoch WHERE epoch = ?1").bind(epoch).first<{ json: string }>();
    return row ? (JSON.parse(row.json) as StoredEpoch) : null;
  }
  async put(e: StoredEpoch): Promise<void> {
    await this.db.prepare("INSERT INTO prize_epoch (epoch, json) VALUES (?1, ?2) ON CONFLICT(epoch) DO UPDATE SET json = ?2").bind(e.epoch, JSON.stringify(e)).run();
  }
}
