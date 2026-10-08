/**
 * Somebody else's boot does not open at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 190 the other step shipped with.
 * Speed still adds 8 hertz. Duration stays 0.07. Q stays 0.8. The lowpass stays.
 * Your own step stays stepSurface. The loudness formula stays put.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_BOOT, bootPitch, GameAudio } from "../client/audio";
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

describe("each district opens somebody else's boot at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_BOOT).toBe(190);
    expect(bootPitch(undefined)).toBe(STREET_BOOT);
    expect(bootPitch("lease_row")).toBe(STREET_BOOT);
    expect(bootPitch("drainage_yard")).toBe(STREET_BOOT);
    expect(bootPitch("deadletter_office")).toBe(STREET_BOOT);
    expect(bootPitch("white_office")).toBe(STREET_BOOT);
    const pitches = CITY_DISTRICTS.map((id) => bootPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(bootPitch("night_market")).toBeGreaterThan(STREET_BOOT);
    expect(bootPitch("deadletter_docks")).toBeLessThan(bootPitch("relay_heights"));
  });

  it("plays that pitch plus speed, and the duration gate, the Q, and the gain stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.otherStep(2, 0.4, 1, "lease_row");
    expect(freqs[0]).toBe(STREET_BOOT + 16);
    expect(gains[0]).toBeCloseTo(0.051);
    freqs.length = 0;
    live.otherStep(2, -0.2, 1, "night_market");
    expect(freqs[0]).toBe(bootPitch("night_market") + 16);
    freqs.length = 0;
    live.otherStep(4, 0.1, 1, "deadletter_docks");
    expect(freqs[0]).toBe(bootPitch("deadletter_docks") + 32);
    freqs.length = 0;
    live.otherStep(4, 0.1, 1, "relay_heights");
    expect(freqs[0]).toBeGreaterThan(bootPitch("deadletter_docks") + 32);
  });

  it("fails closed if the read is removed from the other step", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function bootPitch");
    expect(audio).toContain("freq: bootPitch(place) + speed * 8, q: 0.8, gain: g, type: \"lowpass\", pan");
    expect(audio).toContain("dur: 0.07");
    expect(game).toContain("this.audio.otherStep(cue.speed, cue.pan, cue.gain, this.world.level.name)");
    expect(game).toContain("this.audio.footstep(sp, this.stepSide * 0.25, this.world.level.name)");
  });
});
