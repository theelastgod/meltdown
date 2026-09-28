/**
 * Street runs on the HUD (Stage 703): the words, from the room's messages. No DOM and no renderer
 * here, so the lines are tested as lines; `Campaign` puts them on the objective line, the banner, the
 * card, the beam and the map, all of which the HUD already had.
 */
import type { CityRunMsg } from "@shared/net/protocol";

export type RunCourse = NonNullable<CityRunMsg["courses"]>[number];
export type RunView = NonNullable<CityRunMsg["run"]>;

const WORD: Record<string, string> = { street: "STREET", ledge: "LEDGE", roof: "ROOFTOP", walkway: "WALKWAY" };

/** 38.217 → "38.21"; 95.5 → "1:35.50": a stopwatch, to the hundredth */
export function runClock(seconds: number): string {
  const cs = Math.max(0, Math.floor(seconds * 100 + 1e-6));
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const frac = String(cs % 100).padStart(2, "0");
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}.${frac}` : `${s}.${frac}`;
}

/** -1.2 → "−1.20" (ahead of your best), 0.84 → "+0.84", no best → "" */
export function runDelta(d: number | null | undefined): string {
  if (d === null || d === undefined) return "";
  const r = Math.round(d * 100) / 100;
  return `${r < 0 ? "−" : "+"}${Math.abs(r).toFixed(2)}`;
}

/** The course's start ring nearest to `from`, and how far: the prompt and the beam when no run is on. */
export function nearestStart(courses: readonly RunCourse[], from: { x: number; z: number }): { course: RunCourse; distance: number } | null {
  let best: { course: RunCourse; distance: number } | null = null;
  for (const c of courses) {
    const d = Math.hypot(c.start.x - from.x, c.start.z - from.z);
    if (!best || d < best.distance) best = { course: c, distance: d };
  }
  return best;
}

/** The objective line near a start ring: what the course is and what beating it means. */
export function startPrompt(c: RunCourse, best: number | null, record: { name: string; time: number } | null, distance: number): { title: string; text: string; progress: string } {
  const at = distance > c.radius ? ` · ${Math.round(distance)} M` : "";
  const standing = [best !== null ? `YOUR BEST ${runClock(best)}` : "", record ? `RECORD ${record.name} ${runClock(record.time)}` : ""].filter(Boolean).join(" · ");
  return {
    title: `◈ STREET RUN · ${c.name}`,
    text: `STAND IN THE RING TO ARM · ${c.checkpoints.length} CHECKPOINTS · PAR ${runClock(c.par)}${at}`,
    progress: standing || "NO TIME POSTED YET",
  };
}

/** The objective line during a run: which checkpoint, what kind, how far; the clock and the last split against your best. */
export function runObjective(c: RunCourse, run: RunView, elapsed: number, from: { x: number; z: number } | null): { title: string; text: string; progress: string } {
  if (run.state === "armed") return { title: `◈ STREET RUN · ${c.name}`, text: `ARMED · LEAVE THE RING TO START THE CLOCK · PAR ${runClock(c.par)}`, progress: "0.00" };
  const n = c.checkpoints.length;
  const cp = c.checkpoints[Math.min(run.next, n - 1)]!;
  const away = from ? ` · ${Math.round(Math.hypot(cp.x - from.x, cp.z - from.z))} M` : "";
  const what = run.next >= n - 1 ? "FINISH" : `CHECKPOINT ${run.next + 1}/${n}`;
  const up = cp.y >= 0.6 ? ` · ${WORD[cp.kind] ?? "UP"}` : "";
  const last = runDelta(run.deltas[run.deltas.length - 1]);
  return { title: `◈ STREET RUN · ${c.name}`, text: `${what}${up}${away}`, progress: `${runClock(elapsed)}${last ? ` · ${last}` : ""}` };
}

/** The banner at a checkpoint: its split, and against your best there. */
export function splitBanner(c: RunCourse, run: RunView): string {
  const i = run.splits.length - 1;
  const d = runDelta(run.deltas[i]);
  return `◆ ${i + 1}/${c.checkpoints.length} · ${runClock(run.splits[i] ?? 0)}${d ? ` · ${d}` : ""}`;
}

/**
 * The card when a run ends: the time, the place, against your best and the par, and what it paid; or
 * why it was void.
 */
export function runCard(c: RunCourse, run: RunView, best: number | null): { title: string; lines: string[]; color: "am" | "mg" | "cy" } | null {
  if (run.state === "void") return { title: `RUN VOID · ${c.name}`, lines: [run.reason ?? "", "STAND IN THE START RING TO GO AGAIN"].filter(Boolean), color: "mg" };
  if (run.state !== "finished" || run.time === undefined) return null;
  const vsPar = runDelta(run.time - c.par);
  const vsBest = runDelta(run.deltas[run.deltas.length - 1]);
  const lines = [
    `${runClock(run.time)} · PAR ${runClock(c.par)} (${vsPar})`,
    run.pb ? (vsBest ? `NEW BEST · ${vsBest}` : "FIRST TIME POSTED") : best !== null ? `YOUR BEST ${runClock(best)}${vsBest ? ` · ${vsBest}` : ""}` : "",
    run.rank ? `#${run.rank} IN THE DISTRICT` : "NO FILE · TIMED, NOT POSTED",
    ...(run.reward ?? []),
  ].filter(Boolean);
  return { title: `${run.pb && run.rank === 1 ? "DISTRICT RECORD" : "FINISH"} · ${c.name}`, lines, color: run.pb ? "cy" : "am" };
}
