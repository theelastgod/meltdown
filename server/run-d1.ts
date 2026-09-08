/**
 * The day's banking on D1 (server/schema.sql `run_day` / `run_settled`). Both Workers bind the same
 * database, so the match Worker writes a row on every bank and the counter Worker reads the day.
 *
 * Split from `run-store.ts` only so that file stays free of `@cloudflare/workers-types` and the
 * tests can import the memory store under the client tsconfig.
 */
import type { RunDayLine, RunDayStat, RunSettledRow, RunStore } from "./run-store";

export class D1RunStore implements RunStore {
  constructor(private db: D1Database) {}
  async add(day: number, file: string, units: number): Promise<void> {
    if (!(units > 0)) return;
    await this.db.prepare("INSERT INTO run_day (day, file, units) VALUES (?1, ?2, ?3) ON CONFLICT(day, file) DO UPDATE SET units = units + ?3").bind(day, file, units).run();
    // the gross record the economy reads: `run_day.units` is spent down as files are paid, so it
    // cannot answer how much of the cap a runner used. Nothing ever subtracts from this row.
    await this.db.prepare("INSERT INTO run_day_stat (day, file, gross, eligible) VALUES (?1, ?2, ?3, 1) ON CONFLICT(day, file) DO UPDATE SET gross = gross + ?3, eligible = 1").bind(day, file, units).run();
  }
  async seen(day: number, file: string, eligible: boolean): Promise<void> {
    await this.db.prepare("INSERT INTO run_day_stat (day, file, gross, eligible) VALUES (?1, ?2, 0, ?3) ON CONFLICT(day, file) DO UPDATE SET eligible = MAX(eligible, ?3)").bind(day, file, eligible ? 1 : 0).run();
  }
  async stat(day: number): Promise<RunDayStat> {
    const r = await this.db
      .prepare("SELECT COALESCE(SUM(gross),0) AS gross, COALESCE(SUM(CASE WHEN gross > 0 THEN 1 ELSE 0 END),0) AS runners, COUNT(*) AS active, COALESCE(SUM(eligible),0) AS eligible FROM run_day_stat WHERE day = ?1")
      .bind(day)
      .first<{ gross: number; runners: number; active: number; eligible: number }>();
    return { day, grossUnits: Number(r?.gross ?? 0), runners: Number(r?.runners ?? 0), active: Number(r?.active ?? 0), eligible: Number(r?.eligible ?? 0) };
  }
  async day(day: number): Promise<RunDayLine[]> {
    const rows = await this.db.prepare("SELECT file, units FROM run_day WHERE day = ?1 AND units > 0").bind(day).all<{ file: string; units: number }>();
    return rows.results ?? [];
  }
  async spend(day: number, file: string, units: number): Promise<void> {
    await this.db.prepare("UPDATE run_day SET units = MAX(0, units - ?3) WHERE day = ?1 AND file = ?2").bind(day, file, units).run();
  }
  async settled(day: number): Promise<RunSettledRow | null> {
    const r = await this.db.prepare("SELECT day, epoch, units, minted, rate, settled_at FROM run_settled WHERE day = ?1").bind(day).first<{ day: number; epoch: number; units: number; minted: string; rate: string; settled_at: number }>();
    return r ? { day: r.day, epoch: r.epoch, units: r.units, minted: Number(r.minted), rate: Number(r.rate), settledAt: r.settled_at } : null;
  }
  async markSettled(row: RunSettledRow): Promise<void> {
    // minted and rate are stored as text: they are fractional $CAPITAL, and SQLite REAL would round them
    await this.db.prepare("INSERT INTO run_settled (day, epoch, units, minted, rate, settled_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(day) DO NOTHING").bind(row.day, row.epoch, row.units, String(row.minted), String(row.rate), row.settledAt).run();
  }
}
