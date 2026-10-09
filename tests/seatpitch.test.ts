/**
 * A magazine seat does not clunk at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 150 the clunk shipped with.
 * It still lands at 70. Duration stays 0.1. Gain stays 0.35. The crack stays 1400.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_SEAT, seatPitch, GameAudio } from "../client/audio";
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

describe("each district seats a magazine at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_SEAT).toBe(150);
    expect(seatPitch(undefined)).toBe(STREET_SEAT);
    expect(seatPitch("lease_row")).toBe(STREET_SEAT);
    expect(seatPitch("drainage_yard")).toBe(STREET_SEAT);
    expect(seatPitch("deadletter_office")).toBe(STREET_SEAT);
    expect(seatPitch("white_office")).toBe(STREET_SEAT);
    const pitches = CITY_DISTRICTS.map((id) => seatPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(seatPitch("night_market")).toBeGreaterThan(STREET_SEAT);
    expect(seatPitch("deadletter_docks")).toBeLessThan(seatPitch("relay_heights"));
    for (const id of CITY_DISTRICTS) expect(seatPitch(id)).toBeGreaterThan(70);
  });

  it("opens on that pitch and keeps the landing and the crack", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.reload("seat", "lease_row");
    expect(freqs[0]).toBe(STREET_SEAT);
    expect(freqs[1]).toBe(1400);
    expect(gains[0]).toBeCloseTo(0.35);
    expect(gains[1]).toBeCloseTo(0.2);
    freqs.length = 0;
    gains.length = 0;
    live.reload("seat", "night_market");
    expect(freqs[0]).toBe(seatPitch("night_market"));
    expect(freqs[1]).toBe(1400);
    expect(gains[0]).toBeCloseTo(0.35);
    freqs.length = 0;
    live.reload("seat", "deadletter_docks");
    expect(freqs[0]).toBe(seatPitch("deadletter_docks"));
    expect(freqs[1]).toBe(1400);
    freqs.length = 0;
    live.reload("seat", "relay_heights");
    expect(freqs[0]).toBeGreaterThan(seatPitch("deadletter_docks"));
    expect(freqs[1]).toBe(1400);
  });

  it("fails closed if the read is removed from the seat", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function seatPitch");
    expect(audio).toContain("dur: 0.1, from: seatPitch(place), to: 70, gain: 0.35");
    expect(audio).toContain("dur: 0.05, freq: 1400, q: 1.2, gain: 0.2");
    expect(game).toContain('this.audio.reload("seat", this.world.level.name)');
  });
});
