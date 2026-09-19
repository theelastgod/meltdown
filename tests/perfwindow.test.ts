/**
 * The band's two numbers (Stage 156). They were measured in a window whose clock only ran while the
 * renderer drew, while the ticks divided by it came from every frame the loop was given — so on a
 * machine that could not draw every frame, both came out roughly doubled. Measured against the wall
 * clock, a page running its sim at 60.0 Hz and drawing 3.8 frames a second said `8 FPS · SIM 120 Hz`.
 */
import { describe, expect, it } from "vitest";
import { PERF_WINDOW_SECONDS, perfStep, perfWindow, type PerfRead } from "../client/hud/perf";

/** Run a loop of `frames` frames at `hz`, drawing one frame in every `drawEvery`, and read it. */
function run(frames: number, hz: number, drawEvery: number): PerfRead[] {
  let w = perfWindow();
  let ticks = 0;
  const reads: PerfRead[] = [];
  for (let i = 0; i < frames; i++) {
    ticks++; // one tick per frame the loop is given, which is what 60 Hz on a 60 Hz loop means
    const step = perfStep(w, 1 / hz, i % drawEvery === 0, ticks);
    w = step.window;
    if (step.read) reads.push(step.read);
  }
  return reads;
}

const mean = (xs: number[]): number => xs.reduce((t, x) => t + x, 0) / Math.max(1, xs.length);

describe("the window the band's numbers are measured in", () => {
  // 60 frames a second given to the loop; the renderer draws one in sixteen, which is the shape the
  // probe's software GL runs in — 60 Hz of sim behind 3.75 frames a second of picture
  const skipped = run(1200, 60, 16);

  it("says the sim's real rate however little of it reached the renderer", () => {
    expect(skipped.length).toBeGreaterThan(10);
    expect(mean(skipped.map((r) => r.simHz))).toBeCloseTo(60, 0);
    // and no single reading is anywhere near the doubling this stage found
    for (const r of skipped) expect(r.simHz).toBeLessThan(70);
  });

  it("says the renderer's real rate, not the loop's", () => {
    // a half-second window catches one draw or two depending on where it falls, so the claim is
    // about the rate over the run; what it must never do is report the loop's 60
    expect(mean(skipped.map((r) => r.fps))).toBeCloseTo(3.75, 0);
    for (const r of skipped) expect(r.fps).toBeLessThan(8);
  });

  it("agrees with itself when every frame draws", () => {
    for (const r of run(600, 60, 1)) {
      expect(r.simHz).toBeCloseTo(60, 0);
      expect(r.fps).toBeCloseTo(60, 0);
    }
  });

  it("reads once the window is full and starts the next one clean", () => {
    let w = perfWindow();
    const half = perfStep(w, PERF_WINDOW_SECONDS / 2, true, 30);
    expect(half.read).toBeNull();
    expect(half.window.t).toBeCloseTo(PERF_WINDOW_SECONDS / 2, 6);
    const full = perfStep(half.window, PERF_WINDOW_SECONDS / 2, true, 60);
    expect(full.read).not.toBeNull();
    expect(full.read!.simHz).toBeCloseTo(120, 0); // 60 ticks in half a second really is 120 Hz
    // the next window carries no time, no frames, and the tick the last one closed on
    expect(full.window).toEqual({ t: 0, frames: 0, ticks: 60 });
  });

  it("never runs its clock backwards on a frame that arrives out of order", () => {
    const step = perfStep(perfWindow(), -5, true, 1);
    expect(step.window.t).toBe(0);
    expect(step.read).toBeNull();
  });
});
