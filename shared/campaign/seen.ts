/**
 * Fast travel on the city map opens after the file has entered that district.
 * Standing there once is the whole requirement. Scrip does not buy it.
 */
import { CITY_DISTRICTS } from "../net/city";
import type { Account } from "../progression/account";
import { campaignOf } from "./save";

export function isCityDistrict(id: string): boolean {
  return (CITY_DISTRICTS as readonly string[]).includes(id);
}

/** Record one visit. A repeat does not add a second copy. Anything off the city list is refused. */
export function noteSeen(a: Account, id: string): { ok: boolean; fresh: boolean; reason?: string } {
  if (!isCityDistrict(id)) return { ok: false, fresh: false, reason: "NOT A DISTRICT" };
  const c = campaignOf(a);
  if (!Array.isArray(c.seen)) c.seen = [];
  if (c.seen.includes(id)) return { ok: true, fresh: false };
  c.seen.push(id);
  return { ok: true, fresh: true };
}
