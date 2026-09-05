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
    // distant traffic: low rumble of noise whose level swells and fades like cars passing on the vista roads
    const traffic = ctx.createBufferSource();
    traffic.buffer = this.noiseBuf;
    traffic.loop = true;
    traffic.playbackRate.value = 0.37;
    const tf = ctx.createBiquadFilter();
    tf.type = "lowpass";
    tf.frequency.value = 180;
    tf.Q.value = 0.8;
    const tg = ctx.createGain();
    tg.gain.value = 0.16;
    const swell = ctx.createOscillator();
    swell.type = "sine";
    swell.frequency.value = 0.09;
    const sg = ctx.createGain();
    sg.gain.value = 0.11;
    swell.connect(sg).connect(tg.gain);
    traffic.connect(tf).connect(tg).connect(g);
    traffic.start();
    swell.start();
    // crowd murmur: two narrow bands of noise around the vowel range, each breathing on its own slow LFO
    for (const [freq, rate, gain] of [[420, 0.23, 0.05], [760, 0.31, 0.035]] as const) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      src.playbackRate.value = 0.8;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = freq;
      bp.Q.value = 2.2;
      const cg = ctx.createGain();
      cg.gain.value = gain;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const lg = ctx.createGain();
      lg.gain.value = gain * 0.7;
      lfo.connect(lg).connect(cg.gain);
      src.connect(bp).connect(cg).connect(g);
      src.start();
      lfo.start();
    }
    g.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.5);
    this.bed = { gain: g };
  }

  /** A VANTAGE siren somewhere across the district: a two-tone wail, panned, dull with distance, fading as it passes. */
  siren(pan = 0.6): void {
    this.count("siren");
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 1.2);
    g.gain.setValueAtTime(0.09, t + 3.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + 6.5);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(pan, t);
    p.pan.linearRampToValueAtTime(-pan, t + 6.5);
    for (let i = 0; i < 8; i++) {
      o.frequency.setValueAtTime(i % 2 ? 660 : 494, t + i * 0.8);
    }
    o.connect(f).connect(g).connect(p).connect(this.master!);
    o.start(t);
    o.stop(t + 6.6);
  }

  /** The PA: a three-note VANTAGE chime, then a formant-filtered burst that reads as a voice through street speakers. */
  pa(): void {
    this.count("pa");
    if (!this.ctx) return;
    for (const [i, hz] of [523, 659, 784].entries()) this.tone({ dur: 0.35, from: hz, gain: 0.07, type: "triangle", delay: i * 0.22 });
    // "voice": syllables of narrow-band noise across a few formants, slap-echoed like a speaker on a wall
    let d = 0.9;
    const formants = [640, 820, 1100, 720, 980, 560, 1250, 880, 700];
    for (let i = 0; i < formants.length; i++) {
      const f = formants[i] ?? 700;
      this.burst({ dur: 0.11, freq: f, q: 5, gain: 0.07, delay: d, pan: 0.35 });
      this.burst({ dur: 0.11, freq: f * 0.5, q: 4, gain: 0.05, delay: d, pan: 0.35 });
      this.burst({ dur: 0.09, freq: f, q: 5, gain: 0.025, delay: d + 0.17, pan: -0.5 }); // echo off the far facade
      d += 0.14 + (i % 3) * 0.05;
    }
  }

  /** The monorail passing overhead: a rising then falling whoosh with a doppler-shifted motor note. */
  tram(): void {
    this.count("tram");
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(1800, t + 1.1);
    f.frequency.exponentialRampToValueAtTime(160, t + 2.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 1.1);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.7);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(-0.8, t);
    p.pan.linearRampToValueAtTime(0.8, t + 2.6);
    src.connect(f).connect(g).connect(p).connect(this.master!);
    src.start(t);
    src.stop(t + 2.8);
    this.tone({ dur: 2.4, from: 210, to: 140, gain: 0.08, type: "sawtooth" });
    this.tone({ dur: 0.5, from: 60, to: 45, gain: 0.25 });
  }

  private burst(opts: { dur: number; freq: number; q?: number; gain: number; type?: BiquadFilterType; pan?: number; delay?: number }): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? "bandpass";
    f.frequency.value = opts.freq;
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    const t = ctx.currentTime + (opts.delay ?? 0);
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

  /** Weapon shot silhouettes: each has a distinct low end and crack so they read blind. */
  shot(weapon = "lease_breaker"): void {
    this.count("shot");
    this.count("shot_" + weapon);
    if (!this.ctx) return;
    switch (weapon) {
      case "repo_hammer":
        this.tone({ dur: 0.22, from: 120, to: 30, gain: 0.8, type: "sine" });
        this.burst({ dur: 0.16, freq: 900, q: 0.4, gain: 0.5 });
        this.burst({ dur: 0.35, freq: 220, q: 0.7, gain: 0.35, type: "lowpass" });
        this.burst({ dur: 0.05, freq: 3000, q: 2, gain: 0.15, delay: 0.25 }); // pump
        break;
      case "stack_smg":
        this.tone({ dur: 0.06, from: 220, to: 60, gain: 0.35, type: "sine" });
        this.burst({ dur: 0.04, freq: 3200, q: 0.8, gain: 0.3 });
        break;
      case "longwave":
        this.tone({ dur: 0.5, from: 90, to: 28, gain: 0.85, type: "sine" });
        this.tone({ dur: 0.35, from: 2200, to: 400, gain: 0.25, type: "sawtooth" });
        this.burst({ dur: 0.4, freq: 1200, q: 0.3, gain: 0.35 });
        break;
      case "phage":
        this.tone({ dur: 0.18, from: 140, to: 50, gain: 0.5, type: "sine" });
        this.burst({ dur: 0.12, freq: 600, q: 0.5, gain: 0.3, type: "lowpass" });
        this.tone({ dur: 0.2, from: 500, to: 900, gain: 0.08, type: "triangle" });
        break;
      case "shock_baton":
        this.burst({ dur: 0.12, freq: 2600, q: 3, gain: 0.25 });
        this.tone({ dur: 0.12, from: 180, to: 120, gain: 0.2, type: "square" });
        break;
      case "wasp":
        this.tone({ dur: 0.05, from: 900, to: 500, gain: 0.12, type: "square" });
        this.burst({ dur: 0.05, freq: 2400, q: 1, gain: 0.1 });
        break;
      default:
        this.tone({ dur: 0.12, from: 160, to: 38, gain: 0.55, type: "sine" });
        this.burst({ dur: 0.07, freq: 2400, q: 0.6, gain: 0.35 });
        this.burst({ dur: 0.18, freq: 420, q: 0.8, gain: 0.2, type: "lowpass" });
    }
  }

  charge(level: number): void {
    if (!this.ctx) return;
    this.tone({ dur: 0.08, from: 300 + level * 900, to: 320 + level * 900, gain: 0.06, type: "sawtooth" });
  }

  explosion(big = true): void {
    this.count("explosion");
    if (!this.ctx) return;
    this.tone({ dur: 0.6, from: 80, to: 22, gain: big ? 1.0 : 0.6, type: "sine" });
    this.burst({ dur: 0.5, freq: 400, q: 0.3, gain: big ? 0.7 : 0.4, type: "lowpass" });
    this.burst({ dur: 0.25, freq: 2500, q: 0.4, gain: 0.3 });
  }

  smoke(): void {
    this.count("smoke");
    if (!this.ctx) return;
    this.burst({ dur: 1.4, freq: 1800, q: 0.3, gain: 0.18 });
  }

  emp(): void {
    this.count("emp");
    if (!this.ctx) return;
    this.tone({ dur: 0.4, from: 1400, to: 40, gain: 0.3, type: "square" });
    this.burst({ dur: 0.3, freq: 3500, q: 1.5, gain: 0.25 });
  }

  throw(): void {
    this.count("throw");
    if (!this.ctx) return;
    this.burst({ dur: 0.06, freq: 1200, q: 1.5, gain: 0.12 });
  }

  swap(): void {
    this.count("swap");
    if (!this.ctx) return;
    this.burst({ dur: 0.08, freq: 700, q: 0.8, gain: 0.14, type: "lowpass" });
    this.burst({ dur: 0.04, freq: 2200, q: 2, gain: 0.1, delay: 0.09 });
  }

  stun(): void {
    this.count("stun");
    if (!this.ctx) return;
    this.tone({ dur: 0.35, from: 60, to: 55, gain: 0.3, type: "square" });
    this.burst({ dur: 0.3, freq: 4000, q: 2, gain: 0.15 });
  }

  flagged(): void {
    this.count("flagged");
    if (!this.ctx) return;
    this.tone({ dur: 0.12, from: 880, gain: 0.12, type: "square" });
    this.tone({ dur: 0.12, from: 880, gain: 0.12, type: "square", delay: 0.18 });
  }

  mechBeam(): void {
    this.count("mechBeam");
    if (!this.ctx) return;
    this.tone({ dur: 0.3, from: 55, to: 45, gain: 0.5, type: "sawtooth" });
    this.burst({ dur: 0.25, freq: 1600, q: 0.5, gain: 0.3 });
  }

  /** A node coming off the model: rising cyan-green chord, chunk-thud underneath. */
  nodeFlip(mine: boolean): void {
    this.count("nodeFlip");
    if (!this.ctx) return;
    this.tone({ dur: 0.25, from: 110, to: 50, gain: 0.5 });
    const base = mine ? 440 : 330;
    for (const [i, m] of [1, 1.25, 1.5, 2].entries()) this.tone({ dur: 0.7, from: base * m, gain: 0.08, type: "triangle", delay: 0.05 * i });
  }

  contest(): void {
    this.count("contest");
    if (!this.ctx) return;
    this.tone({ dur: 0.1, from: 700, gain: 0.08, type: "square" });
    this.tone({ dur: 0.1, from: 700, gain: 0.08, type: "square", delay: 0.15 });
  }

  kernelPulse(): void {
    this.count("kernelPulse");
    if (!this.ctx) return;
    this.tone({ dur: 1.2, from: 42, to: 30, gain: 0.7 });
    this.burst({ dur: 0.6, freq: 260, q: 0.5, gain: 0.3, type: "lowpass" });
  }

  hurt(): void {
    this.count("hurt");
    if (!this.ctx) return;
    this.burst({ dur: 0.08, freq: 500, q: 0.6, gain: 0.25, type: "lowpass" });
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

  /**
   * Kill confirm: receipt-printer stamp — a thunk and a short cyan tick. It
   * gains layers with the shooter's mastery tier (rank 1–9: 0, 10–19: 1,
   * 20–29: 2, 30: 3) — growth you can hear, shooter-side only, zero info leak.
   */
  kill(tier = 0): void {
    this.count("kill");
    this.count("kill_t" + Math.max(0, Math.min(3, tier)));
    if (!this.ctx) return;
    this.tone({ dur: 0.16, from: 90, to: 40, gain: 0.6, type: "sine" }); // thunk
    this.burst({ dur: 0.05, freq: 800, q: 0.4, gain: 0.3, type: "lowpass" });
    this.tone({ dur: 0.09, from: 1760, gain: 0.12, type: "square", delay: 0.09 }); // tick
    this.tone({ dur: 0.12, from: 2349, gain: 0.1, type: "square", delay: 0.16 });
    if (tier >= 1) this.tone({ dur: 0.14, from: 3520, gain: 0.07, type: "square", delay: 0.24 }); // second tick, an octave up
    if (tier >= 2) for (const [i, f] of [1319, 1568, 1976].entries()) this.tone({ dur: 0.5, from: f, gain: 0.05, type: "triangle", delay: 0.28 + i * 0.04 }); // a chord under it
    if (tier >= 3) {
      this.tone({ dur: 0.7, from: 48, to: 30, gain: 0.5 }); // sub drop
      this.burst({ dur: 0.6, freq: 2200, q: 0.5, gain: 0.12, delay: 0.3 }); // reverse-sweep tail
    }
  }

  /** The receipt printing a line: a dot-matrix chatter. */
  printTick(): void {
    this.count("print");
    if (!this.ctx) return;
    for (let i = 0; i < 4; i++) this.burst({ dur: 0.02, freq: 2600 + i * 300, q: 3, gain: 0.08, delay: i * 0.03 });
  }

  /** The stamp at the bottom of the receipt, and the player's signature. */
  sign(): void {
    this.count("sign");
    if (!this.ctx) return;
    this.tone({ dur: 0.2, from: 110, to: 45, gain: 0.7 }); // stamp thunk
    this.burst({ dur: 0.08, freq: 600, q: 0.5, gain: 0.35, type: "lowpass" });
    this.tone({ dur: 0.25, from: 1760, gain: 0.08, type: "square", delay: 0.22 });
  }

  /** A Chapter rite: a slow four-note rise on a saw pad, the CRT hum swelling under it. */
  rite(chapter: number): void {
    this.count("rite");
    this.count("rite_" + chapter);
    if (!this.ctx) return;
    const base = 110 * (1 + chapter * 0.25);
    for (const [i, m] of [1, 1.5, 2, 3].entries()) this.tone({ dur: 2.4 - i * 0.3, from: base * m, gain: 0.09, type: "sawtooth", delay: i * 0.45 });
    this.tone({ dur: 3, from: 55, to: 50, gain: 0.35 });
  }

  /** DEBT CLEARED: a stamp thunk then a descending three-note sting in magenta. */
  debtCleared(): void {
    this.count("debtCleared");
    if (!this.ctx) return;
    this.tone({ dur: 0.2, from: 100, to: 40, gain: 0.7 });
    for (const [i, f] of [1568, 1319, 1047].entries()) this.tone({ dur: 0.35, from: f, gain: 0.1, type: "square", delay: 0.15 + i * 0.12 });
  }

  /** A Debt owed: the same three notes, rising — someone has your number. */
  debtOwed(): void {
    this.count("debtOwed");
    if (!this.ctx) return;
    for (const [i, f] of [1047, 1319, 1568].entries()) this.tone({ dur: 0.3, from: f, gain: 0.07, type: "square", delay: i * 0.12 });
  }

  /** The dossier flash: a data sweep as the files print across the screen. */
  dossier(): void {
    this.count("dossier");
    if (!this.ctx) return;
    this.burst({ dur: 1.1, freq: 1400, q: 1.5, gain: 0.12 });
    for (let i = 0; i < 6; i++) this.tone({ dur: 0.05, from: 2200 + i * 180, gain: 0.05, type: "square", delay: i * 0.15 });
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

  reload(phase: "start" | "end" | "seat"): void {
    this.count("reload_" + phase);
    if (!this.ctx) return;
    if (phase === "seat") {
      this.tone({ dur: 0.1, from: 150, to: 70, gain: 0.35 }); // the clunk that says "you can cancel now"
      this.burst({ dur: 0.05, freq: 1400, q: 1.2, gain: 0.2 });
    } else if (phase === "start") {
      this.burst({ dur: 0.06, freq: 1800, q: 1.5, gain: 0.12 });
      this.burst({ dur: 0.1, freq: 500, q: 0.6, gain: 0.1, type: "lowpass", pan: -0.3 });
    } else {
      this.burst({ dur: 0.05, freq: 2600, q: 2, gain: 0.16 });
      this.tone({ dur: 0.08, from: 200, to: 90, gain: 0.25 });
    }
  }
}
