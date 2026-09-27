/**
 * The city's gates (Stage 697): the districts joined into one world. Each district's eight gates
 * lead to a neighbour's city room, and the file arrives at the gate there that leads back. These
 * hold the map (every gate pairs with exactly one gate, both ways, on the same avenue and the
 * opposite side), the arrival (a clear spot inside the gate, facing in, out of the gate's own reach),
 * the room's check of an arrival hint (a gate that really leads where the page says, never a
 * coordinate), the trigger (only the city has doors), and the trip itself (the neighbour's page).
 */
import { describe, expect, it } from "vitest";
import { arrivalFor, arrivalFromQuery, cityWsBase, gateArrival, gatePrompt, GATE_ARRIVE_M, GATE_HOLD_S, GATE_PROMPT_M, GATE_SIDES, gateSide, GATES_PER_DISTRICT, gateToTravel, gateTravelUrl, GATE_TRIGGER_M, holdProgress, neighbourAt, pairedGate, stepGateHold, type GateHold } from "../shared/net/citygates";
import { CITY_DISTRICTS, cityPageUrl, citySocket, inCity } from "../shared/net/city";
import { levelById, type LevelDef } from "../shared/sim/level";
import { capsuleFree } from "../shared/sim/collision";
import { MOVE, SIM_DT } from "../shared/sim/constants";
import { World } from "../shared/sim/world";
import { Btn } from "../shared/sim/input";
import { createCityRoom } from "../server/city-room";
import { Room, type Conn } from "../server/room";
import { decodeServerMessage, encodeJoin } from "../shared/net/protocol";
import { loadingFor } from "../client/loading";
import { gateLine } from "../client/campaign";

const LEVELS = new Map<string, LevelDef>(CITY_DISTRICTS.map((d) => [d, levelById(d)]));
const L = (d: string): LevelDef => LEVELS.get(d)!;
const OUT: Record<string, { x: number; z: number }> = { n: { x: 0, z: -1 }, s: { x: 0, z: 1 }, w: { x: -1, z: 0 }, e: { x: 1, z: 0 } };
/** a point `inside` metres in from gate g's line, `off` metres along it */
const at = (level: LevelDef, g: number, inside: number, off = 0) => {
  const e = level.exits![g]!;
  const o = OUT[e.dir]!;
  return { x: e.x - o.x * inside + o.z * off, z: e.z - o.z * inside + o.x * off };
};
const MODES_WITHOUT_DOORS = ["none", "mission", "explore", "coop", "run", "audit", "wake", ""];

