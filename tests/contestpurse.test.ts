/**
 * The contest purse is on the street line while you carry it, and on the
 * ground when a death drops it. The city room tells the client when it changes.
 */
import { describe, expect, it } from "vitest";
import { contestOf } from "../shared/city/contest";
import { StreetLife } from "../shared/city/street";
import { levelById } from "../shared/sim/level";
import { createCityRoom } from "../server/city-room";
import { MemoryAccountStore } from "../server/accounts";
import { createAccount } from "../shared/progression/account";
import type { Conn } from "../server/room";
import { decodeServerMessage, encodeJoin } from "../shared/net/protocol";

const LOADOUT = JSON.stringify({ primary: "lease_breaker", secondary: "shock_baton", attested: [] });

function conn() {
  const msgs: ReturnType<typeof decodeServerMessage>[] = [];
  const c: Conn = { send: (buf) => msgs.push(decodeServerMessage(buf, () => null)), close: () => {} };
  return { c, msgs };
}

describe("the contest purse is visible", () => {
  const level = levelById("lease_row");
  const vol = contestOf(level)!;

  it("names the scrip in hand, and a drop on the ground", () => {
    const life = new StreetLife(level);
    expect(life.marker(1)?.line ?? "").not.toMatch(/PURSE/);
    life.give(1, 6);
    expect(life.marker(1)?.line).toMatch(/PURSE 6 SCRIP/);
    expect(life.marker(1)?.line).not.toMatch(/ON THE GROUND/);
    life.step({
      tick: 1,
      day: 1,
      players: [
        { id: 1, x: vol.x, z: vol.z, alive: false },
        { id: 2, x: 400, z: 400, alive: true },
      ],
      account: () => null,
      deaths: [{ playerId: 1, killerId: 2, x: vol.x, z: vol.z }],
      offer: () => null,
      eventRunning: false,
    });
    expect(life.carriedOf(1)).toBe(0);
    const ground = life.marker(2);
    expect(ground?.line).toBe("PURSE 6 SCRIP · ON THE GROUND");
    expect(ground?.x).toBeCloseTo(vol.x, 5);
    expect(ground?.z).toBeCloseTo(vol.z, 5);
  });

  it("the city room sends the new line when the purse changes, and not again while it holds", () => {
    const h = createCityRoom({ district: "lease_row", accounts: new MemoryAccountStore(createAccount), seed: 7 });
    h.quietEvents(3600);
    const a = conn();
    h.room.onOpen(a.c);
    h.room.onMessage(a.c, encodeJoin("PURSE", "", "purse-a", LOADOUT));
    const welcome = a.msgs.find((m) => m?.type === "welcome");
    const playerId = welcome?.type === "welcome" ? welcome.playerId : -1;
    expect(playerId).toBeGreaterThan(0);
    h.street.give(playerId, 4);
    a.msgs.length = 0;
    h.room.step();
    const told = a.msgs.flatMap((m) => (m?.type === "cityEvent" ? [m.cityEvent.street?.line ?? ""] : []));
    expect(told.some((line) => line.includes("PURSE 4 SCRIP"))).toBe(true);
    a.msgs.length = 0;
    h.room.step();
    expect(a.msgs.some((m) => m?.type === "cityEvent")).toBe(false);
  });
});
