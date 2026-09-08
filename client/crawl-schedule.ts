/**
 * The crawl as a pure schedule: typed-then-held, one paragraph at a time, a tear between
 * paragraphs, a hard cut to silence, then the title. No DOM here, so the timing is testable and
 * the probe can run it at speed.
 */
export const TYPE_CPS = 60;
/** hold = HOLD_BASE + HOLD_PER_CHAR × chars: the time to read what was just typed */
export const HOLD_BASE = 0.9;
export const HOLD_PER_CHAR = 0.008;
export const TEAR_SECONDS = 0.35;
/** the hard cut: black and silent before the title */
export const CUT_SECONDS = 1.6;

export type Phase = "type" | "hold" | "tear" | "cut" | "title";

export interface Segment {
  kind: Phase;
  /** paragraph index (type/hold/tear: the paragraph just shown) */
  p: number;
  start: number;
  end: number;
}

export interface CrawlState {
  phase: Phase;
  paragraph: number;
  /** characters of the paragraph visible */
  typed: number;
  /** tears completed so far */
  tears: number;
  /** seconds into the crawl (crawl time) */
  t: number;
  /** the crawl is over: the title is up */
  done: boolean;
}

export function buildSchedule(paragraphs: readonly string[]): Segment[] {
  const out: Segment[] = [];
  let t = 0;
  paragraphs.forEach((text, p) => {
    const typeFor = text.length / TYPE_CPS;
    out.push({ kind: "type", p, start: t, end: t + typeFor });
    t += typeFor;
    const hold = HOLD_BASE + HOLD_PER_CHAR * text.length;
    out.push({ kind: "hold", p, start: t, end: t + hold });
    t += hold;
    if (p < paragraphs.length - 1) {
      out.push({ kind: "tear", p, start: t, end: t + TEAR_SECONDS });
      t += TEAR_SECONDS;
    }
  });
  out.push({ kind: "cut", p: paragraphs.length - 1, start: t, end: t + CUT_SECONDS });
  t += CUT_SECONDS;
  out.push({ kind: "title", p: paragraphs.length - 1, start: t, end: Infinity });
  return out;
}

/** Seconds from the first keystroke to the title. */
export function crawlDuration(paragraphs: readonly string[]): number {
  const s = buildSchedule(paragraphs);
  return s[s.length - 1]!.start;
}

export function crawlAt(schedule: readonly Segment[], paragraphs: readonly string[], t: number): CrawlState {
  // A `t` before the first keystroke is the BEGINNING, not the end. The find below misses for any
  // t < 0, and the old fallback handed back the last segment — the title — so a single negative
  // frame reported the crawl as over and done. That is not hypothetical: OpeningCrawl.frame took
  // its dt straight from the rAF timestamp, which can predate the constructor's performance.now(),
  // and one such frame flashed the title, latched the skip hint hidden and burned the "seen" flag
  // on a player's first view. Clamping here makes the whole class unreachable from any caller.
  const seg = schedule.find((s) => t >= s.start && t < s.end) ?? (t < (schedule[0]?.start ?? 0) ? schedule[0]! : schedule[schedule.length - 1]!);
  const tears = schedule.filter((s) => s.kind === "tear" && s.end <= t).length;
  const text = paragraphs[seg.p] ?? "";
  const typed = seg.kind === "type" ? Math.max(0, Math.min(text.length, Math.floor((t - seg.start) * TYPE_CPS))) : seg.kind === "hold" || seg.kind === "tear" ? text.length : 0;
  return { phase: seg.kind, paragraph: seg.p, typed, tears, t, done: seg.kind === "title" };
}

/** The register's shape, checked in CI: paragraphs shorten, and the last is one isolated line. */
export function crawlShape(paragraphs: readonly string[]): { shortening: boolean; isolatedLast: boolean; count: number } {
  let shortening = paragraphs.length > 1;
  for (let i = 1; i < paragraphs.length; i++) if (paragraphs[i]!.length >= paragraphs[i - 1]!.length) shortening = false;
  const last = paragraphs[paragraphs.length - 1] ?? "";
  return { shortening, isolatedLast: last.length > 0 && last.length <= 72 && !last.includes("\n"), count: paragraphs.length };
}
