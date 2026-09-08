/**
 * Reconciling THE RUN's two records.
 *
 * A file's `counter.run.owed` and its `run_day` row are written by different paths — the match
 * Worker writes the row on every bank, the settlement clears the field after posting an epoch — and
 * neither write can be made atomic with the other. Both failures are logged loudly (Stage 18), and
 * neither is self-healing, which is what this is for.
 *
 * There are exactly two shapes of drift, and they fail in opposite directions:
 *
 * **Unrecorded** — the file is owed units the banking table does not know about, because the D1
 * write lost. Nothing will ever pay them: the settlement reads the table, not the file. The player
 * has the receipt in their own ledger and no money is coming.
 *
 * **Stranded** — the settlement posted an epoch but could not clear the file afterwards. The units
 * are still owed on the file, and now they are unpayable in *both* directions: the day is marked
 * settled so the night will not pay them again, and the direct withdrawal refuses a settled day.
 * The money is sitting in a claimable epoch while the file says it is still waiting.
 *
 * The pass reports both and, with `fix`, repairs both — restoring the missing row for the first and
 * clearing the paid-for units for the second. It is deliberately a separate job from the
 * settlement: a repair that runs inside the thing being repaired cannot be trusted to notice when
 * that thing is what is broken.
 */
import type { Account } from "../../shared/progression/account";
import type { CounterLedger } from "./ledger";
import { EPOCH_BASE } from "./prizes-store";
import type { RunStore } from "../run-store";
import type { WalletStore } from "./wallets";

export interface Drift {
  file: string;
  day: number;
  kind: "unrecorded" | "stranded";
  /** units the two records disagree about */
  units: number;
  /** what the file says it is owed, and what the banking table holds for that day */
  owed: number;
  recorded: number;
  fixed: boolean;
  note: string;
}

export interface ReconcileResult {
  day: number;
  /** linked files walked */
  checked: number;
  settled: boolean;
  drift: Drift[];
  /** units restored to the banking table so the night will pay them */
  restored: number;
  /** units cleared off files that had already been paid through an epoch */
  cleared: number;
}

export interface ReconcileDeps {
  ledger: CounterLedger;
  runs: RunStore;
  wallets: WalletStore;
  load: (id: string) => Account | Promise<Account>;
  save: (a: Account) => unknown | Promise<unknown>;
  log?: (line: string) => void;
}

/**
 * The two rules, in one place.
 *
 * `reconcileRunDay` and `reconcileRunBacklog` both need them and two copies would drift apart —
 * which, given what this file is for, would be a poor joke.
 */
function driftOf(id: string, day: number, owed: number, have: number, settled: boolean): Drift | null {
  if (owed <= 0) return null;
  // the day is paid; anything still owed on the file went out in the epoch and was never cleared
  if (settled) return { file: id, day, kind: "stranded", units: owed, owed, recorded: have, fixed: false, note: "paid by the day's epoch, never cleared off the file" };
  // not settled: the table must hold at least what the file is owed, or the night will underpay
  if (have >= owed) return null;
  return { file: id, day, kind: "unrecorded", units: owed - have, owed, recorded: have, fixed: false, note: "banked on the file but missing from the day's table" };
}

export async function reconcileRunDay(day: number, d: ReconcileDeps, opts: { fix?: boolean } = {}): Promise<ReconcileResult> {
  const log = d.log ?? (() => {});
  const fix = opts.fix === true;
  const settled = !!(await d.runs.settled(day)) || !!(await d.ledger.epoch(EPOCH_BASE.run + day));
  const recorded = new Map((await d.runs.day(day)).map((r) => [r.file, r.units]));
  const files = await d.wallets.accounts();

  const drift: Drift[] = [];
  let restored = 0;
  let cleared = 0;

  for (const id of files) {
    let a: Account;
    try {
      a = await d.load(id);
    } catch (e) {
      log(`reconcile · day ${day}: could not load ${id} — ${String((e as Error).message).slice(0, 120)}`);
      continue;
    }
    const run = a.counter?.run;
    if (!run || run.day !== day) continue;
    const entry = driftOf(id, day, run.owed, recorded.get(id) ?? 0, settled);
    if (!entry) continue;
    if (fix) {
      if (entry.kind === "stranded" && a.counter) {
        a.counter = { ...a.counter, run: { ...run, owed: 0, paid: run.paid + run.owed } };
        await d.save(a);
        cleared += entry.units;
        entry.fixed = true;
      } else if (entry.kind === "unrecorded") {
        await d.runs.add(day, id, entry.units);
        restored += entry.units;
        entry.fixed = true;
      }
    }
    drift.push(entry);
  }

  if (drift.length) log(`reconcile · day ${day}: ${drift.length} file(s) drifted${fix ? ` — restored ${restored}, cleared ${cleared}` : " (report only)"}`);
  return { day, checked: files.length, settled, drift, restored, cleared };
}

