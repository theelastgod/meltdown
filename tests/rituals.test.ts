/**
 * Stage 8 room rituals: the pre-match dossier carries identity only, a
 * Debt is written at settlement to the enemy who killed you most, it is
 * cleared (once, with a Wakelight credit under the pair cap) when you kill
 * them in a later match, a moniker is worn only if earned, and a Depth
 * crossing performs its Chapter rite.
 */
import { describe, expect, it } from "vitest";
import { Room, type Conn } from "../server/room";
import { devSeed, MemoryAccountStore } from "../server/accounts";
import { decodeServerMessage, encodeJoin, type SocialMsg } from "../shared/net/protocol";
import { SIM_HZ } from "../shared/sim/constants";
import { mechanicalLeaks } from "../shared/identity/identity";

function fakeConn() {
  const msgs: ReturnType<typeof decodeServerMessage>[] = [];
  const conn: Conn = {
    send: (buf) => {
      msgs.push(decodeServerMessage(buf, () => null));
    },
    close: () => {},
  };
  return {
    conn,
    msgs,
    social: () => msgs.filter((m) => m?.type === "social").map((m) => (m as { type: "social"; social: SocialMsg }).social),
    file: () => msgs.filter((m) => m?.type === "file").map((m) => (m as { type: "file"; file: { reason: string; ledger: string[]; identity?: { moniker: string | null; display: string; unlocked: string[]; debt: { display: string; kills: number } | null; chapters: number[] } } }).file),
  };
}

const loadout = { primary: "lease_breaker", secondary: "shock_baton", attested: [] };

function join(room: Room, name: string, account: string, identity?: unknown) {
  const c = fakeConn();
  room.onOpen(c.conn);
  room.onMessage(c.conn, encodeJoin(name, "", account, JSON.stringify(loadout), identity === undefined ? "" : JSON.stringify(identity)));
  return c;
}

const kill = (room: Room, killer: number, victim: number) => room.world.applyDamage("player", victim, 1000, killer, "lease_breaker", "shot");
const steps = (room: Room, seconds: number) => {
  for (let t = 0; t < SIM_HZ * seconds; t++) room.step();
};

