/**
 * A wasp lock does not open at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 900 the blip shipped with.
 * It still arrives at 1300. The second note stays 1300 to 1700. The crack stays 2600.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_LOCK, lockPitch, GameAudio } from "../client/audio";
import { CITY_DISTRICTS } from "../shared/net/city";

const freqs: number[] = [];
const gains: number[] = [];
const qs: number[] = [];

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

beforeEach(() => { freqs.length = 0; gains.length = 0; qs.length = 0; stubWebAudio(); });
afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window; });

describe("each district opens a wasp lock at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_LOCK).toBe(900);
    expect(lockPitch(undefined)).toBe(STREET_LOCK);
    expect(lockPitch("lease_row")).toBe(STREET_LOCK);
    expect(lockPitch("drainage_yard")).toBe(STREET_LOCK);
    expect(lockPitch("deadletter_office")).toBe(STREET_LOCK);
    expect(lockPitch("white_office")).toBe(STREET_LOCK);
    const pitches = CITY_DISTRICTS.map((id) => lockPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(lockPitch("night_market")).toBeGreaterThan(STREET_LOCK);
    expect(lockPitch("deadletter_docks")).toBeLessThan(lockPitch("relay_heights"));
  });

  it("plays that pitch, and the arrival, the second note, and the crack stay put", () => {
    const live = new GameAudio();
    live.resume();
    const cue = { pan: 0.2, gain: 1 };
    freqs.length = 0;
    gains.length = 0;
    qs.length = 0;
    live.waspLock(cue, "lease_row");
    expect(freqs[0]).toBe(STREET_LOCK);
    expect(freqs[1]).toBe(1300);
    expect(freqs[2]).toBe(2600);
    expect(gains[0]).toBeCloseTo(0.14);
    expect(gains[1]).toBeCloseTo(0.12);
    expect(gains[2]).toBeCloseTo(0.06);
    expect(qs[0]).toBe(1.2);
    freqs.length = 0;
    live.waspLock(cue, "night_market");
    expect(freqs[0]).toBe(lockPitch("night_market"));
    expect(freqs[1]).toBe(1300);
    expect(freqs[2]).toBe(2600);
    freqs.length = 0;
    live.waspLock(cue, "deadletter_docks");
    expect(freqs[0]).toBe(lockPitch("deadletter_docks"));
    freqs.length = 0;
    live.waspLock(cue, "relay_heights");
    expect(freqs[0]).toBeGreaterThan(lockPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the lock", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function lockPitch");
    expect(audio).toContain('dur: 0.07, from: lockPitch(place), to: 1300, gain: 0.14 * cue.gain, type: "square", pan: cue.pan');
    expect(audio).toContain("dur: 0.09, from: 1300, to: 1700, gain: 0.12 * cue.gain");
    expect(audio).toContain("dur: 0.06, freq: 2600, q: 1.2, gain: 0.06 * cue.gain");
    expect(game).toContain("this.audio.waspLock(cue, this.world.level.name)");
  });
});
