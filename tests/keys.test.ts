/** The tutorial never left (Stage 130); its facts are cumulative (Stage 164). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { keysLine, learn, NOTHING_SEEN, padsLine } from "../client/hud/keys";

describe("keysLine", () => {
  it("teaches everything to a file that has done nothing", () => {
    expect(keysLine(NOTHING_SEEN)).toBe("WASD · HOLD CLICK FIRE · R RELOAD · SPACE JUMP · CTRL SLIDE · SHIFT SPRINT");
    expect(keysLine(NOTHING_SEEN)).not.toBe("WASD · HOLD CLICK fire · R reload · SPACE jump · CTRL slide · SHIFT sprint");
  });
  it("drops each lesson once it is done, in the line's order", () => {
    expect(keysLine({ ...NOTHING_SEEN, moved: true, sprinted: true })).toBe("HOLD CLICK FIRE · R RELOAD · SPACE JUMP · CTRL SLIDE");
    expect(keysLine({ ...NOTHING_SEEN, moved: true, fired: true, jumped: true, slid: true, sprinted: true })).toBe("R RELOAD");
  });
  it("is empty once everything has been done", () => {
    expect(keysLine({ moved: true, fired: true, reloaded: true, jumped: true, slid: true, sprinted: true })).toBe("");
  });
});

describe("learn", () => {
  const still = { topSpeed: 0, sprintSpeed: 6.2, shots: 0, reloading: false, jumps: 0, slides: 0 };
  it("reads the lessons from the file's state", () => {
    expect(learn(NOTHING_SEEN, { ...still, topSpeed: 3 })).toEqual({ ...NOTHING_SEEN, moved: true });
    expect(learn(NOTHING_SEEN, { ...still, topSpeed: 7.2 })).toEqual({ ...NOTHING_SEEN, moved: true, sprinted: true });
    expect(learn(NOTHING_SEEN, { ...still, shots: 1, reloading: true, jumps: 1, slides: 1 })).toEqual({ ...NOTHING_SEEN, fired: true, reloaded: true, jumped: true, slid: true });
  });
  it("never forgets a lesson", () => {
    const once = learn(NOTHING_SEEN, { ...still, topSpeed: 7.2, shots: 1 });
    expect(learn(once, still)).toEqual(once);
  });
  it("reads a sprint whose peak fell between two drawn frames (Stage 164)", () => {
    // the tutorial is folded on drawn frames. These two frames are both drawn while the file is
    // standing: the sprint happened in the gap between them, and only the sim's high-water mark
    // carries it. Hand `learn` the frame's own speed instead and the lesson is lost for good.
    let seen = learn(NOTHING_SEEN, { ...still, topSpeed: 0 });
    expect(seen.sprinted).toBe(false);
    seen = learn(seen, { ...still, topSpeed: 7.2 }); // sim mark after the gap; this frame's speed is 0
    expect(seen).toEqual({ ...NOTHING_SEEN, moved: true, sprinted: true });
  });
  it("holds the sprint threshold at the read, not above it", () => {
    expect(learn(NOTHING_SEEN, { ...still, topSpeed: 6.2 }).sprinted).toBe(true);
    expect(learn(NOTHING_SEEN, { ...still, topSpeed: 6.19 }).sprinted).toBe(false);
    // and moving is not sprinting: the walk read is a different line
    expect(learn(NOTHING_SEEN, { ...still, topSpeed: 0.51 })).toEqual({ ...NOTHING_SEEN, moved: true });
    expect(learn(NOTHING_SEEN, { ...still, topSpeed: 0.5 })).toEqual(NOTHING_SEEN);
  });
});

describe("a phone whose wake line is down", () => {
  it("is told which pad it has not used, and the keyboard line stays hidden", () => {
    expect(padsLine(NOTHING_SEEN)).toBe("LEFT STICK · FIRE · RLD · JUMP · SLIDE · PUSH");
    expect(padsLine({ ...NOTHING_SEEN, moved: true, sprinted: true })).toBe("FIRE · RLD · JUMP · SLIDE");
    expect(padsLine({ moved: true, fired: true, reloaded: true, jumped: true, slid: true, sprinted: true })).toBe("");
    expect(padsLine(NOTHING_SEEN)).not.toMatch(/WASD|CLICK|SPACE|CTRL|SHIFT|\[[A-Z]/);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(hud).toMatch(/const show = this\.locked && line !== "";\s*if \(pads\.textContent !== line\) pads\.textContent = line;/);
    expect(hud).toMatch(/const lesson = shown\(wake\) \? wake : shown\(pads\) \? pads : null;/);
    expect(css).toMatch(/#hud\.touch \.keys \{ display: none; \}/);
    expect(css).toMatch(/#hud\.touch \.center \{ display: none; \}/);
    expect(css).toMatch(/#hud\.touch \.pads:not\(\[hidden\]\) \{ display: block;/);
  });
});

describe("a phone that has already woken", () => {
  it("takes the wake line down, the way a locked pointer takes the keyboard line down", () => {
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/this\.q\("\.prompt-touch"\)\.classList\.toggle\("off", locked\)/);
    expect(css).toMatch(/#hud\.touch \.prompt-touch\.off \{ display: none; \}/);
    expect(game).toMatch(/this\.touch\.onGesture = \(\) => \{\s*this\.audio\.resume\(\);\s*this\.hud\.setLocked\(true\);\s*\}/);
  });
});
