/**
 * Public world events in the city (Stage 699). The schedule is a function of the room's seed; each
 * kind completes and fails on its own rule; the room that ran an event credits the files that took
 * part, once, and nobody else — not a file that stood elsewhere, not one that walked in after, not a
 * seat handed on to another file, and never twice. The wire carries it as a new message an older
 * client ignores, and no room but a city's ever sends it.
 */
import { describe, expect, it } from "vitest";
import { Room, type Conn } from "../server/room";
import { createCityRoom } from "../server/city-room";
import { createCampaignRoom } from "../server/campaign-room";
import { MemoryAccountStore } from "../server/accounts";
import { createAccount } from "../shared/progression/account";
import { decodeServerMessage, encodeCityEvent, encodeJoin, Msg, PROTOCOL_VERSION, type CityEventMsg } from "../shared/net/protocol";
import { CITY_EVENT_KINDS, CITY_EVENTS, CityEvents, citySites, cityRing, planCityEvents, type CityEventKind } from "../shared/city/events";
import { CITY_EVENT_XP, CITY_EVENT_XP_PER_DAY, cityEventsPaidToday, creditCityEvent } from "../shared/city/reward";
import { levelById } from "../shared/sim/level";
import { CITY_DISTRICTS } from "../shared/net/city";
import { World, type SimEvent } from "../shared/sim/world";
import { SIM_HZ } from "../shared/sim/constants";
import { WASP } from "../shared/sim/ai";
import { stampById } from "../shared/progression/stamps";
import { eventCard, eventClock, eventObjective, eventProgress, nextEventLine } from "../client/cityevent";
import { reachable } from "./helpers/imports";

const LOADOUT = JSON.stringify({ primary: "lease_breaker", secondary: "shock_baton", attested: [] });
const DAY = 86_400_000;

function conn() {
  const msgs: ReturnType<typeof decodeServerMessage>[] = [];
  const c: Conn = { send: (buf) => msgs.push(decodeServerMessage(buf, () => null)), close: () => {} };
  return { c, msgs };
}
const idOf = (msgs: ReturnType<typeof decodeServerMessage>[]): number => {
  for (const m of msgs) if (m?.type === "welcome") return m.playerId;
  return -1;
};
const cityMsgs = (msgs: ReturnType<typeof decodeServerMessage>[]): CityEventMsg[] => msgs.flatMap((m) => (m?.type === "cityEvent" ? [m.cityEvent] : []));

/** a bare world with the city's patrols and one player, for stepping events without a room */
function cityWorld(level = "lease_row", seed = 7) {
  const world = new World(levelById(level), { ai: true, seed, wakePhase: "off", pvp: false });
  const p = world.addPlayer(1, "ALPHA");
  return { world, p };
}

/** keep a player standing somewhere, alive and unhurt, for a test that is not about the wasps' aim */
function hold(p: { pos: { x: number; y: number; z: number }; health: number; alive: boolean }, at: { x: number; z: number }) {
  p.pos.x = at.x;
  p.pos.y = 0;
  p.pos.z = at.z;
  if (p.alive) p.health = 100;
}

/** step the world and the events together until the event ends or `max` ticks pass */
function run(world: World, ev: CityEvents, max: number, each: (tick: number) => void = () => {}, keyOf: (id: number) => string | null = (id) => `file-${id}`) {
  const events: SimEvent[] = [];
  let end: ReturnType<CityEvents["step"]> = null;
  let start: ReturnType<CityEvents["step"]> = null;
  for (let i = 0; i < max; i++) {
    each(world.tick);
    world.step(new Map(), { online: true });
    const evs = world.drainEvents();
    events.push(...evs);
    const n = ev.step(world, evs, keyOf);
    if (n?.type === "start") start = n;
    if (n?.type === "end") {
      end = n;
      break;
    }
  }
  return { end, start, events };
}

