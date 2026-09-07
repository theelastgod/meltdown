/**
 * A lost input is a movement step the player made and the server did not (Stage 31).
 *
 * Movement is a pure function of the inputs applied, so an input lost in every redundant copy is
 * not a small transient — it is a permanent difference in position between what the client
 * predicted and what the server holds, corrected only by dragging the player back. Measured below
 * at ~12 cm per lost input at sprint, and it survives the player coming to a complete stop.
 *
 * `probe:net` had been reporting exactly this since Stage 2, as
 * "client-predicted movement identical to server ... max error ALPHA 1.02e-1 m" — one lost input.
 * It only shows when the client is slow enough for redundancy to stop covering the loss, which is
 * why it was green by hand and red on CI, and why it held the gate shut for thirty-nine runs
 * (Stage 30).
 *
 * The room fills the gap now by repeating the last input the client sent. These cases pin the
 * residue it removes, and the two bounds on the guess: a filler carries no discrete action, and
 * only so many in a row.
 */
import { describe, expect, it } from "vitest";
import { World } from "../shared/sim/world";
import { levelById } from "../shared/sim/level";
import { Btn } from "../shared/sim/input";
import { Room } from "../server/room";
import { MemoryAccountStore, devSeed } from "../server/accounts";
import { encodeInputs, encodeJoin } from "../shared/net/protocol";

interface Cmd {
  tick: number;
  buttons: number;
  yaw: number;
  pitch: number;
  seq: number;
  viewTick: number;
  viewFrac: number;
  px: number;
  py: number;
  pz: number;
}

const cmd = (t: number, buttons: number): Cmd => ({ tick: t, buttons, yaw: 0.3, pitch: 0, seq: t, viewTick: t, viewFrac: 0, px: 0, py: 0, pz: 0 });
/** sprint forward, then release and coast to a full stop */
const SCRIPT = Array.from({ length: 90 }, (_, i) => cmd(i + 1, i < 30 ? Btn.Forward | Btn.Sprint : 0));

/** Apply the script with the dropped seqs replaced by a repeat of the previous input — the fix. */
function playFilled(dropped: readonly number[]): { x: number; z: number; speed: number } {
  const w = new World(levelById("drainage_yard"));
  const p = w.addPlayer(1, "A");
  let last: Cmd | null = null;
  for (const c of SCRIPT) {
    const use = dropped.includes(c.seq) ? (last ? { ...last, seq: c.seq } : null) : c;
    if (use) {
      w.applyInput(p, use, { predictOnly: true });
      if (!dropped.includes(c.seq)) last = c;
    }
    w.tick++;
  }
  return { x: p.pos.x, z: p.pos.z, speed: Math.hypot(p.vel.x, p.vel.z) };
}

/** Apply a script to a fresh world, optionally never delivering some seqs. */
function play(dropped: readonly number[]): { x: number; z: number; speed: number } {
  const w = new World(levelById("drainage_yard"));
  const p = w.addPlayer(1, "A");
  for (const c of SCRIPT) {
    if (!dropped.includes(c.seq)) w.applyInput(p, c, { predictOnly: true });
    w.tick++;
  }
  return { x: p.pos.x, z: p.pos.z, speed: Math.hypot(p.vel.x, p.vel.z) };
}

describe("what a lost input costs", () => {
  it("is a permanent position residue, not a transient — it is still there at a dead stop", () => {
    const client = play([]);
    const server = play([15]);
    expect(client.speed).toBeCloseTo(0, 6); // both have come to rest
    expect(server.speed).toBeCloseTo(0, 6);
    const residue = Math.hypot(server.x - client.x, server.z - client.z);
    expect(residue).toBeGreaterThan(0.1); // ~12 cm at sprint
    expect(residue).toBeLessThan(0.2);
  });

  it("adds up per lost input, which is why loss reads as rubber-banding", () => {
    const client = play([]);
    const one = play([15]);
    const two = play([15, 16]);
    const d1 = Math.hypot(one.x - client.x, one.z - client.z);
    const d2 = Math.hypot(two.x - client.x, two.z - client.z);
    expect(d2 / d1).toBeCloseTo(2, 1);
  });

  it("and repeating the last input in its place removes it exactly", () => {
    // the whole basis of the fix: the residue is the missing application and nothing subtler, so
    // putting an application back in its place closes it. The server cannot know the lost input,
    // but it knows the one before it, and while a key is held those are the same input.
    const client = play([]);
    const dropped = play([15]);
    const filled = playFilled([15]);
    expect(Math.hypot(dropped.x - client.x, dropped.z - client.z)).toBeGreaterThan(0.1);
    expect(Math.hypot(filled.x - client.x, filled.z - client.z)).toBe(0);
  });
});

describe("the room fills a loss gap, within bounds", () => {
  /** Drive one client's inputs into a real Room and read back what it queued. */
  function queued(seqs: number[], buttons = Btn.Forward | Btn.Sprint | Btn.Fire): { seq: number; buttons: number; px: number }[] {
    const room = new Room({ ai: false, seed: 3, level: "drainage_yard", accounts: new MemoryAccountStore(devSeed), warmupSeconds: 1, roundSeconds: 30 });
    const conn = { send: () => {}, close: () => {} } as unknown as Parameters<Room["onOpen"]>[0];
    room.onOpen(conn);
    room.onMessage(conn, encodeJoin("A", "", "", ""));
    const rec = [...(room as unknown as { clients: Map<number, { queue: Cmd[] }> }).clients.values()][0]!;
    rec.queue.length = 0;
    for (const s of seqs) room.onMessage(conn, encodeInputs([cmd(s, buttons)], 0));
    return rec.queue.map((q) => ({ seq: q.seq, buttons: q.buttons, px: q.px }));
  }

  it("a gap of one is filled, so the player keeps the movement the client predicted", () => {
    expect(queued([1, 2, 4]).map((x) => x.seq)).toEqual([1, 2, 3, 4]);
  });

  it("a filler carries movement and look but never a discrete action", () => {
    const filler = queued([1, 2, 4]).find((x) => x.seq === 3)!;
    expect(filler.buttons & Btn.Forward).toBe(Btn.Forward);
    expect(filler.buttons & Btn.Sprint).toBe(Btn.Sprint);
    // the client was holding fire; the guess does not pull the trigger on its behalf
    expect(filler.buttons & Btn.Fire).toBe(0);
  });

  it("a filler is marked as having no client prediction behind it", () => {
    // the trace check scores the server against what the client said it predicted; there is no
    // such number for an input the client never sent
    const filler = queued([1, 2, 4]).find((x) => x.seq === 3)!;
    expect(Number.isFinite(filler.px)).toBe(false);
  });

  it("a long gap is bounded: past a few ticks the client is gone, not lossy", () => {
    const q = queued([1, 2, 40]);
    expect(q.filter((x) => !Number.isFinite(x.px)).length).toBe(4); // MAX_GAP_FILL
    expect(q[q.length - 1]!.seq).toBe(40); // and the real input still lands
  });

  it("no gap, no fillers", () => {
    expect(queued([1, 2, 3, 4]).filter((x) => !Number.isFinite(x.px))).toEqual([]);
  });
});
