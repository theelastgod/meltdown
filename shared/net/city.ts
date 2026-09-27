/**
 * The city (Stage 692): the campaign's shared open world.
 *
 * One persistent co-op room per district on the campaign host, `city-<district>`, where every file
 * that pressed PLAY in that district roams the same streets under the same patrols. It is PvE: the
 * district's machines can kill a player, another player cannot. The contracts desk opens from
 * anywhere in it; a contract is played in its own instance and the file comes back to the city.
 */
import { LEVEL_INFO } from "../sim/level";

export const CITY_PREFIX = "city-";

/** the districts that have a city room: the ones a player can walk */
export const CITY_DISTRICTS: readonly string[] = LEVEL_INFO.filter((l) => l.kind === "district").map((l) => l.id);

export const DEFAULT_CITY = "lease_row";

/** a district a city room may serve, or the default */
export const cityDistrict = (level: string | null | undefined): string => (level && CITY_DISTRICTS.includes(level) ? level : DEFAULT_CITY);

/** the room a district's city lives in */
export const cityRoomName = (level: string): string => CITY_PREFIX + cityDistrict(level);

/** the district a room name serves, or null when the room is not a city */
export function cityOf(roomName: string): string | null {
  if (!roomName.startsWith(CITY_PREFIX)) return null;
  const d = roomName.slice(CITY_PREFIX.length);
  return CITY_DISTRICTS.includes(d) ? d : null;
}

/**
 * Where a file walking in through a gate came from (Stage 697): the district it left and the gate
 * of this district it arrives at. The room checks it (shared/net/citygates.ts `arrivalFor`).
 */
export interface CityArrival {
  from: string;
  gate: number;
}

/** the socket a player opens to walk a district's city (with the gate it walks in through, if any) */
export function citySocket(wsBase: string, level: string, arrive?: CityArrival | null): string {
  const d = cityDistrict(level);
  const via = arrive ? `&from=${encodeURIComponent(arrive.from)}&gate=${arrive.gate}` : "";
  return `${wsBase.replace(/\/$/, "")}/campaign/${cityRoomName(d)}?city=${encodeURIComponent(d)}&level=${encodeURIComponent(d)}${via}`;
}

/** the page that walks a district's city: the district, campaign mode, the city's socket, the shop kept */
export function cityPageUrl(base: string, o: { wsBase: string; level: string; shop?: string | null; arrive?: CityArrival | null }): string {
  const u = new URL(base);
  // an arrival belongs to its own trip: one carried over from an earlier gate would place the file at the wrong one
  for (const k of ["explore", "menu", "crawl", "mission", "net", "ai", "back", "from", "gate"]) u.searchParams.delete(k);
  const d = cityDistrict(o.level);
  u.searchParams.set("level", d);
  u.searchParams.set("mode", "campaign");
  u.searchParams.set("city", "1");
  u.searchParams.set("net", citySocket(o.wsBase, d, o.arrive));
  if (o.arrive) {
    u.searchParams.set("from", o.arrive.from);
    u.searchParams.set("gate", String(o.arrive.gate));
  }
  if (o.shop) u.searchParams.set("shop", o.shop);
  return u.toString();
}

/** whether a page is walking the city */
export const inCity = (q: URLSearchParams): boolean => q.get("city") === "1" && !!q.get("net") && !q.has("mission");
