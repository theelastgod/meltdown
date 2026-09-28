/**
 * Interest management in the city (Stage 706): each client is told about what is near it, what is
 * hunting it, what it hit, and its event's machines — and every other room sends what it always did.
 *
 * The rules are `shared/net/interest.ts`; the room applies them (`server/room.ts`, `RoomOptions.interest`)
 * and only the city asks (`server/city-room.ts`). These drive the real room with a clock that moves
 * with the ticks: a harness on the wall clock sends a room five seconds of inputs in a fraction of
 * one, the input-rate guard strikes every client out after ~95 of them, and whatever it then
 * measures is an empty room.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { Room, type Conn, type RoomOptions } from "../server/room";
import { createCityRoom, crowdSpawn, ROSTER_EVERY_TICKS } from "../server/city-room";
import { BODY_DUMMY, BODY_PLAYER, INTEREST, InterestSet, attackerKey, bodyKey, eventInterest, stickyFrom, type InterestBody } from "../shared/net/interest";
import { decodeServerMessage, encodeInputs, encodeJoin, encodeSnapshot, encodeWelcome, ENT_MECH, ENT_PROJECTILE, ENT_WASP, FX, Msg, type NetEvent, type RemotePlayerQ, type Snapshot } from "../shared/net/protocol";
import { INTERP_DELAY_TICKS, NetClient } from "../client/net/netclient";
import type { Transport } from "../client/net/transport";
import { GUN_RANGE } from "../client/gunfire";
import { SIM_HZ } from "../shared/sim/constants";
import { Btn } from "../shared/sim/input";
import { reviveMotion } from "../shared/sim/player";
import { levelById } from "../shared/sim/level";
import { v3 } from "../shared/math/vec3";
import type { SimEvent } from "../shared/sim/world";

const PK = (id: number) => bodyKey(BODY_PLAYER, id);
const WK = (id: number) => bodyKey(ENT_WASP, id);
const MK = (id: number) => bodyKey(ENT_MECH, id);
const at0 = { x: 0, z: 0 };

// ---------------------------------------------------------------------------------------------
describe("who is in view: the radius, its hysteresis and the cap", () => {
  const one = (s: InterestSet, key: number, x: number, tick = 0, extra: Partial<InterestBody> = {}) => s.select(at0, [{ key, x, z: 0, ...extra }], tick).has(key);

  it("a body comes into view at `enter`, stays until past `leave`, and needs `enter` again to come back", () => {
    const s = new InterestSet();
    expect(one(s, PK(2), INTEREST.enter + 0.5)).toBe(false);
    expect(one(s, PK(2), INTEREST.enter)).toBe(true);
    // on the line and a little beyond it: no blinking
    for (const d of [INTEREST.enter + 1, INTEREST.enter + 5, INTEREST.leave - 0.1, INTEREST.leave]) expect(one(s, PK(2), d), `at ${d} m`).toBe(true);
    expect(one(s, PK(2), INTEREST.leave + 0.1)).toBe(false);
    // out, it is the enter line again, not the leave line
    expect(one(s, PK(2), INTEREST.leave - 1)).toBe(false);
    expect(one(s, PK(2), INTEREST.enter + 1)).toBe(false);
    expect(one(s, PK(2), INTEREST.enter - 1)).toBe(true);
    expect(INTEREST.leave - INTEREST.enter).toBeGreaterThanOrEqual(8);
  });

  it("a file walking back and forth across the line is told once, not every snapshot", () => {
    const s = new InterestSet();
    let flips = 0;
    let was = false;
    for (let t = 0; t < 600; t++) {
      // ±4 m around the enter line, as a player idling on a corner would
      const d = INTEREST.enter + 4 * Math.sin(t * 0.3);
      const now = one(s, PK(3), d, t);
      if (now !== was) flips++;
      was = now;
    }
    expect(flips).toBe(1);
  });

  it("a body the room no longer offers (a charge gone off, a file gone) falls out of view", () => {
    const s = new InterestSet();
    s.select(at0, [{ key: PK(2), x: 10, z: 0 }, { key: bodyKey(ENT_PROJECTILE, 9), x: 5, z: 0 }], 0);
    expect(s.has(bodyKey(ENT_PROJECTILE, 9))).toBe(true);
    s.select(at0, [{ key: PK(2), x: 10, z: 0 }], 1);
    expect(s.has(bodyKey(ENT_PROJECTILE, 9))).toBe(false);
    expect(s.has(PK(2))).toBe(true);
  });

  it("`always` bodies are in view from anywhere; a `wide` one (an event's machine) from `eventEnter` to `eventLeave`", () => {
    const s = new InterestSet();
    expect(one(s, WK(1), 900, 0, { always: true })).toBe(true);
    const w = new InterestSet();
    expect(one(w, WK(4), INTEREST.eventEnter + 1, 0, { wide: true })).toBe(false);
    expect(one(w, WK(4), INTEREST.eventEnter - 1, 0, { wide: true })).toBe(true);
    expect(one(w, WK(4), INTEREST.eventLeave - 1, 0, { wide: true })).toBe(true);
    expect(one(w, WK(4), INTEREST.eventLeave + 1, 0, { wide: true })).toBe(false);
    // and the same machine, not an event's, is on the ordinary radius
    expect(one(new InterestSet(), WK(4), INTEREST.eventEnter - 1)).toBe(false);
  });

  it("a held body (it hurt you; you hit it) stays in view wherever it is, for `stickyTicks`, then is on the radius again", () => {
    const s = new InterestSet();
    s.hold(MK(2), 100 + INTEREST.stickyTicks);
    expect(one(s, MK(2), 400, 100)).toBe(true);
    expect(one(s, MK(2), 400, 100 + INTEREST.stickyTicks)).toBe(true);
    expect(one(s, MK(2), 400, 101 + INTEREST.stickyTicks)).toBe(false);
    // a shorter hold never cuts a longer one short
    s.hold(MK(2), 500);
    s.hold(MK(2), 300);
    expect(one(s, MK(2), 400, 450)).toBe(true);
  });

  it("no more than `maxPlayers` other files, nearest first; machines are not counted against it", () => {
    const s = new InterestSet();
    const files: InterestBody[] = Array.from({ length: 20 }, (_, i) => ({ key: PK(i + 1), x: 5 + i * 3, z: 0, player: true }));
    const wasps: InterestBody[] = Array.from({ length: 6 }, (_, i) => ({ key: WK(i + 1), x: 0, z: 10 + i }));
    const view = s.select(at0, [...files, ...wasps], 0);
    const seen = [...view].filter((k) => k < 65536);
    expect(seen.length).toBe(INTEREST.maxPlayers);
    expect(seen.sort((a, b) => a - b)).toEqual(files.slice(0, INTEREST.maxPlayers).map((f) => f.key));
    for (const w of wasps) expect(view.has(w.key)).toBe(true);
  });

  it("at the cap a file in view is not cut for a newcomer only a little nearer (the same hysteresis), but is for one much nearer", () => {
    const n = INTEREST.maxPlayers;
    const s = new InterestSet();
    const inView = Array.from({ length: n }, (_, i) => ({ key: PK(i + 1), x: 30 + i, z: 0, player: true }));
    s.select(at0, inView, 0);
    const far = inView[n - 1]!;
    const slightly: InterestBody = { key: PK(50), x: far.x - (INTEREST.leave - INTEREST.enter) / 2, z: 0, player: true };
    expect(s.select(at0, [...inView, slightly], 1).has(slightly.key)).toBe(false);
    expect(s.has(far.key)).toBe(true);
    const much: InterestBody = { key: PK(51), x: 2, z: 0, player: true };
    const v = s.select(at0, [...inView, much], 2);
    expect(v.has(much.key)).toBe(true);
    expect(v.has(far.key)).toBe(false);
  });

  it("an expired hold returns a nearby crowd to the player cap despite negative hysteresis ranks", () => {
    const s = new InterestSet();
    const files: InterestBody[] = Array.from({ length: INTEREST.maxPlayers + 1 }, (_, i) => ({ key: PK(i + 1), x: i + 1, z: 0, player: true }));
    const extra = files[INTEREST.maxPlayers]!;
    expect(s.select(at0, files, 0).size).toBe(INTEREST.maxPlayers);
    expect(s.has(extra.key)).toBe(false);

    // A friendly shot can temporarily reveal a ninth file. Already-visible files closer than
    // ten metres have negative distance ranks too; that must not give them an unlimited hold.
    s.hold(extra.key, INTEREST.stickyTicks);
    expect(s.select(at0, files, 1).has(extra.key)).toBe(true);
    expect(s.select(at0, files, INTEREST.stickyTicks).has(extra.key)).toBe(true);
    for (const tick of [INTEREST.stickyTicks + 1, INTEREST.stickyTicks + 60]) {
      const view = s.select(at0, files, tick);
      expect(view.size, `after the hold at tick ${tick}`).toBe(INTEREST.maxPlayers);
      expect(view.has(extra.key)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("what keeps a body in view, and which wire events go", () => {
  const ev = (e: Partial<SimEvent> & { type: SimEvent["type"] }): SimEvent => ({ tick: 1, playerId: 1, ...e }) as SimEvent;

  it("the sim's attacker ids read back to the bodies they are", () => {
    expect(attackerKey(4)).toBe(PK(4));
    expect(attackerKey(-(100 + 3))).toBe(WK(3));
    expect(attackerKey(-(200 + 2))).toBe(MK(2));
    expect(attackerKey(-1)).toBeNull();
  });

  it("the hurt hold what hurt them, the shooter holds what it hit, the killer what it killed, a mech's mark its mech", () => {
    expect(stickyFrom(ev({ type: "hurt", playerId: 5, by: -(100 + 3), damage: 5, kind: "shot" }))).toEqual([{ viewer: 5, key: WK(3) }]);
    expect(stickyFrom(ev({ type: "shot", playerId: 5, hits: [{ kind: "wasp", id: 2, damage: 9 }, { kind: "world", id: -1, damage: 0 }] } as never))).toEqual([{ viewer: 5, key: WK(2) }]);
    // a machine's shot at a file: the file holds the machine
    expect(stickyFrom(ev({ type: "shot", playerId: -(100 + 1), hits: [{ kind: "player", id: 6, damage: 5 }] } as never))).toEqual([{ viewer: 6, key: WK(1) }]);
    expect(stickyFrom(ev({ type: "kill", playerId: 5, victimKind: "mech", victimId: 1 } as never))).toEqual([{ viewer: 5, key: MK(1) }]);
    expect(stickyFrom(ev({ type: "mechBeam", playerId: 7, mechId: 2 } as never))).toEqual([{ viewer: 7, key: MK(2) }]);
    expect(stickyFrom(ev({ type: "kill", playerId: 5, victimKind: "dummy", victimId: 3 } as never))).toEqual([{ viewer: 5, key: bodyKey(BODY_DUMMY, 3) }]);
    // your own blast is not somebody to keep in view
    expect(stickyFrom(ev({ type: "hurt", playerId: 5, by: 5, damage: 5, kind: "explosion" }))).toEqual([]);
  });

  it("the feed always goes; gunfire and blasts go by who and where", () => {
    const me = 3;
    const view = new Set([PK(4)]);
    const shot = (playerId: number, fx: number, tx = fx, extra: Partial<NetEvent> = {}): NetEvent => ({ type: "shot", playerId, weapon: 1, fx, fy: 1, fz: 0, tx, ty: 1, tz: 0, hitKind: 1, victimId: 255, pierce: 0, ...extra }) as NetEvent;
    for (const e of [{ type: "kill", playerId: 9, victimKind: 2, victimId: 1, ttkTicks: 1, weapon: 1 }, { type: "death", playerId: 9, killerId: 201 }, { type: "join", playerId: 9, name: "Z" }, { type: "leave", playerId: 9 }] as NetEvent[]) expect(eventInterest(e, me, at0, view), e.type).toBe(true);
    expect(eventInterest(shot(me, 900), me, at0, view), "my own shot").toBe(true);
    expect(eventInterest(shot(4, 60), me, at0, view), "a file in view").toBe(true);
    expect(eventInterest(shot(9, 30), me, at0, view), "a file out of view (cut by the cap), even near").toBe(false);
    expect(eventInterest(shot(9, 900, 900, { hitKind: 3, victimId: me }), me, at0, view), "a shot that hit me, from anywhere").toBe(true);
    expect(eventInterest(shot(201, INTEREST.hearing - 1), me, at0, view, true), "a machine within hearing").toBe(true);
    expect(eventInterest(shot(201, 500, INTEREST.hearing - 1), me, at0, view, true), "a machine's round landing within hearing").toBe(true);
    expect(eventInterest(shot(201, INTEREST.hearing + 1), me, at0, view, true), "a machine out of hearing").toBe(false);
    const fx = (kind: number, playerId: number, x: number): NetEvent => ({ type: "fx", kind, playerId, x, y: 0, z: 0, a: 1, b: 0 });
    expect(eventInterest(fx(FX.explode, 9, 50), me, at0, view)).toBe(true);
    expect(eventInterest(fx(FX.explode, 9, INTEREST.hearing + 5), me, at0, view)).toBe(false);
    expect(eventInterest(fx(FX.explode, me, 900), me, at0, view), "my own charge, anywhere").toBe(true);
    expect(eventInterest(fx(FX.hurt, me, 0), me, at0, view)).toBe(true);
    expect(eventInterest(fx(FX.hurt, 4, 0), me, at0, view), "someone else's hurt is never acted on").toBe(false);
    expect(eventInterest(fx(FX.swap, 4, 0), me, at0, view)).toBe(true);
    expect(eventInterest(fx(FX.swap, 9, 0), me, at0, view)).toBe(false);
    expect(eventInterest(fx(FX.waspDeath, 9, 0), me, at0, view), "the district's own announcements").toBe(true);
  });

  it("gunfire is sent as far as the client hears it", () => {
    expect(INTEREST.hearing).toBeGreaterThanOrEqual(GUN_RANGE);
  });

  it("shot interest distinguishes machines from real players sharing high wire ids", () => {
    const shot = (x: number, extra: Partial<NetEvent> = {}): NetEvent => ({ type: "shot", playerId: 201, weapon: 1, fx: x, fy: 1, fz: 0, tx: x + 1, ty: 1, tz: 0, hitKind: 1, victimId: 255, pierce: 0, ...extra }) as NetEvent;
    expect(eventInterest(shot(50), 1, at0, new Set()), "a real high-id file out of view").toBe(false);
    expect(eventInterest(shot(50), 1, at0, new Set(), true), "a machine within hearing").toBe(true);
    expect(eventInterest(shot(500), 201, at0, new Set(), true), "a distant machine is not the receiver's own shot").toBe(false);
    expect(eventInterest(shot(500), 1, at0, new Set([PK(201)]), true), "a distant machine is not a visible file's shot").toBe(false);
    expect(eventInterest(shot(500, { hitKind: 3, victimId: 1 }), 1, at0, new Set(), true), "a machine's hit on me still arrives").toBe(true);
    expect(eventInterest(shot(500), 201, at0, new Set()), "my real shot still arrives").toBe(true);
    expect(eventInterest(shot(50), 1, at0, new Set([PK(201)])), "a visible high-id file still arrives").toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
/**
 * The wire of every room that is not a city, before and after (Stage 706). Each hash is every
 * snapshot byte four (three) moving, turning, firing clients were sent, in order, taken from the
 * code before this stage and again after it: they did not move. A match on drainage_yard with its
 * AI and a live wake (nodes, dummies, shots); THE RUN; and a PvE room with every city option but the
 * city's hooks, so the flag is the only thing that turns filtering on.
 */
