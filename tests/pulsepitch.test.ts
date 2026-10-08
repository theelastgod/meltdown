/**
 * A low-health pulse does not open at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 55 the pulse shipped with.
 * It still lands at 40. The second beat stays 50 falling to 38. The 620 ms gate stays.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_PULSE, pulsePitch, GameAudio } from "../client/audio";
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

describe("each district opens a low-health pulse at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_PULSE).toBe(55);
    expect(pulsePitch(undefined)).toBe(STREET_PULSE);
    expect(pulsePitch("lease_row")).toBe(STREET_PULSE);
    expect(pulsePitch("drainage_yard")).toBe(STREET_PULSE);
    expect(pulsePitch("deadletter_office")).toBe(STREET_PULSE);
    expect(pulsePitch("white_office")).toBe(STREET_PULSE);
    const pitches = CITY_DISTRICTS.map((id) => pulsePitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(pulsePitch("night_market")).toBeGreaterThan(STREET_PULSE);
    expect(pulsePitch("deadletter_docks")).toBeLessThan(pulsePitch("relay_heights"));
  });

  it("plays that pitch, and the second beat stays put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.lowHealth(true, 1000, "lease_row");
    expect(freqs[0]).toBe(STREET_PULSE);
    expect(freqs[1]).toBe(50);
    expect(gains[0]).toBe(0.35);
    expect(gains[1]).toBe(0.25);
    freqs.length = 0;
    live.lowHealth(true, 2000, "night_market");
    expect(freqs[0]).toBe(pulsePitch("night_market"));
    expect(freqs[1]).toBe(50);
    freqs.length = 0;
    live.lowHealth(true, 3000, "deadletter_docks");
    expect(freqs[0]).toBe(pulsePitch("deadletter_docks"));
    freqs.length = 0;
    live.lowHealth(true, 4000, "relay_heights");
    expect(freqs[0]).toBeGreaterThan(pulsePitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the pulse", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function pulsePitch");
    expect(audio).toContain("dur: 0.12, from: pulsePitch(place), to: 40, gain: 0.35");
    expect(audio).toContain("dur: 0.1, from: 50, to: 38, gain: 0.25, delay: 0.16");
    expect(audio).toContain("if (now - this.pulseAt < 620) return");
    expect(game).toContain("this.audio.lowHealth(low, performance.now(), this.world.level.name)");
  });
});
