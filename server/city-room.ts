/**
 * The city room (Stage 692): a district's shared open world. A Room with no match and no mission,
 * the district's patrols live, and players unable to hurt each other. Every file wears its own
 * Kernel Protocols here, as in a co-op contract: the city is campaign, and no PvP room ever loads
 * this module (the PvP worker does not import it).
 *
 * Public events (Stage 699): every few minutes, after a quiet gap, the city starts one event
 * somewhere in the district (`shared/city/events.ts`) and tells everyone in the room. When it
 * completes, every file that took part is credited, here, by the room that ran it — the same rule a
 * contract is closed by (Stage 27) — and nobody can ask for it.
 */
import { Room, type RoomHooks, type RoomOptions } from "./room";
import { campaignOf } from "../shared/campaign/save";
import { protocolMods } from "../shared/campaign/protocols";
import { cityDistrict } from "../shared/net/city";
import { arrivalFromQuery } from "../shared/net/citygates";
import { reviveMotion } from "../shared/sim/player";
import { encodeCityEvent, type CityEventMsg } from "../shared/net/protocol";
import { CityEvents, type CityEventKind, type CityEventView } from "../shared/city/events";
import { creditCityEvent } from "../shared/city/reward";

export interface CityRoomOptions extends RoomOptions {
  district: string;
}

export interface CityRoomHandle {
  room: Room;
  district: string;
  /** the district's public events (Stage 699) */
  events: CityEvents;
  state: () => { district: string; players: number; pvp: boolean; event: CityEventView | null; next: number; events: number; credited: { event: number; file: string; xp: number }[] };
  /** bring the next public event forward to the next tick (the dev host's button, and the tests') */
  startEvent: (kind?: CityEventKind | null) => void;
}

/** a city holds more than a match does: it is somewhere to be, not a round to win */
export const CITY_MAX_PLAYERS = 24;

/** how often a running event's progress goes out (ticks): twice a second, as a contract's does */
const EVENT_PUSH_TICKS = 30;

export function createCityRoom(opts: CityRoomOptions): CityRoomHandle {
  const district = cityDistrict(opts.district);
  let events: CityEvents | null = null;
  /** every credit this room has made, for /stats and the tests */
  const credited: { event: number; file: string; xp: number }[] = [];
  const eventsOf = (room: Room): CityEvents => (events ??= new CityEvents(room.world.seed, room.world.level, room.world.tick));
  /** the key a player takes part under: the file it plays (a guest has none, and is never credited) */
  const keyOf = (room: Room) => (playerId: number): string | null => room.accountOf(playerId)?.id ?? null;
  const msgFor = (room: Room, playerId: number, reward?: string[]): CityEventMsg => {
    const ev = eventsOf(room);
    const key = keyOf(room)(playerId);
    return { event: ev.view(room.world), next: ev.nextIn(room.world.tick), you: key !== null && ev.took(key), ...(reward ? { reward } : {}) };
  };
  const pushAll = (room: Room, rewards: Map<number, string[]> = new Map()): void => {
    for (const id of room.playerIds()) room.send(encodeCityEvent(msgFor(room, id, rewards.get(id))), id);
  };
  const hooks: RoomHooks = {
    onAdmit(room, playerId, account, query) {
      const p = room.world.players.get(playerId);
      if (p && account) room.world.setLoadout(p, account.loadout, protocolMods(campaignOf(account).worn));
      // a file walking in through a gate (Stage 697) stands at that gate, facing in — when the gate
      // it names really leads back to where it says it came from; anything else takes the room's spawn
      const arrive = arrivalFromQuery(room.world.level, query);
      if (p && arrive) reviveMotion(p, arrive);
      // a late joiner sees the event already running (or the one just ended, or when the next is due)
      room.send(encodeCityEvent(msgFor(room, playerId)), playerId);
    },
    afterStep(room, simEvents) {
      const ev = eventsOf(room);
      const notice = ev.step(room.world, simEvents, keyOf(room));
      if (notice?.type === "start") {
        room.opts.onLog(`city event ${notice.event.id} · ${notice.event.kind} · ${notice.event.title}`);
        pushAll(room);
        return;
      }
      if (notice?.type === "end") {
        const e = notice.event;
        const rewards = new Map<number, string[]>();
        for (const { key, playerId } of ev.close(e)) {
          const a = room.accountOf(playerId);
          // the seat must still hold the file that took part: an id handed on to someone else is not them
          if (!a || a.id !== key) continue;
          const r = creditCityEvent(a, e, room.opts.now());
          credited.push({ event: e.id, file: a.id, xp: r.xp });
          rewards.set(playerId, r.lines);
          room.pushFile(playerId, r.lines);
        }
        room.opts.onLog(`city event ${e.id} ${e.status}${e.reason ? ` (${e.reason})` : ""} · ${e.participants.size} took part · ${rewards.size} credited`);
        pushAll(room, rewards);
        return;
      }
      if (ev.current?.status === "running" && room.world.tick % EVENT_PUSH_TICKS === 0) pushAll(room);
    },
  };
  const room = new Room({ maxPlayers: CITY_MAX_PLAYERS, ...opts, hooks, level: district, ai: true, wakePhase: "off", dummyRespawn: true, pvp: false, run: false, arrivalGrace: true });
  return {
    room,
    district,
    get events() {
      return eventsOf(room);
    },
    state: () => {
      const ev = eventsOf(room);
      return { district, players: room.playerIds().length, pvp: room.world.pvp, event: ev.view(room.world), next: ev.nextIn(room.world.tick), events: ev.count, credited: credited.slice() };
    },
    startEvent: (kind = null) => eventsOf(room).startNow(room.world.tick + 1, kind),
  };
}
