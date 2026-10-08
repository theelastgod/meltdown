/**
 * A ledger stamp does not open at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 110 the stamp shipped with.
 * It still lands at 45. The body stays 600. The tick stays 1760.
 * Duration stays 0.2. Gain stays 0.7.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_SIGN, signPitch, GameAudio } from "../client/audio";
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

describe("each district opens a ledger stamp at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_SIGN).toBe(110);
    expect(signPitch(undefined)).toBe(STREET_SIGN);
    expect(signPitch("lease_row")).toBe(STREET_SIGN);
    expect(signPitch("drainage_yard")).toBe(STREET_SIGN);
    expect(signPitch("deadletter_office")).toBe(STREET_SIGN);
    expect(signPitch("white_office")).toBe(STREET_SIGN);
    const pitches = CITY_DISTRICTS.map((id) => signPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(signPitch("night_market")).toBeGreaterThan(STREET_SIGN);
    expect(signPitch("deadletter_docks")).toBeLessThan(signPitch("relay_heights"));
  });

  it("plays that pitch, and the landing, the body, the tick, and the gain stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.sign("lease_row");
    expect(freqs[0]).toBe(STREET_SIGN);
    expect(freqs[1]).toBe(600);
    expect(freqs[2]).toBe(1760);
    expect(gains[0]).toBeCloseTo(0.7);
    freqs.length = 0;
    live.sign("night_market");
    expect(freqs[0]).toBe(signPitch("night_market"));
    expect(freqs[1]).toBe(600);
    expect(freqs[2]).toBe(1760);
    freqs.length = 0;
    live.sign("deadletter_docks");
    expect(freqs[0]).toBe(signPitch("deadletter_docks"));
    freqs.length = 0;
    live.sign("relay_heights");
    expect(freqs[0]).toBeGreaterThan(signPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the stamp", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    const campaign = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(audio).toContain("function signPitch");
    expect(audio).toContain("from: signPitch(place), to: 45, gain: 0.7");
    expect(audio).toContain('dur: 0.08, freq: 600, q: 0.5, gain: 0.35, type: "lowpass"');
    expect(audio).toContain('dur: 0.25, from: 1760, gain: 0.08, type: "square", delay: 0.22');
    expect(game).toContain("this.audio.sign(this.world.level.name)");
    expect(campaign).toContain("this.game.audio.sign(this.game.world.level.name)");
  });
});
