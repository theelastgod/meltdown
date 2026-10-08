/**
 * A stun does not open at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 60 the square shipped with.
 * It still lands at 55. The crack stays 4000.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_STUN, stunPitch, GameAudio } from "../client/audio";
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

describe("each district opens a stun at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_STUN).toBe(60);
    expect(stunPitch(undefined)).toBe(STREET_STUN);
    expect(stunPitch("lease_row")).toBe(STREET_STUN);
    expect(stunPitch("drainage_yard")).toBe(STREET_STUN);
    expect(stunPitch("deadletter_office")).toBe(STREET_STUN);
    expect(stunPitch("white_office")).toBe(STREET_STUN);
    const pitches = CITY_DISTRICTS.map((id) => stunPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(stunPitch("night_market")).toBeGreaterThan(STREET_STUN);
    expect(stunPitch("deadletter_docks")).toBeLessThan(stunPitch("relay_heights"));
  });

  it("plays that pitch, and the landing and the crack stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    qs.length = 0;
    live.stun("lease_row");
    expect(freqs[0]).toBe(STREET_STUN);
    expect(freqs[1]).toBe(4000);
    expect(gains[0]).toBeCloseTo(0.3);
    expect(gains[1]).toBeCloseTo(0.15);
    expect(qs[0]).toBe(2);
    freqs.length = 0;
    live.stun("night_market");
    expect(freqs[0]).toBe(stunPitch("night_market"));
    expect(freqs[1]).toBe(4000);
    freqs.length = 0;
    live.stun("deadletter_docks");
    expect(freqs[0]).toBe(stunPitch("deadletter_docks"));
    freqs.length = 0;
    live.stun("relay_heights");
    expect(freqs[0]).toBeGreaterThan(stunPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the square", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function stunPitch");
    expect(audio).toContain('dur: 0.35, from: stunPitch(place), to: 55, gain: 0.3, type: "square"');
    expect(audio).toContain("dur: 0.3, freq: 4000, q: 2, gain: 0.15");
    expect(game).toContain("this.audio.stun(this.world.level.name)");
  });
});
