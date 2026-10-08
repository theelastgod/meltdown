/**
 * The kernel pulse does not open at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 42 the drop shipped with.
 * It still lands at 30. Duration stays 1.2. Gain stays 0.7. The body stays 260.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_KERNEL, kernelPitch, GameAudio } from "../client/audio";
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

describe("each district opens the kernel pulse at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_KERNEL).toBe(42);
    expect(kernelPitch(undefined)).toBe(STREET_KERNEL);
    expect(kernelPitch("lease_row")).toBe(STREET_KERNEL);
    expect(kernelPitch("drainage_yard")).toBe(STREET_KERNEL);
    expect(kernelPitch("deadletter_office")).toBe(STREET_KERNEL);
    expect(kernelPitch("white_office")).toBe(STREET_KERNEL);
    const pitches = CITY_DISTRICTS.map((id) => kernelPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(kernelPitch("night_market")).toBeGreaterThan(STREET_KERNEL);
    expect(kernelPitch("deadletter_docks")).toBeLessThan(kernelPitch("relay_heights"));
    for (const id of CITY_DISTRICTS) expect(kernelPitch(id)).toBeGreaterThan(30);
  });

  it("opens on that pitch, lands the gain, and keeps the body", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.kernelPulse("lease_row");
    expect(freqs[0]).toBe(STREET_KERNEL);
    expect(freqs).toContain(260);
    expect(gains[0]).toBeCloseTo(0.7);
    expect(gains).toContain(0.3);
    freqs.length = 0;
    gains.length = 0;
    live.kernelPulse("night_market");
    expect(freqs[0]).toBe(kernelPitch("night_market"));
    expect(gains[0]).toBeCloseTo(0.7);
    freqs.length = 0;
    live.kernelPulse("deadletter_docks");
    expect(freqs[0]).toBe(kernelPitch("deadletter_docks"));
    freqs.length = 0;
    live.kernelPulse("relay_heights");
    expect(freqs[0]).toBeGreaterThan(kernelPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the pulse", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function kernelPitch");
    expect(audio).toContain("from: kernelPitch(place), to: 30, gain: 0.7");
    expect(audio).toContain("freq: 260, q: 0.5, gain: 0.3, type: \"lowpass\"");
    expect(game.split("this.audio.kernelPulse(this.world.level.name)").length - 1).toBe(4);
    expect(game).not.toContain("this.audio.kernelPulse()");
  });
});
