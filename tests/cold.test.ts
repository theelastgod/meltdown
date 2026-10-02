/**
 * Stage 946: the north warehouse on DEADLETTER DOCKS is a room. The hatch, the floor inside,
 * and the counter are on the street. Putting the solid floor back seals the room.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { districtById, generateDistrict, type DistrictSpec } from "../shared/sim/city";
import { capsuleFree } from "../shared/sim/collision";
import { MOVE } from "../shared/sim/constants";
import { v3 } from "../shared/math/vec3";
import { shopLine } from "../shared/sim/shop";

const r = MOVE.capsuleRadius;
const h = MOVE.standHeight;
const docks = () => generateDistrict(districtById("deadletter_docks")!);
const LINE = "COLD STORE · THE HATCH IS OPEN. CASH FOR THE MANIFEST. THE GUN STAYS AS IT IS.";

describe("DEADLETTER DOCKS has a cold store you can walk into", () => {
  it("the doorway and the floor inside are open, and the wall beside the hatch is not", () => {
    const L = docks();
    const cold = L.cold!;
    expect(cold).toBeTruthy();
    expect(capsuleFree(cold.mouth, r, h, L.boxes), "doorway").toBe(true);
    expect(capsuleFree(cold.inside, r, h, L.boxes), "inside").toBe(true);
    const opening = v3(cold.mouth.x, 0, cold.mouth.z - 0.68);
    expect(capsuleFree(opening, r, h, L.boxes), `opening ${opening.x},${opening.z}`).toBe(true);
    const jamb = v3(cold.mouth.x - 2.2, 0, opening.z);
    expect(capsuleFree(jamb, r, h, L.boxes), "jamb").toBe(false);
    expect(L.signs?.some((s) => s.text === "COLD STORE")).toBe(true);
    expect(L.shop).toBeUndefined();
  });

  it("the counter answers there and not from the middle of the room, and it changes no gun", () => {
    const L = docks();
    const cold = L.cold!;
    expect(capsuleFree(cold.counter, r, h, L.boxes), "counter").toBe(true);
    expect(shopLine(cold.counter, L)).toBe(LINE);
    expect(shopLine(cold.inside, L)).toBeNull();
    expect(shopLine(cold.mouth, L)).toBeNull();
    expect(LINE).not.toMatch(/XP|stamp|damage|spread|recoil/i);
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/shopLine\(p\.pos, level\)/);
    expect(capsuleFree(v3(cold.counter.x, 0, cold.counter.z - 1.3), r, h, L.boxes), "desk").toBe(false);
  });

  it("the other districts, and LEASE ROW, are not this room", () => {
    for (const id of ["lease_row", "repo_depot", "night_market", "relay_heights"]) {
      expect(generateDistrict(districtById(id)!).cold, id).toBeUndefined();
    }
    const old: DistrictSpec = { ...districtById("lease_row")!, grid: 3, blocks: ["tower", "split", "court", "market", "plaza", "split", "court", "tower", "market"] };
    expect(generateDistrict(old).cold).toBeUndefined();
    const lease = generateDistrict(districtById("lease_row")!);
    expect(lease.shop && lease.pawn && lease.night && lease.wild && lease.yard && lease.east).toBeTruthy();
  });
});
