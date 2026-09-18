/**
 * The shield broke in silence (Stage 102): the break, the return, and what is neither.
 */
import { describe, expect, it } from "vitest";
import { shieldLine, shieldMoments } from "../client/shieldcue";

const v = (shield: number, alive = true, maxShield = 30) => ({ shield, maxShield, alive });

describe("shieldMoments", () => {
  it("breaks when the last of it goes, once", () => {
    expect(shieldMoments(v(12), v(0))).toEqual(["broke"]);
    expect(shieldMoments(v(0), v(0))).toEqual([]);
  });
  it("a hit that leaves some is not a break", () => {
    expect(shieldMoments(v(30), v(5))).toEqual([]);
  });
  it("is back when it reaches full from below, and not while it is still growing", () => {
    expect(shieldMoments(v(29), v(30))).toEqual(["back"]);
    expect(shieldMoments(v(0), v(8))).toEqual([]);
    expect(shieldMoments(v(30), v(30))).toEqual([]);
  });
  it("a respawn is neither, and neither is a dead file", () => {
    expect(shieldMoments(v(0, false), v(30, true))).toEqual([]);
    expect(shieldMoments(v(12, true), v(0, false))).toEqual([]);
    expect(shieldMoments(null, v(30))).toEqual([]);
  });
  it("a file with no shield at all has nothing to break", () => {
    expect(shieldMoments(v(0, true, 0), v(0, true, 0))).toEqual([]);
  });
});

describe("shieldLine", () => {
  it("says which", () => {
    expect(shieldLine("broke")).toBe("◇ SHIELD DOWN");
    expect(shieldLine("back")).toBe("◇ SHIELD BACK");
  });
});
