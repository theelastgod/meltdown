/**
 * An EMP does not open at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 1400 the burst shipped with.
 * It still lands at 40. The crack stays 3500.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_EMP, empPitch, GameAudio } from "../client/audio";
import { CITY_DISTRICTS } from "../shared/net/city";

const freqs: number[] = [];
const gains: number[] = [];
const qs: number[] = [];

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
  const node = () => ({ connect(n: unknown) { return n; }, disconnect() {}, start() {}, stop() {}, frequency: param(freqs), gain: param(gains), Q: param(qs), detune: param(), type: "", buffer: null, loop: false, playbackRate: param(), threshold: param(), ratio: param(), attack: param(), release: param(), knee: param(), pan: param(), delayTime: param() });
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

beforeEach(() => { freqs.length = 0; gains.length = 0; qs.length = 0; stubWebAudio(); });
afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window; });

describe("each district opens an EMP at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_EMP).toBe(1400);
    expect(empPitch(undefined)).toBe(STREET_EMP);
    expect(empPitch("lease_row")).toBe(STREET_EMP);
    expect(empPitch("drainage_yard")).toBe(STREET_EMP);
    expect(empPitch("deadletter_office")).toBe(STREET_EMP);
    expect(empPitch("white_office")).toBe(STREET_EMP);
    const pitches = CITY_DISTRICTS.map((id) => empPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(empPitch("night_market")).toBeGreaterThan(STREET_EMP);
    expect(empPitch("deadletter_docks")).toBeLessThan(empPitch("relay_heights"));
  });

  it("plays that pitch, and the landing and the crack stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    qs.length = 0;
    live.emp("lease_row");
    expect(freqs[0]).toBe(STREET_EMP);
    expect(freqs[1]).toBe(3500);
    expect(gains[0]).toBeCloseTo(0.3);
    expect(gains[1]).toBeCloseTo(0.25);
    expect(qs[0]).toBe(1.5);
    freqs.length = 0;
    live.emp("night_market");
    expect(freqs[0]).toBe(empPitch("night_market"));
    expect(freqs[1]).toBe(3500);
    freqs.length = 0;
    live.emp("deadletter_docks");
    expect(freqs[0]).toBe(empPitch("deadletter_docks"));
    freqs.length = 0;
    live.emp("relay_heights");
    expect(freqs[0]).toBeGreaterThan(empPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the burst", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function empPitch");
    expect(audio).toContain('dur: 0.4, from: empPitch(place), to: 40, gain: 0.3, type: "square"');
    expect(audio).toContain("dur: 0.3, freq: 3500, q: 1.5, gain: 0.25");
    expect(game).toContain("this.audio.emp(this.world.level.name)");
  });
});
