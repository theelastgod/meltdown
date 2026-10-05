/**
 * Stage 1115: the north wall of NIGHT MARKET opens onto a fenced lot, between the two north gates.
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
const LINE = "NORTH TWILL. THE MARKET WALL IS BEHIND YOU.";

describe("NIGHT MARKET opens onto a lot between the two north gates", () => {
  it("the street, the passage, and the ground outside are open, and the wall beside the opening is not", () => {
    const L = market();
    const w = L.twill!;
    expect(w).toBeTruthy();
    expect(capsuleFree(w.street, r, h, L.boxes), "street").toBe(true);
    expect(capsuleFree(w.passage, r, h, L.boxes), "passage").toBe(true);
    expect(capsuleFree(w.outside, r, h, L.boxes), "outside").toBe(true);
    const beside = v3(w.passage.x + 2.2, 0, w.passage.z);
    expect(capsuleFree(beside, r, h, L.boxes), "wall").toBe(false);
    expect(L.signs?.some((s) => s.text === "NORTH TWILL")).toBe(true);
    expect(capsuleFree(v3(w.outside.x, 0, w.outside.z - 4.8), r, h, L.boxes), "far fence").toBe(false);
    expect(capsuleFree(L.fringe!.passage, r, h, L.boxes), "fringe").toBe(true);
    expect(capsuleFree(L.valance!.passage, r, h, L.boxes), "valance").toBe(true);
    expect(wildLine(L.fringe!.outside, L)).toMatch(/NORTH FRINGE/);
    expect(wildLine(L.valance!.outside, L)).toMatch(/NORTH VALANCE/);
    expect(Math.hypot(w.passage.x - L.fringe!.passage.x, w.passage.z - L.fringe!.passage.z)).toBeGreaterThan(4);
    expect(Math.hypot(w.passage.x - L.valance!.passage.x, w.passage.z - L.valance!.passage.z)).toBeGreaterThan(4);
  });

  it("standing outside, the line is the lot's, and it changes no gun", () => {
    const L = market();
    const w = L.twill!;
    expect(wildLine(w.outside, L)).toBe(LINE);
    expect(wildLine(w.street, L)).toBeNull();
    expect(LINE).not.toMatch(/XP|stamp|damage|spread|recoil/i);
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/wildLine\(p\.pos, level\)/);
  });

  it("the gates and the other districts are not this opening, and the docks kingpost still answers", () => {
    for (const id of ["lease_row", "deadletter_docks", "repo_depot", "relay_heights"]) {
      expect(generateDistrict(districtById(id)!).twill, id).toBeUndefined();
    }
    const old: DistrictSpec = { ...districtById("lease_row")!, grid: 3, blocks: ["tower", "split", "court", "market", "plaza", "split", "court", "tower", "market"] };
    expect(generateDistrict(old).twill).toBeUndefined();
    const L = market();
    for (const g of L.exits ?? []) {
      const dx = g.x - L.twill!.passage.x;
      const dz = g.z - L.twill!.passage.z;
      expect(dx * dx + dz * dz, `${g.dir} gate`).toBeGreaterThan(20 * 20);
    }
    const docks = generateDistrict(districtById("deadletter_docks")!);
    expect(wildLine(docks.kingpost!.outside, docks)).toMatch(/NORTH KINGPOST/);
  });
});
