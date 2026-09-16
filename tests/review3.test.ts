/**
 * Stage 56: the third review's findings, each pinned on the code it was found in.
 */
import { describe, expect, it } from "vitest";
import { Room, type Conn } from "../server/room";
import { MemoryAccountStore, devSeed, type AccountStore } from "../server/accounts";
import { decodeServerMessage, encodeInputs, encodeJoin, type NetInput } from "../shared/net/protocol";
import { lintMissionOrder } from "../shared/campaign/lint";
import type { MissionDef } from "../shared/campaign/missions";
import type { Account } from "../shared/progression/account";

const KIT = JSON.stringify({ primary: "lease_breaker", secondary: "shock_baton", attested: [] });

function conn() {
  const msgs: ReturnType<typeof decodeServerMessage>[] = [];
  const c: Conn = { send: (buf) => void msgs.push(decodeServerMessage(buf, () => null)), close: () => {} };
  return { conn: c, msgs, welcome: () => msgs.find((m) => m?.type === "welcome") as { type: "welcome"; playerId: number } | undefined };
}

/** the Workers' store answers later: every method returns a promise */
class AsyncStore implements AccountStore {
  readonly inner = new MemoryAccountStore(devSeed);
  loads: string[] = [];
  async load(id: string, name: string): Promise<Account> {
    this.loads.push(id);
    await Promise.resolve();
    return this.inner.load(id, name);
  }
  async save(a: Account): Promise<void> {
    await Promise.resolve();
    this.inner.save(a);
  }
}
const settle = () => new Promise((r) => setTimeout(r, 5));

describe("a wrong secret on an asynchronous store", () => {
  it("admits a real guest file, not a Promise, and saves nothing for a join that adopted nothing", async () => {
    const store = new AsyncStore();
    const owned = store.inner.load("owned", "OWNER");
    owned.secret = "the-real-one";
    const room = new Room({ ai: false, seed: 1, level: "drainage_yard", accounts: store, warmupSeconds: 1, roundSeconds: 5 });
    const c = conn();
    room.onOpen(c.conn);
    room.onMessage(c.conn, encodeJoin("INTRUDER", "", "owned", KIT, "", "wrong"));
    await settle();
    await settle();
    const w = c.welcome();
    expect(w).toBeDefined();
    const acc = room.accountOf(w!.playerId);
    expect(acc).not.toBeNull();
    expect(acc).not.toBeInstanceOf(Promise);
    expect(acc!.id.startsWith("guest:")).toBe(true);
    expect(acc!.wallet).toBeDefined(); // a Promise has no wallet; the old code would have thrown on the first settlement
    expect(store.loads.filter((id) => id.startsWith("guest:"))).toHaveLength(1);
    // the correct secret adopts nothing and therefore writes nothing at join
    const saves0 = store.inner.saves;
    const d = conn();
    room.onOpen(d.conn);
    room.onMessage(d.conn, encodeJoin("OWNER", "", "owned", KIT, "", "the-real-one"));
    await settle();
    await settle();
    expect(room.accountOf(d.welcome()!.playerId)?.id).toBe("owned");
    expect(store.inner.saves).toBe(saves0);
  });
});

describe("a gap is filled once, on the accepted path", () => {
  const input = (seq: number, extra: Partial<NetInput> = {}): NetInput => ({ tick: seq, seq, buttons: 1, yaw: 0, pitch: 0, px: 0, py: 0, pz: 0, viewTick: seq, viewFrac: 0, ...extra } as NetInput);
  it("a rejected input does not fill, and the next accepted one fills the gap exactly once", () => {
    const room = new Room({ ai: false, seed: 1, level: "drainage_yard", accounts: new MemoryAccountStore(devSeed), warmupSeconds: 1, roundSeconds: 5 });
    const c = conn();
    room.onOpen(c.conn);
    room.onMessage(c.conn, encodeJoin("A", "", "sandbox-gap", KIT, ""));
    room.onMessage(c.conn, encodeInputs([input(1)], 0));
    room.onMessage(c.conn, encodeInputs([input(2)], 0));
    // seq 7 is malformed (pitch past the pole) and is refused; seq 8 is fine
    room.onMessage(c.conn, encodeInputs([input(7, { pitch: 3 })], 0));
    room.onMessage(c.conn, encodeInputs([input(8)], 0));
    const st = room.stats().clients.find((x) => x.name === "A")!;
    expect(st.inputsRejected).toBe(1);
    expect(st.gapFilled).toBe(4); // 3..6 once; the old code filled 3..6 for seq 7 and then 4..7 again for seq 8
    expect(st.queue).toBe(3 + 4); // seq 1, 2, 8 and the four fillers — nothing twice
  });
});

describe("the campaign lint on a broken arc", () => {
  const m = (id: string, order: number, after?: string): MissionDef => ({ id, kind: "mission", order, title: id, level: "lease_row", fixer: "deacon", brief: "", objectives: [], reward: {}, wasps: 0, mechs: 0, requires: after ? { after } : undefined } as unknown as MissionDef);
  it("reports a requires.after that names no mission instead of throwing, and still orders the rest", () => {
    const out = lintMissionOrder([m("m1", 1), m("m2", 2, "m1-typo"), m("m3", 3, "m2"), m("m0", 0, "m3")]);
    expect(out.map((v) => v.rule)).toEqual(["after-names-a-mission", "arc-is-ordered"]);
  });
});
