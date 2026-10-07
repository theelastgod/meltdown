/**
 * A jump does not thud at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 350 the jump shipped with.
 * Duration stays 0.08, Q stays 0.7, and gain stays 0.1.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_JUMP, jumpPitch, GameAudio } from "../client/audio";
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

describe("each district thuds a jump at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_JUMP).toBe(350);
    expect(jumpPitch(undefined)).toBe(STREET_JUMP);
    expect(jumpPitch("lease_row")).toBe(STREET_JUMP);
    expect(jumpPitch("drainage_yard")).toBe(STREET_JUMP);
    expect(jumpPitch("deadletter_office")).toBe(STREET_JUMP);
    expect(jumpPitch("white_office")).toBe(STREET_JUMP);
    const pitches = CITY_DISTRICTS.map((id) => jumpPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(jumpPitch("night_market")).toBeGreaterThan(STREET_JUMP);
    expect(jumpPitch("deadletter_docks")).toBeLessThan(jumpPitch("relay_heights"));
  });

  it("plays that pitch, and duration, Q, and gain stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    qs.length = 0;
    gains.length = 0;
    live.jump("lease_row");
    expect(freqs.at(-1)).toBe(STREET_JUMP);
    expect(qs.at(-1)).toBe(0.7);
    expect(gains.at(-1)).toBe(0.1);
    freqs.length = 0;
    live.jump("night_market");
    expect(freqs.at(-1)).toBe(jumpPitch("night_market"));
    freqs.length = 0;
    live.jump("deadletter_docks");
    expect(freqs.at(-1)).toBe(jumpPitch("deadletter_docks"));
    freqs.length = 0;
    live.jump("relay_heights");
    expect(freqs.at(-1)).toBeGreaterThan(jumpPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the jump", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function jumpPitch");
    expect(audio).toContain("freq: jumpPitch(place)");
    expect(audio).toContain("dur: 0.08");
    expect(audio).toContain("q: 0.7");
    expect(audio).toContain("gain: 0.1");
    expect(game).toContain('this.audio.jump(this.world.level.name)');
  });
});
