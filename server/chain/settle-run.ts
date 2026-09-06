/**
 * The nightly job: settle a day of THE RUN.
 *
 * One function, called by the Cloudflare cron and by the dev host's `POST /prizes/post`, so the
 * scheduled path and the hand-called path cannot drift apart — a job that only ever runs unattended
 * is a job nobody has watched work.
 *
 * The order matters and is the whole safety argument:
 *
 *   1. refuse a day already settled (the store's row, and the epoch on chain)
 *   2. read the day's banking, settle it against the day's pot (shared/economy/settlement.ts)
 *   3. post the epoch — the money is committed on chain here and nowhere else
 *   4. only then clear the settled files' owed units
 *
 * Clearing before posting would lose a player's day if the post reverted. Clearing is therefore
 * best-effort *after* the commit: a file whose clear fails keeps units it has already been paid
 * for, which the next settlement double-counts — so a clear failure is reported loudly rather than
 * swallowed, and step 1 is what stops a retry paying twice.
 */
import { settleRun, type Banked } from "../../shared/economy/settlement";
import type { Account } from "../../shared/progression/account";
import type { CounterLedger } from "./ledger";
import { EPOCH_BASE } from "./prizes-store";
import type { RunStore } from "../run-store";

export interface SettleResult {
  ok: boolean;
  reason?: string;
  day: number;
  units: number;
  rate: number;
  minted: number;
  pot: number;
  epoch?: number;
  /** files paid, and files that banked but have no wallet to pay */
  paid: number;
  skipped: string[];
  /** files whose owed units could not be cleared after the epoch was posted — needs a human */
  stranded: string[];
}

export interface SettleDeps {
  ledger: CounterLedger;
  runs: RunStore;
  /** load a file by id (the DO on the Worker, the account map on the dev host) */
  load: (id: string) => Account | Promise<Account>;
  save: (a: Account) => unknown | Promise<unknown>;
  now?: () => number;
  log?: (line: string) => void;
}

export async function settleRunDay(day: number, d: SettleDeps): Promise<SettleResult> {
  const log = d.log ?? (() => {});
  const now = d.now ?? Date.now;
  const empty = { day, units: 0, rate: 0, minted: 0, pot: 0, paid: 0, skipped: [], stranded: [] };

  const already = await d.runs.settled(day);
  if (already) return { ok: false, reason: `day ${day} already settled as epoch ${already.epoch}`, ...empty };
  if (await d.ledger.epoch(EPOCH_BASE.run + day)) return { ok: false, reason: `day ${day} already has an epoch on chain`, ...empty };

  const rows = await d.runs.day(day);
  const unitsOf = new Map(rows.map((r) => [r.file, r.units]));
  const banked: Banked[] = rows.map((r) => ({ account: r.file, units: r.units }));
  const s = settleRun(day, banked);
  if (s.lines.length === 0) {
    // a quiet day is settled, not skipped: marking it stops the job retrying an empty day forever
    await d.runs.markSettled({ day, epoch: 0, units: s.units, minted: 0, rate: s.rate, settledAt: now() });
    log(`run settlement · day ${day}: nothing banked`);
    return { ok: true, ...empty, units: s.units, pot: s.pot, paid: 0 };
  }

  const post = await d.ledger.postEpoch("run", day, s.lines);
  if (!post.ok) {
    log(`run settlement · day ${day}: post failed — ${post.reason}`);
    return { ok: false, reason: post.reason, ...empty, units: s.units, rate: s.rate, minted: s.minted, pot: s.pot };
  }
  await d.runs.markSettled({ day, epoch: post.epoch!.epoch, units: s.units, minted: s.minted, rate: s.rate, settledAt: now() });

  // the money is committed; now spend the units it was paid for
  const settled = new Set(post.epoch!.leaves.map((l) => l.file));
  const stranded: string[] = [];
  for (const line of s.lines) {
    if (!settled.has(line.account)) continue;
    try {
      const a = await d.load(line.account);
      const run = a.counter?.run;
      if (!a.counter || !run) continue;
      // only the units this day paid for: a file may have banked again since
      const spent = Math.min(run.owed, unitsOf.get(line.account) ?? 0);
      a.counter = { ...a.counter, run: { ...run, owed: Math.max(0, run.owed - spent), paid: run.paid + line.amount } };
      await d.save(a);
    } catch (e) {
      stranded.push(line.account);
      log(`run settlement · day ${day}: could not clear ${line.account} — ${String((e as Error).message).slice(0, 120)}`);
    }
  }

  log(`run settlement · day ${day}: ${s.units} units from ${s.lines.length} files at ${s.rate.toFixed(6)} → ${s.minted.toFixed(6)} $CAPITAL of a ${Math.round(s.pot)} pot, epoch ${post.epoch!.epoch}${stranded.length ? ` · STRANDED ${stranded.length}` : ""}`);
  return { ok: true, day, units: s.units, rate: s.rate, minted: s.minted, pot: s.pot, epoch: post.epoch!.epoch, paid: post.epoch!.leaves.length, skipped: post.skipped ?? [], stranded };
}
