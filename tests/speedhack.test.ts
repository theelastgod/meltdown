/**
 * The speed hack, and the fix.
 *
 * Every accepted input is a full `stepPlayer` at SIM_DT. A client allowed to spend more inputs than
 * the sim has ticked therefore moves and shoots faster than everyone else — no modified physics, no
 * impossible position, just a faster send loop, and the old per-second rate cap (95/s against a 60 Hz
 * sim) left 56% of headroom to do it in. With $CAPITAL paid for PvP outcomes, that is a mint.
 *
 * The fix is a credit per tick with a short burst allowance: a hitching client still catches up, a
 * flooder cannot outrun the clock. See docs/SECURITY.md §5.
 */
import { describe, expect, it } from "vitest";
import { INPUT_BURST_CREDITS, Room, type Conn } from "../server/room";
import { devSeed, MemoryAccountStore } from "../server/accounts";
import { encodeJoin, encodeInputs } from "../shared/net/protocol";
import { SIM_HZ } from "../shared/sim/constants";
import { Btn } from "../shared/sim/input";

const TICK_MS = 1000 / SIM_HZ;

/** A client that sends inputs for a sim tick, all of them holding forward. */
class Sender {
  readonly conn: Conn;
  readonly playerId: number;
  private seq = 0;
  constructor(private room: Room, name: string, account: string) {
    this.conn = { send: () => {}, close: () => {} };
    room.onOpen(this.conn);
    room.onMessage(this.conn, encodeJoin(name, "", account, JSON.stringify({ primary: "lease_breaker", secondary: "shock_baton", attested: [] }), ""));
    // the room hands out ids in join order; the newest player is this one
    this.playerId = Math.max(...room.world.players.keys());
  }
  /** One batch of `n` forward inputs, as a client's send loop would. */
  send(n: number, tick: number): void {
    for (let i = 0; i < n; i++) {
      this.seq++;
      const p = this.room.world.players.get(this.playerId)!;
      this.room.onMessage(this.conn, encodeInputs([{ seq: this.seq, tick, viewTick: tick, buttons: Btn.Forward | Btn.Sprint, yaw: 0, pitch: 0, px: p.pos.x, py: p.pos.y, pz: p.pos.z }], 0));
    }
  }
  get pos() {
    return this.room.world.players.get(this.playerId)!.pos;
  }
}

describe("a client cannot outrun the sim clock", () => {
  /**
   * The room rate-limits per wall-clock second, so the test drives a clock that advances one sim
   * tick per step. Without it a fast loop trips the limiter and nothing under test is exercised.
   */
  const makeRoom = () => {
    let now = 1_700_000_000_000;
    const store = new MemoryAccountStore(devSeed);
    const room = new Room({ ai: false, seed: 5, level: "drainage_yard", accounts: store, wakePhase: "off", warmupSeconds: 0, roundSeconds: 600, now: () => now });
    return { room, tick: () => { now += TICK_MS; room.step(); } };
  };
  /**
   * Both clients start on the yard's open north run, a couple of metres apart so they do not jostle,
   * facing down it. Forward + sprint from here is 21 m of clear ground in three seconds.
   */
  const START_Z = 24;
  const place = (room: Room, s: Sender, x: number) => {
    const p = room.world.players.get(s.playerId)!;
    p.pos.x = x;
    p.pos.y = 0;
    p.pos.z = START_Z;
    p.vel.x = 0;
    p.vel.y = 0;
    p.vel.z = 0;
  };
  const dist = (s: Sender) => Math.abs(s.pos.z - START_Z);

  /** Runs the honest client and the flooder side by side for `seconds`, and reports the flooder's lead. */
  const race = (seconds: number) => {
    const { room, tick } = makeRoom();
    const honest = new Sender(room, "HONEST", "sandbox-honest");
    const flood = new Sender(room, "FLOOD", "sandbox-flood");
    place(room, honest, -2);
    place(room, flood, 2);
    const leadAt: Record<number, number> = {};
    for (let t = 0; t < SIM_HZ * seconds; t++) {
      honest.send(1, t); // one per tick: 60/s, what the real client does
      flood.send(t % 2 === 0 ? 2 : 1, t); // 1.5 per tick: 90/s, under the old 95/s cap
      tick();
      if ((t + 1) % SIM_HZ === 0) leadAt[(t + 1) / SIM_HZ] = dist(flood) - dist(honest);
    }
    const st = room.stats();
    const cl = (n: string) => st.clients.find((c) => c.name === n)!;
    return { honest: dist(honest), flood: dist(flood), lead: dist(flood) - dist(honest), leadAt, perTick: dist(honest) / (SIM_HZ * seconds), st, cl };
  };

  it("a flooding client gains no sustained ground on an honest one, and is never kicked for trying", () => {
    const r = race(3);
    // 90 inputs a second never broke the stated rule, which is exactly what made it a hole
    expect(r.st.kicks).toBe(0);
    expect(r.honest).toBeGreaterThan(15); // the honest client really ran down the yard
    // pre-fix this lead was ~50% of the distance; now it is at most the one-off burst allowance
    expect(r.lead).toBeLessThan(r.perTick * (INPUT_BURST_CREDITS + 4));
    // it spent no more sim time than the sim ran, plus the burst it was allowed to bank
    expect(r.cl("FLOOD").inputsApplied).toBeLessThanOrEqual(SIM_HZ * 3 + INPUT_BURST_CREDITS);
    expect(r.cl("FLOOD").throttled).toBeGreaterThan(0); // the room saw it happen
    expect(r.cl("FLOOD").inputsRejected).toBeGreaterThan(0); // and its surplus piled up and was dropped
    expect(r.cl("HONEST").throttled).toBe(0); // while the honest client was never held back
  });

  it("the flooder's lead is a one-off burst, not a rate: it stops growing once the credits are spent", () => {
    const r = race(3);
    // by one second the banked credits are long spent; a rate advantage would keep opening the gap
    expect(r.leadAt[1]).toBeGreaterThan(0); // the burst did buy a head start
    expect(r.leadAt[3]! - r.leadAt[1]!).toBeLessThan(r.perTick * 2);
    expect(r.leadAt[2]! - r.leadAt[1]!).toBeLessThan(r.perTick * 2);
    // at 90 inputs a second for three seconds, a rate advantage would have been ~90 ticks of travel
    expect(r.lead).toBeLessThan(r.perTick * 90 * 0.25);
  });

  it("a client that hitches and then bursts still catches up: the burst allowance is real", () => {
    const { room, tick } = makeRoom();
    const steady = new Sender(room, "STEADY", "sandbox-steady");
    const hitchy = new Sender(room, "HITCHY", "sandbox-hitchy");
    place(room, steady, -2);
    place(room, hitchy, 2);
    // the hitchy client stalls six ticks, then sends the six it owes in one batch, over and over
    for (let t = 0; t < SIM_HZ * 3; t++) {
      steady.send(1, t);
      if (t % 6 === 5) hitchy.send(6, t);
      tick();
    }
    expect(Math.abs(dist(hitchy) - dist(steady))).toBeLessThan(dist(steady) * 0.1);
    expect(room.stats().clients.find((c) => c.name === "HITCHY")!.throttled).toBe(0);
    expect(room.stats().kicks).toBe(0);
  });
});
