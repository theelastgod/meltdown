/**
 * Stage 947: the south-east warehouse on REPO DEPOT is a room. The hatch, the floor inside,
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
const depot = () => generateDistrict(districtById("repo_depot")!);
const LINE = "IMPOUND · THE COUNTER IS OPEN. CASH FOR THE RELEASE. THE GUN STAYS AS IT IS.";

describe("REPO DEPOT has an impound counter you can walk into", () => {
  it("the doorway and the floor inside are open, and the wall beside the hatch is not", () => {
    const L = depot();
    const room = L.impound!;
    expect(room).toBeTruthy();
    expect(capsuleFree(room.mouth, r, h, L.boxes), "doorway").toBe(true);
    expect(capsuleFree(room.inside, r, h, L.boxes), "inside").toBe(true);
    const opening = v3(room.mouth.x, 0, room.mouth.z - 0.68);
    expect(capsuleFree(opening, r, h, L.boxes), `opening ${opening.x},${opening.z}`).toBe(true);
    const jamb = v3(room.mouth.x - 2.2, 0, opening.z);
    expect(capsuleFree(jamb, r, h, L.boxes), "jamb").toBe(false);
    expect(L.signs?.some((s) => s.text === "IMPOUND")).toBe(true);
    expect(L.cold).toBeUndefined();
  });

  it("the counter answers there and not from the middle of the room, and it changes no gun", () => {
    const L = depot();
    const room = L.impound!;
    expect(capsuleFree(room.counter, r, h, L.boxes), "counter").toBe(true);
    expect(shopLine(room.counter, L)).toBe(LINE);
    expect(shopLine(room.inside, L)).toBeNull();
    expect(shopLine(room.mouth, L)).toBeNull();
    expect(LINE).not.toMatch(/XP|stamp|damage|spread|recoil/i);
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/shopLine\(p\.pos, level\)/);
    expect(capsuleFree(v3(room.counter.x, 0, room.counter.z - 1.3), r, h, L.boxes), "desk").toBe(false);
  });

  it("the other districts are not this room, and the docks cold store still answers", () => {
    for (const id of ["lease_row", "deadletter_docks", "night_market", "relay_heights"]) {
      expect(generateDistrict(districtById(id)!).impound, id).toBeUndefined();
    }
    const old: DistrictSpec = { ...districtById("lease_row")!, grid: 3, blocks: ["tower", "split", "court", "market", "plaza", "split", "court", "tower", "market"] };
    expect(generateDistrict(old).impound).toBeUndefined();
    const docks = generateDistrict(districtById("deadletter_docks")!);
    expect(docks.cold?.line).toMatch(/COLD STORE/);
    expect(shopLine(docks.cold!.counter, docks)).toMatch(/COLD STORE/);
  });
});
