/**
 * A weapon swap does not click at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 700 the first click shipped with.
 * Duration stays 0.08, Q stays 0.8, and gain stays 0.14. The second click stays 2200.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_SWAP, swapPitch, GameAudio } from "../client/audio";
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

describe("each district swaps at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_SWAP).toBe(700);
    expect(swapPitch(undefined)).toBe(STREET_SWAP);
    expect(swapPitch("lease_row")).toBe(STREET_SWAP);
    expect(swapPitch("drainage_yard")).toBe(STREET_SWAP);
    expect(swapPitch("deadletter_office")).toBe(STREET_SWAP);
    expect(swapPitch("white_office")).toBe(STREET_SWAP);
    const pitches = CITY_DISTRICTS.map((id) => swapPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(swapPitch("night_market")).toBeGreaterThan(STREET_SWAP);
    expect(swapPitch("deadletter_docks")).toBeLessThan(swapPitch("relay_heights"));
  });

  it("plays that pitch, and the duration, Q, gain, and second click stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.swap("lease_row");
    expect(freqs[0]).toBe(STREET_SWAP);
    expect(gains[0]).toBe(0.14);
    expect(freqs[1]).toBe(2200);
    freqs.length = 0;
    live.swap("night_market");
    expect(freqs[0]).toBe(swapPitch("night_market"));
    freqs.length = 0;
    live.swap("deadletter_docks");
    expect(freqs[0]).toBe(swapPitch("deadletter_docks"));
    freqs.length = 0;
    live.swap("relay_heights");
    expect(freqs[0]).toBeGreaterThan(swapPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the swap", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function swapPitch");
    expect(audio).toContain("freq: swapPitch(place)");
    expect(audio).toContain("dur: 0.08, freq: swapPitch(place), q: 0.8, gain: 0.14, type: \"lowpass\"");
    expect(audio).toContain("dur: 0.04, freq: 2200, q: 2, gain: 0.1, delay: 0.09");
    expect(game.match(/this\.audio\.swap\(this\.world\.level\.name\)/g)?.length).toBe(2);
  });
});
