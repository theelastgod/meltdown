/**
 * The city (Stage 692): the campaign's shared open world, a room per district where every file
 * that pressed PLAY walks the same streets. These drive the real room: it is PvE (a player cannot
 * hurt another; the patrols and your own blast still can), it runs the district's patrols with no
 * match, and a room that stays open all day hands out player ids forever without running off the
 * one byte they travel in.
 */
import { describe, expect, it } from "vitest";
import { Room, MAX_PLAYER_ID, type Conn } from "../server/room";
import { createCityRoom, CITY_MAX_PLAYERS } from "../server/city-room";
import { MemoryAccountStore } from "../server/accounts";
import { createAccount } from "../shared/progression/account";
import { decodeServerMessage, encodeInputs, encodeJoin } from "../shared/net/protocol";
import { Btn } from "../shared/sim/input";
import { CITY_DISTRICTS, cityDistrict, cityOf, cityPageUrl, cityRoomName, citySocket, inCity } from "../shared/net/city";

const LOADOUT = JSON.stringify({ primary: "lease_breaker", secondary: "shock_baton", attested: [] });

function conn() {
  const msgs: ReturnType<typeof decodeServerMessage>[] = [];
  const c: Conn = { send: (buf) => msgs.push(decodeServerMessage(buf, () => null)), close: () => {} };
  return { c, msgs };
}
const idOf = (msgs: ReturnType<typeof decodeServerMessage>[]): number => {
  for (const m of msgs) if (m?.type === "welcome") return m.playerId;
  return -1;
};

describe("the city is PvE", () => {
  it("in a city room another player's damage is not applied; a patrol's and your own are", () => {
    const store = new MemoryAccountStore(createAccount);
    const h = createCityRoom({ district: "lease_row", accounts: store, seed: 7 });
    const a = conn(), b = conn();
    h.room.onOpen(a.c);
    h.room.onMessage(a.c, encodeJoin("ALPHA", "", "city-a", LOADOUT));
    h.room.onOpen(b.c);
    h.room.onMessage(b.c, encodeJoin("BRAVO", "", "city-b", LOADOUT));
    // both on the street: a file still loading is covered by the arrival grace (Stage 699), which is
    // not what this test is about; one input each ends it
    for (const [k, seq] of [[a, 1], [b, 1]] as const) h.room.onMessage(k.c, encodeInputs([{ seq, tick: h.room.tick, viewTick: h.room.tick, viewFrac: 0, buttons: Btn.Forward, yaw: 0, pitch: 0, px: 0, py: 0, pz: 0 }], 0));
    for (let t = 0; t < 3; t++) h.room.step();
    const [ia, ib] = [idOf(a.msgs), idOf(b.msgs)];
    expect(h.room.world.arriving.size).toBe(0);
    const pb = h.room.world.players.get(ib)!;
    const before = pb.health + pb.shield;
    h.room.world.applyDamage("player", ib, 40, ia, "lease_breaker", "shot");
    expect(pb.health + pb.shield, "a player hurt another in the city").toBe(before);
    // a patrol (an attacker that is not a player) still hurts
    h.room.world.applyDamage("player", ib, 20, 9000, "wasp", "shot");
    expect(pb.health + pb.shield).toBe(before - 20);
    // and a player's own blast still hurts them
    const pa = h.room.world.players.get(ia)!;
    const aBefore = pa.health + pa.shield;
    h.room.world.applyDamage("player", ia, 15, ia, "grenade", "explosion");
    expect(pa.health + pa.shield).toBe(aBefore - 15);
    expect(h.state()).toMatchObject({ district: "lease_row", players: 2, pvp: false });
  });

  it("a match room keeps friendly fire as it was: only the city turns it off", () => {
    const r = new Room({ ai: false, seed: 7, level: "lease_row" });
    const a = conn(), b = conn();
    r.onOpen(a.c);
    r.onMessage(a.c, encodeJoin("ALPHA", "", "", LOADOUT));
    r.onOpen(b.c);
    r.onMessage(b.c, encodeJoin("BRAVO", "", "", LOADOUT));
    r.step();
    const pb = r.world.players.get(idOf(b.msgs))!;
    const before = pb.health + pb.shield;
    r.world.applyDamage("player", idOf(b.msgs), 40, idOf(a.msgs), "lease_breaker", "shot");
    expect(pb.health + pb.shield).toBe(before - 40);
  });

  it("the city runs the district's patrols and no match, and holds more than a match room", () => {
    const h = createCityRoom({ district: "deadletter_docks", seed: 7 });
    expect(h.room.world.wake).toBeNull();
    expect(h.room.world.ai).toBe(true);
    expect(h.room.world.wasps.length).toBeGreaterThan(0);
    expect(h.room.world.level.displayName).toBe("DEADLETTER DOCKS");
    expect(CITY_MAX_PLAYERS).toBeGreaterThan(8);
    // an unknown district is the default city, never a crash or a PvP room
    expect(createCityRoom({ district: "nowhere" }).district).toBe("lease_row");
  });
});

