/**
 * The contest is a block in the city. The city stays pvp: false. Damage lands only when both
 * files are inside the block. A death inside drops the carried purse. A walk out drops nothing.
 * Banking writes scrip and does not write chits.
 * An empty pocket pays nothing at the kill. One file in the block earns no pot.
 */
import { describe, expect, it } from "vitest";
import { CITY_DISTRICTS } from "../shared/net/city";
import { levelById } from "../shared/sim/level";
import { SIM_HZ } from "../shared/sim/constants";
import { World } from "../shared/sim/world";
import { readFileSync } from "node:fs";
import { contestOf, contestRespawn, inContest } from "../shared/city/contest";
import { CONTEST_POT } from "../shared/city/chit";
import { ledgerSpot, LEDGER_HOLD_M, LEDGER_PROMPT_M } from "../shared/net/cityledger";
import { RUN } from "../shared/sim/run";
import { StreetLife } from "../shared/city/street";
import { createAccount } from "../shared/progression/account";
import { reachable } from "./helpers/imports";

function districtWithContest(): string {
  for (const id of CITY_DISTRICTS) if (contestOf(levelById(id))) return id;
  throw new Error("no district has a contest block");
}

describe("player damage only inside the block", () => {
  const district = districtWithContest();
  const level = levelById(district);
  const vol = contestOf(level)!;

  it("lands inside and does not land outside", () => {
    const w = new World(level, { ai: false, seed: 1, wakePhase: "off", pvp: false });
    w.contestAt = (x, z) => inContest(level, x, z, vol);
    const a = w.addPlayer(1, "ALPHA");
    const b = w.addPlayer(2, "BRAVO");
    a.pos.x = vol.x - 1;
    a.pos.z = vol.z;
    b.pos.x = vol.x + 1;
    b.pos.z = vol.z;
    const pool = () => b.health + b.shield;
    const before = pool();
    w.applyDamage("player", b.id, 15, a.id, "lease_breaker", "shot");
    expect(pool()).toBeLessThan(before);

    a.pos.x = 0;
    a.pos.z = 0;
    b.pos.x = 2;
    b.pos.z = 0;
    expect(inContest(level, a.pos.x, a.pos.z, vol)).toBe(false);
    const outside = pool();
    w.applyDamage("player", b.id, 15, a.id, "lease_breaker", "shot");
    expect(pool()).toBe(outside);
    expect(w.pvp).toBe(false);
  });

  it("a death inside drops what was carried, a walk out drops nothing, and an empty pocket pays nothing", () => {
    const life = new StreetLife(level, { heatSeconds: 2 });
    const accounts = new Map<number, ReturnType<typeof createAccount>>();
    const account = (id: number) => accounts.get(id) ?? null;
    const stand = (id: number, x: number, z: number, alive = true) => ({ id, x, z, alive });
    life.give(2, 6);
    life.step({
      tick: 1,
      day: 1,
      players: [stand(1, vol.x - 1, vol.z), stand(2, vol.x + 1, vol.z, false)],
      account,
      deaths: [{ playerId: 2, killerId: 1, x: vol.x + 1, z: vol.z }],
      offer: () => null,
      eventRunning: false,
    });
    expect(life.carriedOf(2)).toBe(0);
    expect(life.carriedOf(1)).toBe(0);
    expect(life.dropList().map((d) => d.value)).toEqual([6]);

    const walk = new StreetLife(level, { heatSeconds: 30 });
    walk.give(1, 3);
    walk.step({ tick: 1, day: 1, players: [stand(1, 0, 0)], account, deaths: [], offer: () => null, eventRunning: false });
    expect(walk.carriedOf(1)).toBe(3);
    expect(walk.dropList()).toEqual([]);

    const empty = new StreetLife(level, { heatSeconds: 30 });
    empty.step({
      tick: 1,
      day: 1,
      players: [stand(1, vol.x, vol.z), stand(2, vol.x + 1, vol.z, false)],
      account,
      deaths: [{ playerId: 2, killerId: 1, x: vol.x + 1, z: vol.z }],
      offer: () => null,
      eventRunning: false,
    });
    expect(empty.carriedOf(1)).toBe(0);
    expect(empty.dropList()).toEqual([]);
  });

  it("one file earns no pot; two files split a fixed pot and the remainder is not minted", () => {
    const solo = new StreetLife(level, { heatSeconds: 1 });
    const p = { id: 1, x: vol.x, z: vol.z, alive: true };
    solo.step({ tick: 0, day: 1, players: [p], account: () => null, deaths: [], offer: () => null, eventRunning: false });
    solo.step({ tick: SIM_HZ, day: 1, players: [p], account: () => null, deaths: [], offer: () => null, eventRunning: false });
    expect(solo.carriedOf(1)).toBe(0);

    const pair = new StreetLife(level, { heatSeconds: 1 });
    const players = [
      { id: 1, x: vol.x - 1, z: vol.z, alive: true },
      { id: 2, x: vol.x + 1, z: vol.z, alive: true },
    ];
    pair.step({ tick: 0, day: 1, players, account: () => null, deaths: [], offer: () => null, eventRunning: false });
    pair.step({ tick: SIM_HZ, day: 1, players, account: () => null, deaths: [], offer: () => null, eventRunning: false });
    const minted = pair.carriedOf(1) + pair.carriedOf(2);
    expect(minted).toBeGreaterThan(0);
    expect(minted).toBeLessThanOrEqual(CONTEST_POT);
  });

  it("banking the pot writes scrip and leaves chits where they were", () => {
    const life = new StreetLife(level, { heatSeconds: 1 });
    const a = createAccount("purse");
    a.chits = 2;
    a.wallet.scrip = 10;
    const accounts = new Map([[1, a]]);
    const account = (id: number) => accounts.get(id) ?? null;
    const inside = [
      { id: 1, x: vol.x - 1, z: vol.z, alive: true },
      { id: 2, x: vol.x + 1, z: vol.z, alive: true },
    ];
    const step = (tick: number, players: typeof inside) => life.step({ tick, day: 1, players, account, deaths: [], offer: () => null, eventRunning: false });
    step(0, inside);
    step(SIM_HZ, inside);
    const purse = life.carriedOf(1);
    expect(purse).toBeGreaterThan(0);
    const spot = ledgerSpot(level);
    expect(spot).toBeTruthy();
    const d = (LEDGER_HOLD_M + LEDGER_PROMPT_M) / 2;
    const atDesk = [{ id: 1, x: spot!.x + d, z: spot!.z, alive: true }];
    let banked = false;
    for (let t = 0; t < RUN.bankSeconds * SIM_HZ + 2; t++) {
      const notes = step(SIM_HZ + 1 + t, atDesk);
      if (notes.some((n) => n.type === "lines" && n.lines.some((l) => l === `SCRIP · BANKED ${purse}`))) banked = true;
    }
    expect(banked).toBe(true);
    expect(a.wallet.scrip).toBe(10 + purse);
    expect(a.chits).toBe(2);
    expect(life.carriedOf(1)).toBe(0);
  });

  it("a file that dies in the block stands up at the nearest gate", () => {
    const w = new World(level, { ai: false, seed: 1, wakePhase: "off", pvp: false });
    w.contestAt = (x, z) => inContest(level, x, z, vol);
    w.contestGate = (x, z) => contestRespawn(level, x, z);
    const a = w.addPlayer(1, "ALPHA");
    const b = w.addPlayer(2, "BRAVO");
    a.pos.x = vol.x - 1;
    a.pos.z = vol.z;
    b.pos.x = vol.x + 1;
    b.pos.z = vol.z;
    w.applyDamage("player", b.id, 999, a.id, "lease_breaker", "shot");
    expect(b.alive).toBe(false);
    const gate = contestRespawn(level, b.pos.x, b.pos.z)!;
    for (let i = 0; i < 4 * SIM_HZ && !b.alive; i++) w.step(new Map());
    expect(b.alive).toBe(true);
    expect(Math.hypot(b.pos.x - gate.pos.x, b.pos.z - gate.pos.z)).toBeLessThan(1);
  });

  it("the city room stays pvp false and opts into the block", () => {
    const src = readFileSync(new URL("../server/city-room.ts", import.meta.url), "utf8");
    expect(src).toMatch(/pvp:\s*false/);
    expect(src).not.toMatch(/pvp:\s*true/);
    expect(src).toContain("contestAt");
    expect(src).toContain("contestGate");
  });
});

describe("the match still does not import the city", () => {
  it("room.ts and worker.ts do not reach shared/city, and the street does not reach the campaign", () => {
    for (const entry of ["server/room.ts", "server/worker.ts"]) expect([...reachable(entry)].filter((f) => /shared[\\/]city[\\/]/.test(f))).toEqual([]);
    for (const entry of ["shared/city/chit.ts", "shared/city/contest.ts", "shared/city/street.ts", "shared/city/reward.ts"]) {
      expect([...reachable(entry)].filter((f) => /shared[\\/](campaign|economy)[\\/]|server[\\/]chain[\\/]/.test(f))).toEqual([]);
    }
  });
});
