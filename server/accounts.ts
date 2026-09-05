/**
 * Ghostfile storage behind the match room. The Node host keeps files in
 * memory; the Workers host talks to a PlayerFile Durable Object that writes
 * through to D1 (see player-do.ts). `load` may answer synchronously so a
 * memory-backed room joins players in the same tick (tests rely on that).
 */
import { ALL_ITEMS } from "../shared/manifest/items";
import { createAccount, sandboxAccount, type Account } from "../shared/progression/account";

export interface AccountStore {
  load(id: string, name: string): Account | Promise<Account>;
  save(account: Account): void | Promise<void>;
}

/** Dev seeding: ids starting with "sandbox" get a Depth-50 file that owns every node; anything else starts Blank. */
export function devSeed(id: string, name: string): Account {
  if (id.startsWith("sandbox")) {
    const a = sandboxAccount(id);
    a.name = name;
    a.owned = ALL_ITEMS.map((i) => i.id);
    return a;
  }
  return createAccount(id, name);
}

export class MemoryAccountStore implements AccountStore {
  readonly accounts = new Map<string, Account>();
  saves = 0;
  constructor(private seed: (id: string, name: string) => Account = createAccount) {}

  load(id: string, name: string): Account {
    let a = this.accounts.get(id);
    if (!a) {
      a = this.seed(id, name);
      this.accounts.set(id, a);
    }
    return a;
  }

  save(a: Account): void {
    this.saves++;
    this.accounts.set(a.id, a);
  }
}
