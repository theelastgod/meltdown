/**
 * The phone measures itself (Stage 50): the statistics a report is built from, what a host will
 * accept, how many it keeps — and that none of it is within the simulation's reach.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { MAX_FRAME_MS, MAX_REPORTS, MIN_FRAMES, ReportRing, summariseFrames, validReport, type PerfReport } from "../shared/perf/report";

const good = (): PerfReport => ({ build: "dev", ua: "probe", gpu: "SwiftShader", viewport: "640x360", dpr: 1, touch: false, scale: 1, calls: 145, triangles: 17000, level: "drainage_yard", frames: 120, seconds: 2, p50: 16, p95: 20, p99: 30, max: 40, fps: 60 });

describe("frame statistics", () => {
  it("a known sequence gives known percentiles", () => {
    const deltas = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100 ms
    const s = summariseFrames(deltas);
    expect(s.frames).toBe(100);
    expect(s.p50).toBe(51);
    expect(s.p95).toBe(96);
    expect(s.p99).toBe(100);
    expect(s.max).toBe(100);
    expect(s.seconds).toBeCloseTo(5.05);
    expect(s.fps).toBeCloseTo(100 / 5.05);
  });

  it("a frame that never ended is not counted as slow: a tab switch is left out, not averaged in", () => {
    const steady = Array.from({ length: 99 }, () => 16);
    const s = summariseFrames([...steady, MAX_FRAME_MS + 1]);
    expect(s.frames).toBe(99);
    expect(s.max).toBe(16);
    expect(summariseFrames([...steady, MAX_FRAME_MS]).frames).toBe(100); // the bound is inclusive
    expect(summariseFrames([0, -1, Number.NaN, Number.POSITIVE_INFINITY]).frames).toBe(0);
  });

  it("no frames is zero everywhere rather than a division by nothing", () => {
    expect(summariseFrames([])).toEqual({ frames: 0, seconds: 0, p50: 0, p95: 0, p99: 0, max: 0, fps: 0 });
  });
});

describe("what a host accepts", () => {
  it("a well-formed report passes with its fields intact and touch read as a strict boolean", () => {
    const r = validReport({ ...good(), touch: "yes" });
    expect(r).toEqual({ ...good(), touch: false });
  });

  it("refuses the shapes an open route would otherwise store: oversize strings, non-numbers, out-of-range, too few frames, and percentiles out of order", () => {
    expect(validReport(null)).toBeNull();
    expect(validReport("x")).toBeNull();
    expect(validReport({ ...good(), ua: "x".repeat(401) })).toBeNull();
    expect(validReport({ ...good(), gpu: 42 })).toBeNull();
    expect(validReport({ ...good(), p95: Number.NaN })).toBeNull();
    expect(validReport({ ...good(), p50: MAX_FRAME_MS + 1, p95: MAX_FRAME_MS + 1, p99: MAX_FRAME_MS + 1, max: MAX_FRAME_MS + 1 })).toBeNull();
    expect(validReport({ ...good(), frames: MIN_FRAMES - 1 })).toBeNull();
    expect(validReport({ ...good(), p95: 10 })).toBeNull(); // p95 below p50
    expect(validReport({ ...good(), dpr: 0 })).toBeNull();
    expect(validReport({ ...good(), scale: 5 })).toBeNull();
  });

  it("keeps a bounded, newest-first list", () => {
    const ring = new ReportRing();
    for (let i = 0; i < MAX_REPORTS + 10; i++) ring.add({ ...good(), calls: i }, i);
    const all = ring.list(1000);
    expect(all).toHaveLength(MAX_REPORTS);
    expect(all[0]!.calls).toBe(MAX_REPORTS + 9);
    expect(all[0]!.at).toBe(MAX_REPORTS + 9);
    expect(ring.list(3)).toHaveLength(3);
  });
});

describe("the monitor is out of the simulation's reach", () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
  it("nothing under shared/ or server/ imports the client, so the sim cannot see the monitor, the HUD or anything else the page owns", () => {
    const offenders = [...files("shared"), ...files("server")].filter((f) => f.endsWith(".ts") && /from\s+["'](@client\/|\.\.?\/(\.\.\/)*client\/)/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
  it("and the report module itself imports nothing at all", () => {
    expect(readFileSync("shared/perf/report.ts", "utf8")).not.toMatch(/^\s*import\s/m);
  });
});
