/**
 * Two more districts (Stage 701): NIGHT MARKET and RELAY HEIGHTS.
 *
 * The city was three districts joined by their gates, so a file walking east came back to where it
 * started after two crossings. These hold what the two new ones promise: each is its own place (its
 * own blocks, crowd, traffic and patrols, a cast the renderer already dresses), each is a 3×3
 * district built by the one generator and pinned by hash like the old ones, a Blank can walk from
 * any spawn to every node, claim and safe zone, its eight gates are there, and the gate map still
 * pairs every gate both ways and joins every district to every other. The frame budget in
 * `tests/citycost.test.ts` measures every entry of DISTRICT_SPECS, so it measures these two under
 * the same 190k it holds the others to.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DISTRICT_SPECS, districtById, districtGrid, districtHalf, generateDistrict, type DistrictSpec } from "../shared/sim/city";
import { LEVEL_INFO, levelById, levelDisplayName } from "../shared/sim/level";
import { buildNav, cellOf, reachableFrom, walkable } from "../shared/sim/nav";
import { capsuleFree } from "../shared/sim/collision";
import { MOVE } from "../shared/sim/constants";
import { CITY_DISTRICTS, cityDistrict, cityRoomName } from "../shared/net/city";
import { gateArrival, gateSide, GATES_PER_DISTRICT, neighbourAt } from "../shared/net/citygates";
import { applyRound, DISTRICTS as SEASON_DISTRICTS, emptySeason, NODE_LABELS } from "../shared/endgame/season";
import { LEVEL_ART } from "../client/loading";

const NEW = ["night_market", "relay_heights"] as const;
const spec = (id: string): DistrictSpec => districtById(id)!;
const hash = (s: DistrictSpec): string => createHash("sha256").update(JSON.stringify(generateDistrict(s))).digest("hex");

/** sha256 of JSON.stringify(generateDistrict(spec)). Night market was re-pinned at Stage 957, when the south wall opened. Relay heights was re-pinned at Stage 958, when the south wall opened. */
const PINNED: Record<(typeof NEW)[number], string> = {
  night_market: "cbaf3f3133adcd0861d026f2b9f5bf27cbde26a6bd639b095a6bb4c32bd6083f",
  relay_heights: "94c6972252f0a4b2e0ba65254c138e0b9fdaea96c4bb798d5c066ec3e3ec15a6",
};
/** Night market before Stage 950. Sealing the north lot puts this hash back. */
const NIGHT_SEALED = "49596a55f53b93a510a3e9ef2c20a0f7a3a98afe8521cc3761f9839c79bb2e56";
/** Night market after Stage 950. Sealing the south row puts this hash back. */
const NIGHT_LANE = "b1a6ca161b94a4dbfe5c578015731fa57ce8fc8efa1bcd694801fec4af6f467c";
/** Relay heights after Stage 949. Sealing the south span puts this hash back. */
const RELAY_RACK = "0960af48b982c704f216cd0a42232cc5bf4b8f2e8cc5d53164d31cd440ee7cd7";

