/**
 * Stage 1110: the south wall of DEADLETTER DOCKS opens onto a fenced lot, between the two south gates.
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
const LINE = "SOUTH SAMSON. THE DOCK WALL IS BEHIND YOU.";

describe("DEADLETTER DOCKS opens onto a lot between the two south gates", () => {
  it("the street, the passage, and the ground outside are open, and the wall beside the opening is not", () => {
    const L = docks();
    const w = L.samson!;
    expect(w).toBeTruthy();
    expect(capsuleFree(w.street, r, h, L.boxes), "street").toBe(true);
    expect(capsuleFree(w.passage, r, h, L.boxes), "passage").toBe(true);
    expect(capsuleFree(w.outside, r, h, L.boxes), "outside").toBe(true);
    const beside = v3(w.passage.x + 2.2, 0, w.passage.z);
    expect(capsuleFree(beside, r, h, L.boxes), "wall").toBe(false);
    expect(L.signs?.some((s) => s.text === "SOUTH SAMSON")).toBe(true);
    expect(capsuleFree(v3(w.outside.x, 0, w.outside.z + 4.8), r, h, L.boxes), "far fence").toBe(false);
    expect(capsuleFree(L.gunwale!.passage, r, h, L.boxes), "gunwale").toBe(true);
    expect(capsuleFree(L.strake!.passage, r, h, L.boxes), "strake").toBe(true);
    expect(wildLine(L.gunwale!.outside, L)).toMatch(/SOUTH GUNWALE/);
    expect(wildLine(L.strake!.outside, L)).toMatch(/SOUTH STRAKE/);
    expect(Math.hypot(w.passage.x - L.gunwale!.passage.x, w.passage.z - L.gunwale!.passage.z)).toBeGreaterThan(4);
    expect(Math.hypot(w.passage.x - L.strake!.passage.x, w.passage.z - L.strake!.passage.z)).toBeGreaterThan(4);
  });

  it("standing outside, the line is the lot's, and it changes no gun", () => {
    const L = docks();
    const w = L.samson!;
    expect(wildLine(w.outside, L)).toBe(LINE);
    expect(wildLine(w.street, L)).toBeNull();
    expect(LINE).not.toMatch(/XP|stamp|damage|spread|recoil/i);
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/wildLine\(p\.pos, level\)/);
  });

  it("the gates and the other districts are not this opening, and the depot knee still answers", () => {
    for (const id of ["lease_row", "repo_depot", "night_market", "relay_heights"]) {
      expect(generateDistrict(districtById(id)!).samson, id).toBeUndefined();
    }
    const old: DistrictSpec = { ...districtById("lease_row")!, grid: 3, blocks: ["tower", "split", "court", "market", "plaza", "split", "court", "tower", "market"] };
    expect(generateDistrict(old).samson).toBeUndefined();
    const L = docks();
    for (const g of L.exits ?? []) {
      const dx = g.x - L.samson!.passage.x;
      const dz = g.z - L.samson!.passage.z;
      expect(dx * dx + dz * dz, `${g.dir} gate`).toBeGreaterThan(20 * 20);
    }
    const depot = generateDistrict(districtById("repo_depot")!);
    expect(wildLine(depot.knee!.outside, depot)).toMatch(/SOUTH KNEE/);
  });
});
