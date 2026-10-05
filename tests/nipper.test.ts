/**
 * Stage 1090: the north wall of DEADLETTER DOCKS opens onto a fenced lot, between the hawse and the slip.
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
const docks = () => generateDistrict(districtById("deadletter_docks")!);
const LINE = "NORTH NIPPER. THE DOCK WALL IS BEHIND YOU.";

describe("DEADLETTER DOCKS opens onto a lot between the hawse and the slip", () => {
  it("the street, the passage, and the ground outside are open, and the wall beside the opening is not", () => {
    const L = docks();
    const w = L.nipper!;
    expect(w).toBeTruthy();
    expect(capsuleFree(w.street, r, h, L.boxes), "street").toBe(true);
    expect(capsuleFree(w.passage, r, h, L.boxes), "passage").toBe(true);
    expect(capsuleFree(w.outside, r, h, L.boxes), "outside").toBe(true);
    const beside = v3(w.passage.x + 2.2, 0, w.passage.z);
    expect(capsuleFree(beside, r, h, L.boxes), "wall").toBe(false);
    expect(L.signs?.some((s) => s.text === "NORTH NIPPER")).toBe(true);
    expect(capsuleFree(v3(w.outside.x, 0, w.outside.z - 4.8), r, h, L.boxes), "far fence").toBe(false);
    expect(capsuleFree(L.hawse!.passage, r, h, L.boxes), "hawse").toBe(true);
    expect(capsuleFree(L.slip!.passage, r, h, L.boxes), "slip").toBe(true);
    expect(wildLine(L.hawse!.outside, L)).toMatch(/NORTH HAWSE/);
    expect(wildLine(L.slip!.outside, L)).toMatch(/NORTH SLIP/);
    expect(Math.hypot(w.passage.x - L.hawse!.passage.x, w.passage.z - L.hawse!.passage.z)).toBeGreaterThan(4);
    expect(Math.hypot(w.passage.x - L.slip!.passage.x, w.passage.z - L.slip!.passage.z)).toBeGreaterThan(4);
  });

  it("standing outside, the line is the lot's, and it changes no gun", () => {
    const L = docks();
    const w = L.nipper!;
    expect(wildLine(w.outside, L)).toBe(LINE);
    expect(wildLine(w.street, L)).toBeNull();
    expect(LINE).not.toMatch(/XP|stamp|damage|spread|recoil/i);
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/wildLine\(p\.pos, level\)/);
  });

  it("the gates and the other districts are not this opening, and the depot gripes still answers", () => {
    for (const id of ["lease_row", "repo_depot", "night_market", "relay_heights"]) {
      expect(generateDistrict(districtById(id)!).nipper, id).toBeUndefined();
    }
    const old: DistrictSpec = { ...districtById("lease_row")!, grid: 3, blocks: ["tower", "split", "court", "market", "plaza", "split", "court", "tower", "market"] };
    expect(generateDistrict(old).nipper).toBeUndefined();
    const L = docks();
    for (const g of L.exits ?? []) {
      const dx = g.x - L.nipper!.passage.x;
      const dz = g.z - L.nipper!.passage.z;
      expect(dx * dx + dz * dz, `${g.dir} gate`).toBeGreaterThan(20 * 20);
    }
    const depot = generateDistrict(districtById("repo_depot")!);
    expect(wildLine(depot.gripes!.outside, depot)).toMatch(/SOUTH GRIPES/);
  });
});
