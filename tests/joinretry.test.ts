/**
 * The join handshake is two packets on a lossy link (Stage 155): the join and its Welcome. Either
 * can be lost, and until this stage neither was timed — the client asked once, the room answered
 * once, and a single loss left the client in `connecting` for ever while the room streamed
 * snapshots at a file it thought was playing.
 */
import { describe, expect, it } from "vitest";
import { JOIN_FIRST_MS, JOIN_RESENDS, joinDelay, joinGiveUpMs, joinWindowMs } from "../shared/net/rejoin";
import { Room, type Conn } from "../server/room";
import { MemoryAccountStore, devSeed, type AccountStore } from "../server/accounts";
import { decodeServerMessage, encodeJoin } from "../shared/net/protocol";

describe("the handshake's retry plan", () => {
  it("re-asks on a doubling wait and then stops", () => {
    const plan = [];
    for (let n = 1; n <= JOIN_RESENDS + 3; n++) plan.push(joinDelay(n));
    expect(plan.slice(0, JOIN_RESENDS)).toEqual([700, 1400, 2800]);
    // the plan ends: a join the room admits on is not an input to repeat forever
    for (const spent of plan.slice(JOIN_RESENDS)) expect(spent).toBeNull();
  });

  it("refuses an attempt that is not a whole try", () => {
    for (const bad of [0, -1, 1.5, NaN]) expect(joinDelay(bad)).toBeNull();
  });

  it("covers the loss it was built for before giving up the door", () => {
    // 4 asks over the window: at the 5 % per-direction loss the probe simulates, the odds of every
    // one of them being lost are under one in a million, and the window is well inside the grace
    expect(joinWindowMs()).toBeGreaterThanOrEqual(4 * JOIN_FIRST_MS);
    expect(joinWindowMs()).toBeLessThan(10_000);
    expect(joinGiveUpMs()).toBe(joinDelay(JOIN_RESENDS));
  });
});

function seated() {
  const msgs: ReturnType<typeof decodeServerMessage>[] = [];
  const conn: Conn = { send: (buf) => void msgs.push(decodeServerMessage(buf, () => null)), close: () => {} };
  const room = new Room({ ai: false, seed: 5, level: "drainage_yard", accounts: new MemoryAccountStore(devSeed), warmupSeconds: 1, roundSeconds: 5 });
  room.onOpen(conn);
  const ask = () => room.onMessage(conn, encodeJoin("ALPHA", "", "sandbox-a", ""));
  const count = (t: string) => msgs.filter((m) => m?.type === t).length;
  return { room, conn, msgs, ask, count };
}

describe("a room asked to join twice while the first join is still loading", () => {
  it("seats the connection once: the Welcome it is waiting for is already coming", async () => {
    const msgs: ReturnType<typeof decodeServerMessage>[] = [];
    const conn: Conn = { send: (buf) => void msgs.push(decodeServerMessage(buf, () => null)), close: () => {} };
    let release = () => {};
    const held = new Promise<void>((r) => (release = r));
    const slow: AccountStore = {
      load: (id, name) => held.then(() => devSeed(id, name)),
      save: () => {},
    };
    const room = new Room({ ai: false, seed: 5, level: "drainage_yard", accounts: slow, warmupSeconds: 1, roundSeconds: 5 });
    room.onOpen(conn);
    const ask = () => room.onMessage(conn, encodeJoin("ALPHA", "", "sandbox-a", ""));
    ask();
    // the file has not answered yet, so the client has heard nothing and asks again — the retry the
    // stage adds. Admitting on it would spawn this one connection a second time
    ask();
    ask();
    release();
    await held;
    await new Promise((r) => setTimeout(r, 0));
    expect(msgs.filter((m) => m?.type === "welcome").length).toBe(1);
    expect(room.stats().players).toBe(1);
  });
});

describe("a room asked to join twice", () => {
  it("says hello again rather than striking the client it stranded", () => {
    const s = seated();
    s.ask();
    expect(s.count("welcome")).toBe(1);
    // the client heard nothing, so it asks again: the room repeats the hello it thinks was lost
    s.ask();
    expect(s.count("welcome")).toBe(2);
    expect(s.count("file")).toBe(2);
    expect(s.count("kick")).toBe(0);
    // and the repeat seats nobody new
    expect(s.room.stats().players).toBe(1);
  });

  it("tolerates the whole plan the client can spend, and no more", () => {
    const s = seated();
    s.ask();
    for (let n = 0; n < JOIN_RESENDS; n++) s.ask();
    expect(s.count("welcome")).toBe(JOIN_RESENDS + 1);
    expect(s.count("kick")).toBe(0);
    // past the plan it is noise again: three strikes inside the window kick
    for (let n = 0; n < 3; n++) s.ask();
    expect(s.count("welcome")).toBe(JOIN_RESENDS + 1);
    expect(s.count("kick")).toBe(1);
  });
});