describe("the schedule is the room's seed and nothing else", () => {
  it("one seed plans one city; another seed plans another", () => {
    const a = planCityEvents(7, 30, 5);
    expect(planCityEvents(7, 30, 5)).toEqual(a);
    expect(planCityEvents(8, 30, 5)).not.toEqual(a);
    // a longer plan begins with the shorter one: growing the plan never rewrites what was scheduled
    expect(planCityEvents(7, 60, 5).slice(0, 30)).toEqual(a);
  });

  it("every three events run all three kinds, never one kind twice running, never one post twice running, the quiet in its band", () => {
    for (const seed of [1, 7, 42, 0xdeadbeef]) {
      const plans = planCityEvents(seed, 30, 5);
      for (let i = 0; i + 3 <= plans.length; i++) expect(new Set(plans.slice(i, i + 3).map((p) => p.kind)).size).toBe(3);
      for (let i = 1; i < plans.length; i++) {
        expect(plans[i]!.kind).not.toBe(plans[i - 1]!.kind);
        expect(plans[i]!.site).not.toBe(plans[i - 1]!.site);
      }
      for (const p of plans) {
        expect(p.site).toBeGreaterThanOrEqual(0);
        expect(p.site).toBeLessThan(5);
        expect(p.gapSeconds).toBeGreaterThanOrEqual(CITY_EVENTS.gapMinSeconds);
        expect(p.gapSeconds).toBeLessThanOrEqual(CITY_EVENTS.gapMaxSeconds);
      }
    }
  });

  it("two rooms with one seed start the same event on the same tick, after the first quiet", () => {
    const starts = [0, 1].map(() => {
      const { world, p } = cityWorld();
      const ev = new CityEvents(world.seed, world.level, world.tick);
      const r = run(world, ev, CITY_EVENTS.firstSeconds * SIM_HZ + 5, () => hold(p, { x: 60, z: 60 }));
      return { tick: r.start?.event.startTick, kind: r.start?.event.kind, title: r.start?.event.title };
    });
    expect(starts[0]!.tick).toBe(CITY_EVENTS.firstSeconds * SIM_HZ);
    expect(starts[1]).toEqual(starts[0]);
    expect(CITY_EVENT_KINDS).toContain(starts[0]!.kind);
  });

  it("an event that comes due on empty streets waits for someone to be there", () => {
    const world = new World(levelById("lease_row"), { ai: true, seed: 7, wakePhase: "off", pvp: false });
    const ev = new CityEvents(world.seed, world.level, world.tick);
    const r = run(world, ev, CITY_EVENTS.firstSeconds * SIM_HZ + SIM_HZ * 20);
    expect(r.start).toBeNull();
    expect(ev.count).toBe(0);
    world.addPlayer(1, "LATE");
    const r2 = run(world, ev, CITY_EVENTS.retrySeconds * SIM_HZ + 2);
    expect(r2.start?.type).toBe("start");
  });

  it("the posts are the district's lattice posts, and the ring runs round the outer four", () => {
    expect(CITY_DISTRICTS.length).toBe(5);
    for (const d of CITY_DISTRICTS) {
      const level = levelById(d);
      expect(citySites(level).map((s) => s.label)).toEqual(level.nodes.map((n) => n.label));
      const ring = cityRing(level);
      expect(ring.length).toBe(4);
      // consecutive posts round the ring share a street: one leg changes one coordinate only
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!.pos, b = ring[(i + 1) % ring.length]!.pos;
        expect(a.x === b.x || a.z === b.z).toBe(true);
      }
    }
  });
});

