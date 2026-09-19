/**
 * The pooled effects' shaders (Stage 158). They are hidden while empty, so nothing drew them, so
 * Three.js had compiled no program for them — and the first trigger pull of a session compiled two
 * and stalled the frame after by 308 ms, measured, with a median of 61.
 */
import { describe, expect, it } from "vitest";
import { drawPool, warmStep, WARM_FRAMES } from "../client/render/warmup";

/** Run a pool that never has anything to show, and report which frames it was drawn on. */
function drawn(frames: number, live = false): boolean[] {
  let left = WARM_FRAMES;
  const out: boolean[] = [];
  for (let i = 0; i < frames; i++) {
    out.push(drawPool(live, left));
    left = warmStep(left);
  }
  return out;
}

describe("warming a pooled effect's shader", () => {
  it("draws an empty pool for the first frames and then stops", () => {
    const d = drawn(10);
    expect(d.slice(0, WARM_FRAMES).every(Boolean)).toBe(true);
    expect(d.slice(WARM_FRAMES).some(Boolean)).toBe(false);
  });

  it("warms for at least a frame, and does not keep warming for ever", () => {
    // one frame was measured to be enough and two is margin; what must not happen is zero, which is
    // the defect, or a number large enough to be a permanent cost dressed as a warm-up
    expect(WARM_FRAMES).toBeGreaterThanOrEqual(1);
    expect(WARM_FRAMES).toBeLessThanOrEqual(4);
  });

  it("draws a pool that has something to show whether or not it is warming", () => {
    expect(drawn(10, true).every(Boolean)).toBe(true);
    expect(drawPool(true, 0)).toBe(true);
  });

  it("never starts warming again once it is spent", () => {
    let left = 0;
    for (let i = 0; i < 100; i++) left = warmStep(left);
    expect(left).toBe(0);
    expect(drawPool(false, left)).toBe(false);
  });
});
