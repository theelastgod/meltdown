/** The foot line said STAND at a sprint (Stage 117). */
import { describe, expect, it } from "vitest";
import { motionWord, SPRINT_READ, WALK_READ } from "../client/hud/stance";

describe("motionWord", () => {
  it("names the sim's own stances first", () => {
    expect(motionWord("mantle", false, 0)).toBe("MANTLE");
    expect(motionWord("slide", true, 9)).toBe("SLIDE");
    expect(motionWord("crouch", true, 2)).toBe("CROUCH");
  });
  it("says AIR for a standing file off the ground, whatever its speed", () => {
    expect(motionWord("stand", false, 7)).toBe("AIR");
    expect(motionWord("stand", false, 0)).toBe("AIR");
  });
  it("reads SPRINT, WALK and STAND from the speed on the ground", () => {
    expect(motionWord("stand", true, 7.2)).toBe("SPRINT");
    expect(motionWord("stand", true, SPRINT_READ)).toBe("SPRINT");
    expect(motionWord("stand", true, 5.2)).toBe("WALK");
    expect(motionWord("stand", true, WALK_READ)).toBe("WALK");
    expect(motionWord("stand", true, 0.2)).toBe("STAND");
    expect(motionWord("stand", true, 0)).toBe("STAND");
  });
});
