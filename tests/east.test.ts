/**
 * Stage 945: the east wall of LEASE ROW has a slot onto open ground. The gates, the north lot,
 * and the south yard are elsewhere. Putting the solid facade back seals the passage.
 */
import { describe, expect, it } from "vitest";
import { districtById, generateDistrict, type DistrictSpec } from "../shared/sim/city";
import { capsuleFree } from "../shared/sim/collision";
import { MOVE } from "../shared/sim/constants";
import { v3 } from "../shared/math/vec3";
import { shopLine, wildLine } from "../shared/sim/shop";

const r = MOVE.capsuleRadius;
const h = MOVE.standHeight;
const lease = () => generateDistrict(districtById("lease_row")!);

describe("LEASE ROW opens onto ground past the east wall", () => {
  it("the street, the passage, and the ground outside are open, and the wall beside the slot is not", () => {
    const L = lease();
    const e = L.east!;
    expect(e).toBeTruthy();
    expect(capsuleFree(e.street, r, h, L.boxes), "street").toBe(true);
    expect(capsuleFree(e.passage, r, h, L.boxes), "passage").toBe(true);
    expect(capsuleFree(e.outside, r, h, L.boxes), "outside").toBe(true);
    const beside = v3(e.passage.x, 0, e.passage.z + 4);
    expect(capsuleFree(beside, r, h, L.boxes), "wall").toBe(false);
    expect(L.signs?.some((s) => s.text === "EAST LOT")).toBe(true);
    expect(L.wild && L.yard && L.shop && L.pawn && L.night).toBeTruthy();
    expect(Math.hypot(e.passage.x - L.wild!.passage.x, e.passage.z - L.wild!.passage.z)).toBeGreaterThan(40);
    expect(Math.hypot(e.passage.x - L.yard!.passage.x, e.passage.z - L.yard!.passage.z)).toBeGreaterThan(40);
  });

  it("standing outside, the lot says the wall is behind you, and the other edges and counters still answer", () => {
    const L = lease();
    const e = L.east!;
    expect(wildLine(e.outside, L)).toBe("EAST LOT. THE WALL IS BEHIND YOU.");
    expect(wildLine(e.street, L)).toBeNull();
    expect(wildLine(L.wild!.outside, L)).toBe("PAST THE LEASE. THE STREET ENDS HERE.");
    expect(wildLine(L.yard!.outside, L)).toBe("SOUTH YARD. THE WALL IS BEHIND YOU.");
    expect(shopLine(L.shop!.counter, L)).toMatch(/NOODLE 24/);
    expect(shopLine(L.pawn!.counter, L)).toMatch(/PAWN/);
    expect(shopLine(L.night!.counter, L)).toMatch(/NIGHT CO/);
  });

  it("the gates and the other districts are not this opening", () => {
    for (const id of ["deadletter_docks", "repo_depot", "night_market", "relay_heights"]) {
      expect(generateDistrict(districtById(id)!).east, id).toBeUndefined();
    }
    const old: DistrictSpec = { ...districtById("lease_row")!, grid: 3, blocks: ["tower", "split", "court", "market", "plaza", "split", "court", "tower", "market"] };
    expect(generateDistrict(old).east).toBeUndefined();
    const L = lease();
    for (const g of L.exits ?? []) {
      const dx = g.x - L.east!.passage.x;
      const dz = g.z - L.east!.passage.z;
      expect(dx * dx + dz * dz, `${g.dir} gate`).toBeGreaterThan(20 * 20);
    }
  });
});
