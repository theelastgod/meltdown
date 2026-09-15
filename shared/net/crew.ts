/**
 * A crew (Stage 49): the co-op campaign's door.
 *
 * The co-op room has existed since Stage 10 — the mission runtime steps on the server, the first
 * file in is the host, completion settles on every file — and nothing let a player reach it
 * except a hand-typed URL. A crew is an invite code, made with the private rooms' alphabet
 * (Stage 20), naming a co-op room: `crew-<CODE>`. The code is the access control, as it is for a
 * private room; a crew nobody is in for a while stops existing on either host.
 *
 * Nothing here touches the sim, the settlement or the money. A crew room is the campaign room it
 * always was, with a name a friend can be told.
 */
import { makeInviteCode, validInviteCode } from "./private";

export const CREW_PREFIX = "crew-";

export const newCrewCode = (random: () => number = Math.random): string => makeInviteCode(random);

/** the co-op room a code names */
export const crewRoomName = (code: string): string => CREW_PREFIX + code.toUpperCase();

/** the code a room name carries, or null when the room is not a crew */
export function crewCodeOf(roomName: string): string | null {
  if (!roomName.startsWith(CREW_PREFIX)) return null;
  const code = roomName.slice(CREW_PREFIX.length);
  return validInviteCode(code) ? code : null;
}

export const isCrewRoom = (roomName: string): boolean => crewCodeOf(roomName) !== null;

/** a code as a player typed it: trimmed, upper-cased, and only accepted if the alphabet could have made it */
export function normaliseCrewCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return validInviteCode(code) ? code : null;
}

/** the socket a crew member opens: the campaign host's co-op room, the contract and its district on the query */
export function crewSocket(wsBase: string, code: string, mission: string, level: string): string {
  return `${wsBase.replace(/\/$/, "")}/campaign/${crewRoomName(code)}?mission=${encodeURIComponent(mission)}&level=${encodeURIComponent(level)}`;
}

/** the code inside a page's `?net=` value, or null when the socket is not a crew's */
export function crewCodeFromSocket(net: string | null | undefined): string | null {
  if (!net) return null;
  try {
    const m = new URL(net).pathname.match(/^\/campaign\/([A-Za-z0-9_-]+)$/);
    return m ? crewCodeOf(m[1]!) : null;
  } catch {
    return null;
  }
}

/** the page a crew member loads: the district, co-op mode, the contract, the room's socket, the shop kept */
export function crewPageUrl(base: string, o: { wsBase: string; code: string; mission: string; level: string; shop?: string | null }): string {
  const u = new URL(base);
  for (const k of ["explore", "menu", "crawl"]) u.searchParams.delete(k);
  u.searchParams.set("level", o.level);
  u.searchParams.set("mode", "campaign");
  u.searchParams.set("mission", o.mission);
  u.searchParams.set("net", crewSocket(o.wsBase, o.code, o.mission, o.level));
  if (o.shop) u.searchParams.set("shop", o.shop);
  return u.toString();
}

/** what a host says about a crew when asked by code */
export type CrewInfo =
  | { ok: true; code: string; mission: string; level: string; players: number; status: "waiting" | "running" | "complete" | "failed" }
  | { ok: false; reason: string };

export const NO_SUCH_CREW = "no such crew";
