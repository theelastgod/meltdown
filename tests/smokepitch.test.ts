/**
 * A smoke cloud does not hiss at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 1800 the cloud shipped with.
 * Duration stays 1.4, Q stays 0.3, and gain stays 0.18.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_SMOKE, smokePitch, GameAudio } from "../client/audio";
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

describe("each district hisses a smoke cloud at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_SMOKE).toBe(1800);
    expect(smokePitch(undefined)).toBe(STREET_SMOKE);
    expect(smokePitch("lease_row")).toBe(STREET_SMOKE);
    expect(smokePitch("drainage_yard")).toBe(STREET_SMOKE);
    expect(smokePitch("deadletter_office")).toBe(STREET_SMOKE);
    expect(smokePitch("white_office")).toBe(STREET_SMOKE);
    const pitches = CITY_DISTRICTS.map((id) => smokePitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(smokePitch("night_market")).toBeGreaterThan(STREET_SMOKE);
    expect(smokePitch("deadletter_docks")).toBeLessThan(smokePitch("relay_heights"));
  });

  it("plays that pitch, and the duration's Q and gain stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    qs.length = 0;
    live.smoke("lease_row");
    expect(freqs[0]).toBe(STREET_SMOKE);
    expect(qs[0]).toBe(0.3);
    expect(gains[0]).toBe(0.18);
    freqs.length = 0;
    gains.length = 0;
    qs.length = 0;
    live.smoke("night_market");
    expect(freqs[0]).toBe(smokePitch("night_market"));
    expect(qs[0]).toBe(0.3);
    expect(gains[0]).toBe(0.18);
    freqs.length = 0;
    live.smoke("deadletter_docks");
    expect(freqs[0]).toBe(smokePitch("deadletter_docks"));
    freqs.length = 0;
    live.smoke("relay_heights");
    expect(freqs[0]).toBeGreaterThan(smokePitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the cloud", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function smokePitch");
    expect(audio).toContain("dur: 1.4, freq: smokePitch(place), q: 0.3, gain: 0.18");
    expect(game).toContain("this.audio.smoke(this.world.level.name)");
  });
});
