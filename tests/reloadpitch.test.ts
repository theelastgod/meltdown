/**
 * A reload does not click at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 1800 the first click shipped with.
 * Duration stays 0.06, Q stays 1.5, and gain stays 0.12. The seat and the end stay put.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_RELOAD, reloadPitch, GameAudio } from "../client/audio";
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

describe("each district clicks a reload at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_RELOAD).toBe(1800);
    expect(reloadPitch(undefined)).toBe(STREET_RELOAD);
    expect(reloadPitch("lease_row")).toBe(STREET_RELOAD);
    expect(reloadPitch("drainage_yard")).toBe(STREET_RELOAD);
    expect(reloadPitch("deadletter_office")).toBe(STREET_RELOAD);
    expect(reloadPitch("white_office")).toBe(STREET_RELOAD);
    const pitches = CITY_DISTRICTS.map((id) => reloadPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(reloadPitch("night_market")).toBeGreaterThan(STREET_RELOAD);
    expect(reloadPitch("deadletter_docks")).toBeLessThan(reloadPitch("relay_heights"));
  });

  it("plays that pitch, and the duration, Q, and gain stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    qs.length = 0;
    gains.length = 0;
    live.reload("start", "lease_row");
    expect(freqs[0]).toBe(STREET_RELOAD);
    expect(qs[0]).toBe(1.5);
    expect(gains[0]).toBe(0.12);
    freqs.length = 0;
    live.reload("start", "night_market");
    expect(freqs[0]).toBe(reloadPitch("night_market"));
    freqs.length = 0;
    live.reload("start", "deadletter_docks");
    expect(freqs[0]).toBe(reloadPitch("deadletter_docks"));
    freqs.length = 0;
    live.reload("start", "relay_heights");
    expect(freqs[0]).toBeGreaterThan(reloadPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the reload", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function reloadPitch");
    expect(audio).toContain("freq: reloadPitch(place)");
    expect(audio).toContain("dur: 0.06, freq: reloadPitch(place), q: 1.5, gain: 0.12");
    expect(game).toContain("this.audio.reload(\"start\", this.world.level.name)");
  });
});
