/**
 * Range ghosts: your own past runs of the Deadletter Office course, replayed
 * as a translucent figure so improvement is visible. The recorder samples the
 * local player at GHOST_HZ from the moment they leave the start pad until
 * they reach the end pad; the best run (fastest) is kept per account and
 * course, in localStorage and — when a ledger host is linked — on the file.
 * Render-only: nothing here touches the sim.
 */
import { GHOST_HZ, type GhostRun } from "@shared/progression/account";
import { overPad, type HubDef } from "@shared/sim/hub";
import { SIM_DT, SIM_HZ } from "@shared/sim/constants";
import type { PlayerState } from "@shared/sim/player";

export interface GhostPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export class RangeGhost {
  /** best run so far (null: none yet) */
  best: GhostRun | null = null;
  /** the run being recorded */
  private rec: number[] | null = null;
  private recTicks = 0;
  private everyTicks = Math.max(1, Math.round(SIM_HZ / GHOST_HZ));
  /** playback clock in seconds (−1: idle) */
  private play = -1;
  private wasOnStart = false;
  /** how many runs finished this session, and the last time */
  runs = 0;
  lastSeconds = 0;
  onFinish: ((run: GhostRun, improved: boolean) => void) | null = null;

  constructor(private hub: HubDef, private level: string, private key: string) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) this.best = JSON.parse(raw) as GhostRun;
    } catch {
      this.best = null;
    }
  }

  /** Adopt a run stored on the file (server-side) when it is better than the local one. */
  adopt(run: GhostRun | null | undefined): void {
    if (run && run.level === this.level && (!this.best || run.seconds < this.best.seconds)) this.best = run;
  }

  get recording(): boolean {
    return this.rec !== null;
  }

  get playing(): boolean {
    return this.play >= 0;
  }

  /** Called once per sim tick with the local player. Playback runs on the sim clock too, so a headless run replays deterministically. */
  tick(p: PlayerState): void {
    if (this.play >= 0) {
      this.play += SIM_DT;
      if (this.best && this.play > this.best.seconds + 1.5) this.play = -1;
    }
    const onStart = overPad(this.hub.start, p.pos);
    const onEnd = overPad(this.hub.end, p.pos);
    if (this.rec === null) {
      // leaving the start pad begins a run (and starts the ghost, if there is one)
      if (this.wasOnStart && !onStart && p.alive) {
        this.rec = [p.pos.x, p.pos.y, p.pos.z, p.yaw];
        this.recTicks = 0;
        this.play = this.best ? 0 : -1;
      }
    } else {
      this.recTicks++;
      if (this.recTicks % this.everyTicks === 0) this.rec.push(p.pos.x, p.pos.y, p.pos.z, p.yaw);
      if (onEnd) this.finish(p);
      else if (onStart || !p.alive || this.recTicks > 120 * SIM_HZ) {
        // back to the start, died, or wandered for two minutes: the run is void
        this.rec = null;
        this.play = -1;
      }
    }
    this.wasOnStart = onStart;
  }

  private finish(p: PlayerState): void {
    const samples = this.rec!;
    samples.push(p.pos.x, p.pos.y, p.pos.z, p.yaw);
    const seconds = this.recTicks / SIM_HZ;
    const run: GhostRun = { level: this.level, seconds, samples, at: Date.now() };
    this.rec = null;
    this.runs++;
    this.lastSeconds = seconds;
    const improved = !this.best || seconds < this.best.seconds;
    if (improved) {
      this.best = run;
      try {
        localStorage.setItem(this.key, JSON.stringify(run));
      } catch {
        /* private mode */
      }
    }
    this.onFinish?.(run, improved);
  }

  /** The ghost's pose at the playback clock, or null when it is not on the course. */
  pose(): GhostPose | null {
    if (this.play < 0 || !this.best) return null;
    const s = this.best.samples;
    const n = s.length / 4;
    const t = this.play * GHOST_HZ;
    if (t >= n - 1) {
      // the ghost reached the end: it holds there a moment (tick() clears it), then vanishes
      const i = (n - 1) * 4;
      return { x: s[i]!, y: s[i + 1]!, z: s[i + 2]!, yaw: s[i + 3]! };
    }
    const i0 = Math.floor(t) * 4;
    const k = t - Math.floor(t);
    const i1 = i0 + 4;
    let dy = s[i1 + 3]! - s[i0 + 3]!;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    return { x: s[i0]! + (s[i1]! - s[i0]!) * k, y: s[i0 + 1]! + (s[i1 + 1]! - s[i0 + 1]!) * k, z: s[i0 + 2]! + (s[i1 + 2]! - s[i0 + 2]!) * k, yaw: s[i0 + 3]! + dy * k };
  }
}
