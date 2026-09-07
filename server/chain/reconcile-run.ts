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
    if (!run || run.day !== day || run.owed <= 0) continue;
    const have = recorded.get(id) ?? 0;

    if (settled) {
      // the day is paid; anything still owed on the file was paid through the epoch and never cleared
      const entry: Drift = { file: id, day, kind: "stranded", units: run.owed, owed: run.owed, recorded: have, fixed: false, note: "paid by the day's epoch, never cleared off the file" };
      if (fix && a.counter) {
        a.counter = { ...a.counter, run: { ...run, owed: 0, paid: run.paid + run.owed } };
        await d.save(a);
        cleared += entry.units;
        entry.fixed = true;
      }
      drift.push(entry);
      continue;
    }

    // not settled: the table must hold at least what the file is owed, or the night will underpay
    if (have >= run.owed) continue;
    const missing = run.owed - have;
    const entry: Drift = { file: id, day, kind: "unrecorded", units: missing, owed: run.owed, recorded: have, fixed: false, note: "banked on the file but missing from the day's table" };
    if (fix) {
      await d.runs.add(day, id, missing);
      restored += missing;
      entry.fixed = true;
    }
    drift.push(entry);
  }

  if (drift.length) log(`reconcile · day ${day}: ${drift.length} file(s) drifted${fix ? ` — restored ${restored}, cleared ${cleared}` : " (report only)"}`);
  return { day, checked: files.length, settled, drift, restored, cleared };
}
