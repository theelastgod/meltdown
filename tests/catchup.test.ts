/**
 * A hitching client is not a cheater (Stage 698).
 *
 * The room's input-rate guard counts inputs in a fixed one-second window and strikes every input past
 * 95 in it. A client whose page blocked for a long first frame (software GL can hold a page ~14 s)
 * comes back with catch-up bursts — up to MAX_CATCHUP_TICKS inputs a frame — and then keeps sending at
 * 60 a second. The bursts plus 60 Hz crossed 95 inside one window, and the inputs past it arrived on
 * consecutive ticks: three strikes in ~54 ms, a kick, and the player rejoined as a blank file.
 *
 * The window rule is unchanged. Silence that no window saw (at least a whole window of it) now earns
 * catch-up credit, 60 a second of it, which the window the client comes back in spends before it
 * counts. These tests pin both halves: the hitch is tolerated, and every flooder is kicked no later
 * than the old guard kicked it.
 */
import { describe, expect, it } from "vitest";
import { Room, type Conn } from "../server/room";
import { devSeed, MemoryAccountStore } from "../server/accounts";
import { encodeJoin, encodeInputs, INPUT_REDUNDANCY, type NetInput } from "../shared/net/protocol";
import { MAX_CATCHUP_TICKS, SIM_HZ } from "../shared/sim/constants";
import { Btn } from "../shared/sim/input";

const TICK_MS = 1000 / SIM_HZ;

/**
 * Kick times of the guard before this stage, in ticks after a steady over-limit flood starts, measured
 * with this file's harness against the parent commit (3fadcb5) and recorded here, never recomputed:
 * [flooding from its first packet after joining, worst case over the 60 tick-phases after three seconds
 * of honest 60 Hz play]. `ONE` sends each input in its own packet (the real client's cadence); `PACKED`
 * sends 32-input packets (the most a packet may carry), the flooder that goes longest between packets.
 */
const OLD_KICKS_ONE: Record<number, [number, number]> = {
  96: [119, 178],
  100: [58, 112],
  105: [55, 103],
  110: [52, 95],
  120: [48, 83],
  150: [38, 62],
  200: [29, 44],
};
const OLD_KICKS_PACKED: Record<number, [number, number]> = {
  96: [179, 219],
  120: [111, 95],
  200: [38, 57],
};

function makeRoom() {
  let now = 1_700_000_000_000;
  const logs: { at: number; line: string }[] = [];
  const room = new Room({
    ai: false,
    seed: 5,
    level: "drainage_yard",
    accounts: new MemoryAccountStore(devSeed),
    wakePhase: "off",
    warmupSeconds: 0,
    roundSeconds: 600,
    now: () => now,
    onLog: (line: string) => logs.push({ at: now, line }),
  } as never);
  return {
    room,
    get now() {
      return now;
    },
    /** one sim tick of wall time, then the room steps */
    tick: () => {
      now += TICK_MS;
      room.step();
    },
    /** wall time passes with the room stepping and the client silent, e.g. while its page is blocked */
    idle: (ms: number) => {
      for (let t = 0; t < ms; t += TICK_MS) {
        now += TICK_MS;
        room.step();
      }
    },
    strikes: () => logs.filter((l) => l.line.startsWith("strike ")).map((l) => l.line),
    kicks: () => logs.filter((l) => l.line.startsWith("kick player")),
  };
}
type R = ReturnType<typeof makeRoom>;

/** A client that sends each tick's input with the last few again, as NetClient.sendInput does. */
class Client {
  readonly conn: Conn;
  private seq = 0;
  private recent: NetInput[] = [];
  constructor(private room: Room, name: string, account: string) {
    this.conn = { send: () => {}, close: () => {} };
    room.onOpen(this.conn);
    room.onMessage(this.conn, encodeJoin(name, "", account, JSON.stringify({ primary: "lease_breaker", secondary: "shock_baton", attested: [] }), ""));
  }
  private input(): NetInput {
    return { seq: ++this.seq, tick: this.room.tick, viewTick: this.room.tick, viewFrac: 0, buttons: Btn.Forward, yaw: 0, pitch: 0, px: 0, py: 0, pz: 0 };
  }
  /** One frame that ran `n` sim ticks: a packet per tick, each carrying the last few inputs. */
  frame(n: number): void {
    for (let i = 0; i < n; i++) {
      this.recent = [...this.recent, this.input()].slice(-INPUT_REDUNDANCY);
      this.room.onMessage(this.conn, encodeInputs(this.recent, 0));
    }
  }
  /** One packet carrying `n` new inputs (at most 32, the protocol's limit). */
  packet(n: number): void {
    const batch: NetInput[] = [];
    for (let i = 0; i < n; i++) batch.push(this.input());
    this.recent = batch.slice(-INPUT_REDUNDANCY);
    this.room.onMessage(this.conn, encodeInputs(batch, 0));
  }
}