describe("the map: every gate pairs with one gate of a neighbour, both ways", () => {
  it("the generator writes each district's exits in the order the gates are numbered", () => {
    for (const d of CITY_DISTRICTS) {
      const ex = L(d).exits!;
      expect(ex.length, d).toBe(GATES_PER_DISTRICT);
      ex.forEach((e, g) => expect(e.dir, `${d} gate ${g}`).toBe(gateSide(g)));
      expect(GATE_SIDES).toEqual(["n", "s", "w", "e"]);
    }
  });

  it("going through gate g of A lands at the gate of B that leads back to A", () => {
    for (const a of CITY_DISTRICTS) {
      for (let g = 0; g < GATES_PER_DISTRICT; g++) {
        const to = neighbourAt(a, g)!;
        expect(to, `${a} gate ${g}`).not.toBeNull();
        expect(to.district, `${a} gate ${g} leads back into itself`).not.toBe(a);
        expect(CITY_DISTRICTS).toContain(to.district);
        expect(to.gate).toBe(pairedGate(g));
        expect(neighbourAt(to.district, to.gate), `${a} ${g} → ${to.district} ${to.gate} does not lead back`).toEqual({ district: a, gate: g });
      }
    }
  });

  it("the gate across the seam is on the same avenue and the opposite side, so the streets line up", () => {
    const opposite: Record<string, string> = { n: "s", s: "n", w: "e", e: "w" };
    for (const a of CITY_DISTRICTS) {
      for (let g = 0; g < GATES_PER_DISTRICT; g++) {
        const to = neighbourAt(a, g)!;
        const here = L(a).exits![g]!;
        const there = L(to.district).exits![to.gate]!;
        expect(there.dir).toBe(opposite[here.dir]);
        // the avenue's coordinate along the seam: x for a north/south gate, z for west/east
        if (here.dir === "n" || here.dir === "s") expect(there.x).toBe(here.x);
        else expect(there.z).toBe(here.z);
      }
    }
  });

  it("the map is a tiling: east then south reaches where south then east does, and every city reaches every other", () => {
    const go = (d: string, side: "n" | "s" | "w" | "e") => neighbourAt(d, GATE_SIDES.indexOf(side))!.district;
    for (const d of CITY_DISTRICTS) {
      expect(go(go(d, "e"), "s")).toBe(go(go(d, "s"), "e"));
      expect(go(go(d, "w"), "n")).toBe(go(go(d, "n"), "w"));
      expect(go(go(d, "e"), "w")).toBe(d);
      const seen = new Set([d]);
      const todo = [d];
      while (todo.length) {
        const x = todo.pop()!;
        for (let g = 0; g < GATES_PER_DISTRICT; g++) {
          const y = neighbourAt(x, g)!.district;
          if (!seen.has(y)) {
            seen.add(y);
            todo.push(y);
          }
        }
      }
      expect([...seen].sort()).toEqual([...CITY_DISTRICTS].sort());
    }
  });

  it("a gate that is not one, a place that is not a city, or a city of one leads nowhere", () => {
    for (const g of [-1, 8, 1.5, NaN, Infinity]) expect(neighbourAt("lease_row", g)).toBeNull();
    for (const d of ["drainage_yard", "deadletter_office", "", "nowhere"]) expect(neighbourAt(d, 0)).toBeNull();
    expect(neighbourAt("lease_row", 3, ["lease_row"])).toBeNull();
    // two cities: each is the other's neighbour on every side, and still both ways
    expect(neighbourAt("a", 3, ["a", "b"])).toEqual({ district: "b", gate: 2 });
    expect(neighbourAt("b", 2, ["a", "b"])).toEqual({ district: "a", gate: 3 });
  });
});

describe("the arrival: inside the gate, clear, facing in, out of the gate's reach", () => {
  it("every gate of every district has an arrival point a file can stand on", () => {
    for (const d of CITY_DISTRICTS) {
      const level = L(d);
      for (let g = 0; g < GATES_PER_DISTRICT; g++) {
        const s = gateArrival(level, g)!;
        const where = `${d} gate ${g} (${s.pos.x}, ${s.pos.z})`;
        expect(capsuleFree(s.pos, MOVE.capsuleRadius, MOVE.standHeight, level.boxes), `${where} stands in a box`).toBe(true);
        expect(Math.max(Math.abs(s.pos.x), Math.abs(s.pos.z)), where).toBeLessThan(level.bounds!);
        // facing in: the sim's forward is (-sin yaw, -cos yaw), against the gate's outward direction
        const o = OUT[level.exits![g]!.dir]!;
        expect(-Math.sin(s.yaw) * o.x + -Math.cos(s.yaw) * o.z, `${where} does not face in`).toBeCloseTo(-1, 6);
        // and out of the gate's reach: an arrival neither triggers nor names the gate it came through
        expect(gateToTravel(s.pos, level, "city"), where).toBeNull();
        expect(gatePrompt(s.pos, level, "city"), where).toBeNull();
      }
    }
    expect(GATE_ARRIVE_M).toBeGreaterThan(GATE_PROMPT_M);
    expect(gateArrival(L("lease_row"), 8)).toBeNull();
    expect(gateArrival(L("lease_row"), -1)).toBeNull();
  });

  it("the room takes an arrival only when the gate named really leads to where the page says it came from", () => {
    for (const d of CITY_DISTRICTS) {
      for (let g = 0; g < GATES_PER_DISTRICT; g++) {
        const from = neighbourAt(d, g)!.district;
        expect(arrivalFor(L(d), from, String(g)), `${d} ${g} from ${from}`).toEqual(gateArrival(L(d), g));
        const liar = CITY_DISTRICTS.find((x) => x !== from)!;
        expect(arrivalFor(L(d), liar, String(g)), `${d} ${g} from ${liar}`).toBeNull();
      }
    }
    const lr = L("lease_row");
    const from0 = neighbourAt("lease_row", 0)!.district;
    for (const gate of ["8", "-1", "1.5", "01", " 0", "0 ", "", "0x0", "NaN", "1e0", null, undefined]) expect(arrivalFor(lr, from0, gate), `gate ${String(gate)}`).toBeNull();
    for (const from of [null, undefined, "", "lease_row", "nowhere"]) expect(arrivalFor(lr, from, "0"), `from ${String(from)}`).toBeNull();
    // a level that is not a city has no gates to arrive at, whatever the page says
    expect(arrivalFor(levelById("drainage_yard"), from0, "0")).toBeNull();
    // coordinates in the query are not read: only the gate's own point comes back
    const q = new URLSearchParams({ from: from0, gate: "0", x: "0", z: "0", yaw: "1" });
    expect(arrivalFromQuery(lr, q)).toEqual(gateArrival(lr, 0));
    expect(arrivalFromQuery(lr, new URLSearchParams({ x: "0", z: "0" }))).toBeNull();
    expect(arrivalFromQuery(lr, null)).toBeNull();
  });
});

