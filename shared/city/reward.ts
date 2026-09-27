/**
 * What taking part in a city event is worth to a file (Stage 699).
 *
 * XP and the record, never money. The event pays file XP (which is Depth) through the same fields a
 * contract's reward writes, counts on the file's lifetime counters (the city's stamps read them),
 * and prints a ledger line. It mints no Scrip, no Wakelight and no $CAPITAL: the city is somewhere
 * to be, and a faucet anyone can stand in every four minutes is the last thing the economy needs.
 *
 * The XP is capped by the day, on the same velocity-cap record the Debt uses (`a.social`): past the
 * cap an event still counts and still stamps, and pays nothing. At the cap a whole day of events is
 * worth less than one good match (`shared/progression/depth.ts`: ≈ 4,200 XP).
 */
import type { Account } from "../progression/account";
import { depthForXp } from "../progression/depth";
import { dayIndex } from "../endgame/clock";

/** file XP for one completed event */
export const CITY_EVENT_XP = 300;
/** events a day that pay XP; the ones after it count and pay nothing */
export const CITY_EVENT_XP_PER_DAY = 6;
/** the room's cap on ledger lines (as the run's banking keeps it) */
const LEDGER_CAP = 200;

const dayKey = (day: number): string => `city:${day}`;

/** Events this file has been paid XP for on the day `now` falls in. */
export function cityEventsPaidToday(a: Account, now: number): number {
  return a.social[dayKey(dayIndex(now))] ?? 0;
}

/**
 * Credit one completed event to one file. The room calls it once per participant per event; that it
 * is once is the room's guard (`CityEvents.close`), not this function's.
 */
export function creditCityEvent(a: Account, ev: { kind: string; title: string }, now: number): { xp: number; capped: boolean; lines: string[] } {
  const day = dayIndex(now);
  const paid = a.social[dayKey(day)] ?? 0;
  const capped = paid >= CITY_EVENT_XP_PER_DAY;
  let xp = 0;
  if (!capped) {
    xp = CITY_EVENT_XP;
    a.social[dayKey(day)] = paid + 1;
    a.xp += xp;
    a.depth = depthForXp(a.xp);
  }
  a.counters["cityEvents"] = (a.counters["cityEvents"] ?? 0) + 1;
  a.counters[`cityEvents:${ev.kind}`] = (a.counters[`cityEvents:${ev.kind}`] ?? 0) + 1;
  const line = `PUBLIC EVENT · ${ev.title} · ${capped ? `NO XP · ${CITY_EVENT_XP_PER_DAY} A DAY PAID` : `+${xp} XP`}`;
  a.ledger.push(line);
  if (a.ledger.length > LEDGER_CAP) a.ledger.splice(0, a.ledger.length - LEDGER_CAP);
  return { xp, capped, lines: [line] };
}
