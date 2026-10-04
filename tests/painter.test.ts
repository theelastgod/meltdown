/**
 * Stage 1019: the west wall of DEADLETTER DOCKS opens onto a fenced lot, between the wharf and the south-west gate.
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
const LINE = "WEST PAINTER. THE DOCK WALL IS BEHIND YOU.";

describe("DEADLETTER DOCKS opens onto a lot past the west wall", () => {
  it("the street, the passage, and the ground outside are open, and the wall beside the opening is not", () => {
    const L = docks();
    const w = L.painter!;
    expect(w).toBeTruthy();
    expect(capsuleFree(w.street, r, h, L.boxes), "street").toBe(true);
    expect(capsuleFree(w.passage, r, h, L.boxes), "passage").toBe(true);
    expect(capsuleFree(w.outside, r, h, L.boxes), "outside").toBe(true);
    const beside = v3(w.passage.x, 0, w.passage.z + 4);
    expect(capsuleFree(beside, r, h, L.boxes), "wall").toBe(false);
    expect(L.signs?.some((s) => s.text === "WEST PAINTER")).toBe(true);
    expect(capsuleFree(v3(w.outside.x - 4.8, 0, w.outside.z), r, h, L.boxes), "far fence").toBe(false);
    expect(capsuleFree(L.wharf!.passage, r, h, L.boxes), "wharf").toBe(true);
    expect(wildLine(L.wharf!.outside, L)).toMatch(/WEST WHARF/);
    expect(wildLine(L.bulwark!.outside, L)).toMatch(/EAST BULWARK/);
    expect(Math.hypot(w.passage.x - L.wharf!.passage.x, w.passage.z - L.wharf!.passage.z)).toBeGreaterThan(8);
  });

  it("standing outside, the line is the lot's, and it changes no gun", () => {
    const L = docks();
    const w = L.painter!;
    expect(wildLine(w.outside, L)).toBe(LINE);
    expect(wildLine(w.street, L)).toBeNull();
    expect(LINE).not.toMatch(/XP|stamp|damage|spread|recoil/i);
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/wildLine\(p\.pos, level\)/);
  });

  it("the gates and the other districts are not this opening, and the depot pawl still answers", () => {
    for (const id of ["lease_row", "repo_depot", "night_market", "relay_heights"]) {
      expect(generateDistrict(districtById(id)!).painter, id).toBeUndefined();
    }
    const old: DistrictSpec = { ...districtById("lease_row")!, grid: 3, blocks: ["tower", "split", "court", "market", "plaza", "split", "court", "tower", "market"] };
    expect(generateDistrict(old).painter).toBeUndefined();
    const L = docks();
    for (const g of L.exits ?? []) {
      const dx = g.x - L.painter!.passage.x;
      const dz = g.z - L.painter!.passage.z;
      expect(dx * dx + dz * dz, `${g.dir} gate`).toBeGreaterThan(20 * 20);
    }
    const depot = generateDistrict(districtById("repo_depot")!);
    expect(wildLine(depot.pawl!.outside, depot)).toMatch(/EAST PAWL/);
  });
});
