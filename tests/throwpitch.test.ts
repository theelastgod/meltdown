/**
 * A thrown charge does not whoosh at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 1200 the toss shipped with.
 * Duration stays 0.06, Q stays 1.5, and gain stays 0.12.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_THROW, throwPitch, GameAudio } from "../client/audio";
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

describe("each district throws at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_THROW).toBe(1200);
    expect(throwPitch(undefined)).toBe(STREET_THROW);
    expect(throwPitch("lease_row")).toBe(STREET_THROW);
    expect(throwPitch("drainage_yard")).toBe(STREET_THROW);
    expect(throwPitch("deadletter_office")).toBe(STREET_THROW);
    expect(throwPitch("white_office")).toBe(STREET_THROW);
    const pitches = CITY_DISTRICTS.map((id) => throwPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(throwPitch("night_market")).toBeGreaterThan(STREET_THROW);
    expect(throwPitch("deadletter_docks")).toBeLessThan(throwPitch("relay_heights"));
  });

  it("plays that pitch, and the duration, Q, and gain stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.throw("lease_row");
    expect(freqs[0]).toBe(STREET_THROW);
    expect(gains[0]).toBe(0.12);
    freqs.length = 0;
    live.throw("night_market");
    expect(freqs[0]).toBe(throwPitch("night_market"));
    freqs.length = 0;
    live.throw("deadletter_docks");
    expect(freqs[0]).toBe(throwPitch("deadletter_docks"));
    freqs.length = 0;
    live.throw("relay_heights");
    expect(freqs[0]).toBeGreaterThan(throwPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the toss", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function throwPitch");
    expect(audio).toContain("freq: throwPitch(place)");
    expect(audio).toContain("dur: 0.06, freq: throwPitch(place), q: 1.5, gain: 0.12");
    expect(game.match(/this\.audio\.throw\(this\.world\.level\.name\)/g)?.length).toBe(2);
  });
});
