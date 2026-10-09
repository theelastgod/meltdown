/**
 * A reload's off-hand body does not sit at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 500 the body shipped with.
 * Duration stays 0.1. Q stays 0.6. Gain stays 0.1. The first click stays reloadPitch.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_WELL, wellPitch, reloadPitch, GameAudio } from "../client/audio";
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

describe("each district seats a reload body at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_WELL).toBe(500);
    expect(wellPitch(undefined)).toBe(STREET_WELL);
    expect(wellPitch("lease_row")).toBe(STREET_WELL);
    expect(wellPitch("drainage_yard")).toBe(STREET_WELL);
    expect(wellPitch("deadletter_office")).toBe(STREET_WELL);
    expect(wellPitch("white_office")).toBe(STREET_WELL);
    const pitches = CITY_DISTRICTS.map((id) => wellPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(wellPitch("night_market")).toBeGreaterThan(STREET_WELL);
    expect(wellPitch("deadletter_docks")).toBeLessThan(wellPitch("relay_heights"));
  });

  it("plays that pitch under the first click, and the body stays put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    qs.length = 0;
    live.reload("start", "lease_row");
    expect(freqs[0]).toBe(reloadPitch("lease_row"));
    expect(freqs[1]).toBe(STREET_WELL);
    expect(qs[1]).toBe(0.6);
    expect(gains[1]).toBeCloseTo(0.1);
    freqs.length = 0;
    gains.length = 0;
    live.reload("start", "night_market");
    expect(freqs[0]).toBe(reloadPitch("night_market"));
    expect(freqs[1]).toBe(wellPitch("night_market"));
    expect(gains[1]).toBeCloseTo(0.1);
    freqs.length = 0;
    live.reload("start", "deadletter_docks");
    expect(freqs[1]).toBe(wellPitch("deadletter_docks"));
    freqs.length = 0;
    live.reload("start", "relay_heights");
    expect(freqs[1]).toBeGreaterThan(wellPitch("deadletter_docks"));
    expect(freqs[1]).toBe(wellPitch("relay_heights"));
  });

  it("fails closed if the read is removed from the reload body", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function wellPitch");
    expect(audio).toContain("dur: 0.1, freq: wellPitch(place), q: 0.6, gain: 0.1, type: \"lowpass\", pan: -0.3");
    expect(audio).toContain("dur: 0.06, freq: reloadPitch(place), q: 1.5, gain: 0.12");
    expect(game).toContain("this.audio.reload(\"start\", this.world.level.name)");
  });
});
