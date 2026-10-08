/**
 * A shield break does not open its drop at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 520 the hum shipped with.
 * It still falls to 90. The 3200 Hz crack, the 900 Hz band, duration 0.3, and gain 0.22 stay.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_BREAK, breakPitch, GameAudio } from "../client/audio";
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

describe("each district breaks a shield at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_BREAK).toBe(520);
    expect(breakPitch(undefined)).toBe(STREET_BREAK);
    expect(breakPitch("lease_row")).toBe(STREET_BREAK);
    expect(breakPitch("drainage_yard")).toBe(STREET_BREAK);
    expect(breakPitch("deadletter_office")).toBe(STREET_BREAK);
    expect(breakPitch("white_office")).toBe(STREET_BREAK);
    const pitches = CITY_DISTRICTS.map((id) => breakPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(breakPitch("night_market")).toBeGreaterThan(STREET_BREAK);
    expect(breakPitch("deadletter_docks")).toBeLessThan(breakPitch("relay_heights"));
  });

  it("plays that pitch, and the crack, the band, the fall, duration, and gain stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    qs.length = 0;
    gains.length = 0;
    live.shieldBreak("lease_row");
    expect(freqs[0]).toBe(3200);
    expect(freqs[1]).toBe(900);
    expect(freqs[2]).toBe(STREET_BREAK);
    expect(qs[0]).toBe(1.1);
    expect(qs[1]).toBe(0.6);
    expect(gains[0]).toBe(0.3);
    expect(gains[1]).toBe(0.18);
    expect(gains[2]).toBe(0.22);
    freqs.length = 0;
    live.shieldBreak("night_market");
    expect(freqs[2]).toBe(breakPitch("night_market"));
    expect(freqs[0]).toBe(3200);
    expect(freqs[1]).toBe(900);
    freqs.length = 0;
    live.shieldBreak("deadletter_docks");
    expect(freqs[2]).toBe(breakPitch("deadletter_docks"));
    freqs.length = 0;
    live.shieldBreak("relay_heights");
    expect(freqs[2]).toBeGreaterThan(breakPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the break", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function breakPitch");
    expect(audio).toContain("from: breakPitch(place)");
    expect(audio).toContain('dur: 0.3, from: breakPitch(place), to: 90, gain: 0.22, type: "sawtooth"');
    expect(audio).toContain('dur: 0.05, freq: 3200, q: 1.1, gain: 0.3');
    expect(audio).toContain('dur: 0.12, freq: 900, q: 0.6, gain: 0.18, type: "bandpass", delay: 0.02');
    expect(game).toContain("this.audio.shieldBreak(this.world.level.name)");
  });
});
