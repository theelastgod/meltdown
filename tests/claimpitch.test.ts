/**
 * A taken claim does not open on the same note on every street.
 * Lease Row, the yard, and the indoor rooms keep the 1320 the tick shipped with.
 * The second note stays 1980. Duration and gain stay.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_CLAIM, claimPitch, GameAudio } from "../client/audio";
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

describe("each district takes a claim at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_CLAIM).toBe(1320);
    expect(claimPitch(undefined)).toBe(STREET_CLAIM);
    expect(claimPitch("lease_row")).toBe(STREET_CLAIM);
    expect(claimPitch("drainage_yard")).toBe(STREET_CLAIM);
    expect(claimPitch("deadletter_office")).toBe(STREET_CLAIM);
    expect(claimPitch("white_office")).toBe(STREET_CLAIM);
    const pitches = CITY_DISTRICTS.map((id) => claimPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(claimPitch("night_market")).toBeGreaterThan(STREET_CLAIM);
    expect(claimPitch("deadletter_docks")).toBeLessThan(claimPitch("relay_heights"));
  });

  it("plays that pitch, and the second note, the durations, and the gains stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.claim("lease_row");
    expect(freqs[0]).toBe(STREET_CLAIM);
    expect(freqs[1]).toBe(1980);
    expect(gains[0]).toBe(0.12);
    expect(gains[1]).toBe(0.1);
    freqs.length = 0;
    live.claim("night_market");
    expect(freqs[0]).toBe(claimPitch("night_market"));
    expect(freqs[1]).toBe(1980);
    freqs.length = 0;
    live.claim("deadletter_docks");
    expect(freqs[0]).toBe(claimPitch("deadletter_docks"));
    freqs.length = 0;
    live.claim("relay_heights");
    expect(freqs[0]).toBeGreaterThan(claimPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the claim", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function claimPitch");
    expect(audio).toContain('dur: 0.07, from: claimPitch(place), gain: 0.12, type: "triangle"');
    expect(audio).toContain('dur: 0.12, from: 1980, gain: 0.1, type: "triangle", delay: 0.07');
    expect(game).toContain("this.audio.claim(this.world.level.name)");
  });
});
