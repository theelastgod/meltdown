/**
 * An empty gun does not click at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 900 the click shipped with.
 * It still falls to 500. Duration stays 0.05 and gain stays 0.08. The wave stays square.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_DRY, dryPitch, GameAudio } from "../client/audio";
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

describe("each district clicks empty at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_DRY).toBe(900);
    expect(dryPitch(undefined)).toBe(STREET_DRY);
    expect(dryPitch("lease_row")).toBe(STREET_DRY);
    expect(dryPitch("drainage_yard")).toBe(STREET_DRY);
    expect(dryPitch("deadletter_office")).toBe(STREET_DRY);
    expect(dryPitch("white_office")).toBe(STREET_DRY);
    const pitches = CITY_DISTRICTS.map((id) => dryPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(dryPitch("night_market")).toBeGreaterThan(STREET_DRY);
    expect(dryPitch("deadletter_docks")).toBeLessThan(dryPitch("relay_heights"));
  });

  it("plays that pitch, and the fall, duration, and gain stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.dryFire("lease_row");
    expect(freqs[0]).toBe(STREET_DRY);
    expect(gains[0]).toBe(0.08);
    freqs.length = 0;
    live.dryFire("night_market");
    expect(freqs[0]).toBe(dryPitch("night_market"));
    freqs.length = 0;
    live.dryFire("deadletter_docks");
    expect(freqs[0]).toBe(dryPitch("deadletter_docks"));
    freqs.length = 0;
    live.dryFire("relay_heights");
    expect(freqs[0]).toBeGreaterThan(dryPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the empty click", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function dryPitch");
    expect(audio).toContain("from: dryPitch(place)");
    expect(audio).toContain("dur: 0.05, from: dryPitch(place), to: 500, gain: 0.08, type: \"square\"");
    expect(game).toContain("this.audio.dryFire(this.world.level.name)");
  });
});