describe("each kind completes and fails on its own rule", () => {
  function started(kind: CityEventKind, level = "lease_row") {
    const { world, p } = cityWorld(level);
    const ev = new CityEvents(world.seed, world.level, world.tick);
    ev.startNow(world.tick + 1, kind);
    const own = new Map(world.wasps.map((w) => [w.id, w.waypoints.map((v) => ({ ...v }))]));
    const r = run(world, ev, 3, () => hold(p, { x: 70, z: 70 }));
    expect(r.start?.event.kind).toBe(kind);
    return { world, p, ev, own, e: r.start!.event };
  }

  it("HOLD: the ring held for its seconds completes it, with VANTAGE sending wasps at the post; the patrols go home after", () => {
    const { world, p, ev, own, e } = started("hold");
    expect(e.need).toBe(CITY_EVENTS.hold.seconds);
    const r = run(world, ev, CITY_EVENTS.hold.limit * SIM_HZ, () => hold(p, e.site));
    expect(r.end?.event.status).toBe("complete");
    // held for its seconds, not a tick less
    expect(world.tick - e.startTick).toBeGreaterThanOrEqual(CITY_EVENTS.hold.seconds * SIM_HZ - 2);
    expect(e.waves).toBeGreaterThanOrEqual(2);
    expect(e.participants.get("file-1")).toBe(1);
    for (const w of world.wasps) expect(w.waypoints).toEqual(own.get(w.id));
  });

  it("HOLD: time spent outside the ring does not count, and a post not held long enough fails at the limit and pays nobody, not even who stood in it", () => {
    const { world, p, ev, e } = started("hold");
    // ten seconds in the ring, then outside it for the rest of the clock
    run(world, ev, 10 * SIM_HZ, () => hold(p, e.site));
    expect(e.progress).toBeCloseTo(10, 1);
    const r = run(world, ev, CITY_EVENTS.hold.limit * SIM_HZ + 5, () => hold(p, { x: e.site.x + CITY_EVENTS.hold.radius + 3, z: e.site.z }));
    expect(r.end?.event.status).toBe("failed");
    expect(e.progress).toBeCloseTo(10, 1);
    expect(e.reason).toMatch(/NOT HELD/);
    expect(e.participants.has("file-1")).toBe(true);
    expect(ev.close(e)).toEqual([]);
  });

  it("INTERCEPT: the convoy is the district's own wasps on a route round the posts; downing all of them completes it; the downed stay down until it ends", () => {
    const { world, p, ev, e } = started("intercept");
    expect(e.targets.length).toBe(CITY_EVENTS.intercept.count);
    expect(world.wasps.length).toBe(levelById("lease_row").wasps.length); // nothing was spawned
    const [t1, t2, t3] = e.targets as [number, number, number];
    run(world, ev, 2, () => hold(p, { x: 70, z: 70 }));
    world.applyDamage("wasp", t1, 999, p.id, "lease_breaker", "shot");
    run(world, ev, 2, () => hold(p, { x: 70, z: 70 }));
    expect(e.downed).toEqual([t1]);
    // the downed one does not come back mid-event
    run(world, ev, (WASP.respawn + 2) * SIM_HZ, () => hold(p, { x: 70, z: 70 }));
    expect(world.wasps.find((w) => w.id === t1)!.alive).toBe(false);
    expect(e.status).toBe("running");
    world.applyDamage("wasp", t2, 999, p.id, "lease_breaker", "shot");
    world.applyDamage("wasp", t3, 999, p.id, "lease_breaker", "shot");
    const r = run(world, ev, 3, () => hold(p, { x: 70, z: 70 }));
    expect(r.end?.event.status).toBe("complete");
    // the one who downed them took part from wherever they stood
    expect(e.participants.has("file-1")).toBe(true);
    // and the convoy goes back on the usual timer
    for (const id of e.targets) expect(world.wasps.find((w) => w.id === id)!.respawnTimer).toBe(WASP.respawn);
  });

  it("INTERCEPT: a convoy nobody downs clears the district and the event fails", () => {
    const { world, p, ev, e } = started("intercept");
    const r = run(world, ev, CITY_EVENTS.intercept.limit * SIM_HZ + 5, () => hold(p, { x: 80, z: 80 }));
    expect(r.end?.event.status).toBe("failed");
    expect(e.reason).toMatch(/CONVOY/);
    expect(ev.close(e)).toEqual([]);
  });

  it("ESCORT: the cell walks only while someone is close, and completes at the far post", () => {
    const { world, p, ev, e } = started("escort");
    const esc = e.escort!;
    expect(esc.path.length).toBe(3);
    // nobody near: it waits
    run(world, ev, 5 * SIM_HZ, () => hold(p, { x: 80, z: 80 }));
    expect(esc.walked).toBe(0);
    expect(esc.waiting).toBe(true);
    const r = run(world, ev, CITY_EVENTS.escort.limit * SIM_HZ, () => hold(p, { x: esc.pos.x + 1, z: esc.pos.z }));
    expect(r.end?.event.status).toBe("complete");
    expect(esc.pos).toMatchObject({ x: esc.path[2]!.x, z: esc.path[2]!.z });
    expect(e.progress).toBeCloseTo(1, 5);
    expect(e.participants.has("file-1")).toBe(true);
    // VANTAGE noticed at the corner
    expect(e.waves).toBe(1);
  });

  it("ESCORT: a cell left in the street fails at the limit", () => {
    const { world, p, ev, e } = started("escort");
    const r = run(world, ev, CITY_EVENTS.escort.limit * SIM_HZ + 5, () => hold(p, { x: 80, z: 80 }));
    expect(r.end?.event.status).toBe("failed");
    expect(e.reason).toMatch(/CELL/);
  });

  it("an event started while one runs waits for it; the next is scheduled after the quiet", () => {
    const { world, p, ev, e } = started("hold");
    run(world, ev, CITY_EVENTS.hold.limit * SIM_HZ, () => hold(p, e.site));
    expect(ev.nextIn(world.tick)).toBe(ev.plan(0).gapSeconds);
  });
});

