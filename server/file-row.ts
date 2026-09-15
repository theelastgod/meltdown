/** The one rule of a file row, shared by D1 (player-do.ts) and SQLite (sqlite.ts): `extras` is the whole account minus the ledger. */
import type { Account } from "../shared/progression/account";

export function extrasOf(a: Account): string {
  const { ledger: _ledger, ...rest } = a;
  return JSON.stringify(rest);
}
