/**
 * Stage 944: LEASE ROW's south-east warehouse is a room. The door, the floor inside, and the
 * counter are on the same street as everyone else. Putting the solid floor back seals the room.
 * The noodle shop and the pawn window stay open.
 */
import { describe, expect, it } from "vitest";
import { districtById, generateDistrict, type DistrictSpec } from "../shared/sim/city";
import { capsuleFree } from "../shared/sim/collision";
import { MOVE } from "../shared/sim/constants";
import { v3 } from "../shared/math/vec3";
import { shopLine, wildLine } from "../shared/sim/shop";

const r = MOVE.capsuleRadius;
const h = MOVE.standHeight;
const lease = () => generateDistrict(districtById("lease_row")!);

describe("LEASE ROW has a third room you can walk into", () => {
  it("the doorway and the floor inside are open, and the wall beside the door is not", () => {
    const L = lease();
    const night = L.night!;
    expect(night).toBeTruthy();
    expect(capsuleFree(night.mouth, r, h, L.boxes), "doorway").toBe(true);
    expect(capsuleFree(night.inside, r, h, L.boxes), "inside").toBe(true);
    const opening = v3(night.mouth.x, 0, night.mouth.z - 0.68);
    expect(capsuleFree(opening, r, h, L.boxes), `opening ${opening.x},${opening.z}`).toBe(true);
    const jamb = v3(night.mouth.x - 2.2, 0, opening.z);
    expect(capsuleFree(jamb, r, h, L.boxes), "jamb").toBe(false);
    expect(L.signs?.some((s) => s.text === "NIGHT CO")).toBe(true);
    expect(L.shop).toBeTruthy();
    expect(L.pawn).toBeTruthy();
    expect(Math.hypot(night.counter.x - L.shop!.counter.x, night.counter.z - L.shop!.counter.z)).toBeGreaterThan(20);
    expect(Math.hypot(night.counter.x - L.pawn!.counter.x, night.counter.z - L.pawn!.counter.z)).toBeGreaterThan(20);
  });

  it("the counter answers there and not from the middle of the room, and it changes no gun", () => {
    const L = lease();
    const night = L.night!;
    expect(capsuleFree(night.counter, r, h, L.boxes), "counter").toBe(true);
    expect(shopLine(night.counter, L)).toBe("NIGHT CO · THE COUNTER IS OPEN. CASH FOR THE CUP. THE GUN STAYS AS IT IS.");
    expect(shopLine(night.inside, L)).toBeNull();
    expect(shopLine(night.mouth, L)).toBeNull();
    expect(shopLine(L.shop!.counter, L)).toMatch(/NOODLE 24/);
    expect(shopLine(L.pawn!.counter, L)).toMatch(/PAWN/);
    expect(wildLine(L.wild!.outside, L)).toBe("PAST THE LEASE. THE STREET ENDS HERE.");
    expect(wildLine(L.yard!.outside, L)).toBe("SOUTH YARD. THE WALL IS BEHIND YOU.");
    expect(capsuleFree(v3(night.counter.x, 0, night.counter.z - 1.3), r, h, L.boxes), "desk").toBe(false);
  });

  it("the other districts, and LEASE ROW's old three-by-three, stay solid blocks", () => {
    for (const id of ["deadletter_docks", "repo_depot", "night_market", "relay_heights"]) {
      const L = generateDistrict(districtById(id)!);
      expect(L.night, id).toBeUndefined();
    }
    const old: DistrictSpec = { ...districtById("lease_row")!, grid: 3, blocks: ["tower", "split", "court", "market", "plaza", "split", "court", "tower", "market"] };
    expect(generateDistrict(old).night).toBeUndefined();
  });
});