describe("the room that ran it credits who took part", () => {
  function city(now: { t: number }) {
    const store = new MemoryAccountStore(createAccount);
    const h = createCityRoom({ district: "lease_row", accounts: store, seed: 7, now: () => now.t });
    const join = (acct: string, name: string) => {
      const x = conn();
      h.room.onOpen(x.c);
      h.room.onMessage(x.c, encodeJoin(name, "", acct, LOADOUT));
      return x;
    };
    return { h, store, join };
  }

  it("the file in the ring is paid; the file across the district is not; a file that walks in after is not; nothing is paid twice", () => {
    const now = { t: 100 * DAY + 1000 };
    const { h, store, join } = city(now);
    const a = join("city-a", "ALPHA");
    const b = join("city-b", "BRAVO");
    h.room.step();
    const [ia, ib] = [idOf(a.msgs), idOf(b.msgs)];
    // the late joiner of a running room would see it: both got the room's word at the door
    expect(cityMsgs(a.msgs).length).toBeGreaterThan(0);
    h.startEvent("hold");
    h.room.step();
    const e = h.events.current!;
    expect(e.kind).toBe("hold");
    expect(cityMsgs(b.msgs).at(-1)?.event?.status).toBe("running");
    const pa = h.room.world.players.get(ia)!, pb = h.room.world.players.get(ib)!;
    const far = { x: e.site.x > 0 ? -60 : 60, z: e.site.z > 0 ? -60 : 60 };
    for (let i = 0; i < CITY_EVENTS.hold.limit * SIM_HZ && e.status === "running"; i++) {
      hold(pa, e.site);
      hold(pb, far);
      h.room.step();
    }
    expect(e.status).toBe("complete");
    const fa = store.accounts.get("city-a")!, fb = store.accounts.get("city-b")!;
    expect(fa.xp).toBe(CITY_EVENT_XP);
    expect(fa.counters["cityEvents"]).toBe(1);
    expect(fa.counters["cityEvents:hold"]).toBe(1);
    expect(fa.stamps).toContain("city_event_1");
    expect(fa.ledger.some((l) => l.startsWith("PUBLIC EVENT · HOLD THE LATTICE POST"))).toBe(true);
    expect(fb.xp).toBe(0);
    expect(fb.counters["cityEvents"] ?? 0).toBe(0);
    // each was told: ALPHA what it was paid (and the file with it), BRAVO that it was not there
    const endA = cityMsgs(a.msgs).at(-1)!, endB = cityMsgs(b.msgs).at(-1)!;
    expect(endA.event?.status).toBe("complete");
    expect(endA.you).toBe(true);
    expect(endA.reward?.[0]).toMatch(/\+300 XP/);
    expect(a.msgs.some((m) => m?.type === "file" && m.file.reason === "stamp" && m.file.xp === CITY_EVENT_XP && (m.file.newStamps ?? []).includes("city_event_1"))).toBe(true);
    expect(endB.you).toBe(false);
    expect(endB.reward).toBeUndefined();
    // walked in after it closed: told how it went, paid nothing
    const c = join("city-c", "CHARLIE");
    h.room.step();
    const atDoor = cityMsgs(c.msgs).at(-1)!;
    expect(atDoor.event?.status).toBe("complete");
    expect(atDoor.you).toBe(false);
    expect(atDoor.reward).toBeUndefined();
    // and never twice: the event's list is spent, and the room goes on without paying again
    expect(h.events.close(e)).toEqual([]);
    for (let i = 0; i < 20 * SIM_HZ; i++) {
      hold(pa, e.site);
      h.room.step();
    }
    expect(store.accounts.get("city-a")!.xp).toBe(CITY_EVENT_XP);
    expect(store.accounts.get("city-c")!.xp).toBe(0);
    expect(h.state().credited).toEqual([{ event: e.id, file: "city-a", xp: CITY_EVENT_XP }]);
  });

  it("a seat handed on to another file is not the file that took part", () => {
    const now = { t: 100 * DAY };
    const { h, store, join } = city(now);
    const a = join("city-a", "ALPHA");
    const b = join("city-b", "BRAVO");
    h.room.step();
    const [ia, ib] = [idOf(a.msgs), idOf(b.msgs)];
    h.startEvent("hold");
    h.room.step();
    const e = h.events.current!;
    const pa = h.room.world.players.get(ia)!, pb = h.room.world.players.get(ib)!;
    for (let i = 0; i < 10; i++) {
      hold(pa, e.site);
      hold(pb, { x: 70, z: 70 });
      h.room.step();
    }
    expect(e.participants.get("city-a")).toBe(ia);
    // the id ALPHA was seen under now seats BRAVO's file (a room reuses ids once they are free)
    e.participants.set("city-a", ib);
    for (let i = 0; i < CITY_EVENTS.hold.limit * SIM_HZ && e.status === "running"; i++) {
      hold(pa, { x: 70, z: 70 });
      hold(pb, { x: 70, z: 70 });
      e.progress = e.need; // the post is held by someone the test does not need
      h.room.step();
    }
    expect(e.status).toBe("complete");
    expect(store.accounts.get("city-b")!.xp).toBe(0);
    expect(store.accounts.get("city-a")!.xp).toBe(0);
    expect(h.state().credited).toEqual([]);
  });

  it("a failed event pays nobody, not even who took part in it, and says so", () => {
    const now = { t: 100 * DAY };
    const { h, store, join } = city(now);
    const a = join("city-a", "ALPHA");
    h.room.step();
    h.startEvent("hold");
    h.room.step();
    const e = h.events.current!;
    const pa = h.room.world.players.get(idOf(a.msgs))!;
    // in the ring for a while, then gone: taking part, and failing
    for (let i = 0; i < CITY_EVENTS.hold.limit * SIM_HZ + 5 && e.status === "running"; i++) {
      hold(pa, i < 5 * SIM_HZ ? e.site : { x: 80, z: 80 });
      h.room.step();
    }
    expect(e.status).toBe("failed");
    expect(e.participants.has("city-a")).toBe(true);
    expect(store.accounts.get("city-a")!.xp).toBe(0);
    expect(h.state().credited).toEqual([]);
    const end = cityMsgs(a.msgs).at(-1)!;
    expect(end.event?.status).toBe("failed");
    expect(end.reward).toBeUndefined();
    expect(eventCard(end)!.lines).toContain("A FAILED EVENT PAYS NO ONE");
  });
});

