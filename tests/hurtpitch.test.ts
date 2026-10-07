/**
 * A hit does not thud at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 500 the hurt shipped with.
 * Duration stays 0.08, Q stays 0.6, and gain stays 0.25. The filter stays lowpass.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_HURT, hurtPitch, GameAudio } from "../client/audio";
import { CITY_DISTRICTS } from "../shared/net/city";

const freqs: number[] = [];
const qs: number[] = [];
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

beforeEach(() => { freqs.length = 0; qs.length = 0; gains.length = 0; stubWebAudio(); });
afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window; });

describe("each district thuds a hit at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_HURT).toBe(500);
    expect(hurtPitch(undefined)).toBe(STREET_HURT);
    expect(hurtPitch("lease_row")).toBe(STREET_HURT);
    expect(hurtPitch("drainage_yard")).toBe(STREET_HURT);
    expect(hurtPitch("deadletter_office")).toBe(STREET_HURT);
    expect(hurtPitch("white_office")).toBe(STREET_HURT);
    const pitches = CITY_DISTRICTS.map((id) => hurtPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(hurtPitch("night_market")).toBeGreaterThan(STREET_HURT);
    expect(hurtPitch("deadletter_docks")).toBeLessThan(hurtPitch("relay_heights"));
  });

  it("plays that pitch, and the duration, Q, and gain stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    qs.length = 0;
    gains.length = 0;
    live.hurt("lease_row");
    expect(freqs.at(-1)).toBe(STREET_HURT);
    expect(qs.at(-1)).toBe(0.6);
    expect(gains.at(-1)).toBe(0.25);
    freqs.length = 0;
    live.hurt("night_market");
    expect(freqs.at(-1)).toBe(hurtPitch("night_market"));
    freqs.length = 0;
    live.hurt("deadletter_docks");
    expect(freqs.at(-1)).toBe(hurtPitch("deadletter_docks"));
    freqs.length = 0;
    live.hurt("relay_heights");
    expect(freqs.at(-1)).toBeGreaterThan(hurtPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the hurt", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function hurtPitch");
    expect(audio).toContain("freq: hurtPitch(place)");
    expect(audio).toContain("dur: 0.08, freq: hurtPitch(place), q: 0.6, gain: 0.25, type: \"lowpass\"");
    expect(game).toContain("this.audio.hurt(this.world.level.name)");
  });
});
