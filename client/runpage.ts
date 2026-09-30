/**
 * THE RUN from a page that is already somewhere (Stage 714).
 *
 * The same district, on the match host, `mode=run`. The shop stays so the file still loads.
 * Kept off the menu module so a city page can offer the trip without pulling the menu's feed.
 */
import { CITY_DISTRICTS } from "@shared/net/city";
import { HOSTS } from "./config";

export function runPageUrl(base: string, district: string): string | null {
  if (!CITY_DISTRICTS.includes(district)) return null;
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    return null;
  }
  const shop = u.searchParams.get("shop");
  for (const k of ["net", "mission", "explore", "level", "ai", "menu", "crawl", "shop", "mode", "city", "from", "gate", "back"]) u.searchParams.delete(k);
  u.searchParams.set("level", district);
  u.searchParams.set("mode", "run");
  if (shop) u.searchParams.set("shop", shop);
  u.searchParams.set("net", `${HOSTS.ws}/room/${HOSTS.publicRoom}-run-${district}?level=${district}&mode=run`);
  return u.toString();
}
