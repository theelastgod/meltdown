/**
 * The co-op campaign room: a Room with the mission runtime attached through
 * hooks. The first file to join is the host (it resolves dialogue); every
 * file wears its own Kernel Protocols; at completion every file settles the
 * contract. This module is the only server code that imports the campaign;
 * the PvP room and the PvP worker never do.
 */
import { Room, type RoomHooks, type RoomOptions } from "./room";
import { encodeMission } from "../shared/net/protocol";
import { campaignOf, completeContract } from "../shared/campaign/save";
import { missionById } from "../shared/campaign/missions";
import { protocolMods } from "../shared/campaign/protocols";
import { threatRating } from "../shared/campaign/threat";
import { createMission, drainMissionEvents, missionView, resolveDialogue, stepMission, type MissionState } from "../shared/campaign/runtime";
import type { FactionId } from "../shared/campaign/factions";

export interface CampaignRoomOptions extends RoomOptions {
  mission: string;
}

export interface CampaignRoomHandle {
  room: Room;
  /** probe-readable */
  state: () => { mission: string; hostId: number; view: ReturnType<typeof missionView> | null; settled: { id: string; ok: boolean; reason?: string }[]; choices: number };
}

export function createCampaignRoom(opts: CampaignRoomOptions): CampaignRoomHandle {
  const def = missionById(opts.mission);
  let st: MissionState | null = null;
  let hostId = -1;
  let choices = 0;
  const settled: { id: string; ok: boolean; reason?: string }[] = [];
  let ticks = 0;
  const hooks: RoomHooks = {
    onAdmit(room, playerId, account) {
      if (hostId < 0) hostId = playerId;
      const p = room.world.players.get(playerId);
      if (p && account) {
        const c = campaignOf(account);
        // co-op is campaign: the file's worn protocols corrupt its sheet here
        room.world.setLoadout(p, account.loadout, protocolMods(c.worn));
        if (!st && def) st = createMission(def.id, room.world, c.testimony, c.faction as FactionId | null, threatRating({ depth: account.depth, counters: account.counters, campaign: c }));
      } else if (!st && def) st = createMission(def.id, room.world, {}, null, 0);
      if (st) room.send(encodeMission({ view: missionView(st), events: [], hostId, settled }), playerId);
    },
    afterStep(room, events) {
      if (!st) return;
      ticks++;
      const was = st.status;
      stepMission(st, room.world, events);
      const evs = drainMissionEvents(st);
      if (st.status === "complete" && was !== "complete") {
        for (const id of room.playerIds()) {
          const a = room.accountOf(id);
          if (!a) continue;
          const r = completeContract(a, st.def.id, st.testimony);
          settled.push({ id: st.def.id, ok: r.ok, reason: r.reason });
          room.saveAccount(a);
        }
      }
      if (evs.length || ticks % 30 === 0) room.send(encodeMission({ view: missionView(st), events: evs, hostId, settled }));
    },
    onClientMessage(_room, playerId, msg) {
      if (!st || msg.type !== "choice" || playerId !== hostId) return;
      if (resolveDialogue(st, msg.testimony)) choices++;
    },
  };
  const room = new Room({ ...opts, hooks, level: def?.level ?? opts.level, ai: true, wakePhase: "off", dummyRespawn: false });
  return { room, state: () => ({ mission: opts.mission, hostId, view: st ? missionView(st) : null, settled: settled.slice(), choices }) };
}
