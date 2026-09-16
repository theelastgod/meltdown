/**
 * The phone measures itself (Stage 50).
 *
 * Every frame-time number in the repo before this came from software GL on a CI runner, which
 * says whether a frame allocates, not how long it takes on a mid-range Android. A device can only
 * be measured by the device. So a page opened with `?perf=1` samples its own frames, shows the
 * percentiles on the HUD, and after `perfAfter` seconds posts one report to the ledger host, where
 * `GET /perf` lists them — a row anyone can read without holding the phone.
 *
 * This module is the pure part: the statistics and the shape of a report, shared by the client
 * that writes one and the hosts that store one. It reads nothing from the sim and the sim reads
 * nothing from it; `tests/perf.test.ts` keeps it that way.
 */

/** A frame longer than this is a tab switch or a debugger, not a frame; the game drops the same excess (client/game.ts) */
export const MAX_FRAME_MS = 500;
/** how many reports a host keeps; a phone is a row, not a stream */
export const MAX_REPORTS = 200;
/** the most frames the monitor keeps: a minute at 60 fps, so a page left open does not sort its whole history twice a second */
export const MAX_SAMPLES = 3600;
/** the fewest frames a report may summarise; below this a percentile is a guess */
export const MIN_FRAMES = 60;

export interface FrameSummary {
  frames: number;
  seconds: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  fps: number;
}

/** Percentiles over frame deltas in ms, with the frames that never ended left out rather than counted as slow. */
export function summariseFrames(deltasMs: readonly number[]): FrameSummary {
  const kept = deltasMs.filter((d) => Number.isFinite(d) && d > 0 && d <= MAX_FRAME_MS);
  const sorted = kept.slice().sort((a, b) => a - b);
  const at = (q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]! : 0);
  const seconds = kept.reduce((a, b) => a + b, 0) / 1000;
  return { frames: kept.length, seconds, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted[sorted.length - 1] ?? 0, fps: seconds > 0 ? kept.length / seconds : 0 };
}

export interface PerfReport extends FrameSummary {
  /** the client build (VITE_BUILD), so a row says which code it measured */
  build: string;
  ua: string;
  /** the GPU's unmasked renderer string when the browser gives it, else "unknown" */
  gpu: string;
  viewport: string;
  dpr: number;
  touch: boolean;
  /** the post chain's internal scale (Stage 32 drops a phone to 0.45) */
  scale: number;
  calls: number;
  triangles: number;
  level: string;
}

export interface StoredReport extends PerfReport {
  at: number;
}

const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.length <= max ? v : null);
const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

/** What a host accepts on POST /perf: every field bounded, so an open route cannot be a place to put anything. */
export function checkReport(raw: unknown): { ok: true; report: PerfReport } | { ok: false; problem: string } {
  if (!raw || typeof raw !== "object") return { ok: false, problem: "not an object" };
  const r = raw as Record<string, unknown>;
  const problems: string[] = [];
  const S = (k: string, max: number): string => {
    const v = str(r[k], max);
    if (v === null) problems.push(`${k}: ${typeof r[k] === "string" ? `longer than ${max}` : "not a string"}`);
    return v ?? "";
  };
  const N = (k: string, lo: number, hi: number): number => {
    const v = num(r[k], lo, hi);
    if (v === null) problems.push(`${k}: ${typeof r[k] === "number" && Number.isFinite(r[k]) ? `${r[k]} outside ${lo}..${hi}` : "not a finite number"}`);
    return v ?? 0;
  };
  const report: PerfReport = {
    build: S("build", 64),
    ua: S("ua", 400),
    gpu: S("gpu", 200),
    viewport: S("viewport", 32),
    level: S("level", 64),
    dpr: N("dpr", 0.25, 8),
    scale: N("scale", 0.1, 2),
    calls: N("calls", 0, 100_000),
    triangles: N("triangles", 0, 1e9),
    frames: N("frames", MIN_FRAMES, 1e7),
    seconds: N("seconds", 0.1, 86_400),
    p50: N("p50", 0, MAX_FRAME_MS),
    p95: N("p95", 0, MAX_FRAME_MS),
    p99: N("p99", 0, MAX_FRAME_MS),
    max: N("max", 0, MAX_FRAME_MS),
    fps: N("fps", 0, 1000),
    touch: r["touch"] === true,
  };
  if (!problems.length && !(report.p50 <= report.p95 && report.p95 <= report.p99 && report.p99 <= report.max)) problems.push("percentiles out of order");
  return problems.length ? { ok: false, problem: problems.join("; ") } : { ok: true, report };
}

export function validReport(raw: unknown): PerfReport | null {
  const c = checkReport(raw);
  return c.ok ? c.report : null;
}

/** A bounded, newest-first list: what both hosts keep. */
export class ReportRing {
  private rows: StoredReport[] = [];
  add(r: PerfReport, at = Date.now()): StoredReport {
    const row = { ...r, at };
    this.rows.unshift(row);
    if (this.rows.length > MAX_REPORTS) this.rows.length = MAX_REPORTS;
    return row;
  }
  list(n = 50): StoredReport[] {
    return this.rows.slice(0, n);
  }
}