describe("a room open all day", () => {
  it("reuses player ids once nobody holds them, so the 300th join still fits in the byte ids travel in", () => {
    let now = 1_000_000;
    const r = new Room({ ai: false, seed: 7, level: "lease_row", wakePhase: "off", rejoinGraceSeconds: 1, now: () => now });
    const ids: number[] = [];
    for (let i = 0; i < 300; i++) {
      const c = conn();
      r.onOpen(c.c);
      r.onMessage(c.c, encodeJoin(`P${i}`, "", "", LOADOUT));
      r.step();
      const id = idOf(c.msgs);
      ids.push(id);
      r.onClose(c.c);
      now += 2000;
      r.step();
    }
    expect(ids.every((id) => id >= 1 && id <= MAX_PLAYER_ID), `ids out of range: ${ids.filter((id) => id < 1 || id > MAX_PLAYER_ID).slice(0, 5).join(", ")}`).toBe(true);
    expect(ids.length).toBe(300);
    // and two players in the room at once never share one
    const x = conn(), y = conn();
    r.onOpen(x.c);
    r.onMessage(x.c, encodeJoin("X", "", "", LOADOUT));
    r.onOpen(y.c);
    r.onMessage(y.c, encodeJoin("Y", "", "", LOADOUT));
    r.step();
    expect(idOf(x.msgs)).not.toBe(idOf(y.msgs));
  });
});

describe("the city's names and pages", () => {
  it("every walkable district has a city, named so a room name reads back to its district", () => {
    expect(CITY_DISTRICTS.length).toBeGreaterThanOrEqual(3);
    for (const d of CITY_DISTRICTS) expect(cityOf(cityRoomName(d))).toBe(d);
    expect(cityOf("crew-ABCDEFGH")).toBeNull();
    expect(cityOf("city-deadletter_office")).toBeNull();
    expect(cityDistrict("deadletter_office")).toBe("lease_row");
  });

  it("a city page walks its district's city in campaign mode, and a contract page is not the city", () => {
    const url = cityPageUrl("http://x/?mission=m1_wake_unlisted&explore=1&shop=http://h", { wsBase: "ws://h", level: "repo_depot", shop: "http://h" });
    const q = new URL(url).searchParams;
    expect(q.get("level")).toBe("repo_depot");
    expect(q.get("mode")).toBe("campaign");
    expect(q.get("net")).toBe(citySocket("ws://h", "repo_depot"));
    expect(new URL(q.get("net")!).pathname).toBe("/campaign/city-repo_depot");
    expect(inCity(q)).toBe(true);
    q.set("mission", "m1_wake_unlisted");
    expect(inCity(q)).toBe(false);
  });
});

describe("the dev host's EMP over a district (Stage 704)", () => {
  it("holds every wasp and mech down for the seconds asked, never shortening a longer hold", () => {
    const h = createCityRoom({ district: "lease_row", seed: 7 });
    for (let t = 0; t < 3; t++) h.room.step();
    const { wasps, mechs } = h.room.world;
    expect(wasps.length).toBeGreaterThan(0);
    expect(mechs.length).toBeGreaterThan(0);
    h.empDistrict(150);
    for (const x of [...wasps, ...mechs]) expect(x.disabledTimer).toBe(150);
    h.empDistrict(5);
    for (const x of [...wasps, ...mechs]) expect(x.disabledTimer).toBe(150);
    // and it runs down on the sim's clock like a grenade's
    for (let t = 0; t < 60; t++) h.room.step();
    for (const x of [...wasps, ...mechs]) expect(x.disabledTimer).toBeCloseTo(149, 5);
  });
});
