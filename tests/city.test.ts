/**
 * Neo-China proper: the districts are generated, not hand-placed, so the tests
 * prove what a level designer would walk: every spawn reaches every node at
 * street level, the walkway is reachable by its stairs, nothing spawns
 * inside a wall, and the same seed always builds the same city.
 */
import { describe, expect, it } from "vitest";
import { DISTRICT_SPECS, generateDistrict, CITY_HALF } from "../shared/sim/city";
import { levelById, LEVEL_IDS, DEFAULT_LEVEL_ID } from "../shared/sim/level";
import { buildNav, findPath, nearestCell, reachableFrom } from "../shared/sim/nav";
import { capsuleFree } from "../shared/sim/collision";
import { MOVE } from "../shared/sim/constants";
import { World, hashWorld } from "../shared/sim/world";
import { Btn } from "../shared/sim/input";

describe("city districts", () => {
  it("the registry serves the range and three districts; the default is a district", () => {
    expect(LEVEL_IDS).toEqual(["drainage_yard", "lease_row", "deadletter_docks", "repo_depot", "deadletter_office", "white_office"]);
    expect(levelById(DEFAULT_LEVEL_ID).district).toBe("magenta");
    expect(levelById("nonsense").name).toBe(DEFAULT_LEVEL_ID);
  });
  it("is deterministic: the same spec builds byte-identical geometry", () => {
    for (const spec of DISTRICT_SPECS) {
      const a = generateDistrict(spec);
      const b = generateDistrict(spec);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.boxes.length).toBeGreaterThan(200);
      expect((a.signs ?? []).length).toBeGreaterThan(30);
    }
  });
  it("spawns and nodes stand in free space on the ground", () => {
    for (const spec of DISTRICT_SPECS) {
      const L = generateDistrict(spec);
      for (const s of L.spawns) expect(capsuleFree({ x: s.pos.x, y: s.pos.y + 0.03, z: s.pos.z }, MOVE.capsuleRadius, MOVE.standHeight, L.boxes), `${spec.id} spawn ${s.pos.x},${s.pos.z}`).toBe(true);
      for (const n of L.nodes) expect(capsuleFree({ x: n.pos.x, y: n.pos.y + 0.03, z: n.pos.z }, MOVE.capsuleRadius, MOVE.standHeight, L.boxes), `${spec.id} node ${n.label} ${n.pos.x},${n.pos.z}`).toBe(true);
      for (const n of L.nodes) expect(Math.max(Math.abs(n.pos.x), Math.abs(n.pos.z))).toBeLessThan(CITY_HALF - 4);
    }
  });
  it("every spawn reaches every node at street level, in every district", () => {
    for (const id of LEVEL_IDS) {
      const L = levelById(id);
      const nav = buildNav(L);
      const reach = reachableFrom(nav, L.spawns[0]!.pos);
      for (const s of L.spawns) {
        const c = nearestCell(nav, s.pos.x, s.pos.z)!;
        expect(reach.has(c.j * nav.w + c.i), `${id} spawn (${s.pos.x},${s.pos.z})`).toBe(true);
      }
      for (const n of L.nodes) {
        const c = nearestCell(nav, n.pos.x, n.pos.z)!;
        expect(reach.has(c.j * nav.w + c.i), `${id} node ${n.label}`).toBe(true);
        expect(findPath(nav, L.spawns[0]!.pos, n.pos)).not.toBeNull();
      }
    }
  });
  it("the elevated walkway is reachable up its stairs (steps, no mantle)", () => {
    for (const spec of DISTRICT_SPECS) {
      const L = generateDistrict(spec);
      const nav = buildNav(L, 0.5, 0.05, 6);
      const walk = L.boxes.find((b) => b.tag === "walkway")!;
      const mid = { x: (walk.min.x + walk.max.x) / 2, y: walk.max.y, z: (walk.min.z + walk.max.z) / 2 };
      const path = findPath(nav, L.spawns[0]!.pos, mid);
      expect(path, spec.id).not.toBeNull();
      expect(path![path!.length - 1]!.y).toBeCloseTo(walk.max.y, 1);
    }
  });
  it("a district plays: the wake starts, a Blank walks a street, and the world hashes deterministically", () => {
    const mk = () => new World(levelById("lease_row"), { ai: true, seed: 9 });
    const w1 = mk();
    const w2 = mk();
    const p1 = w1.addPlayer(1, "A");
    const p2 = w2.addPlayer(1, "A");
    for (let t = 0; t < 240; t++) {
      const input = { buttons: Btn.Forward | Btn.Sprint, yaw: p1.yaw, pitch: 0 };
      w1.step(new Map([[1, [{ ...input, tick: t }]]]));
      w2.step(new Map([[1, [{ ...input, tick: t }]]]));
    }
    expect(hashWorld(w1)).toBe(hashWorld(w2));
    expect(Math.hypot(p1.pos.x - w1.level.spawns[0]!.pos.x, p1.pos.z - w1.level.spawns[0]!.pos.z)).toBeGreaterThan(8);
    expect(w1.wake!.phase).toBe("wake");
    expect(w1.wasps.length).toBe(3);
    expect(w1.mechs.length).toBe(1);
  });
});
