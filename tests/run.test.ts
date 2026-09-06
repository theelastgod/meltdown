import { describe, expect, it, beforeAll } from "vitest";
import { createRun, dropCarried, inSafeZone, RUN, runView, stepRun, type RunEvent } from "../shared/sim/run";
import { SIM_HZ } from "../shared/sim/constants";
import { World } from "../shared/sim/world";
import { levelById } from "../shared/sim/level";
import { Room, type Conn } from "../server/room";
import { devSeed, MemoryAccountStore } from "../server/accounts";
import { decodeServerMessage, encodeJoin } from "../shared/net/protocol";
import { RUN_DAILY_CAP, RUN_DEPTH, RUN_SCRIP_PER_UNIT } from "../shared/economy/counter";
import { bootDevnetLedger, DEV_KEYS } from "../server/chain/boot";
import { ARTIFACTS } from "../server/chain/deploy";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { SIWE_STATEMENT } from "../shared/economy/counter";
import { v3 } from "../shared/math/vec3";

const zones = [{ kind: "safe" as const, label: "GATE", pos: v3(0, 0, 0), radius: 5 }];
const claims = [{ pos: v3(20, 0, 0), value: 3 }, { pos: v3(30, 0, 0), value: 2 }];

describe("THE RUN — the sim", () => {
  it("a carrier picks a claim up, the claim respawns later, a death drops the carried value where the file fell, and a gate banks it after the dwell", () => {
    const run = createRun(zones, claims);
    const ev: RunEvent[] = [];
    const a = { id: 1, team: 1, pos: v3(20, 0, 0), alive: true };
    stepRun(run, [a], ev);
    expect(ev.map((e) => e.type)).toEqual(["claim"]);
    expect(run.carried.get(1)).toBe(3);
    expect(run.claims[0]!.active).toBe(false);
    // it comes back after RUN.respawnSeconds
    for (let t = 0; t < RUN.respawnSeconds * SIM_HZ + 1; t++) stepRun(run, [{ ...a, pos: v3(50, 0, 50) }], ev);
    expect(run.claims[0]!.active).toBe(true);
    // a death drops the carried value as one claim at the death position
    ev.length = 0;
    dropCarried(run, 1, v3(25, 0, 5), ev);
    expect(ev[0]).toMatchObject({ type: "drop", playerId: 1, value: 3 });
    expect(run.carried.get(1)).toBe(0);
    const dropped = run.claims.find((c) => c.dropped)!;
    expect(dropped.pos.x).toBe(25);
    // someone else picks the drop up and banks it at the gate after the dwell
    const b = { id: 2, team: 2, pos: v3(25, 0, 5), alive: true };
    ev.length = 0;
    stepRun(run, [b], ev);
    expect(run.carried.get(2)).toBe(3);
    expect(run.claims.some((c) => c.dropped)).toBe(false);
    b.pos = v3(1, 0, 1);
    expect(inSafeZone(run, b.pos)).toBe(true);
    const half = Math.floor((RUN.bankSeconds * SIM_HZ) / 2);
    for (let t = 0; t < half; t++) stepRun(run, [b], ev);
    expect(run.carried.get(2)).toBe(3);
    expect(runView(run, 2, b.pos).banking).toBeGreaterThan(0.3);
    for (let t = 0; t < RUN.bankSeconds * SIM_HZ; t++) stepRun(run, [b], ev);
    expect(ev.some((e) => e.type === "bank" && e.value === 3 && e.zone === "GATE")).toBe(true);
    expect(run.carried.get(2)).toBe(0);
    expect(run.banked.get(2)).toBe(3);
    expect(run.totalBanked).toBe(3);
    // leaving the zone resets the dwell
    b.pos = v3(20, 0, 0);
    stepRun(run, [b], ev);
    b.pos = v3(1, 0, 1);
    stepRun(run, [b], ev);
    expect(runView(run, 2, b.pos).banking).toBeLessThan(0.1);
  });

  it("safe zones: no damage in, no damage out; the world drops a carrier's claims on death", () => {
    const w = new World(levelById("drainage_yard"), { ai: false, run: true, dummyRespawn: false });
    expect(w.wake).toBeNull();
    expect(w.run).not.toBeNull();
    const gate = w.run!.zones[0]!;
    const a = w.addPlayer(1, "A", 1, undefined as never);
    const b = w.addPlayer(2, "B", 2, undefined as never);
    b.pos.x = gate.pos.x;
    b.pos.z = gate.pos.z;
    a.pos.x = gate.pos.x + 12;
    a.pos.z = gate.pos.z;
    const hp = b.health;
    w.applyDamage("player", 2, 50, 1, "lease_breaker", "shot");
    expect(b.health).toBe(hp); // inside: no damage taken
    w.applyDamage("player", 1, 50, 2, "lease_breaker", "shot");
    expect(a.health).toBe(a.maxHealth ?? a.health); // from inside: no damage dealt
    // outside, a carrier dies and drops
    b.pos.x = gate.pos.x + 20;
    w.run!.carried.set(2, 4);
    w.applyDamage("player", 2, 1000, 1, "lease_breaker", "shot");
    expect(b.alive).toBe(false);
    expect(w.run!.carried.get(2)).toBe(0);
    expect(w.run!.claims.some((c) => c.dropped && c.value === 4)).toBe(true);
  });
});