/** Honest play: one input a tick for `ticks` ticks. */
function play(r: R, c: Client, ticks: number): void {
  for (let t = 0; t < ticks; t++) {
    c.frame(1);
    r.tick();
  }
}

/**
 * A steady flood at `rate` inputs a second, in packets of `pkt` inputs, for up to ten seconds,
 * stopping at the kick. Returns the ticks from its first tick to the kick, or Infinity.
 */
function flood(r: R, c: Client, rate: number, pkt = 1): number {
  const start = r.now;
  let owed = 0;
  for (let t = 0; t < SIM_HZ * 10 && r.kicks().length === 0; t++) {
    const n = Math.floor(((t + 1) * rate) / SIM_HZ) - Math.floor((t * rate) / SIM_HZ);
    if (pkt === 1) c.frame(n);
    else
      for (owed += n; owed >= pkt; owed -= pkt) c.packet(pkt);
    r.tick();
  }
  const k = r.kicks()[0];
  return k ? Math.round((k.at - start) / TICK_MS) : Infinity;
}

/** [kick ticks flooding from join, worst kick ticks over the 60 phases after 3 s of honest play] */
function kickTimes(rate: number, pkt = 1): [number, number] {
  const r = makeRoom();
  const fromJoin = flood(r, new Client(r.room, "FLOOD", "sandbox-flood"), rate, pkt);
  let worst = 0;
  for (let phase = 0; phase < SIM_HZ; phase++) {
    const s = makeRoom();
    const c = new Client(s.room, "FLOOD", "sandbox-flood");
    play(s, c, SIM_HZ * 3 + phase);
    worst = Math.max(worst, flood(s, c, rate, pkt));
  }
  return [fromJoin, worst];
}

describe("a client whose page blocked comes back and catches up without being kicked", () => {
  it("a 14 s block, then four 30-tick catch-up frames back to back, then ten seconds of play: no strike", () => {
    const r = makeRoom();
    const c = new Client(r.room, "SLOWGL", "sandbox-slowgl");
    play(r, c, SIM_HZ); // a second of honest play, so the guard is in its steady state
    r.idle(14_000); // the page blocks: the client sends nothing, the room keeps ticking
    // it comes back through several long frames, each a full MAX_CATCHUP_TICKS catch-up, whose packets
    // arrive back to back (the failing probe's three strikes landed inside ~54 ms)
    for (let f = 0; f < 4; f++) {
      c.frame(MAX_CATCHUP_TICKS);
      r.tick();
    }
    play(r, c, SIM_HZ * 10); // then ordinary 60 Hz play, across many one-second windows
    expect(r.strikes()).toEqual([]);
    expect(r.kicks()).toEqual([]);
    expect(r.room.stats().players).toBe(1);
  });

  it("one to four catch-up frames after the block, at every phase of the one-second window: no strike", () => {
    // the window is anchored at join, so whether burst + 60 Hz crossed 95 depended on where the burst
    // landed and how many long frames the page limped through: about half the probe runs
    for (let frames = 1; frames <= 4; frames++) {
      for (let phase = 0; phase < SIM_HZ; phase++) {
        const r = makeRoom();
        const c = new Client(r.room, "SLOWGL", "sandbox-slowgl");
        r.idle(14_000 + phase * TICK_MS);
        for (let f = 0; f < frames; f++) {
          c.frame(MAX_CATCHUP_TICKS);
          r.tick();
        }
        play(r, c, SIM_HZ * 3);
        expect(r.strikes(), `${frames} frames, phase ${phase}`).toEqual([]);
        expect(r.kicks(), `${frames} frames, phase ${phase}`).toEqual([]);
      }
    }
  });

  it("a page that hitches again and again, half a second at a time, is never struck", () => {
    // a client stuck at 2 fps: each frame is capped at 0.5 s and runs MAX_CATCHUP_TICKS ticks, which is
    // exactly 60 Hz of wall time, delivered in lumps
    const r = makeRoom();
    const c = new Client(r.room, "TWOFPS", "sandbox-twofps");
    play(r, c, SIM_HZ);
    for (let f = 0; f < 20; f++) {
      r.idle(500);
      c.frame(MAX_CATCHUP_TICKS);
    }
    expect(r.strikes()).toEqual([]);
    expect(r.kicks()).toEqual([]);
  });
});

