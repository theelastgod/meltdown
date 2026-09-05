/**
 * Stage 1 audio: fully procedural WebAudio so the grey-box ships with real
 * low-end punch and distinct hit silhouettes. Sample-based layers replace
 * these synths in the polish pass without changing the call sites.
 */
import type { HitZone } from "@shared/sim/world";

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bed: { gain: GainNode } | null = null;
  /** Counts of each cue fired; readable by the probe to prove audio is wired. */
  readonly fired: Record<string, number> = {};
  private noiseBuf: AudioBuffer | null = null;

  /** Must be called from a user gesture (or with autoplay allowed). Idempotent. */
  resume(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.12;
      this.master.connect(comp).connect(this.ctx.destination);
      this.noiseBuf = this.makeNoise(2);
      this.startBed();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    // deterministic LCG so the bed is identical run to run
    let s = 0x2545f491;
    for (let i = 0; i < d.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      d[i] = (s / 0xffffffff) * 2 - 1;
    }
    return buf;
  }

  private count(name: string): void {
    this.fired[name] = (this.fired[name] ?? 0) + 1;
  }

  /** Rain bed + sub hum + neon buzz. The city is never silent. */
  private startBed(): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = 0.0;
    g.connect(this.master!);
    // rain: filtered noise
    const rain = ctx.createBufferSource();
    rain.buffer = this.noiseBuf;
    rain.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = "bandpass";
    rf.frequency.value = 3200;
    rf.Q.value = 0.5;
    const rg = ctx.createGain();
    rg.gain.value = 0.16;
    rain.connect(rf).connect(rg).connect(g);
    rain.start();
    // sub hum
    const hum = ctx.createOscillator();
    hum.type = "sine";
    hum.frequency.value = 48;
    const hg = ctx.createGain();
    hg.gain.value = 0.12;
    hum.connect(hg).connect(g);
    hum.start();
    // neon buzz: 120 Hz saw, heavily filtered, slow flicker
    const buzz = ctx.createOscillator();
    buzz.type = "sawtooth";
    buzz.frequency.value = 120;
    const bf = ctx.createBiquadFilter();
    bf.type = "lowpass";
    bf.frequency.value = 900;
    const bg = ctx.createGain();
    bg.gain.value = 0.012;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7.3;
    const lg = ctx.createGain();
    lg.gain.value = 0.006;
    lfo.connect(lg).connect(bg.gain);
    buzz.connect(bf).connect(bg).connect(g);
    buzz.start();
    lfo.start();
    g.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.5);
    this.bed = { gain: g };
  }

  private burst(opts: { dur: number; freq: number; q?: number; gain: number; type?: BiquadFilterType; pan?: number }): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? "bandpass";
    f.frequency.value = opts.freq;
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(opts.gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + opts.dur);
    const pan = ctx.createStereoPanner();
    pan.pan.value = opts.pan ?? 0;
    src.connect(f).connect(g).connect(pan).connect(this.master!);
    src.start(t);
    src.stop(t + opts.dur + 0.02);
  }

  private tone(opts: { dur: number; from: number; to?: number; gain: number; type?: OscillatorType; delay?: number }): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = opts.type ?? "sine";
    const t = ctx.currentTime + (opts.delay ?? 0);
    o.frequency.setValueAtTime(opts.from, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + opts.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + opts.dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + opts.dur + 0.02);
  }

  /** Lease-Breaker: crack + sub thump, mixed with real low end. */
  shot(): void {
    this.count("shot");
    if (!this.ctx) return;
    this.tone({ dur: 0.12, from: 160, to: 38, gain: 0.55, type: "sine" }); // sub punch
    this.burst({ dur: 0.07, freq: 2400, q: 0.6, gain: 0.35 }); // crack
    this.burst({ dur: 0.18, freq: 420, q: 0.8, gain: 0.2, type: "lowpass" }); // body
  }

  dryFire(): void {
    this.count("dry");
    if (!this.ctx) return;
    this.tone({ dur: 0.05, from: 900, to: 500, gain: 0.08, type: "square" });
  }

  /** Zone-pitched hit: head high and glassy, body mid, legs dull. */
  hit(zone: HitZone): void {
    this.count("hit_" + zone);
    if (!this.ctx) return;
    const f = zone === "head" ? 2200 : zone === "body" ? 1100 : 600;
    this.tone({ dur: 0.07, from: f, to: f * 0.6, gain: 0.22, type: "triangle" });
    this.burst({ dur: 0.05, freq: f * 1.5, q: 2, gain: 0.12 });
  }

  /** Kill confirm: receipt-printer stamp — a thunk and a short cyan tick. */
  kill(): void {
    this.count("kill");
    if (!this.ctx) return;
    this.tone({ dur: 0.16, from: 90, to: 40, gain: 0.6, type: "sine" }); // thunk
    this.burst({ dur: 0.05, freq: 800, q: 0.4, gain: 0.3, type: "lowpass" });
    this.tone({ dur: 0.09, from: 1760, gain: 0.12, type: "square", delay: 0.09 }); // tick
    this.tone({ dur: 0.12, from: 2349, gain: 0.1, type: "square", delay: 0.16 });
  }

  footstep(speed: number, pan: number): void {
    this.count("step");
    if (!this.ctx) return;
    const g = 0.05 + Math.min(0.12, speed * 0.012);
    this.burst({ dur: 0.06, freq: 260 + speed * 10, q: 0.7, gain: g, type: "lowpass", pan });
  }

  slide(): void {
    this.count("slide");
    if (!this.ctx) return;
    this.burst({ dur: 0.45, freq: 500, q: 0.4, gain: 0.2, type: "lowpass" });
  }

  jump(): void {
    this.count("jump");
    if (!this.ctx) return;
    this.burst({ dur: 0.08, freq: 350, q: 0.7, gain: 0.1, type: "lowpass" });
  }

  land(speed: number): void {
    this.count("land");
    if (!this.ctx) return;
    this.tone({ dur: 0.1, from: 120, to: 50, gain: 0.15 + Math.min(0.2, speed * 0.02) });
    this.burst({ dur: 0.08, freq: 300, q: 0.6, gain: 0.12, type: "lowpass" });
  }

  mantle(): void {
    this.count("mantle");
    if (!this.ctx) return;
    this.burst({ dur: 0.2, freq: 700, q: 0.5, gain: 0.14, type: "lowpass" });
    this.tone({ dur: 0.18, from: 80, to: 55, gain: 0.2, delay: 0.25 });
  }

  reload(phase: "start" | "end"): void {
    this.count("reload_" + phase);
    if (!this.ctx) return;
    if (phase === "start") {
      this.burst({ dur: 0.06, freq: 1800, q: 1.5, gain: 0.12 });
      this.burst({ dur: 0.1, freq: 500, q: 0.6, gain: 0.1, type: "lowpass", pan: -0.3 });
    } else {
      this.burst({ dur: 0.05, freq: 2600, q: 2, gain: 0.16 });
      this.tone({ dur: 0.08, from: 200, to: 90, gain: 0.25 });
    }
  }
}
