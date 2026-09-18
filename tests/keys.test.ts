/** The tutorial never left (Stage 130). */
import { describe, expect, it } from "vitest";
import { keysLine, learn, NOTHING_SEEN } from "../client/hud/keys";

describe("keysLine", () => {
  it("teaches everything to a file that has done nothing", () => {
    expect(keysLine(NOTHING_SEEN)).toBe("WASD · HOLD CLICK fire · R reload · SPACE jump · CTRL slide · SHIFT sprint");
  });
  it("drops each lesson once it is done, in the line's order", () => {
    expect(keysLine({ ...NOTHING_SEEN, moved: true, sprinted: true })).toBe("HOLD CLICK fire · R reload · SPACE jump · CTRL slide");
    expect(keysLine({ ...NOTHING_SEEN, moved: true, fired: true, jumped: true, slid: true, sprinted: true })).toBe("R reload");
  });
  it("is empty once everything has been done", () => {
    expect(keysLine({ moved: true, fired: true, reloaded: true, jumped: true, slid: true, sprinted: true })).toBe("");
  });
});

describe("learn", () => {
  const still = { speed: 0, sprintSpeed: 6.2, shots: 0, reloading: false, jumps: 0, slides: 0 };
  it("reads the lessons from the file's state", () => {
    expect(learn(NOTHING_SEEN, { ...still, speed: 3 })).toEqual({ ...NOTHING_SEEN, moved: true });
    expect(learn(NOTHING_SEEN, { ...still, speed: 7.2 })).toEqual({ ...NOTHING_SEEN, moved: true, sprinted: true });
    expect(learn(NOTHING_SEEN, { ...still, shots: 1, reloading: true, jumps: 1, slides: 1 })).toEqual({ ...NOTHING_SEEN, fired: true, reloaded: true, jumped: true, slid: true });
  });
  it("never forgets a lesson", () => {
    const once = learn(NOTHING_SEEN, { ...still, speed: 7.2, shots: 1 });
    expect(learn(once, still)).toEqual(once);
  });
});