function conn() {
  const msgs: ReturnType<typeof decodeServerMessage>[] = [];
  const c: Conn = { send: (buf) => msgs.push(decodeServerMessage(buf, () => null)), close: () => {} };
  return { c, msgs };
}
const idOf = (msgs: ReturnType<typeof decodeServerMessage>[]): number => {
  for (const m of msgs) if (m?.type === "welcome") return m.playerId;
  return -1;
};
const LOADOUT = JSON.stringify({ primary: "lease_breaker", secondary: "shock_baton", attested: [] });

describe("the city room places a file walking in through a gate", () => {
  const joinWith = (room: Room, query?: URLSearchParams) => {
    const k = conn();
    room.onOpen(k.c, query);
    room.onMessage(k.c, encodeJoin("WALKER", "", "", LOADOUT));
    return room.world.players.get(idOf(k.msgs))!;
  };
  const onASpawn = (level: LevelDef, p: { pos: { x: number; z: number } }) => level.spawns.some((s) => s.pos.x === p.pos.x && s.pos.z === p.pos.z);

  it("at the gate it names, facing in, when the gate leads back to where it came from", () => {
    const d = "deadletter_docks";
    const h = createCityRoom({ district: d, seed: 7 });
    for (const g of [0, 3, 6]) {
      const from = neighbourAt(d, g)!.district;
      const p = joinWith(h.room, new URL(citySocket("ws://h", d, { from, gate: g })).searchParams);
      const want = gateArrival(h.room.world.level, g)!;
      expect({ x: p.pos.x, z: p.pos.z, yaw: p.yaw }).toEqual({ x: want.pos.x, z: want.pos.z, yaw: want.yaw });
    }
  });

  it("and is still standing there a second later: nothing the room does after the admit moves it back to a spawn", () => {
    // probe:world caught this: the admit placed the walker, and it stood on a spawn when it could look
    const d = "deadletter_docks";
    const h = createCityRoom({ district: d, seed: 7 });
    const g = 2;
    const p = joinWith(h.room, new URL(citySocket("ws://h", d, { from: neighbourAt(d, g)!.district, gate: g })).searchParams);
    const want = gateArrival(h.room.world.level, g)!;
    for (let t = 0; t < 60; t++) h.room.step();
    const live = h.room.world.players.get(p.id)!;
    expect(Math.hypot(live.pos.x - want.pos.x, live.pos.z - want.pos.z), JSON.stringify(live.pos)).toBeLessThan(0.1);
  });

  it("at the room's own spawn when the hint is missing, malformed, or lies about where it came from", () => {
    const d = "repo_depot";
    const h = createCityRoom({ district: d, seed: 7 });
    const from0 = neighbourAt(d, 0)!.district;
    const liar = CITY_DISTRICTS.find((x) => x !== from0 && x !== d)!;
    for (const q of [undefined, new URLSearchParams(), new URLSearchParams({ from: from0, gate: "9" }), new URLSearchParams({ from: liar, gate: "0" }), new URLSearchParams({ gate: "0", x: "3", z: "3" })]) {
      const p = joinWith(h.room, q);
      expect(onASpawn(h.room.world.level, p), `placed off the spawns for ${q?.toString()}`).toBe(true);
    }
  });

  it("a room that is not a city never reads an arrival, even when handed one", () => {
    const r = new Room({ ai: false, seed: 7, level: "lease_row" });
    const from = neighbourAt("lease_row", 0)!.district;
    const p = joinWith(r, new URLSearchParams({ from, gate: "0" }));
    expect(onASpawn(r.world.level, p)).toBe(true);
  });
});

