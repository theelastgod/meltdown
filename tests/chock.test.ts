/**
 * Stage 981: the south-east wall of REPO DEPOT opens onto a fenced lot. The gates are elsewhere.
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
const depot = () => generateDistrict(districtById("repo_depot")!);
const LINE = "SOUTH CHOCK. THE DEPOT WALL IS BEHIND YOU.";

describe("REPO DEPOT opens onto a lot past the south wall", () => {
  it("the street, the passage, and the ground outside are open, and the wall beside the opening is not", () => {
    const L = depot();
    const w = L.chock!;
    expect(w).toBeTruthy();
    expect(capsuleFree(w.street, r, h, L.boxes), "street").toBe(true);
    expect(capsuleFree(w.passage, r, h, L.boxes), "passage").toBe(true);
    expect(capsuleFree(w.outside, r, h, L.boxes), "outside").toBe(true);
    const beside = v3(w.passage.x + 4, 0, w.passage.z);
    expect(capsuleFree(beside, r, h, L.boxes), "wall").toBe(false);
    expect(L.signs?.some((s) => s.text === "SOUTH CHOCK")).toBe(true);
    expect(capsuleFree(v3(w.outside.x, 0, w.outside.z + 4.8), r, h, L.boxes), "far fence").toBe(false);
    expect(capsuleFree(L.bay!.passage, r, h, L.boxes), "bay").toBe(true);
    expect(wildLine(L.bay!.outside, L)).toMatch(/SOUTH BAY/);
    expect(wildLine(L.jack!.outside, L)).toMatch(/EAST JACK/);
    expect(Math.hypot(w.passage.x - L.bay!.passage.x, w.passage.z - L.bay!.passage.z)).toBeGreaterThan(40);
  });

  it("standing outside, the line is the lot's, and it changes no gun", () => {
    const L = depot();
    const w = L.chock!;
    expect(wildLine(w.outside, L)).toBe(LINE);
    expect(wildLine(w.street, L)).toBeNull();
    expect(LINE).not.toMatch(/XP|stamp|damage|spread|recoil/i);
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/wildLine\(p\.pos, level\)/);
  });

  it("the gates and the other districts are not this opening, and the market tarp still answers", () => {
    for (const id of ["lease_row", "deadletter_docks", "night_market", "relay_heights"]) {
      expect(generateDistrict(districtById(id)!).chock, id).toBeUndefined();
    }
    const old: DistrictSpec = { ...districtById("lease_row")!, grid: 3, blocks: ["tower", "split", "court", "market", "plaza", "split", "court", "tower", "market"] };
    expect(generateDistrict(old).chock).toBeUndefined();
    const L = depot();
    for (const g of L.exits ?? []) {
      const dx = g.x - L.chock!.passage.x;
      const dz = g.z - L.chock!.passage.z;
      expect(dx * dx + dz * dz, `${g.dir} gate`).toBeGreaterThan(20 * 20);
    }
    const market = generateDistrict(districtById("night_market")!);
    expect(wildLine(market.tarp!.outside, market)).toMatch(/NORTH TARP/);
  });
});
