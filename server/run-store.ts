/**
 * The day's banking: who banked how many units, so a night can be settled.
 *
 * Stage 17 made THE RUN's payout a share of the day's emission pot rather than a fixed price, which
 * means a settlement needs the *day's total* — a fact no single room, file or Durable Object holds.
 * This is where it accumulates: one row per file per day, written as each bank happens, read once
 * when the day is settled.
 *
 * It deliberately stores units and nothing else. What a unit is worth is decided at settlement, and
 * a store that recorded a price would be recording a guess. That is also why it lives here rather
 * than in `server/chain/`: the PvP Worker writes it on every bank, and that bundle must not carry a
 * chain client or an economy module (`tests/quarantine.test.ts` holds it to that).
 */
export interface RunDayLine {
  file: string;
  units: number;
}

/** What a settled day left behind, so a second settlement of the same day is refused rather than paid. */
export interface RunSettledRow {
  day: number;
  epoch: number;
  units: number;
  minted: number;
  rate: number;
  settledAt: number;
}

/**
 * What a day looked like, for the economy's own parameters (Stage 38).
 *
 * `run_day.units` is spent down as files are paid, and `run_settled.units` is only the part the
 * night settled — neither is the day's gross. So neither could answer the two questions every
 * projection in docs/ECONOMY.md rests on: how much of the daily cap a runner actually banks, and
 * what share of eligible players run at all. This is the record that can, and nothing subtracts
 * from it.
 */
export interface RunDayStat {
  day: number;
  /** units banked that day, gross — never reduced by a payout */
  grossUnits: number;
  /** distinct files that banked at least one unit */
  runners: number;
  /** distinct files that finished a match at all */
  active: number;
  /** of those, the ones past the run's Depth gate — the population that COULD have run */
  eligible: number;
}

export interface RunStore {
  /** Add units to a file's day. Called on every bank, so it must be cheap and idempotent-ish under retry. */
  add(day: number, file: string, units: number): void | Promise<void>;
  /** Every file that banked that day. */
  day(day: number): RunDayLine[] | Promise<RunDayLine[]>;
  /**
   * Drop units a file has already been paid for. THE RUN has two payment paths — the nightly
   * settlement and the direct withdrawal — and this store is the single record of what is still
   * unpaid, so whichever pays first must spend here or the other will pay for it again.
   */
  spend(day: number, file: string, units: number): void | Promise<void>;
  settled(day: number): RunSettledRow | null | Promise<RunSettledRow | null>;
  markSettled(row: RunSettledRow): void | Promise<void>;
  /**
   * A file finished a match today. Idempotent per (day, file): the denominator is *people*, not
   * matches, so a file that played nine rounds counts once.
   */
  seen(day: number, file: string, eligible: boolean): void | Promise<void>;
  /** The day as the economy needs to read it. */
  stat(day: number): RunDayStat | Promise<RunDayStat>;
}

export class MemoryRunStore implements RunStore {
  readonly days = new Map<number, Map<string, number>>();
  readonly settlements = new Map<number, RunSettledRow>();
  /** day → file → { gross units banked, eligible to bank } — written alongside, never spent */
  readonly stats = new Map<number, Map<string, { gross: number; eligible: boolean }>>();
  private statRow(day: number, file: string): { gross: number; eligible: boolean } {
    let d = this.stats.get(day);
    if (!d) this.stats.set(day, (d = new Map()));
    let r = d.get(file);
    if (!r) d.set(file, (r = { gross: 0, eligible: false }));
    return r;
  }
  add(day: number, file: string, units: number): void {
    if (!(units > 0)) return;
    let d = this.days.get(day);
    if (!d) this.days.set(day, (d = new Map()));
    d.set(file, (d.get(file) ?? 0) + units);
    const st = this.statRow(day, file);
    st.gross += units;
    // banking a unit is proof of eligibility: the room only calls this past the Depth gate
    st.eligible = true;
  }
  seen(day: number, file: string, eligible: boolean): void {
    const st = this.statRow(day, file);
    if (eligible) st.eligible = true;
  }
  stat(day: number): RunDayStat {
    const d = this.stats.get(day) ?? new Map<string, { gross: number; eligible: boolean }>();
    const rows = [...d.values()];
    return { day, grossUnits: rows.reduce((n, r) => n + r.gross, 0), runners: rows.filter((r) => r.gross > 0).length, active: rows.length, eligible: rows.filter((r) => r.eligible).length };
  }
  day(day: number): RunDayLine[] {
    return [...(this.days.get(day) ?? new Map<string, number>())].map(([file, units]) => ({ file, units })).filter((r) => r.units > 0);
  }
  spend(day: number, file: string, units: number): void {
    const d = this.days.get(day);
    if (!d) return;
    d.set(file, Math.max(0, (d.get(file) ?? 0) - units));
  }
  settled(day: number): RunSettledRow | null {
    return this.settlements.get(day) ?? null;
  }
  markSettled(row: RunSettledRow): void {
    this.settlements.set(row.day, row);
  }
}
