/**
 * Stage 1079: the east wall of NIGHT MARKET opens onto a fenced lot, between the gusset and the crate.
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
const LINE = "EAST FACING. THE MARKET WALL IS BEHIND YOU.";

describe("NIGHT MARKET opens onto a lot between the gusset and the crate", () => {
  it("the street, the passage, and the ground outside are open, and the wall beside the opening is not", () => {
    const L = market();
    const w = L.facing!;
    expect(w).toBeTruthy();
    expect(capsuleFree(w.street, r, h, L.boxes), "street").toBe(true);
    expect(capsuleFree(w.passage, r, h, L.boxes), "passage").toBe(true);
    expect(capsuleFree(w.outside, r, h, L.boxes), "outside").toBe(true);
    const beside = v3(w.passage.x, 0, w.passage.z - 2);
    expect(capsuleFree(beside, r, h, L.boxes), "wall").toBe(false);
    expect(L.signs?.some((s) => s.text === "EAST FACING")).toBe(true);
    expect(capsuleFree(v3(w.outside.x + 4.8, 0, w.outside.z), r, h, L.boxes), "far fence").toBe(false);
    expect(capsuleFree(L.gusset!.passage, r, h, L.boxes), "gusset").toBe(true);
    expect(capsuleFree(L.crate!.passage, r, h, L.boxes), "crate").toBe(true);
    expect(wildLine(L.gusset!.outside, L)).toMatch(/EAST GUSSET/);
    expect(wildLine(L.crate!.outside, L)).toMatch(/EAST CRATE/);
    expect(Math.hypot(w.passage.x - L.gusset!.passage.x, w.passage.z - L.gusset!.passage.z)).toBeGreaterThan(4);
    expect(Math.hypot(w.passage.x - L.crate!.passage.x, w.passage.z - L.crate!.passage.z)).toBeGreaterThan(4);
  });

  it("standing outside, the line is the lot's, and it changes no gun", () => {
    const L = market();
    const w = L.facing!;
    expect(wildLine(w.outside, L)).toBe(LINE);
    expect(wildLine(w.street, L)).toBeNull();
    expect(LINE).not.toMatch(/XP|stamp|damage|spread|recoil/i);
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/wildLine\(p\.pos, level\)/);
  });

  it("the gates and the other districts are not this opening, and the docks kedge still answers", () => {
    for (const id of ["lease_row", "deadletter_docks", "repo_depot", "relay_heights"]) {
      expect(generateDistrict(districtById(id)!).facing, id).toBeUndefined();
    }
    const old: DistrictSpec = { ...districtById("lease_row")!, grid: 3, blocks: ["tower", "split", "court", "market", "plaza", "split", "court", "tower", "market"] };
    expect(generateDistrict(old).facing).toBeUndefined();
    const L = market();
    for (const g of L.exits ?? []) {
      const dx = g.x - L.facing!.passage.x;
      const dz = g.z - L.facing!.passage.z;
      expect(dx * dx + dz * dz, `${g.dir} gate`).toBeGreaterThan(20 * 20);
    }
    const docks = generateDistrict(districtById("deadletter_docks")!);
    expect(wildLine(docks.kedge!.outside, docks)).toMatch(/EAST KEDGE/);
  });
});
