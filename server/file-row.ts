/** The one rule of a file row, shared by D1 (player-do.ts) and SQLite (sqlite.ts): `extras` is the whole account minus the ledger. */
import type { Account } from "../shared/progression/account";

export function extrasOf(a: Account): string {
  const { ledger: _ledger, ...rest } = a;
  return JSON.stringify(rest);
}

/**
 * The ledger lines written since the last save (Stage 54). The room caps a file's ledger at 200
 * lines by dropping the oldest, so "everything past the count I saved last time" is empty forever
 * once a file is full — every BANKED line after the two-hundredth was being lost on both hosts.
 * The new lines are what is left of the current ledger after the longest prefix of it that is a
 * suffix of what was saved: the trim only ever removes from the front, so that overlap is exact.
 */
export function freshLedgerLines(saved: readonly string[], current: readonly string[]): string[] {
  for (let k = Math.min(saved.length, current.length); k > 0; k--) {
    let same = true;
    for (let i = 0; i < k; i++) {
      if (saved[saved.length - k + i] !== current[i]) {
        same = false;
        break;
      }
    }
    if (same) return current.slice(k);
  }
  return current.slice();
}