describe("what an event is worth", () => {
  it("XP and the record, capped by the day; past the cap it still counts and pays nothing; the next day pays again", () => {
    const a = createAccount("x");
    const t = 200 * DAY + 5;
    for (let i = 0; i < CITY_EVENT_XP_PER_DAY; i++) expect(creditCityEvent(a, { kind: "hold", title: "T" }, t).xp).toBe(CITY_EVENT_XP);
    const over = creditCityEvent(a, { kind: "escort", title: "T" }, t);
    expect(over).toMatchObject({ xp: 0, capped: true });
    expect(a.xp).toBe(CITY_EVENT_XP * CITY_EVENT_XP_PER_DAY);
    expect(a.counters["cityEvents"]).toBe(CITY_EVENT_XP_PER_DAY + 1);
    expect(cityEventsPaidToday(a, t)).toBe(CITY_EVENT_XP_PER_DAY);
    expect(creditCityEvent(a, { kind: "hold", title: "T" }, t + DAY).xp).toBe(CITY_EVENT_XP);
    // money is not on the list: no Scrip, no Wakelight, no salvage
    expect(a.wallet).toEqual(createAccount("y").wallet);
    // a day's worth is under one good match (≈ 4,200 XP)
    expect(CITY_EVENT_XP * CITY_EVENT_XP_PER_DAY).toBeLessThan(4200);
  });

  it("the city's stamps read the count", () => {
    expect(stampById("city_event_1")).toMatchObject({ group: "city", counter: "cityEvents", need: 1 });
    expect(stampById("city_events_10")?.need).toBe(10);
  });
});

