/**
 * The last quarter of a magazine does not tick at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 2600 the first tick shipped with.
 * The second tick stays 2100. Both stay 0.03 seconds at Q 1.4. Gains stay 0.1 and 0.09.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_CLIP, clipPitch, GameAudio } from "../client/audio";
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

describe("each district ticks the last quarter at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_CLIP).toBe(2600);
    expect(clipPitch(undefined)).toBe(STREET_CLIP);
    expect(clipPitch("lease_row")).toBe(STREET_CLIP);
    expect(clipPitch("drainage_yard")).toBe(STREET_CLIP);
    expect(clipPitch("deadletter_office")).toBe(STREET_CLIP);
    expect(clipPitch("white_office")).toBe(STREET_CLIP);
    const pitches = CITY_DISTRICTS.map((id) => clipPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(clipPitch("night_market")).toBeGreaterThan(STREET_CLIP);
    expect(clipPitch("deadletter_docks")).toBeLessThan(clipPitch("relay_heights"));
  });

  it("plays that pitch, and the second tick, the duration, the Q, and the gains stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.lowAmmo("lease_row");
    expect(freqs[0]).toBe(STREET_CLIP);
    expect(freqs[1]).toBe(2100);
    expect(gains[0]).toBe(0.1);
    expect(gains[1]).toBe(0.09);
    freqs.length = 0;
    live.lowAmmo("night_market");
    expect(freqs[0]).toBe(clipPitch("night_market"));
    expect(freqs[1]).toBe(2100);
    freqs.length = 0;
    live.lowAmmo("deadletter_docks");
    expect(freqs[0]).toBe(clipPitch("deadletter_docks"));
    freqs.length = 0;
    live.lowAmmo("relay_heights");
    expect(freqs[0]).toBeGreaterThan(clipPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the tick", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function clipPitch");
    expect(audio).toContain("freq: clipPitch(place)");
    expect(audio).toContain("dur: 0.03, freq: clipPitch(place), q: 1.4, gain: 0.1");
    expect(audio).toContain("dur: 0.03, freq: 2100, q: 1.4, gain: 0.09, delay: 0.09");
    expect(game.match(/this\.audio\.lowAmmo\(this\.world\.level\.name\)/g)?.length).toBe(1);
  });
});
