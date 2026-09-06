/**
 * Daily contracts: three a day, seeded by the UTC day so every host offers
 * the same three, scored from the file's lifetime counters (the delta
 * since the day began), paying Scrip and Wakelight — never power.
 */
import type { Account } from "../progression/account";
import { dayIndex, pickDistinct } from "./clock";

export interface ContractDef {
  id: string;
  text: string;
  counter: string;
  need: number;
  scrip: number;
  wakelight: number;
}

const c = (id: string, text: string, counter: string, need: number, scrip: number, wakelight: number): ContractDef => ({ id, text, counter, need, scrip, wakelight });

export const CONTRACT_POOL: readonly ContractDef[] = [
  c("files_5", "CLOSE FIVE FILES", "kills", 5, 120, 3),
  c("files_12", "CLOSE TWELVE FILES", "kills", 12, 260, 6),
  c("stack_4", "CLOSE FOUR FILES WITH THE STACK", "kills:stack_smg", 4, 180, 4),
  c("hammer_3", "CLOSE THREE FILES WITH THE REPO HAMMER", "kills:repo_hammer", 3, 180, 4),
  c("longwave_3", "CLOSE THREE FILES WITH THE LONGWAVE", "kills:longwave", 3, 180, 4),
  c("breaker_6", "CLOSE SIX FILES WITH THE LEASE-BREAKER", "kills:lease_breaker", 6, 180, 4),
  c("baton_2", "CLOSE TWO FILES WITH THE BATON", "kills:shock_baton", 2, 200, 5),
  c("heads_3", "THREE HEADSHOT CLOSES", "headshotKills:lease_breaker", 3, 220, 5),
  c("flips_6", "PULL SIX NODES OFF THE MODEL", "flips", 6, 200, 5),
  c("flips_12", "PULL TWELVE NODES OFF THE MODEL", "flips", 12, 360, 8),
  c("wins_2", "WAKE TWO DISTRICTS", "wins", 2, 300, 6),
  c("wasps_8", "DOWN EIGHT WASPS", "waspKills", 8, 160, 4),
  c("mech_1", "DISABLE A REPO MECH", "mechKills", 1, 200, 5),
  c("slide_2", "TWO SLIDE-JUMP CLOSES", "slideJumpKills", 2, 240, 6),
  c("hold_120", "TWO MINUTES ON NODES", "nodeSeconds", 120, 200, 5),
  c("support_40", "FORTY SUPPORT POINTS", "supportPoints", 40, 200, 5),
  c("matches_3", "SETTLE THREE MATCHES", "matches", 3, 160, 4),
  c("debt_1", "CLEAR A DEBT", "debtsCleared", 1, 260, 8),
];

export interface DailyState {
  day: number;
  /** counter snapshot at the day's first touch: progress is the delta */
  base: Record<string, number>;
  claimed: string[];
}

export function contractsFor(day: number): ContractDef[] {
  return pickDistinct(day * 7919 + 17, CONTRACT_POOL.length, 3).map((i) => CONTRACT_POOL[i]!);
}

/** The file's daily state for today (rolls the day: a new base snapshot, nothing claimed). */
export function dailyOf(a: Account, now = Date.now()): DailyState {
  const day = dayIndex(now);
  const d = a.daily;
  if (!d || d.day !== day) {
    const base: Record<string, number> = {};
    for (const k of contractsFor(day).map((x) => x.counter)) base[k] = a.counters[k] ?? 0;
    a.daily = { day, base, claimed: [] };
  }
  return a.daily!;
}

export interface ContractView extends ContractDef {
  progress: number;
  done: boolean;
  claimed: boolean;
}

export function dailyView(a: Account, now = Date.now()): { day: number; contracts: ContractView[] } {
  const d = dailyOf(a, now);
  return {
    day: d.day,
    contracts: contractsFor(d.day).map((x) => {
      const progress = Math.max(0, (a.counters[x.counter] ?? 0) - (d.base[x.counter] ?? 0));
      return { ...x, progress: Math.min(x.need, progress), done: progress >= x.need, claimed: d.claimed.includes(x.id) };
    }),
  };
}

/** Claim a finished contract: pays once per day. */
export function claimContract(a: Account, id: string, now = Date.now()): { ok: boolean; reason?: string; scrip?: number; wakelight?: number } {
  const v = dailyView(a, now);
  const ct = v.contracts.find((x) => x.id === id);
  if (!ct) return { ok: false, reason: "not on today's board" };
  if (ct.claimed) return { ok: false, reason: "already claimed" };
  if (!ct.done) return { ok: false, reason: `${ct.progress}/${ct.need}` };
  a.daily!.claimed.push(id);
  a.wallet.scrip += ct.scrip;
  a.wallet.wakelight += ct.wakelight;
  a.counters["contractsClaimed"] = (a.counters["contractsClaimed"] ?? 0) + 1;
  a.ledger.push(`CONTRACT · ${ct.text} · +${ct.scrip} SCRIP · +${ct.wakelight} WAKELIGHT`);
  return { ok: true, scrip: ct.scrip, wakelight: ct.wakelight };
}