const MATCH_WIRE = { hash: "f5d436dabe33fc7d", bytes: 247040, snaps: 720 };
const RUN_WIRE = { hash: "8d5653aa658ac19b", bytes: 136328, snaps: 450 };
const PVE_WIRE = { hash: "926cdddf78fa2e72", bytes: 136328, snaps: 450 };

function wire(opts: RoomOptions, n: number, seconds: number): { hash: string; bytes: number; snaps: number } {
  let clock = 1_700_000_000_000;
  const room = new Room({ ...opts, now: () => clock });
  const h = createHash("sha256");
  let bytes = 0;
  let snaps = 0;
  const cs = Array.from({ length: n }, (_, i) => {
    const m = { i, seq: 0, ack: 0, conn: { send: (_b: ArrayBuffer) => {}, close: () => {} } };
    m.conn.send = (buf: ArrayBuffer) => {
      const v = new DataView(buf);
      if (v.getUint8(0) !== Msg.Snapshot) return;
      m.ack = Math.max(m.ack, v.getUint32(1, true));
      h.update(`${m.i}:`);
      h.update(Buffer.from(buf));
      bytes += buf.byteLength;
      snaps++;
    };
    room.onOpen(m.conn as never);
    room.onMessage(m.conn as never, encodeJoin(`P${i}`, "", "", ""));
    return m;
  });
  for (let t = 0; t < seconds * SIM_HZ; t++) {
    for (const m of cs) room.onMessage(m.conn as never, encodeInputs([{ seq: ++m.seq, tick: room.tick, buttons: Btn.Forward | (t % 50 < 25 ? Btn.Left : Btn.Right) | (t % 9 === m.i ? Btn.Fire : 0) | (t % 120 < 10 ? Btn.Sprint : 0), yaw: Math.sin(t * 0.03 + m.i) * 3, pitch: Math.cos(t * 0.02) * 0.2, viewTick: Math.max(0, room.tick - 6), viewFrac: 0.5, px: 0, py: 0, pz: 0 }], m.ack));
    room.step();
    clock += 1000 / SIM_HZ;
  }
  return { hash: h.digest("hex").slice(0, 16), bytes, snaps };
}

