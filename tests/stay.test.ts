/**
 * Stage 989: the north-east wall of RELAY HEIGHTS opens onto a fenced lot, between the gate and the ledge.
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
const heights = () => generateDistrict(districtById("relay_heights")!);
const LINE = "NORTH STAY. THE TOWER WALL IS BEHIND YOU.";

describe("RELAY HEIGHTS opens onto a lot past the north wall", () => {
  it("the street, the passage, and the ground outside are open, and the wall beside the opening is not", () => {
    const L = heights();
    const w = L.stay!;
    expect(w).toBeTruthy();
    expect(capsuleFree(w.street, r, h, L.boxes), "street").toBe(true);
    expect(capsuleFree(w.passage, r, h, L.boxes), "passage").toBe(true);
    expect(capsuleFree(w.outside, r, h, L.boxes), "outside").toBe(true);
    const beside = v3(w.passage.x + 4, 0, w.passage.z);
    expect(capsuleFree(beside, r, h, L.boxes), "wall").toBe(false);
    expect(L.signs?.some((s) => s.text === "NORTH STAY")).toBe(true);
    expect(capsuleFree(v3(w.outside.x, 0, w.outside.z - 4.8), r, h, L.boxes), "far fence").toBe(false);
    expect(capsuleFree(L.ledge!.passage, r, h, L.boxes), "ledge").toBe(true);
    expect(wildLine(L.ledge!.outside, L)).toMatch(/NORTH LEDGE/);
    expect(wildLine(L.vane!.outside, L)).toMatch(/NORTH VANE/);
    expect(Math.hypot(w.passage.x - L.ledge!.passage.x, w.passage.z - L.ledge!.passage.z)).toBeGreaterThan(20);
  });

  it("standing outside, the line is the lot's, and it changes no gun", () => {
    const L = heights();
    const w = L.stay!;
    expect(wildLine(w.outside, L)).toBe(LINE);
    expect(wildLine(w.street, L)).toBeNull();
    expect(LINE).not.toMatch(/XP|stamp|damage|spread|recoil/i);
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/wildLine\(p\.pos, level\)/);
  });

  it("the gates and the other districts are not this opening, and the market valance still answers", () => {
    for (const id of ["lease_row", "deadletter_docks", "repo_depot", "night_market"]) {
      expect(generateDistrict(districtById(id)!).stay, id).toBeUndefined();
    }
    const old: DistrictSpec = { ...districtById("lease_row")!, grid: 3, blocks: ["tower", "split", "court", "market", "plaza", "split", "court", "tower", "market"] };
    expect(generateDistrict(old).stay).toBeUndefined();
    const L = heights();
    for (const g of L.exits ?? []) {
      const dx = g.x - L.stay!.passage.x;
      const dz = g.z - L.stay!.passage.z;
      expect(dx * dx + dz * dz, `${g.dir} gate`).toBeGreaterThan(20 * 20);
    }
    const market = generateDistrict(districtById("night_market")!);
    expect(wildLine(market.valance!.outside, market)).toMatch(/NORTH VALANCE/);
  });
});
