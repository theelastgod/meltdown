/**
 * Stage 940: LEASE ROW's north-west warehouse is a room. The door, the floor inside, and the
 * counter are on the same street as everyone else. Putting the solid floor back seals the room.
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
const lease = () => generateDistrict(districtById("lease_row")!);

describe("LEASE ROW has a room you can walk into", () => {
  it("the doorway and the floor inside are open, and the wall beside the door is not", () => {
    const L = lease();
    const shop = L.shop!;
    expect(shop).toBeTruthy();
    expect(capsuleFree(shop.mouth, r, h, L.boxes), "doorway").toBe(true);
    expect(capsuleFree(shop.inside, r, h, L.boxes), "inside").toBe(true);
    // the mouth is just outside the south wall; a step back toward the room stands in the opening
    const opening = v3(shop.mouth.x, 0, shop.mouth.z - 0.68);
    expect(capsuleFree(opening, r, h, L.boxes), `opening ${opening.x},${opening.z}`).toBe(true);
    const jamb = v3(shop.mouth.x - 2.2, 0, opening.z);
    expect(capsuleFree(jamb, r, h, L.boxes), "jamb").toBe(false);
    expect(L.signs?.some((s) => s.text === "NOODLE 24")).toBe(true);
  });

  it("the clerk answers at the counter and not from the middle of the room", () => {
    const L = lease();
    const shop = L.shop!;
    expect(capsuleFree(shop.counter, r, h, L.boxes), "counter").toBe(true);
    expect(shopLine(shop.counter, L)).toBe("NOODLE 24 · THE CLERK IS IN. CASH FOR THE BOWL. THE GUN STAYS AS IT IS.");
    expect(shopLine(shop.inside, L)).toBeNull();
    expect(shopLine(shop.mouth, L)).toBeNull();
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/shopLine\(p\.pos, level\)/);
    expect(src).toMatch(/else if \(clerk\) g\.hud\.setGate\(clerk\)/);
    // the counter itself is solid: a step into the desk does not pass
    expect(capsuleFree(v3(shop.counter.x, 0, shop.counter.z - 1.3), r, h, L.boxes), "desk").toBe(false);
  });

  it("the other districts, and LEASE ROW's old three-by-three, stay solid blocks", () => {
    for (const id of ["deadletter_docks", "repo_depot", "night_market", "relay_heights"]) {
      expect(generateDistrict(districtById(id)!).shop, id).toBeUndefined();
    }
    const old: DistrictSpec = { ...districtById("lease_row")!, grid: 3, blocks: ["tower", "split", "court", "market", "plaza", "split", "court", "tower", "market"] };
    expect(generateDistrict(old).shop).toBeUndefined();
  });
});
