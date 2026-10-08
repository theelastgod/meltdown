/**
 * A shield coming back does not open its rise at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 220 the hum shipped with.
 * It still rises to 660. The 2400 Hz tick, duration 0.35, and gain 0.12 stay.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_MEND, mendPitch, GameAudio } from "../client/audio";
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

describe("each district mends a shield at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_MEND).toBe(220);
    expect(mendPitch(undefined)).toBe(STREET_MEND);
    expect(mendPitch("lease_row")).toBe(STREET_MEND);
    expect(mendPitch("drainage_yard")).toBe(STREET_MEND);
    expect(mendPitch("deadletter_office")).toBe(STREET_MEND);
    expect(mendPitch("white_office")).toBe(STREET_MEND);
    const pitches = CITY_DISTRICTS.map((id) => mendPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(mendPitch("night_market")).toBeGreaterThan(STREET_MEND);
    expect(mendPitch("deadletter_docks")).toBeLessThan(mendPitch("relay_heights"));
  });

  it("plays that pitch, and the rise, the tick, the duration, and the gains stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.shieldBack("lease_row");
    expect(freqs[0]).toBe(STREET_MEND);
    expect(freqs[1]).toBe(2400);
    expect(gains[0]).toBe(0.12);
    expect(gains[1]).toBe(0.08);
    freqs.length = 0;
    live.shieldBack("night_market");
    expect(freqs[0]).toBe(mendPitch("night_market"));
    expect(freqs[1]).toBe(2400);
    freqs.length = 0;
    live.shieldBack("deadletter_docks");
    expect(freqs[0]).toBe(mendPitch("deadletter_docks"));
    freqs.length = 0;
    live.shieldBack("relay_heights");
    expect(freqs[0]).toBeGreaterThan(mendPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the mend", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function mendPitch");
    expect(audio).toContain('dur: 0.35, from: mendPitch(place), to: 660, gain: 0.12, type: "triangle"');
    expect(audio).toContain("dur: 0.03, freq: 2400, q: 1.4, gain: 0.08, delay: 0.32");
    expect(game).toContain("this.audio.shieldBack(this.world.level.name)");
  });
});
