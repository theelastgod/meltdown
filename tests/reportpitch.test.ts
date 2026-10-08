/**
 * A lease breaker does not report at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 160 the report shipped with.
 * It still lands at 38. The crack stays 2400. The body stays 420.
 * Duration stays 0.12. Gain stays 0.55. The other guns stay on their own voices.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_REPORT, reportPitch, GameAudio } from "../client/audio";
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

describe("each district opens a lease-breaker report at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_REPORT).toBe(160);
    expect(reportPitch(undefined)).toBe(STREET_REPORT);
    expect(reportPitch("lease_row")).toBe(STREET_REPORT);
    expect(reportPitch("drainage_yard")).toBe(STREET_REPORT);
    expect(reportPitch("deadletter_office")).toBe(STREET_REPORT);
    expect(reportPitch("white_office")).toBe(STREET_REPORT);
    const pitches = CITY_DISTRICTS.map((id) => reportPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(reportPitch("night_market")).toBeGreaterThan(STREET_REPORT);
    expect(reportPitch("deadletter_docks")).toBeLessThan(reportPitch("relay_heights"));
  });

  it("plays that pitch, and the landing, the crack, the body, and the gain stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.shot("lease_breaker", false, "lease_row");
    expect(freqs[0]).toBe(STREET_REPORT);
    expect(freqs[1]).toBe(2400);
    expect(freqs[2]).toBe(420);
    expect(gains[0]).toBeCloseTo(0.55);
    freqs.length = 0;
    live.shot("lease_breaker", false, "night_market");
    expect(freqs[0]).toBe(reportPitch("night_market"));
    expect(freqs[1]).toBe(2400);
    expect(freqs[2]).toBe(420);
    freqs.length = 0;
    live.shot("lease_breaker", false, "deadletter_docks");
    expect(freqs[0]).toBe(reportPitch("deadletter_docks"));
    freqs.length = 0;
    live.shot("lease_breaker", false, "relay_heights");
    expect(freqs[0]).toBeGreaterThan(reportPitch("deadletter_docks"));
    freqs.length = 0;
    gains.length = 0;
    live.shot("wasp");
    expect(freqs[0]).toBe(900);
    expect(freqs[1]).toBe(2400);
  });

  it("fails closed if the read is removed from the report", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function reportPitch");
    expect(audio).toContain("from: reportPitch(place), to: 38, gain: 0.55, type: \"sine\"");
    expect(audio).toContain("dur: 0.07, freq: 2400, q: 0.6, gain: 0.35");
    expect(audio).toContain("dur: 0.18, freq: 420, q: 0.8, gain: 0.2, type: \"lowpass\"");
    expect(game).toContain("this.audio.shot(ev.weapon, this.altFire.tick === ev.tick && this.altFire.alt, this.world.level.name)");
  });
});
