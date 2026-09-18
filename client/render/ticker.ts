/**
 * The ad tickers' clock (Stage 114). The holographic ad panels redraw their canvases at a capped
 * rate: on a fast machine every 1/12 s, on a slow one every drawn frame. The step carries the
 * remainder rather than dropping it, so at 30 or 50 fps the average is still 12 Hz (dropping it
 * made every redraw wait a whole extra frame: 10 Hz at 20 ms frames), and the carry is capped
 * below one period so a hitch is one redraw plus one, never a burst at frame rate.
 */
export const TICKER_HZ = 12;
export const TICKER_PERIOD = 1 / TICKER_HZ;

/** advance the throttle by one frame of `dt` seconds: the new accumulator and whether to redraw */
export function tickerStep(acc: number, dt: number): { acc: number; redraw: boolean } {
  const a = acc + Math.max(0, dt);
  if (a < TICKER_PERIOD) return { acc: a, redraw: false };
  return { acc: Math.min(a - TICKER_PERIOD, TICKER_PERIOD * 0.999), redraw: true };
}

/** redraws a ticker makes over a sequence of frame times, starting from accumulator `acc0` */
export function tickerRedraws(dts: readonly number[], acc0 = 0): number {
  let acc = acc0;
  let n = 0;
  for (const dt of dts) {
    const s = tickerStep(acc, dt);
    acc = s.acc;
    if (s.redraw) n++;
  }
  return n;
}
