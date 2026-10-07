/**
 * A mantle does not scrape at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 700 the scrape shipped with.
 * Duration stays 0.2, Q stays 0.5, and gain stays 0.14. The drop stays 80 to 55.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_MANTLE, mantlePitch, GameAudio } from "../client/audio";
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

describe("each district scrapes a mantle at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_MANTLE).toBe(700);
    expect(mantlePitch(undefined)).toBe(STREET_MANTLE);
    expect(mantlePitch("lease_row")).toBe(STREET_MANTLE);
    expect(mantlePitch("drainage_yard")).toBe(STREET_MANTLE);
    expect(mantlePitch("deadletter_office")).toBe(STREET_MANTLE);
    expect(mantlePitch("white_office")).toBe(STREET_MANTLE);
    const pitches = CITY_DISTRICTS.map((id) => mantlePitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(mantlePitch("night_market")).toBeGreaterThan(STREET_MANTLE);
    expect(mantlePitch("deadletter_docks")).toBeLessThan(mantlePitch("relay_heights"));
  });

  it("plays that pitch, and the duration, Q, gain, and drop stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    qs.length = 0;
    gains.length = 0;
    live.mantle("lease_row");
    expect(freqs[0]).toBe(STREET_MANTLE);
    expect(qs[0]).toBe(0.5);
    expect(gains[0]).toBe(0.14);
    expect(freqs).toContain(80);
    freqs.length = 0;
    live.mantle("night_market");
    expect(freqs[0]).toBe(mantlePitch("night_market"));
    freqs.length = 0;
    live.mantle("deadletter_docks");
    expect(freqs[0]).toBe(mantlePitch("deadletter_docks"));
    freqs.length = 0;
    live.mantle("relay_heights");
    expect(freqs[0]).toBeGreaterThan(mantlePitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the mantle", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function mantlePitch");
    expect(audio).toContain("freq: mantlePitch(place)");
    expect(audio).toContain("dur: 0.2, freq: mantlePitch(place), q: 0.5, gain: 0.14, type: \"lowpass\"");
    expect(audio).toContain("from: 80, to: 55, gain: 0.2, delay: 0.25");
    expect(game).toContain("this.audio.mantle(this.world.level.name)");
  });
});