describe("the trigger: only the city has doors", () => {
  it("in its mouth, within reach of its line, the city walks into the gate; nowhere else does", () => {
    for (const d of CITY_DISTRICTS) {
      const level = L(d);
      for (let g = 0; g < GATES_PER_DISTRICT; g++) {
        const mouth = at(level, g, 0.5);
        expect(gateToTravel(mouth, level, "city"), `${d} gate ${g}`).toBe(g);
        expect(gateToTravel(at(level, g, GATE_TRIGGER_M - 0.01, 2), level, "city")).toBe(g);
        for (const m of MODES_WITHOUT_DOORS) {
          expect(gateToTravel(mouth, level, m), `${d} gate ${g} in mode "${m}"`).toBeNull();
          expect(gatePrompt(mouth, level, m)).toBeNull();
        }
        // past the trigger it is only named; past the prompt it is nothing; off the mouth it is the wall
        const near = at(level, g, GATE_TRIGGER_M + 0.3);
        expect(gateToTravel(near, level, "city")).toBeNull();
        expect(gatePrompt(near, level, "city")).toEqual({ gate: g, to: neighbourAt(d, g) });
        expect(gatePrompt(at(level, g, GATE_PROMPT_M + 0.3), level, "city")).toBeNull();
        expect(gateToTravel(at(level, g, 0.5, 4), level, "city")).toBeNull();
      }
      expect(gateToTravel({ x: 0, z: 0 }, level, "city")).toBeNull();
    }
    // the range, the office: not cities, no doors, even in city mode
    for (const id of ["drainage_yard", "deadletter_office"]) {
      const level = levelById(id);
      for (const e of level.exits ?? []) expect(gateToTravel({ x: e.x, z: e.z }, level, "city")).toBeNull();
    }
  });

  it("a file walking into a gate in the sim ends up in its mouth, where the trigger fires", () => {
    for (const d of CITY_DISTRICTS) {
      const w = new World(levelById(d), { ai: false, seed: 1, wakePhase: "off", dummyRespawn: true, pvp: false });
      for (const g of [0, 3, 5]) {
        const p = w.addPlayer(1, "BLANK", 1);
        const s = gateArrival(w.level, g)!;
        p.pos.x = s.pos.x;
        p.pos.z = s.pos.z;
        // arriving faces in: turn round and walk straight back out through the gate
        const yaw = s.yaw + Math.PI;
        let fired = -1;
        for (let t = 0; t < 180 && fired < 0; t++) {
          w.step(new Map([[1, { tick: t, buttons: Btn.Forward, yaw, pitch: 0 }]]));
          if (gateToTravel(p.pos, w.level, "city") === g) fired = t;
        }
        expect(fired, `${d} gate ${g}: walked out from (${s.pos.x}, ${s.pos.z}) and stopped at (${p.pos.x.toFixed(2)}, ${p.pos.z.toFixed(2)})`).toBeGreaterThan(0);
        w.removePlayer(1);
      }
    }
  });

  it("the hold: a second stood in the same gate goes; stepping out or across starts again", () => {
    let h: GateHold | null = null;
    let went = -1;
    for (let t = 0; t < 120 && went < 0; t++) {
      const s = stepGateHold(h, 2, SIM_DT);
      h = s.hold;
      if (s.go) went = t + 1;
    }
    expect(went).toBe(Math.round(GATE_HOLD_S / SIM_DT));
    // half a second in, a step out: back to nothing
    let s = stepGateHold(null, 2, 0.5);
    expect(s.go).toBe(false);
    expect(holdProgress(s.hold)).toBeCloseTo(0.5);
    s = stepGateHold(s.hold, null, SIM_DT);
    expect(s.hold).toBeNull();
    expect(holdProgress(s.hold)).toBe(0);
    // into another gate: its own clock
    s = stepGateHold({ gate: 2, held: 0.9 }, 3, 0.2);
    expect(s).toEqual({ hold: { gate: 3, held: 0.2 }, go: false });
    expect(stepGateHold({ gate: 3, held: 0.9 }, 3, 0.2).go).toBe(true);
  });

  it("the HUD line names the neighbour, then the crossing", () => {
    expect(gateLine("deadletter_docks", 0, false)).toBe("→ DEADLETTER DOCKS · WALK INTO THE GATE");
    expect(gateLine("repo_depot", 0.5, true)).toBe("→ REPO DEPOT · CROSSING ▮▮▮▯▯▯");
    expect(gateLine("repo_depot", 1, true)).toBe("→ REPO DEPOT · CROSSING ▮▮▮▮▮▮");
  });
});

