/**
 * Stage 942: LEASE ROW's south-west warehouse is a room. The door, the floor inside, and the
 * window are on the same street as everyone else. Putting the solid floor back seals the room.
 * The noodle shop on the north-west stack stays open.
 */
import { describe, expect, it } from "vitest";
import { districtById, generateDistrict, type DistrictSpec } from "../shared/sim/city";
import { capsuleFree } from "../shared/sim/collision";
import { MOVE } from "../shared/sim/constants";
import { v3 } from "../shared/math/vec3";
import { shopLine } from "../shared/sim/shop";

const r = MOVE.capsuleRadius;
const h = MOVE.standHeight;
const lease = () => generateDistrict(districtById("lease_row")!);

describe("LEASE ROW has a second room you can walk into", () => {
  it("the doorway and the floor inside are open, and the wall beside the door is not", () => {
    const L = lease();
    const pawn = L.pawn!;
    expect(pawn).toBeTruthy();
    expect(capsuleFree(pawn.mouth, r, h, L.boxes), "doorway").toBe(true);
    expect(capsuleFree(pawn.inside, r, h, L.boxes), "inside").toBe(true);
    const opening = v3(pawn.mouth.x, 0, pawn.mouth.z - 0.68);
    expect(capsuleFree(opening, r, h, L.boxes), `opening ${opening.x},${opening.z}`).toBe(true);
    const jamb = v3(pawn.mouth.x - 2.2, 0, opening.z);
    expect(capsuleFree(jamb, r, h, L.boxes), "jamb").toBe(false);
    expect(L.signs?.some((s) => s.text === "PAWN")).toBe(true);
    // the noodle shop is a different room, still open
    expect(L.shop).toBeTruthy();
    expect(Math.hypot(pawn.counter.x - L.shop!.counter.x, pawn.counter.z - L.shop!.counter.z)).toBeGreaterThan(20);
  });

  it("the window answers at the counter and not from the middle of the room, and it changes no gun", () => {
    const L = lease();
    const pawn = L.pawn!;
    expect(capsuleFree(pawn.counter, r, h, L.boxes), "counter").toBe(true);
    expect(shopLine(pawn.counter, L)).toBe("PAWN · THE WINDOW IS OPEN. CASH FOR THE PIECE. THE GUN STAYS AS IT IS.");
    expect(shopLine(pawn.inside, L)).toBeNull();
    expect(shopLine(pawn.mouth, L)).toBeNull();
    expect(shopLine(L.shop!.counter, L)).toBe("NOODLE 24 · THE CLERK IS IN. CASH FOR THE BOWL. THE GUN STAYS AS IT IS.");
    expect(capsuleFree(v3(pawn.counter.x, 0, pawn.counter.z - 1.3), r, h, L.boxes), "desk").toBe(false);
  });

  it("the other districts, and LEASE ROW's old three-by-three, stay solid blocks", () => {
    for (const id of ["deadletter_docks", "repo_depot", "night_market", "relay_heights"]) {
      const L = generateDistrict(districtById(id)!);
      expect(L.pawn, id).toBeUndefined();
      expect(L.shop, id).toBeUndefined();
    }
    const old: DistrictSpec = { ...districtById("lease_row")!, grid: 3, blocks: ["tower", "split", "court", "market", "plaza", "split", "court", "tower", "market"] };
    expect(generateDistrict(old).pawn).toBeUndefined();
  });
});
