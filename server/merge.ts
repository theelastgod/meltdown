/**
 * Three-way merge of a Ghostfile (Stage 58).
 *
 * The match room holds a copy of the file from join to leave and saves it whole after every
 * settlement, bank and stamp. On the Workers host that copy is a snapshot: a payout from the FILE
 * panel, a node bought at the desk, a contract claimed, a Rewrite — any write made while the file
 * was in a match — was overwritten by the room's next save, and a payout undone that way was paid
 * again by the next one. The Durable Object's header promised that "two rooms can never race a
 * write"; the object serialised the writes and the last one won.
 *
 * So a save carries the copy the writer started from, and the store folds the writer's changes
 * into whatever is there now: what the writer did not touch keeps the stored value, numbers the
 * writer moved are moved by the same amount, sets keep both sides' additions and removals, the
 * ledger appends, and a field the writer replaced is replaced. A conflict on a scalar (both sides
 * changed it) goes to the writer, which is the old behaviour confined to the one field.
 */
import { depthForXp, MAX_DEPTH } from "../shared/progression/depth";
import type { Account, CounterRecord } from "../shared/progression/account";
import { freshLedgerLines } from "./file-row";

/** the room's cap on ledger lines (the oldest are dropped) */
export const LEDGER_CAP = 200;

const eq = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const keysOf = (...objs: (object | null | undefined)[]): string[] => [...new Set(objs.flatMap((o) => (o ? Object.keys(o) : [])))];
const delta = (prev: number, base: number, next: number): number => prev + (next - base);

/** a scalar or an opaque object: the writer's value when it changed it, else what is stored */
const pick = <T>(prev: T, base: T, next: T): T => (eq(next, base) ? prev : next);

/** numbers keyed by name (the wallet, the counters): each key moves by what the writer moved it */
function mergeNumbers(prev: Record<string, number> | undefined, base: Record<string, number> | undefined, next: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = { ...(prev ?? {}) };
  for (const k of keysOf(base, next)) {
    const d = (next?.[k] ?? 0) - (base?.[k] ?? 0);
    if (d !== 0) out[k] = (out[k] ?? 0) + d;
  }
  return out;
}

/** a set as an array: the writer's additions are added, its removals removed, the rest is what is stored */
function mergeSet<T>(prev: readonly T[] | undefined, base: readonly T[] | undefined, next: readonly T[] | undefined): T[] {
  const b = base ?? [];
  const n = next ?? [];
  const removed = new Set(b.filter((x) => !n.includes(x)));
  const out = (prev ?? []).filter((x) => !removed.has(x));
  for (const x of n) if (!b.includes(x) && !out.includes(x)) out.push(x);
  return out;
}

/** opaque values keyed by name (mastery per weapon, ghosts per course): each key is picked on its own */
function mergeRecord<T>(prev: Record<string, T> | undefined, base: Record<string, T> | undefined, next: Record<string, T> | undefined): Record<string, T> {
  const out: Record<string, T> = { ...(prev ?? {}) };
  for (const k of keysOf(base, next)) {
    if (!next || !(k in next)) {
      if (base && k in base) delete out[k]; // the writer removed it
      continue;
    }
    if (!eq(next[k], base?.[k])) out[k] = next[k]!;
  }
  return out;
}

function mergeRun(prev: CounterRecord["run"], base: CounterRecord["run"], next: CounterRecord["run"]): CounterRecord["run"] {
  if (eq(next, base)) return prev;
  if (!prev || !base || !next) return next;
  const day = Math.max(prev.day, next.day);
  // banked is the day's tally and resets with the day; owed and paid carry across days
  const banked = next.day > prev.day ? next.banked : next.day < prev.day ? prev.banked : delta(prev.banked, base.banked, next.banked);
  const clearedDay = Math.max(prev.clearedDay ?? 0, next.clearedDay ?? 0);
  return { day, banked, owed: Math.max(0, delta(prev.owed, base.owed, next.owed)), paid: delta(prev.paid, base.paid, next.paid), ...(clearedDay > 0 ? { clearedDay } : {}) };
}

