/**
 * A finished reload does not lock the bolt at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 2600 the end click shipped with.
 * The follow tone stays 200 falling to 90. Duration stays 0.05, Q stays 2, and gain stays 0.16.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_BOLT, boltPitch, GameAudio } from "../client/audio";
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

describe("each district locks a reload at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_BOLT).toBe(2600);
    expect(boltPitch(undefined)).toBe(STREET_BOLT);
    expect(boltPitch("lease_row")).toBe(STREET_BOLT);
    expect(boltPitch("drainage_yard")).toBe(STREET_BOLT);
    expect(boltPitch("deadletter_office")).toBe(STREET_BOLT);
    expect(boltPitch("white_office")).toBe(STREET_BOLT);
    const pitches = CITY_DISTRICTS.map((id) => boltPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(boltPitch("night_market")).toBeGreaterThan(STREET_BOLT);
    expect(boltPitch("deadletter_docks")).toBeLessThan(boltPitch("relay_heights"));
  });

  it("plays that pitch, and the follow tone, duration, Q, and gain stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    qs.length = 0;
    gains.length = 0;
    live.reload("end", "lease_row");
    expect(freqs[0]).toBe(STREET_BOLT);
    expect(freqs[1]).toBe(200);
    expect(qs[0]).toBe(2);
    expect(gains[0]).toBe(0.16);
    freqs.length = 0;
    live.reload("end", "night_market");
    expect(freqs[0]).toBe(boltPitch("night_market"));
    expect(freqs[1]).toBe(200);
    freqs.length = 0;
    live.reload("end", "deadletter_docks");
    expect(freqs[0]).toBe(boltPitch("deadletter_docks"));
    freqs.length = 0;
    live.reload("end", "relay_heights");
    expect(freqs[0]).toBeGreaterThan(boltPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the lock", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function boltPitch");
    expect(audio).toContain("freq: boltPitch(place)");
    expect(audio).toContain("dur: 0.05, freq: boltPitch(place), q: 2, gain: 0.16");
    expect(audio).toContain("dur: 0.08, from: 200, to: 90, gain: 0.25");
    expect(game.match(/this\.audio\.reload\("end", this\.world\.level\.name\)/g)?.length).toBe(1);
  });
});
