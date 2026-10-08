/**
 * A contested node does not beep at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 700 the double beep shipped with.
 * Both notes stay that pitch. Duration stays 0.1. Gain stays 0.08. The gap stays 0.15.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_CONTEST, contestPitch, GameAudio } from "../client/audio";
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

describe("each district beeps a contested node at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_CONTEST).toBe(700);
    expect(contestPitch(undefined)).toBe(STREET_CONTEST);
    expect(contestPitch("lease_row")).toBe(STREET_CONTEST);
    expect(contestPitch("drainage_yard")).toBe(STREET_CONTEST);
    expect(contestPitch("deadletter_office")).toBe(STREET_CONTEST);
    expect(contestPitch("white_office")).toBe(STREET_CONTEST);
    const pitches = CITY_DISTRICTS.map((id) => contestPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(contestPitch("night_market")).toBeGreaterThan(STREET_CONTEST);
    expect(contestPitch("deadletter_docks")).toBeLessThan(contestPitch("relay_heights"));
  });

  it("plays that pitch twice, and the gain stays put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.contest("lease_row");
    expect(freqs[0]).toBe(STREET_CONTEST);
    expect(freqs[1]).toBe(STREET_CONTEST);
    expect(gains[0]).toBeCloseTo(0.08);
    expect(gains[1]).toBeCloseTo(0.08);
    freqs.length = 0;
    gains.length = 0;
    live.contest("night_market");
    expect(freqs[0]).toBe(contestPitch("night_market"));
    expect(freqs[1]).toBe(contestPitch("night_market"));
    expect(gains[0]).toBeCloseTo(0.08);
    freqs.length = 0;
    live.contest("deadletter_docks");
    expect(freqs[0]).toBe(contestPitch("deadletter_docks"));
    freqs.length = 0;
    live.contest("relay_heights");
    expect(freqs[0]).toBeGreaterThan(contestPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the beep", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function contestPitch");
    expect(audio).toContain("from: contestPitch(place), gain: 0.08, type: \"square\"");
    expect(audio).toContain("from: contestPitch(place), gain: 0.08, type: \"square\", delay: 0.15");
    expect(game).toContain("this.audio.contest(this.world.level.name)");
  });
});
