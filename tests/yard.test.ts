/**
 * Stage 943: the south wall of LEASE ROW has an opening onto open ground. The gates, the north
 * opening, and the two warehouse rooms are elsewhere. Putting the solid facade back seals the passage.
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

describe("LEASE ROW opens onto a yard past the south wall", () => {
  it("the street, the passage, and the ground outside are open, and the wall beside the opening is not", () => {
    const L = lease();
    const y = L.yard!;
    expect(y).toBeTruthy();
    expect(capsuleFree(y.street, r, h, L.boxes), "street").toBe(true);
    expect(capsuleFree(y.passage, r, h, L.boxes), "passage").toBe(true);
    expect(capsuleFree(y.outside, r, h, L.boxes), "outside").toBe(true);
    const beside = v3(y.passage.x - 4, 0, y.passage.z);
    expect(capsuleFree(beside, r, h, L.boxes), "wall").toBe(false);
    expect(L.signs?.some((s) => s.text === "SOUTH YARD")).toBe(true);
    expect(capsuleFree(v3(y.outside.x, 0, y.outside.z + 4.85), r, h, L.boxes), "far fence").toBe(false);
    // the north lot and both rooms stay open, and this is not either of them
    expect(L.wild).toBeTruthy();
    expect(Math.hypot(y.passage.x - L.wild!.passage.x, y.passage.z - L.wild!.passage.z)).toBeGreaterThan(40);
    expect(capsuleFree(L.shop!.inside, r, h, L.boxes), "noodle").toBe(true);
    expect(capsuleFree(L.pawn!.inside, r, h, L.boxes), "pawn").toBe(true);
  });

  it("standing outside, the yard says the wall is behind you, and the north lot still says the street has ended", () => {
    const L = lease();
    const y = L.yard!;
    expect(wildLine(y.outside, L)).toBe("SOUTH YARD. THE WALL IS BEHIND YOU.");
    expect(wildLine(y.street, L)).toBeNull();
    expect(wildLine(L.wild!.outside, L)).toBe("PAST THE LEASE. THE STREET ENDS HERE.");
    expect(shopLine(L.shop!.counter, L)).toMatch(/NOODLE 24/);
    expect(shopLine(L.pawn!.counter, L)).toMatch(/PAWN/);
  });

  it("the gates and the other districts are not this opening", () => {
    for (const id of ["deadletter_docks", "repo_depot", "night_market", "relay_heights"]) {
      expect(generateDistrict(districtById(id)!).yard, id).toBeUndefined();
    }
    const old: DistrictSpec = { ...districtById("lease_row")!, grid: 3, blocks: ["tower", "split", "court", "market", "plaza", "split", "court", "tower", "market"] };
    expect(generateDistrict(old).yard).toBeUndefined();
    const L = lease();
    for (const g of L.exits ?? []) {
      const dx = g.x - L.yard!.passage.x;
      const dz = g.z - L.yard!.passage.z;
      expect(dx * dx + dz * dz, `${g.dir} gate`).toBeGreaterThan(20 * 20);
    }
  });
});