describe("the wire", () => {
  it("a city event round-trips as its own message, which the version's encoders do not touch", () => {
    const m: CityEventMsg = {
      event: { id: 3, kind: "escort", title: "CELL RESCUE · B TO E", text: "WALK THE CELL", status: "running", reason: "", x: 16.5, z: -16.5, radius: 7, progress: 0.25, need: 1, left: 120, escort: { x: 1, z: 2, waiting: false, heading: 0.5 }, targets: [{ x: 1, y: 4, z: 2 }], participants: 2 },
      next: -1,
      you: true,
      reward: ["PUBLIC EVENT · X · +300 XP"],
    };
    const buf = encodeCityEvent(m);
    expect(new Uint8Array(buf)[0]).toBe(Msg.CityEvent);
    const back = decodeServerMessage(buf, () => null);
    expect(back).toEqual({ type: "cityEvent", cityEvent: m });
    const quiet: CityEventMsg = { event: null, next: 140, you: false };
    expect(decodeServerMessage(encodeCityEvent(quiet), () => null)).toEqual({ type: "cityEvent", cityEvent: quiet });
    // its own number: no other message shares it, so an older client decodes nothing rather than the wrong thing
    const nums = Object.values(Msg);
    expect(nums.filter((n) => n === Msg.CityEvent).length).toBe(1);
    expect(PROTOCOL_VERSION).toBe(11);
  });

  it("a message kind a client does not know decodes to nothing, not to garbage", () => {
    const buf = new Uint8Array(encodeCityEvent({ event: null, next: 1, you: false }));
    buf[0] = 99;
    expect(decodeServerMessage(buf.buffer, () => null)).toBeNull();
  });
});

describe("only a city schedules events", () => {
  const TICKS = CITY_EVENTS.firstSeconds * SIM_HZ + 10;
  it("a match room and a contract room run past the city's first event and never send one", () => {
    const rooms = [new Room({ ai: true, seed: 7, level: "lease_row", wakePhase: "off" }), new Room({ ai: true, seed: 7, level: "lease_row" }), createCampaignRoom({ mission: "g_escrow_row", seed: 7 }).room];
    for (const r of rooms) {
      const x = conn();
      r.onOpen(x.c);
      r.onMessage(x.c, encodeJoin("ALPHA", "", "", LOADOUT));
      for (let i = 0; i < TICKS; i++) r.step();
      expect(idOf(x.msgs)).toBeGreaterThan(0);
      expect(cityMsgs(x.msgs)).toEqual([]);
    }
  });

  it("while the city, over the same span, starts one and tells its players", () => {
    const h = createCityRoom({ district: "deadletter_docks", seed: 7 });
    const x = conn();
    h.room.onOpen(x.c);
    h.room.onMessage(x.c, encodeJoin("ALPHA", "", "", LOADOUT));
    for (let i = 0; i < TICKS; i++) h.room.step();
    expect(h.events.count).toBe(1);
    expect(cityMsgs(x.msgs).some((m) => m.event?.status === "running")).toBe(true);
  });

  it("the match room and the PvP worker never reach the city's events; the events reach no campaign, economy or chain", () => {
    for (const entry of ["server/room.ts", "server/worker.ts"]) expect([...reachable(entry)].filter((f) => /shared[\\/]city[\\/]/.test(f))).toEqual([]);
    for (const entry of ["shared/city/events.ts", "shared/city/reward.ts"]) {
      const bad = [...reachable(entry)].filter((f) => /shared[\\/](campaign|economy)[\\/]|server[\\/]chain[\\/]/.test(f));
      expect(bad).toEqual([]);
    }
  });
});