describe("every room that is not a city is byte-for-byte what it was", () => {
  it("a match room's snapshots are the bytes they were before interest management existed", () => {
    expect(wire({ ai: true, seed: 11, level: "drainage_yard", warmupSeconds: 1, roundSeconds: 600 }, 4, 6)).toEqual(MATCH_WIRE);
  });
  it("THE RUN's, and a PvE room with every city option but the city's own, likewise", () => {
    expect(wire({ ai: true, seed: 12, level: "lease_row", run: true, wakePhase: "off" }, 3, 5)).toEqual(RUN_WIRE);
    expect(wire({ ai: true, seed: 13, level: "lease_row", wakePhase: "off", pvp: false, arrivalGrace: true }, 3, 5)).toEqual(PVE_WIRE);
  });
  it("only the city asks: a room is unfiltered unless told, and a match room with files 150 m apart still sends each the other", { timeout: 60_000 }, () => {
    expect(new Room({ ai: false, seed: 1 }).opts.interest).toBeNull();
    expect(createCityRoom({ district: "lease_row", seed: 1 }).room.opts.interest).not.toBeNull();
    const r = new Room({ ai: false, seed: 1, level: "lease_row", wakePhase: "off" });
    const a = client(r, "A"), b = client(r, "B");
    place(r, a.id, -75, -75);
    place(r, b.id, 75, 75);
    step(r, 4);
    expect(lastSnap(a).players.map((p) => p.id)).toEqual([b.id]);
    expect(r.inViewOf(a.id)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
/** each room's clock, moved on with its ticks by `step` (the input-rate guard counts inputs a wall-clock second) */
const clocks = new WeakMap<Room, { t: number }>();
function city(district = "lease_row", opts: Omit<Parameters<typeof createCityRoom>[0], "district"> = {}) {
  const clk = { t: 1_000_000 };
  const h = createCityRoom({ district, seed: 3, now: () => clk.t, ...opts });
  clocks.set(h.room, clk);
  return h;
}

interface Client {
  id: number;
  conn: Conn;
  msgs: NonNullable<ReturnType<typeof decodeServerMessage>>[];
  snaps: Snapshot[];
  seq: number;
}
/** A client that decodes what it is sent against the baselines it was sent, and acks the newest. */
function client(room: Room, name: string, query?: URLSearchParams): Client {
  const base = new Map<number, Snapshot>();
  const c: Client = { id: -1, conn: null as never, msgs: [], snaps: [], seq: 0 };
  c.conn = {
    send: (buf) => {
      const m = decodeServerMessage(buf, (t) => base.get(t) ?? null);
      if (!m) return;
      c.msgs.push(m);
      if (m.type === "welcome") c.id = m.playerId;
      if (m.type === "snapshot") {
        base.set(m.snapshot.tick, m.snapshot);
        c.snaps.push(m.snapshot);
      }
    },
    close: () => {},
  };
  room.onOpen(c.conn, query);
  room.onMessage(c.conn, encodeJoin(name, "", "", ""));
  return c;
}
const lastSnap = (c: Client): Snapshot => c.snaps[c.snaps.length - 1]!;
/** every client sends one still input a tick (off the arrival grace, acking what it has) and the room steps */
function step(room: Room, ticks: number, cs: Client[] = []): void {
  for (let t = 0; t < ticks; t++) {
    for (const c of cs) room.onMessage(c.conn, encodeInputs([{ seq: ++c.seq, tick: room.tick, buttons: 0, yaw: 0, pitch: 0, viewTick: room.tick, viewFrac: 0, px: 0, py: 0, pz: 0 }], c.snaps.length ? lastSnap(c).tick : 0));
    room.step();
    const clk = clocks.get(room);
    if (clk) clk.t += 1000 / SIM_HZ;
  }
}
function place(room: Room, id: number, x: number, z: number): void {
  reviveMotion(room.world.players.get(id)!, { pos: v3(x, 0, z), yaw: 0 });
}
/** hold a wasp where it is put: on its one waypoint, not chasing anyone */
function pin(room: Room, id: number, x: number, z: number, y = 4): void {
  const w = room.world.wasps.find((q) => q.id === id)!;
  w.pos = v3(x, y, z);
  w.waypoints = [v3(x, y, z)];
  w.wp = 0;
  w.state = "patrol";
  w.targetId = -1;
}

describe("the city tells each client what is near it", () => {
  // Two hundred admissions exercise lifetime id allocation; this is not a wall-clock benchmark.
  it("a long-lived city filters an unseen real player's gunfire after admissions reach id 201", { timeout: 60_000 }, () => {
    const h = city("lease_row", { rejoinGraceSeconds: 0 });
    h.quietEvents(300);
    h.empDistrict(300);
    const observer = client(h.room, "OBSERVER");
    // The room cap is concurrent seats, not lifetime joins: expired seats advance the allocator.
    for (let id = 2; id < 201; id++) {
      const visitor = client(h.room, "VISITOR");
      expect(visitor.id).toBe(id);
      h.room.onClose(visitor.conn);
      step(h.room, 2, [observer]);
    }
    const shooter = client(h.room, "SHOOTER");
    expect(shooter.id).toBe(201);
    expect(h.room.playerIds().length).toBe(2);
    place(h.room, observer.id, -80, 83);
    place(h.room, shooter.id, 10, 83);
    step(h.room, 2, [observer, shooter]);
    expect(lastSnap(observer).players).toEqual([]);

    // Fire upwards so this checks the gunfire policy, without hitting a body and making it sticky.
    h.room.onMessage(shooter.conn, encodeInputs([{ seq: ++shooter.seq, tick: h.room.tick, buttons: Btn.Fire, yaw: 0, pitch: -1.5, viewTick: h.room.tick, viewFrac: 0, px: 0, py: 0, pz: 0 }], lastSnap(shooter).tick));
    step(h.room, 2, [observer]);
    expect(lastSnap(shooter).events.some((e) => e.type === "shot" && e.playerId === shooter.id), "the real shot was fired").toBe(true);
    expect(lastSnap(observer).events.some((e) => e.type === "shot" && e.playerId === shooter.id), "the invisible file's shot is filtered").toBe(false);

    // Pass machine events through the real room's conversion and fanout: both encode to the same
    // wire id as this player. A near shot is heard; a distant shot is not mistaken for their own.
    const machineShot = (x: number): SimEvent => ({ type: "shot", tick: h.room.tick + 1, playerId: -101, weapon: "wasp", from: v3(x, 2, 83), to: v3(x + 1, 2, 83), hit: { kind: "none", id: -1, damage: 0 }, hits: [], nearMiss: -1, rewindTicks: 0, pierce: false });
    const drain = vi.spyOn(h.room.world, "drainEvents").mockReturnValueOnce([machineShot(10), machineShot(500)]);
    step(h.room, 2, [observer, shooter]);
    drain.mockRestore();
    for (const c of [observer, shooter]) {
      const shots = lastSnap(c).events.filter((e) => e.type === "shot");
      expect(shots.map((e) => e.playerId)).toEqual([201]);
      expect(shots.map((e) => e.fx)).toEqual([10]);
    }
  });

  it("a file out of range is not in the snapshot, comes in at `enter`, and stays until past `leave`", () => {
    const h = city();
    const a = client(h.room, "A"), b = client(h.room, "B");
    place(h.room, a.id, -80, 0);
    place(h.room, b.id, 60, 0);
    step(h.room, 4, [a, b]);
    expect(lastSnap(a).players.map((p) => p.id)).toEqual([]);
    expect(lastSnap(b).players.map((p) => p.id)).toEqual([]);
    place(h.room, b.id, -80 + INTEREST.enter - 1, 0);
    step(h.room, 4, [a, b]);
    expect(lastSnap(a).players.map((p) => p.id)).toEqual([b.id]);
    expect(lastSnap(b).players.map((p) => p.id)).toEqual([a.id]);
    place(h.room, b.id, -80 + INTEREST.leave - 1, 0);
    step(h.room, 4, [a, b]);
    expect(lastSnap(a).players.map((p) => p.id), "inside the hysteresis band").toEqual([b.id]);
    place(h.room, b.id, -80 + INTEREST.leave + 2, 0);
    step(h.room, 4, [a, b]);
    expect(lastSnap(a).players.map((p) => p.id)).toEqual([]);
  });

  it("a wasp or mech far off is not sent; one hunting this client is, from anywhere; so is the charge it threw", () => {
    const h = city();
    const a = client(h.room, "A");
    // the north-west corner; LEASE ROW's mechs walk the south
    const me = { x: -80, z: 80 };
    const w = h.room.world.wasps[0]!;
    const m = h.room.world.mechs[h.room.world.mechs.length - 1]!;
    const put = (hunt: boolean) => {
      place(h.room, a.id, me.x, me.z);
      pin(h.room, w.id, 80, 80);
      if (hunt) {
        w.state = "chase";
        w.targetId = a.id;
        m.targetId = a.id;
      } else m.targetId = -1;
    };
    for (let t = 0; t < 4; t++) {
      put(false);
      step(h.room, 1, [a]);
    }
    const ents = () => lastSnap(a).entities.map((e) => bodyKey(e.kind, e.id));
    expect(Math.hypot(m.pos.x - me.x, m.pos.z - me.z)).toBeGreaterThan(INTEREST.leave);
    expect(ents()).not.toContain(WK(w.id));
    expect(ents()).not.toContain(MK(m.id));
    // it has this client in its sights: the wasp chasing it, the mech locked on. The room reads both
    // at the snapshot, after the sim has stepped (and after the city's hook), so that is where the
    // mech's lock is set: its own AI would drop a lock on a file it cannot see
    const orig = h.room.opts.hooks.afterStep!;
    h.room.opts.hooks.afterStep = (r, evs) => {
      orig(r, evs);
      m.targetId = a.id;
    };
    for (let t = 0; t < 2; t++) {
      put(true);
      step(h.room, 1, [a]);
    }
    h.room.opts.hooks.afterStep = orig;
    expect(Math.hypot(w.pos.x - me.x, w.pos.z - me.z)).toBeGreaterThan(INTEREST.leave);
    expect(ents(), "the wasp hunting this client").toContain(WK(w.id));
    expect(ents(), "the mech with this client in its light").toContain(MK(m.id));
    // and a charge this client threw, wherever it has got to
    const pr = { id: 77, kind: "frag", owner: a.id, pos: v3(80, 1, -80), vel: v3(0, 0, 0), fuse: 9, gravity: 0, bounce: 0, stuck: false, armed: 0, radius: 4, damage: 0, edgeDamage: 0, direct: 0, proximity: 0 };
    const other = { ...pr, id: 78, owner: 999, pos: v3(80, 1, -79) };
    h.room.world.projectiles.push(pr as never, other as never);
    step(h.room, 2, [a]);
    expect(ents()).toContain(bodyKey(ENT_PROJECTILE, 77));
    expect(ents()).not.toContain(bodyKey(ENT_PROJECTILE, 78));
  });

  it("anything that hurt this client stays in its view, wherever it is, for `stickyTicks`", () => {
    const h = city();
    const a = client(h.room, "A");
    place(h.room, a.id, -80, -80);
    const w = h.room.world.wasps[0]!;
    pin(h.room, w.id, 80, 80);
    step(h.room, 4, [a]);
    expect(h.room.inViewOf(a.id)!.has(WK(w.id))).toBe(false);
    h.room.world.applyDamage("player", a.id, 1, -(100 + w.id), "wasp", "shot");
    step(h.room, 2, [a]);
    expect(h.room.inViewOf(a.id)!.has(WK(w.id)), "the wasp that just shot this client, 226 m off").toBe(true);
    expect(lastSnap(a).entities.some((e) => e.kind === ENT_WASP && e.id === w.id)).toBe(true);
    for (let t = 0; t < INTEREST.stickyTicks + 4; t++) {
      pin(h.room, w.id, 80, 80);
      step(h.room, 1, [a]);
    }
    expect(h.room.inViewOf(a.id)!.has(WK(w.id)), "and out again once the hold has run").toBe(false);
  });

  it("a public event's machines: from anywhere to a file taking part, from `eventEnter` to one that is not", () => {
    const h = city();
    const [a, b, c] = [client(h.room, "A"), client(h.room, "B"), client(h.room, "C")];
    step(h.room, 2, [a, b, c]);
    h.startEvent("intercept");
    step(h.room, 2, [a, b, c]);
    const ev = h.events.current!;
    expect(ev.kind).toBe("intercept");
    const convoy = ev.targets[0]!;
    const plain = h.room.world.wasps.find((w) => !h.events.lent.has(w.id))!;
    expect(h.events.lent.has(convoy)).toBe(true);
    // A takes part (it is on the list), 160 m off; B is not, as far; C is not, within the event's reach
    const put = () => {
      ev.participants.clear();
      ev.participants.set(`#${a.id}`, a.id);
      pin(h.room, convoy, 80, 80);
      pin(h.room, plain.id, 80, 75);
      place(h.room, a.id, -80, 80);
      place(h.room, b.id, -80, 75);
      place(h.room, c.id, 80 - (INTEREST.eventEnter - 5), 80);
    };
    // long enough for anything the arrivals were shot by on the way in to have let go
    for (let t = 0; t < INTEREST.stickyTicks + 4; t++) {
      put();
      step(h.room, 1, [a, b, c]);
    }
    const sees = (k: Client, id: number) => lastSnap(k).entities.some((e) => e.kind === ENT_WASP && e.id === id);
    expect(h.events.takesPart(a.id, null)).toBe(true);
    expect(sees(a, convoy), "a participant, 226 m off").toBe(true);
    expect(sees(b, convoy), "a file not taking part, as far").toBe(false);
    expect(sees(c, convoy), "a file not taking part, within the event's reach").toBe(true);
    expect(sees(c, plain.id), "an ordinary wasp as far off is not an event's").toBe(false);
    expect(sees(a, plain.id)).toBe(false);
  });

  it("a file out of view is not heard firing; a file in view is, and the shooter hears its own", () => {
    const h = city();
    const [a, b, c] = [client(h.room, "A"), client(h.room, "B"), client(h.room, "C")];
    for (let t = 0; t < 120; t++) {
      place(h.room, a.id, -80, 80);
      place(h.room, b.id, 60, -80);
      place(h.room, c.id, 80, -80);
      for (const k of [a, b, c]) h.room.onMessage(k.conn, encodeInputs([{ seq: ++k.seq, tick: h.room.tick, buttons: k === b && t % 15 === 0 ? Btn.Fire : 0, yaw: 0, pitch: 0, viewTick: h.room.tick, viewFrac: 0, px: 0, py: 0, pz: 0 }], k.snaps.length ? lastSnap(k).tick : 0));
      h.room.step();
      clocks.get(h.room)!.t += 1000 / SIM_HZ;
    }
    const shotsBy = (k: Client, id: number) => k.snaps.flatMap((s) => s.events).filter((e) => e.type === "shot" && e.playerId === id).length;
    expect(shotsBy(b, b.id), "the shooter hears its own").toBeGreaterThan(3);
    expect(shotsBy(c, b.id), "a file 20 m off, in view").toBe(shotsBy(b, b.id));
    expect(shotsBy(a, b.id), "a file 200 m off, out of view").toBe(0);
  });

  it("the kill feed, joins and leaves reach a client whatever it can see", () => {
    const h = city();
    const a = client(h.room, "A");
    place(h.room, a.id, -80, -80);
    step(h.room, 2, [a]);
    const b = client(h.room, "B");
    place(h.room, b.id, 80, 80);
    step(h.room, 2, [a, b]);
    const w = h.room.world.wasps[0]!;
    pin(h.room, w.id, 80, 80);
    h.room.world.applyDamage("wasp", w.id, 999, b.id, "lease_breaker", "shot");
    step(h.room, 2, [a, b]);
    const evs = a.snaps.flatMap((s) => s.events);
    expect(lastSnap(a).players).toEqual([]);
    expect(evs.some((e) => e.type === "join" && e.playerId === b.id)).toBe(true);
    expect(evs.some((e) => e.type === "kill" && e.playerId === b.id && e.victimId === w.id)).toBe(true);
  });
});

describe("the roster: who is in the city, without where", () => {
  it("every client is told everyone in the room, names and tags, including files it cannot see, and again when one leaves", () => {
    const h = city("lease_row", { rejoinGraceSeconds: 1 });
    const a = client(h.room, "ALPHA"), b = client(h.room, "BRAVO"), c = client(h.room, "CHARLIE");
    place(h.room, a.id, -80, -80);
    place(h.room, b.id, 80, 80);
    place(h.room, c.id, 80, -80);
    step(h.room, 4, [a, b, c]);
    const roster = (k: Client) => [...k.msgs].reverse().find((m) => m.type === "cityRoster");
    const names = (k: Client) => {
      const r = roster(k);
      return r?.type === "cityRoster" ? r.cityRoster.players.map((p) => p.name).sort() : null;
    };
    expect(lastSnap(a).players).toEqual([]);
    expect(names(a)).toEqual(["ALPHA", "BRAVO", "CHARLIE"]);
    const r = roster(a);
    expect(r?.type === "cityRoster" && r.cityRoster.players.every((p) => Object.keys(p).sort().join() === "id,name,tag")).toBe(true);
    h.room.onClose(c.conn);
    step(h.room, 2 * SIM_HZ, [a, b]);
    expect(names(a)).toEqual(["ALPHA", "BRAVO"]);
    // and every ten seconds with no change, for a client that relinked in between
    const before = a.msgs.filter((m) => m.type === "cityRoster").length;
    step(h.room, ROSTER_EVERY_TICKS, [a, b]);
    expect(a.msgs.filter((m) => m.type === "cityRoster").length).toBe(before + 1);
    // a match room never sends one
    const plain = new Room({ ai: false, seed: 1 });
    const x = client(plain, "X");
    step(plain, 4, [x]);
    expect(x.msgs.some((m) => m.type === "cityRoster")).toBe(false);
  });
});

describe("a file that walks in finds somebody", () => {
  it("without a gate it stands at the spawn nearest a file already in the street, in that file's view", () => {
    const h = city();
    const a = client(h.room, "ALPHA");
    step(h.room, 2, [a]);
    const b = client(h.room, "BRAVO");
    step(h.room, 2, [a, b]);
    const pa = h.room.world.players.get(a.id)!.pos, pb = h.room.world.players.get(b.id)!.pos;
    // the room's turn-taking alone put the first two files into LEASE ROW 168 m apart
    const L = levelById("lease_row");
    expect(Math.hypot(L.spawns[0]!.pos.x - L.spawns[1]!.pos.x, L.spawns[0]!.pos.z - L.spawns[1]!.pos.z)).toBeGreaterThan(INTEREST.leave);
    const d = Math.hypot(pa.x - pb.x, pa.z - pb.z);
    expect(d).toBeLessThan(INTEREST.enter);
    expect(d).toBeGreaterThan(2);
    expect(lastSnap(a).players.map((p) => p.id)).toEqual([b.id]);
    expect(lastSnap(b).players.map((p) => p.id)).toEqual([a.id]);
  });

  it("the rule: nobody there keeps the room's spawn; never on top of a file; never further than it already was", () => {
    const L = levelById("lease_row");
    expect(crowdSpawn(L, [], { x: 0, z: 0 })).toBeNull();
    const s = L.spawns[0]!.pos;
    const got = crowdSpawn(L, [{ x: s.x, z: s.z }], { x: -s.x, z: -s.z })!;
    expect(Math.hypot(got.pos.x - s.x, got.pos.z - s.z)).toBeGreaterThanOrEqual(3);
    // already beside somebody: stays
    expect(crowdSpawn(L, [{ x: s.x + 2, z: s.z }], { x: s.x + 4, z: s.z })).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
describe("hits and lag compensation use the world, not the snapshot", () => {
  it("the rewind holds every file in the district, in view of the shooter or not", () => {
    const h = city();
    const a = client(h.room, "A"), b = client(h.room, "B");
    place(h.room, a.id, -80, -80);
    place(h.room, b.id, 80, 80);
    step(h.room, 4, [a, b]);
    expect(h.room.inViewOf(a.id)!.has(PK(b.id))).toBe(false);
    const poses = (h.room as unknown as { rewindFor(s: number, t: number, f: number): ReadonlyMap<number, unknown> | null }).rewindFor(a.id, h.room.tick - 2, 0);
    expect(poses?.has(b.id)).toBe(true);
  });

  it("a round fired at a wasp the shooter was not told about still lands, and the wasp is then held in its view", () => {
    const h = city();
    const a = client(h.room, "A");
    step(h.room, 2, [a]);
    const p = h.room.world.players.get(a.id)!;
    const w = h.room.world.wasps[0]!;
    // down the north street, 80 m: never inside `enter`, well inside the Lease Breaker's reach; the
    // wasp at eye height, so the aim is level and the round's cone is all that decides it
    const from = { x: -83, z: 83 };
    const target = { x: -3, y: 2.07, z: 83 };
    let hit: SimEvent | undefined;
    for (let t = 0; t < 900 && !hit; t++) {
      place(h.room, a.id, from.x, from.z);
      p.grounded = true;
      pin(h.room, w.id, target.x, target.z, target.y);
      const aim = h.room.world.aimAt(p, v3(target.x, target.y - 0.45, target.z));
      h.room.onMessage(a.conn, encodeInputs([{ seq: ++a.seq, tick: h.room.tick, buttons: t % 30 === 0 ? Btn.Fire : 0, yaw: aim.yaw, pitch: aim.pitch, viewTick: h.room.tick, viewFrac: 0, px: 0, py: 0, pz: 0 }], lastSnap(a).tick));
      const seen = h.room.inViewOf(a.id)!.has(WK(w.id));
      const spy: SimEvent[] = [];
      const orig = h.room.opts.hooks.afterStep!;
      h.room.opts.hooks.afterStep = (r, evs) => {
        spy.push(...evs);
        orig(r, evs);
      };
      h.room.step();
      clocks.get(h.room)!.t += 1000 / SIM_HZ;
      h.room.opts.hooks.afterStep = orig;
      const s = spy.find((e) => e.type === "shot" && e.playerId === a.id && e.hits.some((x) => x.kind === "wasp" && x.id === w.id));
      if (s) {
        expect(seen, "the wasp was out of the shooter's view when it fired").toBe(false);
        hit = s;
      }
    }
    expect(hit, "the round found the wasp 80 m off").toBeDefined();
    pin(h.room, w.id, target.x, target.z, target.y);
    step(h.room, 2, [a]);
    expect(h.room.inViewOf(a.id)!.has(WK(w.id)), "and the wasp it hit is now in view").toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
/**
 * The client side: a file missing from a snapshot is gone, and one that comes back is drawn where it
 * is. `NetClient` is fed real encoded snapshots through a transport with nothing on the other end.
 */
describe("the client: out of view is gone, and back in view starts where it is", () => {
  let now = 0;
  afterEach(() => vi.restoreAllMocks());

  function harness() {
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const t: Transport = { send: () => {}, close: () => t.onClose?.("closed"), onMessage: null, onOpen: null, onClose: null, open: true };
    const net = new NetClient(t, "ME");
    t.onMessage!(encodeWelcome(1, 100, "tok", "lease_row", 1, "campaign"));
    let prev: Snapshot | null = null;
    const feed = (tick: number, players: RemotePlayerQ[]) => {
      const s = { tick, serverTimeMs: 0, local: null, players, dummies: [], entities: [], match: null, events: [] };
      // deltaed against the last one, as the room does for a client that acked it
      t.onMessage!(encodeSnapshot(s, prev));
      prev = { ...s, bytes: 0 };
      now = ((tick - 100) * 1000) / SIM_HZ;
    };
    return { net, feed, close: () => net.close() };
  }
  const q = (id: number, x: number): RemotePlayerQ => ({ id, slot: 1, team: 1, shield: 0, x, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, health: 100, ammo: 10, alive: true, grounded: true, stance: 0, height: 1.8, name: "BRAVO", tag: "" });

  it("a file that leaves view is gone the next snapshot: no body standing where it was", () => {
    const { net, feed, close } = harness();
    for (let k = 0; k < 10; k++) feed(102 + k * 2, [q(2, k)]);
    expect(net.remoteViews().map((v) => v.id)).toEqual([2]);
    feed(122, []);
    expect(net.remoteViews()).toEqual([]);
    close();
  });

  it("a file that comes back is drawn at its new place, not slid there from the old one", () => {
    const { net, feed, close } = harness();
    for (let k = 0; k < 10; k++) feed(102 + k * 2, [q(2, 0)]);
    feed(122, []);
    feed(124, []);
    feed(126, [q(2, 50)]);
    // the view time is INTERP_DELAY_TICKS behind, here tick 125: a stale list would be halfway from 0
    now += 3 * (1000 / SIM_HZ);
    expect(net.serverTickNow() - INTERP_DELAY_TICKS).toBeCloseTo(125, 6);
    const v = net.remoteViews().find((r) => r.id === 2)!;
    expect(v.x).toBe(50);
    feed(128, [q(2, 51)]);
    for (const r of net.remoteViews()) expect(r.x).toBeGreaterThanOrEqual(50);
    close();
  });

  it("(the control) a file that never left and jumped 50 m is lerped: the snap is the absence doing it", () => {
    const { net, feed, close } = harness();
    for (let k = 0; k < 10; k++) feed(102 + k * 2, [q(2, 0)]);
    feed(122, [q(2, 0)]);
    feed(124, [q(2, 0)]);
    feed(126, [q(2, 50)]);
    now += 3 * (1000 / SIM_HZ);
    const v = net.remoteViews().find((r) => r.id === 2)!;
    expect(v.x).toBeCloseTo(25, 6);
    close();
  });

  it("the file count is the room's roster when the room sends one, not the files in view", () => {
    const { net, feed, close } = harness();
    feed(102, [q(2, 0)]);
    expect(net.files).toBe(2);
    const t = (net as unknown as { transport: Transport }).transport;
    const roster = new TextEncoder().encode(JSON.stringify({ players: [1, 2, 3, 4, 5].map((id) => ({ id, name: `F${id}`, tag: "" })) }));
    const buf = new Uint8Array(3 + roster.length);
    buf[0] = Msg.CityRoster;
    new DataView(buf.buffer).setUint16(1, roster.length, true);
    buf.set(roster, 3);
    t.onMessage!(buf.buffer);
    expect(net.roster?.map((p) => p.name)).toEqual(["F1", "F2", "F3", "F4", "F5"]);
    expect(net.files).toBe(5);
    feed(104, []);
    expect(net.files, "a file walking out of view is still in the room").toBe(5);
    close();
  });
});

// ---------------------------------------------------------------------------------------------
/** The ceiling probe:net asserts per client, downstream, and tests/bandwidth.test.ts holds a match to. */
const BUDGET_KBS = 12;

interface Meter {
  conn: Conn;
  bytes: number;
  seq: number;
  ack: number;
  id: number;
}
/**
 * `n` files in a city room (or, with `unfiltered`, the same room without interest), placed by
 * `where(i)`, every one moving, turning and (with `fire`) shooting, for `seconds`; bytes per client
 * per second downstream, everything the room sends counted.
 */
function cityBytes(o: { n: number; where: (i: number) => { x: number; z: number }; fire?: boolean; seconds?: number; unfiltered?: boolean; measure?: (i: number) => boolean }): number {
  let clock = 1_000_000;
  const room = o.unfiltered
    ? new Room({ level: "lease_row", seed: 5, ai: true, wakePhase: "off", dummyRespawn: true, pvp: false, run: false, arrivalGrace: true, maxPlayers: 24, now: () => clock })
    : createCityRoom({ district: "lease_row", seed: 5, now: () => clock }).room;
  const meters: Meter[] = [];
  for (let i = 0; i < o.n; i++) {
    const m: Meter = { bytes: 0, seq: 0, ack: 0, id: -1, conn: null as never };
    m.conn = {
      send: (buf: ArrayBuffer) => {
        m.bytes += buf.byteLength;
        const v = new DataView(buf);
        if (v.getUint8(0) === Msg.Snapshot) m.ack = Math.max(m.ack, v.getUint32(1, true));
        if (v.getUint8(0) === Msg.Welcome) m.id = v.getUint8(1);
      },
      close: () => {},
    };
    room.onOpen(m.conn);
    room.onMessage(m.conn, encodeJoin(`P${i}`, "", "", ""));
    meters.push(m);
  }
  meters.forEach((m, i) => {
    const w = o.where(i);
    place(room, m.id, w.x, w.z);
  });
  const drive = (t: number) => {
    for (const m of meters) room.onMessage(m.conn, encodeInputs([{ seq: ++m.seq, tick: room.tick, buttons: Btn.Forward | Btn.Sprint | (t % 40 < 20 ? Btn.Left : Btn.Right) | (o.fire && (t + m.id) % 12 === 0 ? Btn.Fire : 0), yaw: Math.sin(t * 0.05 + m.seq) * 2, pitch: 0, viewTick: m.ack, viewFrac: 0, px: 0, py: 0, pz: 0 }], m.ack));
    room.step();
    clock += 1000 / SIM_HZ;
  };
  // the join burst is not the steady state
  for (let t = 0; t < SIM_HZ; t++) drive(t);
  for (const m of meters) m.bytes = 0;
  const seconds = o.seconds ?? 4;
  for (let t = 0; t < seconds * SIM_HZ; t++) drive(t);
  expect(room.kicks, "a client struck out: the measurement would be of an empty room").toBe(0);
  const counted = meters.filter((_, i) => (o.measure ? o.measure(i) : true));
  const kbs = counted.reduce((a, m) => a + m.bytes, 0) / counted.length / seconds / 1024;
  console.info(`CITY BANDWIDTH ${JSON.stringify({ players: o.n, measuredPlayers: counted.length, firing: !!o.fire, unfiltered: !!o.unfiltered, KBps: +kbs.toFixed(3) })}`);
  return kbs;
}
/** a square grid of `n` over ±`half` metres round (cx, cz) */
const grid = (n: number, half: number, cx = 0, cz = 0) => (i: number) => {
  const side = Math.ceil(Math.sqrt(n));
  const s = side > 1 ? (2 * half) / (side - 1) : 0;
  return { x: cx - half + (i % side) * s, z: cz - half + Math.floor(i / side) * s };
};

// These simulate several complete city rooms. The budget below is bytes per sim second, not CPU time.
describe("per-client bytes are bounded by what a client is told about, not by the room", { timeout: 60_000 }, () => {
  // Measured by this harness (LEASE ROW, every file moving and turning; KB/s per client downstream,
  // everything the room sends):
  //                                        before (unfiltered)   after
  //   24 spread over the district                17.9             7.1
  //   24 spread, every file firing               21.3             8.5
  //   24 in one street, every file firing        20.9             9.6   ← the cap, not the radius
  //   (8 in one street, every file firing, unfiltered: 11.0 — a full match's worth)
  it("24 files spread over the district, every one moving and firing, stay under the per-client budget a match is held to", () => {
    const kbs = cityBytes({ n: 24, where: grid(24, 80), fire: true });
    expect(kbs).toBeLessThan(BUDGET_KBS);
  });

  it("24 files crowded into one street, every one moving and firing, stay under it too: the cap, not the radius", () => {
    const kbs = cityBytes({ n: 24, where: grid(24, 8, -40, 83), fire: true });
    expect(kbs).toBeLessThan(BUDGET_KBS);
    // and no more than eight files in that street cost each other with nothing filtered: a full match's worth
    expect(kbs).toBeLessThan(cityBytes({ n: 8, where: grid(8, 8, -40, 83), fire: true, unfiltered: true }));
  });

  it("the same 24 spread files without interest are over it: the filter is what holds the line", () => {
    const off = cityBytes({ n: 24, where: grid(24, 80), unfiltered: true });
    const on = cityBytes({ n: 24, where: grid(24, 80) });
    expect(off).toBeGreaterThan(BUDGET_KBS);
    expect(on).toBeLessThan(off * 0.6);
  });

  it("eighteen more files across the district cost a group of six nothing they can see", () => {
    // six in the south-west corner, alone; then the same six with eighteen more in the north-east
    const corner = grid(6, 6, -75, -75);
    const alone = cityBytes({ n: 6, where: corner });
    const crowd = cityBytes({ n: 24, where: (i) => (i < 6 ? corner(i) : grid(18, 10, 70, 70)(i - 6)), measure: (i) => i < 6 });
    // what grows is only the roster (eighteen more names every ten seconds) and the kill feed
    expect(crowd / alone).toBeLessThan(1.1);
    // and without the filter the same eighteen cost the six several KB/s each
    const crowdOff = cityBytes({ n: 24, where: (i) => (i < 6 ? corner(i) : grid(18, 10, 70, 70)(i - 6)), measure: (i) => i < 6, unfiltered: true });
    expect(crowdOff - alone).toBeGreaterThan(4);
  });
});
