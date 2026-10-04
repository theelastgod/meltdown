/**
 * Stage 1032: the south wall of NIGHT MARKET opens onto a fenced lot, past the hook.
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
const LINE = "SOUTH EYELET. THE MARKET WALL IS BEHIND YOU.";

describe("NIGHT MARKET opens onto a lot past the west end of the south wall", () => {
  it("the street, the passage, and the ground outside are open, and the wall beside the opening is not", () => {
    const L = market();
    const w = L.eyelet!;
    expect(w).toBeTruthy();
    expect(capsuleFree(w.street, r, h, L.boxes), "street").toBe(true);
    expect(capsuleFree(w.passage, r, h, L.boxes), "passage").toBe(true);
    expect(capsuleFree(w.outside, r, h, L.boxes), "outside").toBe(true);
    const beside = v3(w.passage.x + 4, 0, w.passage.z);
    expect(capsuleFree(beside, r, h, L.boxes), "wall").toBe(false);
    expect(L.signs?.some((s) => s.text === "SOUTH EYELET")).toBe(true);
    expect(capsuleFree(v3(w.outside.x, 0, w.outside.z + 4.8), r, h, L.boxes), "far fence").toBe(false);
    expect(capsuleFree(L.hook!.passage, r, h, L.boxes), "hook").toBe(true);
    expect(capsuleFree(L.seam!.passage, r, h, L.boxes), "seam").toBe(true);
    expect(wildLine(L.hook!.outside, L)).toMatch(/SOUTH HOOK/);
    expect(wildLine(L.seam!.outside, L)).toMatch(/SOUTH SEAM/);
    expect(Math.hypot(w.passage.x - L.hook!.passage.x, w.passage.z - L.hook!.passage.z)).toBeGreaterThan(5);
    expect(Math.hypot(w.passage.x - L.seam!.passage.x, w.passage.z - L.seam!.passage.z)).toBeGreaterThan(5);
  });

  it("standing outside, the line is the lot's, and it changes no gun", () => {
    const L = market();
    const w = L.eyelet!;
    expect(wildLine(w.outside, L)).toBe(LINE);
    expect(wildLine(w.street, L)).toBeNull();
    expect(LINE).not.toMatch(/XP|stamp|damage|spread|recoil/i);
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/wildLine\(p\.pos, level\)/);
  });

  it("the gates and the other districts are not this opening, and the docks pintle still answers", () => {
    for (const id of ["lease_row", "deadletter_docks", "repo_depot", "relay_heights"]) {
      expect(generateDistrict(districtById(id)!).eyelet, id).toBeUndefined();
    }
    const old: DistrictSpec = { ...districtById("lease_row")!, grid: 3, blocks: ["tower", "split", "court", "market", "plaza", "split", "court", "tower", "market"] };
    expect(generateDistrict(old).eyelet).toBeUndefined();
    const L = market();
    for (const g of L.exits ?? []) {
      const dx = g.x - L.eyelet!.passage.x;
      const dz = g.z - L.eyelet!.passage.z;
      expect(dx * dx + dz * dz, `${g.dir} gate`).toBeGreaterThan(20 * 20);
    }
    const docks = generateDistrict(districtById("deadletter_docks")!);
    expect(wildLine(docks.pintle!.outside, docks)).toMatch(/SOUTH PINTLE/);
  });
});
