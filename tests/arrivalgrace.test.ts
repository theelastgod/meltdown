/**
 * The arrival grace (Stage 699). A room places a file the moment it joins, and the page behind it
 * takes seconds more to load. probe:world walked a file through LEASE ROW's east gate into the
 * docks, where a wasp patrol flies through the WEST GATE it arrives at: it was placed at the gate,
 * worn down while its page loaded, and was standing on an ordinary spawn by the time it could look.
 * In a room that asks for the grace, a file is not on the street until its first input reaches the
 * room (or ARRIVAL_GRACE_TICKS pass): the AI does not see it and nothing hurts it.
 */
import { describe, expect, it } from "vitest";
import { ARRIVAL_GRACE_TICKS, Room, type Conn } from "../server/room";
import { createCityRoom } from "../server/city-room";
import { decodeServerMessage, encodeInputs, encodeJoin, PROTOCOL_VERSION, type NetInput } from "../shared/net/protocol";
import { Btn } from "../shared/sim/input";

const LOADOUT = JSON.stringify({ primary: "lease_breaker", secondary: "shock_baton", attested: [] });

function join(room: Room): { id: number; c: Conn } {
  const msgs: ReturnType<typeof decodeServerMessage>[] = [];
  const c: Conn = { send: (buf) => msgs.push(decodeServerMessage(buf, () => null)), close: () => {} };
  room.onOpen(c);
  room.onMessage(c, encodeJoin("WALKER", "", "", LOADOUT));
  const w = msgs.find((m) => m?.type === "welcome");
  expect(w, `no welcome (protocol ${PROTOCOL_VERSION})`).toBeTruthy();
  return { id: (w as { playerId: number }).playerId, c };
}

let seq = 0;
function send(room: Room, c: Conn): void {
  const inp: NetInput = { seq: ++seq, tick: room.tick, viewTick: room.tick, viewFrac: 0, buttons: Btn.Forward, yaw: 0, pitch: 0, px: 0, py: 0, pz: 0 };
  room.onMessage(c, encodeInputs([inp], 0));
}

/** what a wasp's round does to a file (attacker 0: the AI) */
const hurt = (room: Room, id: number): number => {
  const p = room.world.players.get(id)!;
  const before = p.health + p.shield;
  room.world.applyDamage("player", id, 10, 0, "wasp", "shot");
  return before - (p.health + p.shield);
};

describe("a file loading into the city is not on the street yet (Stage 699)", () => {
  it("nothing hurts it and no wasp takes it as a target until its first input arrives; then both do", () => {
    const h = createCityRoom({ district: "deadletter_docks", seed: 7 });
    const { id, c } = join(h.room);
    expect(h.room.world.arriving.has(id)).toBe(true);
    // stand it under a wasp, in the open, and let the patrol look for a second and a half
    const w = h.room.world.wasps[0]!;
    const p = h.room.world.players.get(id)!;
    p.pos.x = w.pos.x;
    p.pos.z = w.pos.z + 3;
    for (let t = 0; t < 90; t++) {
      h.room.step();
      p.pos.x = w.pos.x;
      p.pos.z = w.pos.z + 3;
      expect(h.room.world.wasps.some((x) => x.targetId === id), `a wasp targeted the loading file at tick ${t}`).toBe(false);
    }
    expect(hurt(h.room, id)).toBe(0);
    send(h.room, c);
    h.room.step();
    expect(h.room.world.arriving.has(id)).toBe(false);
    expect(hurt(h.room, id)).toBe(10);
  });

  it("the grace runs out: a file that never sends an input is on the street after ARRIVAL_GRACE_TICKS", () => {
    const h = createCityRoom({ district: "repo_depot", seed: 7 });
    const { id } = join(h.room);
    // off the street for ARRIVAL_GRACE_TICKS whole steps, on it from the next
    for (let t = 0; t < ARRIVAL_GRACE_TICKS; t++) h.room.step();
    expect(h.room.world.arriving.has(id)).toBe(true);
    h.room.step();
    expect(h.room.world.arriving.has(id)).toBe(false);
    expect(hurt(h.room, id)).toBe(10);
  });

  it("only a room that asks for it: a match room hurts a file the moment it is placed", () => {
    const room = new Room({ ai: true, seed: 7, level: "lease_row" });
    const { id } = join(room);
    expect(room.world.arriving.size).toBe(0);
    expect(hurt(room, id)).toBe(10);
  });

  it("a file that leaves while loading leaves nothing behind", () => {
    const h = createCityRoom({ district: "lease_row", seed: 7 });
    const { id } = join(h.room);
    h.room.world.removePlayer(id);
    expect(h.room.world.arriving.has(id)).toBe(false);
  });
});
