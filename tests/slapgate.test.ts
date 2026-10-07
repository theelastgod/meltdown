/**
 * A distant shot does not wait the same number of metres to slap.
 * Lease Row, the yard, and the indoor rooms keep the 22 the slap shipped with.
 * The slap itself stays shotSlap. Pan still folds by 0.6. A wasp still throws none.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_GATE, shotSlap, slapGate, GameAudio } from "../client/audio";
import { CITY_DISTRICTS } from "../shared/net/city";

const freqs: number[] = [];

function stubWebAudio(): void {
  const param = (bucket?: number[]) => {
    let v = 0;
    return {
      get value() { return v; },
      set value(n: number) { v = n; bucket?.push(n); },
      setValueAtTime(n: number) { v = n; },
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {},
      cancelScheduledValues() {},
    };
  };
  const node = () => ({ connect(n: unknown) { return n; }, disconnect() {}, start() {}, stop() {}, frequency: param(freqs), gain: param(), Q: param(), detune: param(), type: "", buffer: null, loop: false, playbackRate: param(), threshold: param(), ratio: param(), attack: param(), release: param(), knee: param(), pan: param(), delayTime: param() });
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

beforeEach(() => { freqs.length = 0; stubWebAudio(); });
afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window; });

const cue = (distance: number) => ({ gain: 1, pan: 0.4, delay: 0, muffle: 0, distance });

describe("each district opens its shot slap at its own distance", () => {
  it("keeps the street gate and gives the other nineteen their own", () => {
    expect(STREET_GATE).toBe(22);
    expect(slapGate(undefined)).toBe(STREET_GATE);
    expect(slapGate("lease_row")).toBe(STREET_GATE);
    expect(slapGate("drainage_yard")).toBe(STREET_GATE);
    expect(slapGate("deadletter_office")).toBe(STREET_GATE);
    expect(slapGate("white_office")).toBe(STREET_GATE);
    const gates = CITY_DISTRICTS.map((id) => slapGate(id));
    expect(new Set(gates).size).toBe(CITY_DISTRICTS.length);
    expect(slapGate("night_market")).toBeLessThan(STREET_GATE);
    expect(slapGate("deadletter_docks")).toBeGreaterThan(slapGate("relay_heights"));
    expect(shotSlap("lease_row")).toEqual({ hz: 480, dur: 0.26, q: 0.5, lag: 0.055, gain: 0.09 });
    expect(shotSlap("deadletter_docks").lag).toBe(0.16);
  });

  it("throws the slap only past that gate, and a wasp still throws none", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    live.otherShot("lease_breaker", cue(STREET_GATE), "lease_row");
    expect(freqs).toEqual([3000]);
    freqs.length = 0;
    live.otherShot("lease_breaker", cue(STREET_GATE + 0.1), "lease_row");
    expect(freqs).toEqual([3000, shotSlap("lease_row").hz]);
    freqs.length = 0;
    live.otherShot("lease_breaker", cue(slapGate("night_market")), "night_market");
    expect(freqs).toEqual([3000]);
    freqs.length = 0;
    live.otherShot("lease_breaker", cue(slapGate("night_market") + 0.1), "night_market");
    expect(freqs).toEqual([3000, shotSlap("night_market").hz]);
    freqs.length = 0;
    live.otherShot("wasp", cue(80), "night_market");
    expect(freqs).toEqual([2400]);
    freqs.length = 0;
    live.otherShot("lease_breaker", cue(slapGate("deadletter_docks")), "deadletter_docks");
    expect(freqs).toEqual([3000]);
    freqs.length = 0;
    live.otherShot("lease_breaker", cue(slapGate("relay_heights") + 0.1), "relay_heights");
    expect(freqs).toEqual([3000, shotSlap("relay_heights").hz]);
  });

  it("fails closed if the read is removed from the slap", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    expect(audio).toContain("function slapGate");
    expect(audio).toContain("cue.distance > slapGate(place)");
    expect(audio).toContain("const slap = shotSlap(place)");
    expect(audio).toContain("pan: -cue.pan * 0.6");
  });
});