describe("THE RUN — the room and the payout", () => {
  const fake = () => {
    const msgs: ReturnType<typeof decodeServerMessage>[] = [];
    const conn: Conn = { send: (buf) => void msgs.push(decodeServerMessage(buf, () => null)), close: () => {} };
    return { conn, msgs };
  };
  const join = (room: Room, name: string, account: string) => {
    const c = fake();
    room.onOpen(c.conn);
    room.onMessage(c.conn, encodeJoin(name, "", account, JSON.stringify({ primary: "lease_breaker", secondary: "shock_baton", attested: [] }), ""));
    return c;
  };
  const stand = (room: Room, id: number, x: number, z: number, ticks: number) => {
    for (let t = 0; t < ticks; t++) {
      const p = room.world.players.get(id)!;
      p.pos.x = x;
      p.pos.z = z;
      room.step();
    }
  };

  it("a bank credits the file: $CAPITAL owed at the gate against the day's cap, Scrip below Depth 10; the Welcome says run; the Run message reaches the client", () => {
    const store = new MemoryAccountStore(devSeed);
    const room = new Room({ ai: false, seed: 3, level: "drainage_yard", accounts: store, run: true });
    const a = join(room, "A", "sandbox-run");
    const b = join(room, "B", "fresh-run");
    expect((a.msgs.find((m) => m?.type === "welcome") as { mode: string }).mode).toBe("run");
    const run = room.world.run!;
    const claim = run.claims[0]!;
    const gate = run.zones[0]!;
    stand(room, 1, claim.pos.x, claim.pos.z, 2);
    expect(run.carried.get(1)).toBe(claim.value);
    stand(room, 1, gate.pos.x, gate.pos.z, RUN.bankSeconds * SIM_HZ + 5);
    const acc = store.accounts.get("sandbox-run")!;
    expect(acc.counter?.run?.owed).toBe(claim.value);
    expect(acc.counter?.run?.banked).toBe(claim.value);
    expect(acc.ledger.some((l) => /BANKED .* \$CAPITAL OWED/.test(l))).toBe(true);
    const runMsgs = a.msgs.filter((m) => m?.type === "run") as { type: "run"; run: { carried: number; banked: number; owed: number; zones: unknown[]; claims: unknown[] } }[];
    expect(runMsgs.length).toBeGreaterThan(0);
    expect(runMsgs[runMsgs.length - 1]!.run.owed).toBe(claim.value);
    expect(runMsgs[runMsgs.length - 1]!.run.zones.length).toBe(1);
    // below the gate: Scrip
    const c2 = run.claims[1]!;
    const scrip0 = store.accounts.get("fresh-run")!.wallet.scrip;
    stand(room, 2, c2.pos.x, c2.pos.z, 2);
    stand(room, 2, gate.pos.x, gate.pos.z, RUN.bankSeconds * SIM_HZ + 5);
    const fresh = store.accounts.get("fresh-run")!;
    expect(fresh.depth).toBeLessThan(RUN_DEPTH);
    expect(fresh.wallet.scrip - scrip0).toBe(c2.value * RUN_SCRIP_PER_UNIT);
    expect(fresh.counter?.run?.owed ?? 0).toBe(0);
    // the day's cap
    run.carried.set(1, RUN_DAILY_CAP);
    stand(room, 1, gate.pos.x, gate.pos.z, RUN.bankSeconds * SIM_HZ + 5);
    expect(acc.counter!.run!.banked).toBe(RUN_DAILY_CAP);
    expect(acc.counter!.run!.owed).toBe(RUN_DAILY_CAP);
    expect(acc.ledger.some((l) => /DAY CAP/.test(l))).toBe(true);
    expect(room.stats().run?.totalBanked).toBeGreaterThan(0);
    void b;
  });

  it("the payout moves what is owed from the treasury to the linked wallet on chain", async () => {
    const b = await bootDevnetLedger({ onLog: () => {}, seedMarket: false });
    const store = new MemoryAccountStore(devSeed);
    const a = store.load("sandbox-pay", "PAY");
    const player = privateKeyToAccount(DEV_KEYS.player2);
    const nonce = await b.ledger.nonce(a.id);
    const message = createSiweMessage({ address: player.address, chainId: b.devnet.chainId, domain: "127.0.0.1", nonce, uri: "http://127.0.0.1/", version: "1", statement: SIWE_STATEMENT });
    expect((await b.ledger.link(a, message, await player.signMessage({ message }))).ok).toBe(true);
    expect((await b.ledger.payout(a)).reason).toMatch(/nothing owed/);
    a.counter!.run = { day: 0, banked: 7, owed: 7, paid: 0 };
    const before = (await b.pub.readContract({ address: b.contracts.capital, abi: ARTIFACTS.CAPITAL!.abi, functionName: "balanceOf", args: [player.address] })) as bigint;
    const r = await b.ledger.payout(a);
    expect(r.ok).toBe(true);
    expect(r.paid).toBe(7);
    const after = (await b.pub.readContract({ address: b.contracts.capital, abi: ARTIFACTS.CAPITAL!.abi, functionName: "balanceOf", args: [player.address] })) as bigint;
    expect(after - before).toBe(7n * 10n ** 18n);
    expect(a.counter!.run!.owed).toBe(0);
    expect(a.counter!.run!.paid).toBe(7);
    expect(Number(a.counter!.capital)).toBe(Number(before / 10n ** 18n) + 7);
  }, 60_000);
});