describe("the HUD's words", () => {
  const ev = { id: 1, kind: "hold", title: "HOLD THE LATTICE POST AT C", text: "STAND IN THE RING", status: "running" as const, reason: "", x: 0, z: 0, radius: 6, progress: 12.5, need: 40, left: 95, escort: null, targets: [], participants: 1 };
  it("progress in the event's own unit, a clock, and how far", () => {
    expect(eventClock(95)).toBe("1:35");
    expect(eventProgress(ev)).toBe("12S / 40S");
    expect(eventProgress({ ...ev, kind: "intercept", progress: 1, need: 3 })).toBe("1/3 DOWN");
    expect(eventProgress({ ...ev, kind: "escort", progress: 0.456, need: 1 })).toBe("46%");
    expect(eventObjective(ev, { x: 30, z: 40 })).toEqual({ title: "◈ PUBLIC EVENT · HOLD THE LATTICE POST AT C", text: "STAND IN THE RING", progress: "12S / 40S · 1:35 · 50 M" });
    expect(nextEventLine(40)).toBe("NEXT PUBLIC EVENT IN ~1 MIN");
    expect(nextEventLine(-1)).toBe("");
  });
  it("the closing card says what this file was paid, or that it was not there", () => {
    const done = { ...ev, status: "complete" as const };
    expect(eventCard({ event: done, next: 200, you: true, reward: ["PUBLIC EVENT · X · +300 XP"] })!.lines).toEqual(["1 TOOK PART", "SETTLED ON YOUR FILE", "PUBLIC EVENT · X · +300 XP", "NEXT PUBLIC EVENT IN ~4 MIN"]);
    expect(eventCard({ event: done, next: 200, you: false })!.lines).toContain("YOU WERE NOT THERE · NOTHING SETTLED ON YOUR FILE");
    expect(eventCard({ event: ev, next: -1, you: true })).toBeNull();
  });
});

describe("the dev host's quiet (Stage 704)", () => {
  it("holds the schedule back, never brings it forward, and a forced event still starts at once", () => {
    const L = levelById("lease_row");
    const ev = new CityEvents(7, L, 0);
    const first = ev.nextAt;
    expect(first).toBe(Math.round(CITY_EVENTS.firstSeconds * 60));
    ev.postpone(0, 1800);
    expect(ev.nextAt).toBe(1800 * 60);
    // a shorter quiet does not undo a longer one, nor bring the first event forward
    ev.postpone(0, 1);
    expect(ev.nextAt).toBe(1800 * 60);
    // the probe's own event: at once, quiet or not
    ev.startNow(5, "hold");
    expect(ev.nextAt).toBe(5);
    // and the room steps it: nothing starts on its own under the quiet
    const w = new World(L, { ai: true, seed: 7, wakePhase: "off" });
    const quiet = new CityEvents(7, L, 0);
    quiet.postpone(0, 600);
    for (let t = 0; t < CITY_EVENTS.firstSeconds * 60 + 120; t++) {
      w.step(new Map());
      expect(quiet.step(w, w.drainEvents())).toBeNull();
    }
    expect(quiet.current).toBeNull();
  }, 30_000);
});
