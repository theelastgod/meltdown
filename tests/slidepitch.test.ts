/**
 * A slide does not scrape at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 500 the slide shipped with.
 * Duration stays 0.45, Q stays 0.4, and gain stays 0.2. The filter stays lowpass.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_SLIDE, slidePitch, GameAudio } from "../client/audio";
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

describe("each district scrapes a slide at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_SLIDE).toBe(500);
    expect(slidePitch(undefined)).toBe(STREET_SLIDE);
    expect(slidePitch("lease_row")).toBe(STREET_SLIDE);
    expect(slidePitch("drainage_yard")).toBe(STREET_SLIDE);
    expect(slidePitch("deadletter_office")).toBe(STREET_SLIDE);
    expect(slidePitch("white_office")).toBe(STREET_SLIDE);
    const pitches = CITY_DISTRICTS.map((id) => slidePitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(slidePitch("night_market")).toBeGreaterThan(STREET_SLIDE);
    expect(slidePitch("deadletter_docks")).toBeLessThan(slidePitch("relay_heights"));
  });

  it("plays that pitch, and the duration, Q, and gain stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    qs.length = 0;
    gains.length = 0;
    live.slide("lease_row");
    expect(freqs.at(-1)).toBe(STREET_SLIDE);
    expect(qs.at(-1)).toBe(0.4);
    expect(gains.at(-1)).toBe(0.2);
    freqs.length = 0;
    live.slide("night_market");
    expect(freqs.at(-1)).toBe(slidePitch("night_market"));
    freqs.length = 0;
    live.slide("deadletter_docks");
    expect(freqs.at(-1)).toBe(slidePitch("deadletter_docks"));
    freqs.length = 0;
    live.slide("relay_heights");
    expect(freqs.at(-1)).toBeGreaterThan(slidePitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the slide", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function slidePitch");
    expect(audio).toContain("freq: slidePitch(place)");
    expect(audio).toContain("dur: 0.45, freq: slidePitch(place), q: 0.4, gain: 0.2, type: \"lowpass\"");
    expect(game).toContain("this.audio.slide(this.world.level.name)");
  });
});