describe("the city has five districts", () => {
  it("the two new ones are in the generator, the level registry, the city's rooms and the season's graph, after the three it had", () => {
    const ids = DISTRICT_SPECS.map((d) => d.id);
    expect(ids).toEqual(["lease_row", "deadletter_docks", "repo_depot", "night_market", "relay_heights"]);
    // the frame budget, the gates and the Deep Wake all read this one list
    expect(CITY_DISTRICTS).toEqual(ids);
    expect(SEASON_DISTRICTS).toEqual(ids);
    expect(LEVEL_INFO.filter((l) => l.kind === "district").map((l) => l.id)).toEqual(ids);
    for (const id of NEW) {
      expect(cityDistrict(id)).toBe(id);
      expect(cityRoomName(id)).toBe(`city-${id}`);
      expect(levelById(id).name).toBe(id);
    }
    expect(levelDisplayName("night_market")).toBe("NIGHT MARKET");
    expect(levelDisplayName("relay_heights")).toBe("RELAY HEIGHTS");
  });

  it("each is its own place: its name, seed, blocks, crowd, traffic and patrols differ from every other district's", () => {
    const counts = (s: DistrictSpec) => JSON.stringify([...s.blocks].sort());
    for (const id of NEW) {
      const s = spec(id);
      for (const o of DISTRICT_SPECS.filter((d) => d.id !== id)) {
        expect(s.displayName, `${id} vs ${o.id}`).not.toBe(o.displayName);
        expect(s.seed, `${id} vs ${o.id}`).not.toBe(o.seed);
        expect(counts(s), `${id}'s block mix is ${o.id}'s`).not.toBe(counts(o));
        expect([s.pedestrians, s.carDensity, s.wasps, s.mechs], `${id} vs ${o.id}`).not.toEqual([o.pedestrians, o.carDensity, o.wasps, o.mechs]);
      }
    }
    // the market is stalls and courtyards with the thickest crowd of the 3×3 districts and the fewest cars
    const m = spec("night_market");
    expect(m.blocks.filter((b) => b === "market" || b === "court").length).toBe(7);
    const small = DISTRICT_SPECS.filter((d) => districtGrid(d) === 3);
    expect(Math.max(...small.map((d) => d.pedestrians))).toBe(m.pedestrians);
    expect(Math.min(...DISTRICT_SPECS.map((d) => d.carDensity))).toBe(m.carDensity);
    // the heights are towers, with the thinnest crowd of any district
    const r = spec("relay_heights");
    expect(r.blocks.filter((b) => b === "tower").length).toBe(5);
    expect(Math.min(...DISTRICT_SPECS.map((d) => d.pedestrians))).toBe(r.pedestrians);
  });

  it("each is three blocks by three, 108 m across, with the plaza at its centre", () => {
    for (const id of NEW) {
      const s = spec(id);
      expect(districtGrid(s), id).toBe(3);
      expect(s.blocks, id).toHaveLength(9);
      expect(s.blocks[4], id).toBe("plaza");
      expect(s.blocks.filter((b) => b === "plaza"), id).toHaveLength(1);
      expect(generateDistrict(s).bounds, id).toBe(districtHalf(s));
      expect(districtHalf(s)).toBe(54);
    }
  });

  it("each generates deterministically, and builds the level it was added with", () => {
    for (const id of NEW) {
      const s = spec(id);
      expect(JSON.stringify(generateDistrict(s)), id).toBe(JSON.stringify(generateDistrict({ ...s })));
      expect(hash(s), id).toBe(PINNED[id]);
      // the grid written out builds the same level as the default
      expect(hash({ ...s, grid: 3 }), id).toBe(PINNED[id]);
    }
    expect(PINNED.night_market).not.toBe(NIGHT_SEALED);
    expect(PINNED.night_market).not.toBe(NIGHT_LANE);
    expect(PINNED.relay_heights).not.toBe(RELAY_RACK);
    expect(generateDistrict(spec("night_market")).stall?.line).toMatch(/SOUTH ROW/);
    expect(generateDistrict(spec("relay_heights")).span?.line).toMatch(/SOUTH SPAN/);
    expect(generateDistrict(spec("night_market")).lane?.line).toMatch(/OPEN AIR/);
  });

  it("each is a place a crew can play: the patrols the spec asks for, claims for THE RUN, two safe zones, a picture on the loading card", () => {
    for (const id of NEW) {
      const s = spec(id);
      const L = generateDistrict(s);
      expect(L.wasps.length, id).toBe(s.wasps);
      expect(L.mechs.length, id).toBe(s.mechs);
      expect(L.pedestrians, id).toBe(s.pedestrians);
      expect(L.district, id).toBe(s.cast);
      expect(L.nodes.map((n) => n.label), id).toEqual(["A", "B", "C", "D", "E"]);
      expect(L.zones!.filter((z) => z.kind === "safe").length, id).toBe(2);
      expect(L.claims!.length, id).toBeGreaterThanOrEqual(10);
      for (const c of L.claims!) for (const z of L.zones!) expect(Math.hypot(c.pos.x - z.pos.x, c.pos.z - z.pos.z), id).toBeGreaterThan(z.radius + 2);
      // the loading card names a picture, and it is one that ships
      expect(LEVEL_ART[id], id).toBeTruthy();
      expect(existsSync(new URL(`../public${LEVEL_ART[id]}`, import.meta.url)), LEVEL_ART[id]).toBe(true);
    }
  });
});

describe("a Blank can walk every new district", () => {
  for (const id of NEW) {
    it(`${id}: every spawn reaches every node, every claim and both safe zones at street level`, () => {
      const L = levelById(id);
      const nav = buildNav(L);
      const on = (reach: Set<number>, x: number, z: number, what: string) => {
        const c = cellOf(nav, x, z);
        expect(walkable(nav, c.i, c.j), `${id} ${what} (${x}, ${z}) stands on walkable ground`).toBe(true);
        expect(reach.has(c.j * nav.w + c.i), `${id} ${what} (${x}, ${z}) is reachable`).toBe(true);
      };
      for (const sp of L.spawns) {
        const reach = reachableFrom(nav, sp.pos);
        for (const s of L.spawns) on(reach, s.pos.x, s.pos.z, "spawn");
        for (const n of L.nodes) on(reach, n.pos.x, n.pos.z, `node ${n.label}`);
        for (const cl of L.claims!) on(reach, cl.pos.x, cl.pos.z, `claim worth ${cl.value}`);
        for (const z of L.zones!) on(reach, z.pos.x, z.pos.z, `safe zone ${z.label}`);
        // and every gate's arrival point: a file walking in can walk on
        for (let g = 0; g < GATES_PER_DISTRICT; g++) {
          const a = gateArrival(L, g)!.pos;
          on(reach, a.x, a.z, `gate ${g} arrival`);
        }
      }
    });

    it(`${id}: spawns, nodes, claims, zones and gate arrivals stand clear of every box`, () => {
      const L = levelById(id);
      const free = (x: number, z: number) => capsuleFree({ x, y: 0.03, z }, MOVE.capsuleRadius, MOVE.standHeight, L.boxes);
      for (const s of L.spawns) expect(free(s.pos.x, s.pos.z), `spawn ${s.pos.x},${s.pos.z}`).toBe(true);
      for (const n of L.nodes) expect(free(n.pos.x, n.pos.z), `node ${n.label}`).toBe(true);
      for (const c of L.claims!) expect(free(c.pos.x, c.pos.z), `claim ${c.pos.x},${c.pos.z}`).toBe(true);
      for (const z of L.zones!) expect(free(z.pos.x, z.pos.z), `zone ${z.label}`).toBe(true);
      for (let g = 0; g < GATES_PER_DISTRICT; g++) {
        const a = gateArrival(L, g)!.pos;
        expect(free(a.x, a.z), `gate ${g} arrival`).toBe(true);
      }
    });
  }
});

