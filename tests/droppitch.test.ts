/**
 * A dropped claim does not start its fall at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 660 the drop shipped with.
 * It still lands at 110. The four scatter ticks stay at 1800, 1550, 1300, and 1050.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_DROP, dropPitch, GameAudio } from "../client/audio";
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

describe("each district drops a claim at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_DROP).toBe(660);
    expect(dropPitch(undefined)).toBe(STREET_DROP);
    expect(dropPitch("lease_row")).toBe(STREET_DROP);
    expect(dropPitch("drainage_yard")).toBe(STREET_DROP);
    expect(dropPitch("deadletter_office")).toBe(STREET_DROP);
    expect(dropPitch("white_office")).toBe(STREET_DROP);
    const pitches = CITY_DISTRICTS.map((id) => dropPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(dropPitch("night_market")).toBeGreaterThan(STREET_DROP);
    expect(dropPitch("deadletter_docks")).toBeLessThan(dropPitch("relay_heights"));
  });

  it("plays that pitch, and the landing and the scatter ticks stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.dropClaims("lease_row");
    expect(freqs[0]).toBe(STREET_DROP);
    expect(freqs.slice(1, 5)).toEqual([1800, 1550, 1300, 1050]);
    expect(gains[0]).toBe(0.3);
    expect(gains.slice(1, 5)).toEqual([0.08, 0.08, 0.08, 0.08]);
    freqs.length = 0;
    live.dropClaims("night_market");
    expect(freqs[0]).toBe(dropPitch("night_market"));
    expect(freqs.slice(1, 5)).toEqual([1800, 1550, 1300, 1050]);
    freqs.length = 0;
    live.dropClaims("deadletter_docks");
    expect(freqs[0]).toBe(dropPitch("deadletter_docks"));
    freqs.length = 0;
    live.dropClaims("relay_heights");
    expect(freqs[0]).toBeGreaterThan(dropPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the drop", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function dropPitch");
    expect(audio).toContain('dur: 0.35, from: dropPitch(place), to: 110, gain: 0.3, type: "triangle"');
    expect(audio).toContain("freq: 1800 - i * 250");
    expect(game).toContain("this.audio.dropClaims(this.world.level.name)");
  });
});
