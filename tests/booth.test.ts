/**
 * Stage 964: the west wall of NIGHT MARKET opens onto a fenced lot. The gates are elsewhere.
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
const market = () => generateDistrict(districtById("night_market")!);
const LINE = "WEST BOOTH. THE MARKET WALL IS BEHIND YOU.";

describe("NIGHT MARKET opens onto a lot past the west wall", () => {
  it("the street, the passage, and the ground outside are open, and the wall beside the opening is not", () => {
    const L = market();
    const w = L.booth!;
    expect(w).toBeTruthy();
    expect(capsuleFree(w.street, r, h, L.boxes), "street").toBe(true);
    expect(capsuleFree(w.passage, r, h, L.boxes), "passage").toBe(true);
    expect(capsuleFree(w.outside, r, h, L.boxes), "outside").toBe(true);
    const beside = v3(w.passage.x, 0, w.passage.z - 4);
    expect(capsuleFree(beside, r, h, L.boxes), "wall").toBe(false);
    expect(L.signs?.some((s) => s.text === "WEST BOOTH")).toBe(true);
    expect(capsuleFree(v3(w.outside.x - 4.8, 0, w.outside.z), r, h, L.boxes), "far fence").toBe(false);
    expect(wildLine(L.aisle!.outside, L)).toMatch(/EAST AISLE/);
    expect(wildLine(L.lane!.outside, L)).toMatch(/OPEN AIR/);
    expect(wildLine(L.stall!.outside, L)).toMatch(/SOUTH ROW/);
    expect(Math.hypot(w.passage.x - L.aisle!.passage.x, w.passage.z - L.aisle!.passage.z)).toBeGreaterThan(40);
  });

  it("standing outside, the line is the lot's, and it changes no gun", () => {
    const L = market();
    const w = L.booth!;
    expect(wildLine(w.outside, L)).toBe(LINE);
    expect(wildLine(w.street, L)).toBeNull();
    expect(LINE).not.toMatch(/XP|stamp|damage|spread|recoil/i);
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/wildLine\(p\.pos, level\)/);
  });

  it("the gates and the other districts are not this opening, and the heights ledge still answers", () => {
    for (const id of ["lease_row", "deadletter_docks", "repo_depot", "relay_heights"]) {
      expect(generateDistrict(districtById(id)!).booth, id).toBeUndefined();
    }
    const old: DistrictSpec = { ...districtById("lease_row")!, grid: 3, blocks: ["tower", "split", "court", "market", "plaza", "split", "court", "tower", "market"] };
    expect(generateDistrict(old).booth).toBeUndefined();
    const L = market();
    for (const g of L.exits ?? []) {
      const dx = g.x - L.booth!.passage.x;
      const dz = g.z - L.booth!.passage.z;
      expect(dx * dx + dz * dz, `${g.dir} gate`).toBeGreaterThan(20 * 20);
    }
    const heights = generateDistrict(districtById("relay_heights")!);
    expect(wildLine(heights.ledge!.outside, heights)).toMatch(/NORTH LEDGE/);
  });
});