function mergeCounter(prev: Account["counter"], base: Account["counter"], next: Account["counter"]): Account["counter"] {
  if (eq(next, base)) return prev;
  if (!prev || !base || !next) return next;
  const out: Record<string, unknown> = { ...prev };
  for (const k of keysOf(base, next) as (keyof CounterRecord)[]) {
    if (k === "run") continue;
    if (k === "stamps" || k === "rig" || k === "seasons") out[k] = mergeSet(prev[k] as unknown[] | undefined, base[k] as unknown[] | undefined, next[k] as unknown[] | undefined);
    else if (!eq(next[k], base[k])) out[k] = next[k];
  }
  out["run"] = mergeRun(prev.run, base.run, next.run);
  return out as unknown as CounterRecord;
}

function mergeDaily(prev: Account["daily"], base: Account["daily"], next: Account["daily"]): Account["daily"] {
  if (eq(next, base)) return prev;
  if (!prev || !next) return next;
  if (next.day !== prev.day) return next.day > prev.day ? next : prev;
  return { day: next.day, base: eq(next.base, base?.base) ? prev.base : next.base, claimed: mergeSet(prev.claimed, base?.claimed, next.claimed) };
}

/**
 * `prev` is what the store holds now, `base` the copy the writer loaded, `next` what the writer
 * made of it. The answer is `prev` with the writer's changes applied.
 */
export function mergeAccount(prev: Account, base: Account, next: Account): Account {
  const out = { ...prev } as unknown as Record<string, unknown> & Account;
  for (const k of keysOf(base, next) as (keyof Account)[]) {
    switch (k) {
      case "id":
        break;
      case "xp":
      case "crafts":
      case "matches":
        out[k] = delta(prev[k] ?? 0, base[k] ?? 0, next[k] ?? 0);
        break;
      case "depth": {
        const both = prev.depth !== base.depth && next.depth !== base.depth;
        // both sides moved it (a Rewrite at the desk during a match that climbed): the merged XP decides
        out.depth = both ? Math.max(1, Math.min(MAX_DEPTH, depthForXp(out.xp))) : pick(prev.depth, base.depth, next.depth);
        break;
      }
      case "wallet":
        out.wallet = mergeNumbers(prev.wallet as unknown as Record<string, number>, base.wallet as unknown as Record<string, number>, next.wallet as unknown as Record<string, number>) as unknown as Account["wallet"];
        break;
      case "counters":
      case "social":
        out[k] = mergeNumbers(prev[k], base[k], next[k]);
        break;
      case "owned":
      case "wears":
      case "stamps":
      case "cosmetics":
      case "aliases":
        out[k] = mergeSet(prev[k], base[k], next[k]);
        break;
      case "chapters":
        out.chapters = mergeSet(prev.chapters, base.chapters, next.chapters);
        break;
      case "ledger":
        out.ledger = [...prev.ledger, ...freshLedgerLines(base.ledger, next.ledger)];
        if (out.ledger.length > LEDGER_CAP) out.ledger.splice(0, out.ledger.length - LEDGER_CAP);
        break;
      case "mastery":
        out.mastery = mergeRecord(prev.mastery, base.mastery, next.mastery) as Account["mastery"];
        break;
      case "ghosts":
        out.ghosts = mergeRecord(prev.ghosts, base.ghosts, next.ghosts);
        break;
      case "counter":
        out.counter = mergeCounter(prev.counter, base.counter, next.counter);
        break;
      case "daily":
        out.daily = mergeDaily(prev.daily, base.daily, next.daily);
        break;
      default:
        (out as Record<string, unknown>)[k] = pick(prev[k], base[k], next[k]);
    }
  }
  return out as Account;
}
