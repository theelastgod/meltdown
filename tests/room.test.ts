/**
 * The match room as the Ghostfile's gatekeeper: loadouts are validated
 * against the file at join, illegal ones are refused (never stripped), and
 * results settle XP/Scrip into the store.
 */
import { describe, expect, it } from "vitest";
import { Room, type Conn } from "../server/room";
import { devSeed, MemoryAccountStore } from "../server/accounts";
import { decodeServerMessage, encodeJoin, PROTOCOL_VERSION } from "../shared/net/protocol";
import { SIM_HZ } from "../shared/sim/constants";
import { readFileSync } from "node:fs";
import { SCHEMA } from "../server/schema";

function fakeConn() {
  const msgs: ReturnType<typeof decodeServerMessage>[] = [];
  let closed: string | null = null;
  const conn: Conn = {
    send: (buf) => {
      msgs.push(decodeServerMessage(buf, () => null));
    },
    close: (_c, reason) => {
      closed = reason;
    },
  };
  return {
    conn,
    msgs,
    get closed() {
      return closed;
    },
    kick: () => msgs.find((m) => m?.type === "kick") as { type: "kick"; reason: string } | undefined,
    file: () => msgs.filter((m) => m?.type === "file") as { type: "file"; file: { reason: string; depth: number; xp: number; scrip: number; ledger: string[]; loadout: { attested: string[]; keystone: string | null } } }[],
  };
}

function join(room: Room, name: string, account: string, loadout: unknown) {
  const c = fakeConn();
  room.onOpen(c.conn);
  room.onMessage(c.conn, encodeJoin(name, "", account, loadout === undefined ? "" : JSON.stringify(loadout)));
  return c;
}

const legal = { primary: "lease_breaker", secondary: "shock_baton", attested: ["slipfile", "static_skin", "quiet_ledger"], keystone: "debtless" };

describe("room — loadout validation at spawn", () => {
  const mk = () => new Room({ ai: false, seed: 3, accounts: new MemoryAccountStore(devSeed), warmupSeconds: 1, roundSeconds: 5 });

  it("admits a legal attestation and echoes the admitted loadout in the File message", () => {
    const room = mk();
    const c = join(room, "ALPHA", "sandbox-a", legal);
    expect(c.kick()).toBeUndefined();
    const f = c.file()[0]!.file;
    expect(f.reason).toBe("join");
    expect(f.depth).toBe(50);
    expect(f.loadout.attested).toEqual(["slipfile", "static_skin", "quiet_ledger"]);
    expect(f.loadout.keystone).toBe("debtless");
    expect(room.stats().players).toBe(1);
    const p = room.world.players.get(1)!;
    expect(p.mods.moveSpeed).toBeGreaterThan(1); // debtless
    expect(p.maxShield).toBe(0);
  });
  it("protocol v4 joins are refused with the version mismatch, not a loadout error", () => {
    const room = mk();
    const c = fakeConn();
    room.onOpen(c.conn);
    const buf = encodeJoin("OLD", "", "", "");
    new DataView(buf).setUint8(1, PROTOCOL_VERSION - 1);
    room.onMessage(c.conn, buf);
    expect(c.kick()?.reason).toMatch(/protocol/);
  });
  it("refuses eight attested nodes", () => {
    const room = mk();
    const c = join(room, "X", "sandbox-b", { ...legal, keystone: null, attested: ["slipfile", "static_skin", "contagion_rider", "long_lease", "quiet_ledger", "spite_clause", "collateral", "hair_trigger"] });
    expect(c.kick()?.reason).toMatch(/^LOADOUT REJECTED: attest-limit/);
    expect(room.stats().players).toBe(0);
  });
  it("refuses a disconnected attestation", () => {
    const room = mk();
    const c = join(room, "X", "sandbox-c", { ...legal, keystone: null, attested: ["slipfile", "wake_lung"] });
    expect(c.kick()?.reason).toMatch(/connected/);
  });
  it("refuses nodes the file does not own (a fresh Blank owns nothing)", () => {
    const room = mk();
    const c = join(room, "X", "fresh-1", { ...legal, keystone: null, attested: ["slipfile"] });
    expect(c.kick()?.reason).toMatch(/not-owned/);
  });
  it("refuses Depth-gated weapons for a fresh file", () => {
    const room = mk();
    const c = join(room, "X", "fresh-2", { primary: "phage", secondary: "shock_baton", attested: [] });
    expect(c.kick()?.reason).toMatch(/weapon-depth/);
  });
  it("refuses a Kernel Protocol smuggled in as an unknown field — refused, not stripped", () => {
    const room = mk();
    const c = join(room, "X", "sandbox-d", { ...legal, protocols: ["kp_redline"] });
    expect(c.kick()?.reason).toMatch(/unknown-field: field "protocols"/);
    expect(room.loadoutRejections.length).toBe(1);
  });
  it("a guest with no file and no loadout spawns the default build", () => {
    const room = mk();
    const c = join(room, "GUEST", "", undefined);
    expect(c.kick()).toBeUndefined();
    expect(c.file()[0]!.file.depth).toBe(1);
    expect(room.stats().players).toBe(1);
  });
  it("a room without a store still validates the default loadout and admits guests", () => {
    const room = new Room({ ai: false, seed: 3 });
    const c = join(room, "GUEST", "", undefined);
    expect(c.kick()).toBeUndefined();
    expect(room.stats().players).toBe(1);
  });
});