describe("a flooder is kicked no later than the old guard kicked it", () => {
  for (const rate of Object.keys(OLD_KICKS_ONE).map(Number)) {
    it(`${rate} inputs a second, a packet each: from join, and worst case after honest play`, () => {
      const [oldJoin, oldWorst] = OLD_KICKS_ONE[rate]!;
      const [join, worst] = kickTimes(rate);
      expect(join, "from join").toBeLessThanOrEqual(oldJoin);
      expect(worst, "after honest play").toBeLessThanOrEqual(oldWorst);
    });
  }

  for (const rate of Object.keys(OLD_KICKS_PACKED).map(Number)) {
    it(`${rate} inputs a second in 32-input packets: from join, and worst case after honest play`, () => {
      const [oldJoin, oldWorst] = OLD_KICKS_PACKED[rate]!;
      const [join, worst] = kickTimes(rate, 32);
      expect(join, "from join").toBeLessThanOrEqual(oldJoin);
      expect(worst, "after honest play").toBeLessThanOrEqual(oldWorst);
    });
  }

  it("a fake catch-up burst every frame, with no silence before it, is struck and kicked", () => {
    const r = makeRoom();
    const c = new Client(r.room, "FAKER", "sandbox-faker");
    play(r, c, SIM_HZ);
    const start = r.now;
    // claims a full hitch's worth of ticks every frame while its frames are 16 ms apart
    for (let t = 0; t < SIM_HZ * 5 && r.kicks().length === 0; t++) {
      c.frame(MAX_CATCHUP_TICKS);
      r.tick();
    }
    expect(r.strikes().length).toBeGreaterThan(0);
    expect(r.kicks()[0]?.line).toMatch(/input rate/);
    expect((r.kicks()[0]!.at - start) / TICK_MS).toBeLessThan(SIM_HZ / 2);
  });

  it("silence buys a catch-up, not a flood: 14 s of it does not license 14 s of inputs at once", () => {
    // the room will take two seconds of backlog after a block (four catch-up frames) on top of the
    // window; a client that dumps everything its silence could nominally owe is refused and struck
    const r = makeRoom();
    const c = new Client(r.room, "DUMPER", "sandbox-dumper");
    play(r, c, SIM_HZ);
    r.idle(14_000);
    c.frame(SIM_HZ * 14);
    expect(r.strikes().length).toBeGreaterThan(0);
    expect(r.kicks()[0]?.line).toMatch(/input rate/);
  });

  it("a fake hitch that sends twice what its silence owed, over and over, is struck and kicked", () => {
    // the silence is real here, but the burst after it claims 2x the ticks that silence could owe:
    // 120/s sustained, dressed up as catch-up
    const r = makeRoom();
    const c = new Client(r.room, "LIAR", "sandbox-liar");
    play(r, c, SIM_HZ);
    for (let f = 0; f < 40 && r.kicks().length === 0; f++) {
      r.idle(500);
      c.frame(MAX_CATCHUP_TICKS * 2);
    }
    expect(r.strikes().length).toBeGreaterThan(0);
    expect(r.kicks()[0]?.line).toMatch(/input rate/);
  });

  it("credit does not carry: after a catch-up, a flood is counted from the next window as before", () => {
    // a client that came back from a block with credit to spare cannot bank it for a later flood
    const r = makeRoom();
    const c = new Client(r.room, "BANKER", "sandbox-banker");
    r.idle(14_000);
    c.frame(1); // comes back owing 120 and spends one of it
    // then goes quiet for too short a time to earn anything new, and floods: its window opens with
    // the flood, exactly as a flood from join does, and must be kicked as fast
    r.idle(1_500);
    expect(flood(r, c, 120)).toBeLessThanOrEqual(OLD_KICKS_ONE[120]![0]);
  });
});
