/**
 * A mech flag does not open at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 880 the square shipped with.
 * The second note stays 880. Duration stays 0.12. Gain stays 0.12. The gap stays 0.18.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_FLAG, flagPitch, GameAudio } from "../client/audio";
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

describe("each district opens a mech flag at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_FLAG).toBe(880);
    expect(flagPitch(undefined)).toBe(STREET_FLAG);
    expect(flagPitch("lease_row")).toBe(STREET_FLAG);
    expect(flagPitch("drainage_yard")).toBe(STREET_FLAG);
    expect(flagPitch("deadletter_office")).toBe(STREET_FLAG);
    expect(flagPitch("white_office")).toBe(STREET_FLAG);
    const pitches = CITY_DISTRICTS.map((id) => flagPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(flagPitch("night_market")).toBeGreaterThan(STREET_FLAG);
    expect(flagPitch("deadletter_docks")).toBeLessThan(flagPitch("relay_heights"));
  });

  it("plays that pitch, and the second note stays put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.flagged("lease_row");
    expect(freqs[0]).toBe(STREET_FLAG);
    expect(freqs[1]).toBe(880);
    expect(gains[0]).toBeCloseTo(0.12);
    expect(gains[1]).toBeCloseTo(0.12);
    freqs.length = 0;
    live.flagged("night_market");
    expect(freqs[0]).toBe(flagPitch("night_market"));
    expect(freqs[1]).toBe(880);
    freqs.length = 0;
    live.flagged("deadletter_docks");
    expect(freqs[0]).toBe(flagPitch("deadletter_docks"));
    freqs.length = 0;
    live.flagged("relay_heights");
    expect(freqs[0]).toBeGreaterThan(flagPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the square", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function flagPitch");
    expect(audio).toContain('dur: 0.12, from: flagPitch(place), gain: 0.12, type: "square"');
    expect(audio).toContain('dur: 0.12, from: 880, gain: 0.12, type: "square", delay: 0.18');
    expect(game).toContain("this.audio.flagged(this.world.level.name)");
  });
});