describe("room — settlement", () => {
  it("credits flips and node time during the round and pays XP/Scrip into the file at results", () => {
    const store = new MemoryAccountStore(devSeed);
    const room = new Room({ ai: false, seed: 3, accounts: store, warmupSeconds: 0.5, roundSeconds: 6 });
    const a = join(room, "ALPHA", "fresh-alpha", { primary: "lease_breaker", secondary: "shock_baton", attested: [] });
    const b = join(room, "BRAVO", "fresh-bravo", { primary: "lease_breaker", secondary: "shock_baton", attested: [] });
    // put ALPHA on node D and BRAVO in a corner; no inputs needed, presence is what the wake reads
    const pa = room.world.players.get(1)!;
    const pb = room.world.players.get(2)!;
    pa.pos.x = 0;
    pa.pos.z = 17;
    pb.pos.x = -20;
    pb.pos.z = -20;
    for (let t = 0; t < SIM_HZ * 8; t++) room.step();
    const st = room.stats();
    expect(st.match && (st.match as { phase: string }).phase).toBe("results");
    expect(st.settlements).toBe(2);
    const alpha = store.accounts.get("fresh-alpha")!;
    const bravo = store.accounts.get("fresh-bravo")!;
    expect(pa.stats.flips).toBeGreaterThanOrEqual(1);
    expect(pa.stats.nodeSeconds).toBeGreaterThan(3);
    expect(alpha.xp).toBeGreaterThan(bravo.xp); // objective play pays
    expect(alpha.xp).toBeGreaterThan(250 + 500); // participation + win + objective
    expect(alpha.wallet.scrip).toBeGreaterThan(0);
    expect(alpha.matches).toBe(1);
    expect(store.saves).toBe(2);
    const settle = a.file().find((f) => f.file.reason === "settle")!.file;
    expect(settle.ledger.some((l) => l.startsWith("MATCH 0001 · WOKE"))).toBe(true);
    expect(settle.xp).toBe(alpha.xp);
    const settleB = b.file().find((f) => f.file.reason === "settle")!.file;
    expect(settleB.ledger[0]).toMatch(/LEASED/);
  });
});

describe("player DO — D1 schema", () => {
  it("the self-healing schema in the DO matches server/schema.sql statement for statement", () => {
    const norm = (q: string) => q.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim().replace(/;$/, "");
    const file = readFileSync("server/schema.sql", "utf8").split(";").map(norm).filter(Boolean);
    expect(SCHEMA.map(norm)).toEqual(file);
  });
});
