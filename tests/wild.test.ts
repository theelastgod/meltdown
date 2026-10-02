/**
 * Stage 941: the north wall of LEASE ROW has an opening onto open ground. The gates are elsewhere.
 * Putting the solid facade back seals the passage.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { districtById, generateDistrict, type DistrictSpec } from "../shared/sim/city";
import { capsuleFree } from "../shared/sim/collision";
import { MOVE } from "../shared/sim/constants";
import { v3 } from "../shared/math/vec3";
import { wildLine } from "../shared/sim/shop";

const r = MOVE.capsuleRadius;
const h = MOVE.standHeight;
const lease = () => generateDistrict(districtById("lease_row")!);

describe("LEASE ROW opens onto ground past the wall", () => {
  it("the street, the passage, and the ground outside are open, and the wall beside the opening is not", () => {
    const L = lease();
    const w = L.wild!;
    expect(w).toBeTruthy();
    expect(capsuleFree(w.street, r, h, L.boxes), "street").toBe(true);
    expect(capsuleFree(w.passage, r, h, L.boxes), "passage").toBe(true);
    expect(capsuleFree(w.outside, r, h, L.boxes), "outside").toBe(true);
    const beside = v3(w.passage.x - 4, 0, w.passage.z);
    expect(capsuleFree(beside, r, h, L.boxes), "wall").toBe(false);
    expect(L.signs?.some((s) => s.text === "CITY LIMIT")).toBe(true);
    // the lot's fence is above a mantle, so the open ground is a place
    expect(capsuleFree(v3(w.outside.x, 0, w.outside.z - 7.85), r, h, L.boxes), "far fence").toBe(false);
  });

  it("standing outside, the street says it has ended", () => {
    const L = lease();
    const w = L.wild!;
    expect(wildLine(w.outside, L)).toBe("PAST THE LEASE. THE STREET ENDS HERE.");
    expect(wildLine(w.street, L)).toBeNull();
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/wildLine\(p\.pos, level\)/);
    expect(src).toMatch(/else if \(edge\) g\.hud\.setGate\(edge\)/);
  });

  it("the gates and the other districts are not this opening", () => {
    for (const id of ["deadletter_docks", "repo_depot", "night_market", "relay_heights"]) {
      expect(generateDistrict(districtById(id)!).wild, id).toBeUndefined();
    }
    const old: DistrictSpec = { ...districtById("lease_row")!, grid: 3, blocks: ["tower", "split", "court", "market", "plaza", "split", "court", "tower", "market"] };
    expect(generateDistrict(old).wild).toBeUndefined();
    const L = lease();
    for (const g of L.exits ?? []) {
      const dx = g.x - L.wild!.passage.x;
      const dz = g.z - L.wild!.passage.z;
      expect(dx * dx + dz * dz, `${g.dir} gate`).toBeGreaterThan(20 * 20);
    }
  });
});
