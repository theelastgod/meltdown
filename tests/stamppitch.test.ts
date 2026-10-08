/**
 * A kill confirm does not open its stamp at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 90 the thunk shipped with.
 * It still falls to 40. The 800 Hz body, the 1760 Hz tick, duration 0.16, and gain 0.6 stay.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_STAMP, stampPitch, GameAudio } from "../client/audio";
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

describe("each district stamps a kill at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_STAMP).toBe(90);
    expect(stampPitch(undefined)).toBe(STREET_STAMP);
    expect(stampPitch("lease_row")).toBe(STREET_STAMP);
    expect(stampPitch("drainage_yard")).toBe(STREET_STAMP);
    expect(stampPitch("deadletter_office")).toBe(STREET_STAMP);
    expect(stampPitch("white_office")).toBe(STREET_STAMP);
    const pitches = CITY_DISTRICTS.map((id) => stampPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(stampPitch("night_market")).toBeGreaterThan(STREET_STAMP);
    expect(stampPitch("deadletter_docks")).toBeLessThan(stampPitch("relay_heights"));
  });

  it("plays that pitch, and the fall, the body, the tick, duration, and gain stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    qs.length = 0;
    gains.length = 0;
    live.kill(0, "lease_row");
    expect(freqs[0]).toBe(STREET_STAMP);
    expect(freqs[1]).toBe(800);
    expect(freqs[2]).toBe(1760);
    expect(qs[0]).toBe(0.4);
    expect(gains[0]).toBe(0.6);
    freqs.length = 0;
    live.kill(0, "night_market");
    expect(freqs[0]).toBe(stampPitch("night_market"));
    expect(freqs[1]).toBe(800);
    expect(freqs[2]).toBe(1760);
    freqs.length = 0;
    live.kill(0, "deadletter_docks");
    expect(freqs[0]).toBe(stampPitch("deadletter_docks"));
    freqs.length = 0;
    live.kill(0, "relay_heights");
    expect(freqs[0]).toBeGreaterThan(stampPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the stamp", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function stampPitch");
    expect(audio).toContain("from: stampPitch(place)");
    expect(audio).toContain('dur: 0.16, from: stampPitch(place), to: 40, gain: 0.6, type: "sine"');
    expect(audio).toContain('dur: 0.05, freq: 800, q: 0.4, gain: 0.3, type: "lowpass"');
    expect(audio).toContain('dur: 0.09, from: 1760, gain: 0.12, type: "square", delay: 0.09');
    expect(game).toContain("this.audio.kill(this.killTier(weaponDefOf(this.player).id), this.world.level.name)");
    expect(game).toContain("this.audio.kill(this.killTier(ev.weapon), this.world.level.name)");
  });
});
