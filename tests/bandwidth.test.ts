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
import { encodeInputs, encodeJoin, Msg } from "../shared/net/protocol";
import { SIM_HZ } from "../shared/sim/constants";
import { Btn } from "../shared/sim/input";

interface Meter {
  conn: { send(buf: ArrayBuffer): void; close(): void };
  bytes: number;
  seq: number;
  /** newest snapshot tick seen, echoed back so the server deltas against it */
  ack: number;
}

/** Run a room of `n` moving players for `seconds` and report downstream bytes per client per second. */
function measure(n: number, seconds = 4): { perClientKBs: number; total: number; ticks: number } {
  const room = new Room({ ai: false, seed: 5, level: "drainage_yard", accounts: new MemoryAccountStore(devSeed), warmupSeconds: 0, roundSeconds: 600 });
  const meters: Meter[] = [];
  for (let i = 0; i < n; i++) {
    const m: Meter = { bytes: 0, seq: 0, ack: 0, conn: { send: () => {}, close: () => {} } };
    m.conn.send = (buf: ArrayBuffer) => {
      m.bytes += buf.byteLength;
      // Ack the newest snapshot: `rec.ackTick` is what selects a delta baseline server-side, so a
      // client that never acks is sent a FULL snapshot every time and the measurement describes a
      // protocol the game does not ship. The header is [u8 Msg.Snapshot][u32 tick].
      const v = new DataView(buf);
      if (buf.byteLength >= 5 && v.getUint8(0) === Msg.Snapshot) m.ack = Math.max(m.ack, v.getUint32(1, true));
    };
    room.onOpen(m.conn as never);
    room.onMessage(m.conn as never, encodeJoin(`P${i}`, "", "", ""));
    meters.push(m);
  }
  const ticks = seconds * SIM_HZ;
  // discard the join burst: the first snapshot to each client is a full one by construction
  for (let t = 0; t < SIM_HZ; t++) {
    for (const m of meters) room.onMessage(m.conn as never, encodeInputs([{ seq: ++m.seq, tick: room.tick, buttons: Btn.Forward | Btn.Sprint, yaw: m.seq * 0.05, pitch: 0, viewTick: m.ack, viewFrac: 0, px: 0, py: 0, pz: 0 }], m.ack));
    room.step();
  }
  for (const m of meters) m.bytes = 0;
  for (let t = 0; t < ticks; t++) {
    for (const m of meters) {
      // everyone moving and turning: the case delta compression cannot shrink away
      room.onMessage(m.conn as never, encodeInputs([{ seq: ++m.seq, tick: room.tick, buttons: Btn.Forward | Btn.Sprint | (t % 40 < 20 ? Btn.Left : Btn.Right), yaw: Math.sin(t * 0.05 + m.seq) * 2, pitch: 0, viewTick: m.ack, viewFrac: 0, px: 0, py: 0, pz: 0 }], m.ack));
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
  // Measured by this harness, steady state, everyone moving and turning, snapshots acked so the
  // shipped delta path is what is counted:
  //   1 player  2.61 KB/s per client · room  2.6 KB/s
  //   2         2.69                 · room  5.4
  //   4         2.85                 · room 11.4
  //   6         3.00                 · room 18.0
  //   8         3.16                 · room 25.3
  //
  // READ THESE AS SHAPE, NOT AS LEVEL. This drives a Room directly with `warmupSeconds: 0`, so the
  // match never reaches its live phase: no wake nodes, no dummies, none of the per-snapshot entity
  // payload a real round carries. `probe:net` measures the same eight clients over real sockets in a
  // real round and reads 14.70 KB/s against this 3.16 — that check is the authority on the level,
  // and this file is only good for how the cost grows with players.
  //
  // An earlier version of this file got both halves wrong at once and looked right: it did not ack,
  // so every snapshot came back full (inflating), while the quiescent room carried no entities
  // (deflating). Its extrapolations appeared to bracket the socket's 14.70, which was luck from two
  // compensating errors, and that claim has been withdrawn rather than kept because it flattered.

  it("is linear per client in the number of other players it is told about", () => {
    const p2 = measure(2).perClientKBs;
    const p4 = measure(4).perClientKBs;
    const p8 = measure(ROOM_CAP).perClientKBs;
    expect(p4).toBeGreaterThan(p2);
    expect(p8).toBeGreaterThan(p4);
    const perPlayer28 = (p8 - p2) / (ROOM_CAP - 2);
    const perPlayer24 = (p4 - p2) / 2;
    expect(perPlayer28).toBeGreaterThan(perPlayer24 * 0.7);
    expect(perPlayer28).toBeLessThan(perPlayer24 * 1.4);
  });

  it("costs the room itself quadratically, which is the number that scales a shard", () => {
    const room2 = measure(2).perClientKBs * 2;
    const room8 = measure(ROOM_CAP).perClientKBs * ROOM_CAP;
    expect(room8 / room2).toBeGreaterThan(4); // 4x the clients, each paying more than before
  });

  it("holds the budget in a quiescent room, which is why a quiescent room proves nothing", () => {
    // The point of keeping this: even the player-state floor alone is a fifth of the budget before a
    // round is running. The socket check is what found the overrun; this says the headroom that
    // check is spending was never large.
    expect(measure(ROOM_CAP).perClientKBs).toBeLessThan(BUDGET_KBS);
    expect(measure(ROOM_CAP).perClientKBs).toBeGreaterThan(BUDGET_KBS * 0.2);
  });
});
