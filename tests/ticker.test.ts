/**
 * The ticker that lost its remainder (Stage 114): 12 Hz on the average at any frame rate, every
 * frame when frames are slower, and a hitch that is not followed by a burst.
 */
import { describe, expect, it } from "vitest";
import { TICKER_HZ, TICKER_PERIOD, tickerRedraws, tickerStep } from "../client/render/ticker";

const frames = (dt: number, n: number): number[] => Array.from({ length: n }, () => dt);

describe("tickerStep", () => {
  it("does not redraw until a period has accumulated", () => {
    let acc = 0;
    for (let i = 0; i < 4; i++) {
      const s = tickerStep(acc, 1 / 60);
      expect(s.redraw).toBe(false);
      acc = s.acc;
    }
    expect(tickerStep(acc, 1 / 60).redraw).toBe(true);
  });
  it("carries the remainder forward instead of dropping it", () => {
    const s = tickerStep(0, 0.1);
    expect(s.redraw).toBe(true);
    expect(s.acc).toBeCloseTo(0.1 - TICKER_PERIOD, 9);
  });
  it("caps the carry below one period so a hitch cannot queue a burst", () => {
    const s = tickerStep(0, 1.2);
    expect(s.redraw).toBe(true);
    expect(s.acc).toBeLessThan(TICKER_PERIOD);
    const next = tickerStep(s.acc, 1 / 60);
    expect(next.redraw).toBe(true);
    expect(tickerStep(next.acc, 1 / 60).redraw).toBe(false);
  });
  it("ignores a negative frame time", () => {
    expect(tickerStep(0.05, -1).acc).toBe(0.05);
  });
});

describe("tickerRedraws", () => {
  it("averages 12 Hz at 20 ms frames (a 10 Hz result is the dropped remainder)", () => {
    expect(tickerRedraws(frames(0.02, 100))).toBe(2 * TICKER_HZ);
  });
  it("averages 12 Hz at 33 ms frames", () => {
    expect(tickerRedraws(frames(1 / 30, 300))).toBe(10 * TICKER_HZ);
  });
  it("redraws every frame when frames are slower than the period", () => {
    expect(tickerRedraws(frames(0.27, 7))).toBe(7);
  });
  it("after a stall, redraws once for the stall and once for the carry, then settles", () => {
    expect(tickerRedraws([1.2, 0.03, 0.03, 0.03, 0.03, 0.3, 0.3])).toBe(5);
    expect(tickerRedraws([1.2, ...frames(1 / 60, 10)])).toBe(1 + 1 + 1);
  });
  it("starts from the given accumulator", () => {
    expect(tickerRedraws([0.05], 0.05)).toBe(1);
    expect(tickerRedraws([0.05], 0)).toBe(0);
  });
});
