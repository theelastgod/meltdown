/**
 * A blast does not open at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 80 the boom shipped with.
 * It still lands at 22. The 400 Hz body and the 2500 Hz crack stay.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_BLAST, blastPitch, GameAudio } from "../client/audio";
import { CITY_DISTRICTS } from "../shared/net/city";

const freqs: number[] = [];
const gains: number[] = [];

function stubWebAudio(): void {
  const param = (bucket?: number[]) => {
    let v = 0;
    return {
      get value() { return v; },
      set value(n: number) { v = n; bucket?.push(n); },
      setValueAtTime(n: number) { v = n; bucket?.push(n); },
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {},
      cancelScheduledValues() {},
    };
  };
  const node = () => ({ connect(n: unknown) { return n; }, disconnect() {}, start() {}, stop() {}, frequency: param(freqs), gain: param(gains), Q: param(), detune: param(), type: "", buffer: null, loop: false, playbackRate: param(), threshold: param(), ratio: param(), attack: param(), release: param(), knee: param(), pan: param(), delayTime: param() });
  class FakeContext {
    state = "running";
    currentTime = 0;
    sampleRate = 48000;
    destination = node();
    createGain() { return node(); }
    createOscillator() { return node(); }
    createBiquadFilter() { return node(); }
    createDynamicsCompressor() { return node(); }
    createBufferSource() { return node(); }
    createStereoPanner() { return node(); }
    createBuffer() { return { getChannelData: () => new Float32Array(16) }; }
    resume() { return Promise.resolve(); }
  }
  (globalThis as unknown as { window: unknown }).window = { AudioContext: FakeContext };
}

beforeEach(() => { freqs.length = 0; gains.length = 0; stubWebAudio(); });
afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window; });

describe("each district opens a blast at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_BLAST).toBe(80);
    expect(blastPitch(undefined)).toBe(STREET_BLAST);
    expect(blastPitch("lease_row")).toBe(STREET_BLAST);
    expect(blastPitch("drainage_yard")).toBe(STREET_BLAST);
    expect(blastPitch("deadletter_office")).toBe(STREET_BLAST);
    expect(blastPitch("white_office")).toBe(STREET_BLAST);
    const pitches = CITY_DISTRICTS.map((id) => blastPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(blastPitch("night_market")).toBeGreaterThan(STREET_BLAST);
    expect(blastPitch("deadletter_docks")).toBeLessThan(blastPitch("relay_heights"));
  });

  it("plays that pitch, and the body and the crack stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.explosion(true, "lease_row");
    expect(freqs[0]).toBe(STREET_BLAST);
    expect(freqs[1]).toBe(400);
    expect(freqs[2]).toBe(2500);
    expect(gains[0]).toBe(1);
    expect(gains[1]).toBe(0.7);
    expect(gains[2]).toBe(0.3);
    freqs.length = 0;
    gains.length = 0;
    live.explosion(false, "night_market");
    expect(freqs[0]).toBe(blastPitch("night_market"));
    expect(freqs[1]).toBe(400);
    expect(freqs[2]).toBe(2500);
    expect(gains[0]).toBe(0.6);
    freqs.length = 0;
    live.explosion(true, "deadletter_docks");
    expect(freqs[0]).toBe(blastPitch("deadletter_docks"));
    freqs.length = 0;
    live.explosion(true, "relay_heights");
    expect(freqs[0]).toBeGreaterThan(blastPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the blast", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function blastPitch");
    expect(audio).toContain("dur: 0.6, from: blastPitch(place), to: 22, gain: big ? 1.0 : 0.6, type: \"sine\"");
    expect(audio).toContain("dur: 0.5, freq: 400, q: 0.3, gain: big ? 0.7 : 0.4, type: \"lowpass\"");
    expect(audio).toContain("dur: 0.25, freq: 2500, q: 0.4, gain: 0.3");
    expect(game).toContain("this.audio.explosion(ev.b === 3, this.world.level.name)");
    expect(game).toContain("this.audio.explosion(ev.projKind === \"frag\", this.world.level.name)");
    expect(game).toContain("this.audio.explosion(false, this.world.level.name)");
    expect(game).toContain("this.audio.explosion(true, this.world.level.name)");
  });
});