describe("the gates join five districts", () => {
  it("each new district has its eight gates, numbered in the order the map reads them", () => {
    for (const id of NEW) {
      const L = levelById(id);
      expect(L.exits!.length, id).toBe(GATES_PER_DISTRICT);
      L.exits!.forEach((e, g) => expect(e.dir, `${id} gate ${g}`).toBe(gateSide(g)));
      expect(L.boxes.filter((b) => b.tag === "gate").length, id).toBe(GATES_PER_DISTRICT);
    }
  });

  it("every gate of every district pairs with one gate of a neighbour, both ways, and never with itself", () => {
    const seen = new Set<string>();
    for (const d of CITY_DISTRICTS) {
      for (let g = 0; g < GATES_PER_DISTRICT; g++) {
        const to = neighbourAt(d, g)!;
        expect(to, `${d} gate ${g}`).not.toBeNull();
        expect(to.district, `${d} gate ${g}`).not.toBe(d);
        expect(neighbourAt(to.district, to.gate), `${d} ${g} → ${to.district} ${to.gate}`).toEqual({ district: d, gate: g });
        // no two gates land at the same gate: the pairing is one to one
        const key = `${to.district}:${to.gate}`;
        expect(seen.has(key), key).toBe(false);
        seen.add(key);
      }
    }
    expect(seen.size).toBe(CITY_DISTRICTS.length * GATES_PER_DISTRICT);
  });

  it("the map runs round all five: east from REPO DEPOT is the market, the heights are west of LEASE ROW, and every district reaches every other", () => {
    const go = (d: string, side: "n" | "s" | "w" | "e") => neighbourAt(d, ["n", "s", "w", "e"].indexOf(side))!.district;
    expect(go("repo_depot", "e")).toBe("night_market");
    expect(go("night_market", "e")).toBe("relay_heights");
    expect(go("relay_heights", "e")).toBe("lease_row");
    expect(go("lease_row", "w")).toBe("relay_heights");
    expect(go("lease_row", "n")).toBe("relay_heights");
    expect(go("night_market", "w")).toBe("repo_depot");
    // walking east visits every district once before it comes home
    const loop = [CITY_DISTRICTS[0]!];
    while (loop.length <= CITY_DISTRICTS.length) loop.push(go(loop[loop.length - 1]!, "e"));
    expect(new Set(loop.slice(0, -1)).size).toBe(CITY_DISTRICTS.length);
    expect(loop[loop.length - 1]).toBe(CITY_DISTRICTS[0]);
    for (const a of CITY_DISTRICTS) {
      const seen = new Set([a]);
      const todo = [a];
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
      expect([...seen].sort(), `from ${a}`).toEqual([...CITY_DISTRICTS].sort());
    }
  });
});

describe("the Deep Wake holds the new districts' nodes", () => {
  it("a fresh season has five nodes in each; a round played in one moves its graph", () => {
    const st = emptySeason(3);
    for (const id of NEW) expect(Object.keys(st.districts[id]!), id).toEqual([...NODE_LABELS]);
    applyRound(st, { level: "night_market", flips: [{ label: "C", house: "clockeaters", count: 2 }], winners: [] }, 3 * 28 * 86_400_000 + 1);
    expect(st.districts["night_market"]!["C"]!.pressure.clockeaters).toBe(2);
    expect(st.last).toMatch(/NIGHT MARKET/);
  });

  it("a season stored before the district existed opens its graph on the district's first round, and leaves the others as they were", () => {
    const st = emptySeason(3);
    delete st.districts["relay_heights"];
    st.districts["lease_row"]!["A"]!.house = "estate";
    const before = JSON.stringify(st.districts["lease_row"]);
    applyRound(st, { level: "relay_heights", flips: [{ label: "E", house: "cells", count: 1 }], winners: [] }, 3 * 28 * 86_400_000 + 1);
    expect(Object.keys(st.districts["relay_heights"]!)).toEqual([...NODE_LABELS]);
    expect(st.districts["relay_heights"]!["E"]!.pressure.cells).toBe(1);
    expect(JSON.stringify(st.districts["lease_row"])).toBe(before);
    // a level that is not a district still opens nothing
    expect(applyRound(st, { level: "drainage_yard", flips: [{ label: "A", house: "cells", count: 9 }], winners: [] }, 3 * 28 * 86_400_000 + 1)).toEqual([]);
    expect(st.districts["drainage_yard"]).toBeUndefined();
  });
});
