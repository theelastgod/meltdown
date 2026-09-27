/**
 * The city room (Stage 692): a district's shared open world. A Room with no match and no mission,
 * the district's patrols live, and players unable to hurt each other. Every file wears its own
 * Kernel Protocols here, as in a co-op contract: the city is campaign, and no PvP room ever loads
 * this module (the PvP worker does not import it).
 */
import { Room, type RoomHooks, type RoomOptions } from "./room";
import { campaignOf } from "../shared/campaign/save";
import { protocolMods } from "../shared/campaign/protocols";
import { cityDistrict } from "../shared/net/city";
import { arrivalFromQuery } from "../shared/net/citygates";
import { reviveMotion } from "../shared/sim/player";

export interface CityRoomOptions extends RoomOptions {
  district: string;
}

export interface CityRoomHandle {
  room: Room;
  district: string;
  state: () => { district: string; players: number; pvp: boolean };
}

/** a city holds more than a match does: it is somewhere to be, not a round to win */
export const CITY_MAX_PLAYERS = 24;

export function createCityRoom(opts: CityRoomOptions): CityRoomHandle {
  const district = cityDistrict(opts.district);
  const hooks: RoomHooks = {
    onAdmit(room, playerId, account, query) {
      const p = room.world.players.get(playerId);
      if (p && account) room.world.setLoadout(p, account.loadout, protocolMods(campaignOf(account).worn));
      // a file walking in through a gate (Stage 697) stands at that gate, facing in — when the gate
      // it names really leads back to where it says it came from; anything else takes the room's spawn
      const arrive = arrivalFromQuery(room.world.level, query);
      if (p && arrive) reviveMotion(p, arrive);
    },
  };
  const room = new Room({ maxPlayers: CITY_MAX_PLAYERS, ...opts, hooks, level: district, ai: true, wakePhase: "off", dummyRespawn: true, pvp: false, run: false });
  return { room, district, state: () => ({ district, players: room.playerIds().length, pvp: room.world.pvp }) };
}