describe("the trip: the neighbour's city page, behind the loading card", () => {
  const BASE = "http://x/?headless=1&account=a1&shop=http%3A%2F%2Fh";

  it("a gate's page walks the neighbour's city, and its socket carries the arrival the room checks", () => {
    for (const d of CITY_DISTRICTS) {
      const page = cityPageUrl(BASE, { wsBase: "ws://h:1", level: d, shop: "http://h" });
      expect(cityWsBase(new URL(page).searchParams.get("net"))).toBe("ws://h:1");
      for (let g = 0; g < GATES_PER_DISTRICT; g++) {
        const t = gateTravelUrl(page, g)!;
        const to = neighbourAt(d, g)!;
        expect(t.to).toEqual(to);
        const q = new URL(t.url).searchParams;
        expect(inCity(q)).toBe(true);
        expect(q.get("level")).toBe(to.district);
        expect(q.get("shop")).toBe("http://h");
        expect(q.get("from")).toBe(d);
        expect(q.get("gate")).toBe(String(to.gate));
        const sock = new URL(q.get("net")!);
        expect(sock.pathname).toBe(`/campaign/city-${to.district}`);
        expect(`${sock.protocol}//${sock.host}`).toBe("ws://h:1");
        // what the room will do with it: the arrival gate's own point
        expect(arrivalFromQuery(L(to.district), sock.searchParams)).toEqual(gateArrival(L(to.district), to.gate));
        // and the loading card shows where it is going, and where from
        expect(loadingFor(t.url)).toMatchObject({ kind: "play", title: L(to.district).displayName, line: `THE CITY · IN FROM ${L(d).displayName}` });
      }
    }
  });

  it("a page that is not a city goes through no gate", () => {
    expect(gateTravelUrl(`${BASE}&level=lease_row`, 0)).toBeNull();
    expect(gateTravelUrl(`${BASE}&level=lease_row&net=${encodeURIComponent("ws://h/room/neochina-lease_row")}`, 0)).toBeNull();
    expect(gateTravelUrl(`${BASE}&level=lease_row&net=${encodeURIComponent("ws://h/campaign/crew-ABCDEFGH")}`, 0)).toBeNull();
    expect(gateTravelUrl(`${BASE}&level=drainage_yard&net=${encodeURIComponent("ws://h/campaign/city-lease_row")}`, 0)).toBeNull();
    expect(gateTravelUrl("not a url", 0)).toBeNull();
    const page = cityPageUrl(BASE, { wsBase: "ws://h", level: "lease_row" });
    expect(gateTravelUrl(page, 8)).toBeNull();
  });

  it("an arrival belongs to its own trip: the next city page, from the desk or back from a contract, drops it", () => {
    const arrived = cityPageUrl(BASE, { wsBase: "ws://h", level: "repo_depot", arrive: { from: "lease_row", gate: 2 } });
    expect(new URL(arrived).searchParams.get("gate")).toBe("2");
    const plain = new URL(cityPageUrl(arrived, { wsBase: "ws://h", level: "repo_depot" })).searchParams;
    expect(plain.has("from") || plain.has("gate")).toBe(false);
    expect(new URL(plain.get("net")!).searchParams.has("gate")).toBe(false);
    expect(loadingFor(cityPageUrl(BASE, { wsBase: "ws://h", level: "repo_depot" })).line).toBe("THE CITY · CONTINUE THE CAMPAIGN");
  });
});

