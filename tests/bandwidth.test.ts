/**
 * The downstream budget is asserted at two players and the product sells rooms of eight (Stage 34).
 *
 * `probe:net` checks "bandwidth: < 12 KB/s per client downstream" in a room with ALPHA and BRAVO in
 * it, and reports ~10.5-12.2 KB/s — at or over the line with two. Matchmaking, meanwhile, fills a
 * room to **eight** before rolling to the next shard (`probe:harden`: "a full room (8) rolls to the
 * next shard"). Nothing has ever measured the number the budget is about at the size the game
 * actually runs.
 *
 * The room is a plain class, so this drives it directly — no browser, no wall clock, no noise — and
 * counts the bytes it hands each connection over a fixed number of ticks. Every player moves, which
 * is the expensive case for delta snapshots: a still player costs almost nothing to encode.
 */
import { describe, expect, it } from "vitest";
import { Room } from "../server/room";
import { MemoryAccountStore, devSeed } from "../server/accounts";
import { encodeInputs, encodeJoin } from "../shared/net/protocol";
import { SIM_HZ } from "../shared/sim/constants";
import { Btn } from "../shared/sim/input";

interface Meter {
  conn: { send(buf: ArrayBuffer): void; close(): void };
  bytes: number;
  seq: number;
}

/** Run a room of `n` moving players for `seconds` and report downstream bytes per client per second. */
function measure(n: number, seconds = 4): { perClientKBs: number; total: number; ticks: number } {
  const room = new Room({ ai: false, seed: 5, level: "drainage_yard", accounts: new MemoryAccountStore(devSeed), warmupSeconds: 0, roundSeconds: 600 });
  const meters: Meter[] = [];
  for (let i = 0; i < n; i++) {
    const m: Meter = { bytes: 0, seq: 0, conn: { send: () => {}, close: () => {} } };
    m.conn.send = (buf: ArrayBuffer) => {
      m.bytes += buf.byteLength;
    };
    room.onOpen(m.conn as never);
    room.onMessage(m.conn as never, encodeJoin(`P${i}`, "", "", ""));
    meters.push(m);
  }
  const ticks = seconds * SIM_HZ;
  // discard the join burst: the first snapshot to each client is a full one by construction
  for (let t = 0; t < SIM_HZ; t++) {
    for (const m of meters) room.onMessage(m.conn as never, encodeInputs([{ seq: ++m.seq, tick: room.tick, buttons: Btn.Forward | Btn.Sprint, yaw: m.seq * 0.05, pitch: 0, viewTick: room.tick, viewFrac: 0, px: 0, py: 0, pz: 0 }], 0));
    room.step();
  }
  for (const m of meters) m.bytes = 0;
  for (let t = 0; t < ticks; t++) {
    for (const m of meters) {
      // everyone moving and turning: the case delta compression cannot shrink away
      room.onMessage(m.conn as never, encodeInputs([{ seq: ++m.seq, tick: room.tick, buttons: Btn.Forward | Btn.Sprint | (t % 40 < 20 ? Btn.Left : Btn.Right), yaw: Math.sin(t * 0.05 + m.seq) * 2, pitch: 0, viewTick: room.tick, viewFrac: 0, px: 0, py: 0, pz: 0 }], 0));
    }
    room.step();
  }
  const total = meters.reduce((a, m) => a + m.bytes, 0);
  return { perClientKBs: total / n / seconds / 1024, total, ticks };
}

/** The ceiling probe:net asserts, per client, downstream. */
const BUDGET_KBS = 12;
/** What matchmaking fills a public room to before opening the next shard. */
const ROOM_CAP = 8;

describe("downstream bandwidth at the size the game actually runs", () => {
  // measured by this harness, steady state, everyone moving and turning:
  //   1 player  2.61 KB/s per client · room  2.6 KB/s
  //   2         2.82                 · room  5.6
  //   4         3.24                 · room 13.0
  //   6         3.67                 · room 22.0
  //   8         4.10                 · room 32.7
  // Per client it is linear in the others to describe, about +0.21 KB/s each; per room it is
  // quadratic, because every one of n clients is told about n-1 others.

  it("is linear per client in the number of other players it is told about", () => {
    const p2 = measure(2).perClientKBs;
    const p4 = measure(4).perClientKBs;
    const p8 = measure(ROOM_CAP).perClientKBs;
    expect(p4).toBeGreaterThan(p2);
    expect(p8).toBeGreaterThan(p4);
    // the per-extra-player increment is steady rather than accelerating
    const perPlayer28 = (p8 - p2) / (ROOM_CAP - 2);
    const perPlayer24 = (p4 - p2) / 2;
    expect(perPlayer28).toBeGreaterThan(perPlayer24 * 0.7);
    expect(perPlayer28).toBeLessThan(perPlayer24 * 1.4);
  });

  it("costs the room itself quadratically, which is the number that scales a shard", () => {
    const room2 = measure(2).perClientKBs * 2;
    const room8 = measure(ROOM_CAP).perClientKBs * ROOM_CAP;
    expect(room8 / room2).toBeGreaterThan(4); // 8/2 = 4 clients, each paying more than before
  });

  it("leaves the probe's own budget without room for a full lobby", () => {
    // The point of the whole file. `probe:net` asserts < 12 KB/s per client and measures ~10.5-12.2
    // in a room of TWO, against a product whose matchmaking fills a room to EIGHT. This harness
    // excludes the join burst so its absolute level is lower than the probe's; the transferable
    // quantity is the slope. Carried onto the probe's own reading, both ways of extrapolating land
    // at or over the line:
    const p2 = measure(2).perClientKBs;
    const p8 = measure(ROOM_CAP).perClientKBs;
    const probeMeasuredAtTwo = 11.0; // the middle of what probe:net reports for its two clients
    const byIncrement = probeMeasuredAtTwo + (p8 - p2);
    const byRatio = probeMeasuredAtTwo * (p8 / p2);
    expect(byIncrement).toBeGreaterThan(BUDGET_KBS * 0.95);
    expect(byRatio).toBeGreaterThan(BUDGET_KBS);
    // Recorded, not asserted as a defect: the honest fix is to measure the budget at the room cap
    // rather than to argue about the extrapolation. That is a probe change, and it is named in
    // docs/STAGES.md rather than made here on an estimate.
  });
});
