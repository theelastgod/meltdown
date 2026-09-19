/**
 * What the band's two numbers are measured against (Stage 156).
 *
 * The right-hand band has said `N FPS · SIM N Hz` since the first stage. Both were measured in a
 * window that only advanced on the frames the renderer drew, while the ticks counted into it came
 * from every frame the loop was given — and the loop is given frames from two drivers, the
 * animation frame and the keep-alive timer that carries the sim when animation frames are scarce.
 * On a machine drawing as fast as it is asked to, the two are the same and the numbers are right.
 * On a machine that is not, the window measures about half the time that passed and everything
 * divided by it comes out roughly doubled: measured against the wall clock, a page running its sim
 * at 60.0 Hz and drawing 3.8 frames a second said `8 FPS · SIM 120 Hz`.
 *
 * Which is the wrong way round. The number is there for the player whose machine is struggling —
 * to tell a renderer that cannot keep up from a simulation that is running fast or slow — and it
 * was exact right up to the moment it mattered and then wrong by a factor of two.
 *
 * So the window is folded here, once per frame the loop is given, drawn or not, and it keeps the
 * two counts apart: real time and ticks from every frame, drawn frames only from the ones that
 * drew. The elapsed time is the sim's own — the clamped frame delta the accumulator was fed — so
 * `SIM` answers "how fast did the sim run for the time it was given", the same question the probes
 * have always asked it.
 */

/** how much time each reading is averaged over */
export const PERF_WINDOW_SECONDS = 0.5;

export interface PerfWindow {
  /** seconds of sim time in this window, from every frame the loop was given */
  t: number;
  /** frames actually drawn in this window */
  frames: number;
  /** the tick counter as the window opened */
  ticks: number;
}

export interface PerfRead {
  /** frames drawn per second */
  fps: number;
  /** ticks run per second of the time the sim was given */
  simHz: number;
}

export function perfWindow(ticks = 0): PerfWindow {
  return { t: 0, frames: 0, ticks };
}

/**
 * Fold one frame into the window. `drew` is whether this frame reached the renderer; `ticks` is the
 * sim's tick counter after this frame's ticks have run. The read is returned on the frame that
 * closes the window, and the window returned is the one to carry into the next frame.
 */
export function perfStep(w: PerfWindow, dt: number, drew: boolean, ticks: number): { window: PerfWindow; read: PerfRead | null } {
  const t = w.t + Math.max(0, dt);
  const frames = w.frames + (drew ? 1 : 0);
  if (t < PERF_WINDOW_SECONDS) return { window: { t, frames, ticks: w.ticks }, read: null };
  return { window: perfWindow(ticks), read: { fps: frames / t, simHz: (ticks - w.ticks) / t } };
}