export interface BacklogResult {
  /** distinct days that carried an owed balance, oldest first */
  days: number[];
  /** linked files walked — once each, whatever the span */
  checked: number;
  /** days skipped because they are not finished yet */
  skippedToday: number;
  drift: Drift[];
  restored: number;
  cleared: number;
}

/**
 * Walk the history for drift nobody thought to ask about (Stage 40).
 *
 * `docs/ECONOMY.md` §6 has said since Stage 24 that the reconciliation only walks one day, and that
 * running it over a backlog is a loop the caller has to write. The loop is the wrong shape.
 *
 * A file's counter carries exactly ONE run day — `counter.run.day` — so a file can only ever be
 * drifted on that day. Walking thirty days re-loads every linked file thirty times to find drift
 * that can only be in one place per file, and it still misses anything older than the window the
 * caller happened to choose. Driven off the files instead it is a single pass with no window at
 * all: each file names its own day, and days are read once each however many files share them.
 *
 * **Today is skipped by default.** An `unrecorded` repair adds the missing units back to the
 * banking table, and a bank whose D1 write is still in flight is indistinguishable from one that
 * was lost — repairing it would pay twice. Yesterday and earlier are finished; today is not, so it
 * is left alone unless a caller asks for it explicitly.
 */
export async function reconcileRunBacklog(d: ReconcileDeps & { today: number }, opts: { fix?: boolean; includeToday?: boolean } = {}): Promise<BacklogResult> {
  const log = d.log ?? (() => {});
  const fix = opts.fix === true;
  const files = await d.wallets.accounts();
  const settledCache = new Map<number, boolean>();
  const recordedCache = new Map<number, Map<string, number>>();
  const seenDays = new Set<number>();
  const drift: Drift[] = [];
  let restored = 0;
  let cleared = 0;
  let skippedToday = 0;

  for (const id of files) {
    let a: Account;
    try {
      a = await d.load(id);
    } catch (e) {
      log(`reconcile backlog: could not load ${id} — ${String((e as Error).message).slice(0, 120)}`);
      continue;
    }
    const run = a.counter?.run;
    if (!run || run.owed <= 0) continue;
    const day = run.day;
    if (day >= d.today && opts.includeToday !== true) {
      skippedToday++;
      continue;
    }
    if (!settledCache.has(day)) settledCache.set(day, !!(await d.runs.settled(day)) || !!(await d.ledger.epoch(EPOCH_BASE.run + day)));
    if (!recordedCache.has(day)) recordedCache.set(day, new Map((await d.runs.day(day)).map((r) => [r.file, r.units])));
    seenDays.add(day);
    const entry = driftOf(id, day, run.owed, recordedCache.get(day)!.get(id) ?? 0, settledCache.get(day)!);
    if (!entry) continue;
    if (fix) {
      if (entry.kind === "stranded" && a.counter) {
        a.counter = { ...a.counter, run: { ...run, owed: 0, paid: run.paid + run.owed } };
        await d.save(a);
        cleared += entry.units;
        entry.fixed = true;
      } else if (entry.kind === "unrecorded") {
        // no need to update the cached view: it is keyed by file and every file is visited once, so
        // nothing in this pass reads this row again
        await d.runs.add(day, id, entry.units);
        restored += entry.units;
        entry.fixed = true;
      }
    }
    drift.push(entry);
  }

  const days = [...seenDays].sort((x, y) => x - y);
  if (drift.length) log(`reconcile backlog: ${drift.length} file(s) drifted across ${days.length} day(s) (${days[0]}–${days[days.length - 1]})${fix ? ` — restored ${restored}, cleared ${cleared}` : " (report only)"}`);
  return { days, checked: files.length, skippedToday, drift, restored, cleared };
}