describe("room — identity & rituals", () => {
  it("dossier at round start (identity only), Debt at settlement, Chapter I rite on a Depth-10 crossing", () => {
    const store = new MemoryAccountStore(devSeed);
    const room = new Room({ ai: false, seed: 3, level: "drainage_yard", accounts: store, warmupSeconds: 0.5, roundSeconds: 12 });
    const a = join(room, "ALPHA", "fresh-alpha");
    const b = join(room, "BRAVO", "fresh-bravo");
    const c = join(room, "CHARLIE", "rite-charlie");
    // cells balance ALPHA → 1, BRAVO → 2, CHARLIE → 1; CHARLIE holds node D so cell one wins
    const pc = room.world.players.get(3)!;
    pc.pos.x = 0;
    pc.pos.z = 17;
    room.world.players.get(2)!.pos.x = -20;
    room.world.players.get(2)!.pos.z = -20;
    steps(room, 0.6);
    // the dossier: every file, both cells, nothing mechanical
    const dossier = a.social().find((m) => m.kind === "dossier");
    expect(dossier?.kind).toBe("dossier");
    if (dossier?.kind !== "dossier") return;
    expect(dossier.entries.length).toBe(3);
    expect(dossier.entries.map((e) => e.display)).toEqual(["BLANK", "BLANK", "BLANK"]);
    expect(dossier.entries.map((e) => e.team).sort()).toEqual([1, 1, 2]);
    expect(dossier.entries.every((e) => e.chapter === 0 && !e.debt && e.moniker === null)).toBe(true);
    expect(mechanicalLeaks(dossier)).toEqual([]);
    expect(Object.keys(dossier.entries[0]!).sort()).toEqual(["chapter", "debt", "display", "glyph", "id", "moniker", "stamps", "team"]);
    // BRAVO closes ALPHA's file twice
    kill(room, 2, 1);
    steps(room, 4);
    kill(room, 2, 1);
    steps(room, 10);
    const st = room.stats();
    expect((st.match as { phase: string }).phase).toBe("results");
    const alpha = store.accounts.get("fresh-alpha")!;
    const bravo = store.accounts.get("fresh-bravo")!;
    const charlie = store.accounts.get("rite-charlie")!;
    expect(bravo.debt).toBeNull();
    expect(alpha.debt).toEqual({ account: "fresh-bravo", display: "BLANK", kills: 2 });
    expect(alpha.ledger.some((l) => l.startsWith("DEBT · BLANK · 2 FILES"))).toBe(true);
    const owed = a.social().find((m) => m.kind === "debt");
    expect(owed && owed.kind === "debt" && owed.event === "owed" && owed.id === 2 && owed.kills === 2).toBe(true);
    // the rite: CHARLIE crossed Depth 10
    expect(charlie.depth).toBeGreaterThanOrEqual(10);
    expect(charlie.chapters).toEqual([1]);
    const rite = c.social().find((m) => m.kind === "rite");
    expect(rite && rite.kind === "rite" && rite.chapter === 1 && rite.title === "LISTED" && rite.named === false).toBe(true);
    expect(st.clients.find((x) => x.name === "CHARLIE")!.identity.chapter).toBe(1);
    expect(a.social().every((m) => mechanicalLeaks(m).length === 0)).toBe(true);
    expect(c.social().every((m) => mechanicalLeaks(m).length === 0)).toBe(true);
    expect(st.social["dossier"]).toBe(3);
    expect(st.social["rite"]).toBe(1);
    // the join File carried the file's own identity: monikers earned, no Debt yet
    const joinFile = a.file().find((f) => f.reason === "join")!;
    expect(joinFile.identity?.unlocked).toEqual(["unlisted"]);
    expect(joinFile.identity?.debt).toBeNull();
    const settleFile = a.file().find((f) => f.reason === "settle")!;
    expect(settleFile.identity?.debt).toEqual({ display: "BLANK", glyph: expect.any(Number), kills: 2 });
    expect(settleFile.ledger.some((l) => l.startsWith("DEBT · BLANK"))).toBe(true);
  });

  it("the Debt is cleared once per round with +5 Wakelight, capped per pair per day; monikers are worn only if earned", () => {
    const store = new MemoryAccountStore(devSeed);
    const alpha = store.load("fresh-alpha", "ALPHA");
    const bravo = store.load("fresh-bravo", "BRAVO");
    alpha.debt = { account: "fresh-bravo", display: "BLANK", kills: 2 };
    alpha.counters["matches"] = 1; // TENANT earned
    const room = new Room({ ai: false, seed: 5, level: "drainage_yard", accounts: store, warmupSeconds: 0.5, roundSeconds: 12 });
    const a = join(room, "ALPHA", "fresh-alpha", { moniker: "tenant" });
    const b = join(room, "BRAVO", "fresh-bravo", { moniker: "named" }); // not earned
    steps(room, 0.6);
    const st0 = room.stats();
    const ia = st0.clients.find((x) => x.name === "ALPHA")!.identity;
    const ib = st0.clients.find((x) => x.name === "BRAVO")!.identity;
    expect(ia.moniker).toBe("tenant");
    expect(ia.display).toBe("TENANT");
    expect(ib.moniker).toBeNull();
    expect(ib.display).toBe("BLANK");
    expect(ia.debtTarget).toBe(2);
    // ALPHA was told at join that BRAVO has their number; the dossier flags BRAVO for ALPHA only
    const owed = a.social().find((m) => m.kind === "debt");
    expect(owed && owed.kind === "debt" && owed.event === "owed" && owed.id === 2).toBe(true);
    const da = a.social().find((m) => m.kind === "dossier");
    const db = b.social().find((m) => m.kind === "dossier");
    expect(da?.kind === "dossier" && da.entries.find((e) => e.id === 2)?.debt).toBe(true);
    expect(db?.kind === "dossier" && db.entries.every((e) => !e.debt)).toBe(true);
    // ALPHA settles it
    kill(room, 1, 2);
    steps(room, 0.1);
    const cleared = a.social().find((m) => m.kind === "debt" && m.event === "cleared");
    expect(cleared && cleared.kind === "debt" && cleared.credit === 5 && cleared.capped === false && cleared.id === 2).toBe(true);
    expect(alpha.debt).toBeNull();
    expect(alpha.wallet.wakelight).toBe(5);
    expect(alpha.counters["debtsCleared"]).toBe(1);
    expect(alpha.ledger.some((l) => l.startsWith("DEBT CLEARED · BLANK · +5 WAKELIGHT"))).toBe(true);
    expect(room.stats().clients.find((x) => x.name === "ALPHA")!.identity.debtTarget).toBe(-1);
    // a second kill in the same round settles nothing more
    steps(room, 4);
    kill(room, 1, 2);
    steps(room, 0.1);
    expect(a.social().filter((m) => m.kind === "debt" && m.event === "cleared").length).toBe(1);
    expect(alpha.wallet.wakelight).toBe(5);
    expect(bravo.wallet.wakelight).toBe(0);
    expect(a.social().every((m) => mechanicalLeaks(m).length === 0)).toBe(true);
  });

  it("the pair cap: a fourth clear in a day credits nothing (CAPPED) but still settles the Debt", () => {
    const store = new MemoryAccountStore(devSeed);
    const alpha = store.load("fresh-alpha", "ALPHA");
    store.load("fresh-bravo", "BRAVO");
    alpha.debt = { account: "fresh-bravo", display: "BLANK", kills: 1 };
    for (const day of [0, Math.floor(Date.now() / 86_400_000), Math.floor(performance.now() / 86_400_000)]) alpha.social[`pair:fresh-bravo:${day}`] = 3;
    const room = new Room({ ai: false, seed: 5, level: "drainage_yard", accounts: store, warmupSeconds: 0.5, roundSeconds: 12 });
    const a = join(room, "ALPHA", "fresh-alpha");
    join(room, "BRAVO", "fresh-bravo");
    steps(room, 0.6);
    kill(room, 1, 2);
    steps(room, 0.1);
    const cleared = a.social().find((m) => m.kind === "debt" && m.event === "cleared");
    expect(cleared && cleared.kind === "debt" && cleared.capped === true && cleared.credit === 0).toBe(true);
    expect(alpha.wallet.wakelight).toBe(0);
    expect(alpha.debt).toBeNull();
    expect(alpha.ledger.some((l) => l.startsWith("DEBT CLEARED · BLANK · CAPPED"))).toBe(true);
  });
});
