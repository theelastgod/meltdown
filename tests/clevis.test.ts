/**
 * Stage 1022: the west wall of REPO DEPOT opens onto a fenced lot, between the apron and the south-west gate.
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
const LINE = "WEST CLEVIS. THE DEPOT WALL IS BEHIND YOU.";

describe("REPO DEPOT opens onto a lot past the west wall", () => {
  it("the street, the passage, and the ground outside are open, and the wall beside the opening is not", () => {
    const L = depot();
    const w = L.clevis!;
    expect(w).toBeTruthy();
    expect(capsuleFree(w.street, r, h, L.boxes), "street").toBe(true);
    expect(capsuleFree(w.passage, r, h, L.boxes), "passage").toBe(true);
    expect(capsuleFree(w.outside, r, h, L.boxes), "outside").toBe(true);
    const beside = v3(w.passage.x, 0, w.passage.z + 4);
    expect(capsuleFree(beside, r, h, L.boxes), "wall").toBe(false);
    expect(L.signs?.some((s) => s.text === "WEST CLEVIS")).toBe(true);
    expect(capsuleFree(v3(w.outside.x - 4.8, 0, w.outside.z), r, h, L.boxes), "far fence").toBe(false);
    expect(capsuleFree(L.apron!.passage, r, h, L.boxes), "apron").toBe(true);
    expect(wildLine(L.apron!.outside, L)).toMatch(/WEST APRON/);
    expect(wildLine(L.skid!.outside, L)).toMatch(/WEST SKID/);
    expect(Math.hypot(w.passage.x - L.apron!.passage.x, w.passage.z - L.apron!.passage.z)).toBeGreaterThan(8);
  });

  it("standing outside, the line is the lot's, and it changes no gun", () => {
    const L = depot();
    const w = L.clevis!;
    expect(wildLine(w.outside, L)).toBe(LINE);
    expect(wildLine(w.street, L)).toBeNull();
    expect(LINE).not.toMatch(/XP|stamp|damage|spread|recoil/i);
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/wildLine\(p\.pos, level\)/);
  });

  it("the gates and the other districts are not this opening, and the heights tack still answers", () => {
    for (const id of ["lease_row", "deadletter_docks", "night_market", "relay_heights"]) {
      expect(generateDistrict(districtById(id)!).clevis, id).toBeUndefined();
    }
    const old: DistrictSpec = { ...districtById("lease_row")!, grid: 3, blocks: ["tower", "split", "court", "market", "plaza", "split", "court", "tower", "market"] };
    expect(generateDistrict(old).clevis).toBeUndefined();
    const L = depot();
    for (const g of L.exits ?? []) {
      const dx = g.x - L.clevis!.passage.x;
      const dz = g.z - L.clevis!.passage.z;
      expect(dx * dx + dz * dz, `${g.dir} gate`).toBeGreaterThan(20 * 20);
    }
    const heights = generateDistrict(districtById("relay_heights")!);
    expect(wildLine(heights.tack!.outside, heights)).toMatch(/WEST TACK/);
  });
});
