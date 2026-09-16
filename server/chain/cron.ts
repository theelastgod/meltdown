/**
 * The nightly job's decisions, as pure functions (Stage 57), so they can be tested without a
 * Worker, a chain or a clock:
 *
 *  - which days to settle: yesterday, and any day in the window before it that is still unsettled
 *    and has units — a settlement the RPC failed was never retried before this;
 *  - which epochs to reclaim: old enough, worth something, and not already swept — the sweep used
 *    to be resent for every old epoch every night, forever, paying gas to move nothing;
 *  - which season to post: the one the roll just closed, whose contributors the roll used to erase
 *    before the job could read them.
 */
import type { StoredEpoch } from "./prizes-store";

export const SETTLE_WINDOW_DAYS = 7;
export const RECLAIM_AFTER_MS = 90 * 86_400_000;

export async function daysToSettle(today: number, isSettled: (day: number) => boolean | Promise<boolean>, hasUnits: (day: number) => boolean | Promise<boolean>, window = SETTLE_WINDOW_DAYS): Promise<number[]> {
  const out: number[] = [];
  for (let day = today - window; day <= today - 1; day++) {
    if (await isSettled(day)) continue;
    // yesterday is settled whether or not it has units (a quiet day is marked settled so it is not retried);
    // an older quiet day is left alone — marking it would be work for nothing
    if (day === today - 1 || (await hasUnits(day))) out.push(day);
  }
  return out;
}

export function epochsToReclaim(epochs: readonly StoredEpoch[], at: number): StoredEpoch[] {
  return epochs.filter((e) => Number(e.total) > 0 && !e.sweptAt && at - e.postedAt >= RECLAIM_AFTER_MS);
}

export function seasonToPost(st: { season: number; closed?: { season: number; contributors: Record<string, number> } }): { season: number; contributors: Record<string, number> } | null {
  return st.closed ?? null;
}
