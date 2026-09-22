/**
 * The frame monitor (Stage 50): on with `?perf=1`, off otherwise, and when off it costs nothing —
 * the game never constructs it. On, it costs one subtraction a frame. After `?perfAfter=` seconds
 * (default 30) with enough frames it posts one report to the ledger host and stops posting.
 */
import { MAX_SAMPLES, MIN_FRAMES, summariseFrames, type FrameSummary, type PerfReport } from "@shared/perf/report";
import { HOSTS } from "./config";
import type { Game } from "./game";

export class PerfMonitor {
  private deltas: number[] = [];
  private last = -1;
  private startedAt = -1;
  private nextDraw = 0;
  private el: HTMLDivElement;
  /** true only once the host has accepted the report; `posting` guards re-entry while the request is in flight */
  posted = false;
  private posting = false;
  postError: string | null = null;
  report: PerfReport | null = null;
  readonly after: number;
  readonly host: string | null;

  constructor(private game: Game, hud: HTMLElement, after: number) {
    this.after = Math.max(1, after);
    const q = new URLSearchParams(location.search);
    this.host = q.get("shop") ?? game.file.shop ?? (HOSTS.build !== "dev" ? HOSTS.ledger : null);
    this.el = document.createElement("div");
    this.el.className = "p cy perf";
    this.el.textContent = "PERF · SAMPLING…";
    hud.appendChild(this.el);
  }

  /** the GPU as the browser names it; a browser that hides it says so */
  gpu(): string {
    try {
      const gl = this.game.renderer.renderer.getContext();
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      const s = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
      return s || "unknown";
    } catch {
      return "unknown";
    }
  }

  summary(): FrameSummary {
    return summariseFrames(this.deltas);
  }

  /** one call per frame from the game loop; rendered frames only, since a hidden tab's timer ticks are not frames */
  sample(now: number, rendered: boolean): void {
    if (!rendered) {
      this.last = -1;
      return;
    }
    if (this.startedAt < 0) this.startedAt = now;
    if (this.last >= 0) {
      this.deltas.push(now - this.last);
      if (this.deltas.length > MAX_SAMPLES) this.deltas.splice(0, this.deltas.length - MAX_SAMPLES);
    }
    this.last = now;
    if (now >= this.nextDraw) {
      this.nextDraw = now + 500;
      this.draw();
    }
    // the gate counts the frames the statistics will keep, not the samples taken: a load frame over
    // 500 ms is a sample and not a frame, and a report one frame short is one the host refuses
    if (!this.posted && !this.posting && !this.postError && now - this.startedAt >= this.after * 1000 && this.deltas.length >= MIN_FRAMES && this.summary().frames >= MIN_FRAMES) void this.post();
  }

  private draw(): void {
    const s = this.summary();
    const r = this.game.renderer.renderer.info.render;
    this.el.innerHTML = `PERF · ${s.fps.toFixed(0)} fps · p50 <b>${s.p50.toFixed(1)}</b> p95 <b>${s.p95.toFixed(1)}</b> p99 <b>${s.p99.toFixed(1)}</b> max ${s.max.toFixed(0)} ms · ${r.calls} calls · ${(r.triangles / 1000).toFixed(0)}k tris · scale ${this.game.renderer.post.scale}<br><span class="dim">${this.gpu().slice(0, 60)} · ${innerWidth}×${innerHeight}@${devicePixelRatio} · ${this.posted ? "REPORTED" : this.postError ? `NOT REPORTED: ${this.postError}` : `REPORT IN ${Math.max(0, Math.ceil(this.after - (performance.now() - this.startedAt) / 1000))} S`}</span>`;
  }

  build(): PerfReport {
    const r = this.game.renderer.renderer.info.render;
    return {
      ...this.summary(),
      build: HOSTS.build,
      ua: navigator.userAgent.slice(0, 400),
      gpu: this.gpu().slice(0, 200),
      viewport: `${innerWidth}x${innerHeight}`,
      dpr: devicePixelRatio,
      touch: !!this.game.touch,
      scale: this.game.renderer.post.scale,
      calls: r.calls,
      triangles: r.triangles,
      level: this.game.levelId,
    };
  }

  private async post(): Promise<void> {
    this.report = this.build();
    if (!this.host) {
      this.postError = "NO LEDGER HOST";
      return;
    }
    this.posting = true; // once; a failure is shown, not retried every frame
    try {
      const res = await fetch(`${this.host}/perf`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(this.report) });
      const j = (await res.json()) as { ok?: boolean; reason?: string };
      // "posted" means the host said yes — not that a request left. A probe that reads this flag
      // and then asks the host must find the row there.
      if (j.ok) this.posted = true;
      else this.postError = j.reason ?? `status ${res.status}`;
    } catch (e) {
      this.postError = String((e as Error).message ?? e).slice(0, 80);
    }
    this.posting = false;
    this.draw();
  }

  /** probe-readable */
  state() {
    return { ...this.summary(), posted: this.posted, error: this.postError, host: this.host, report: this.report, after: this.after };
  }
}
