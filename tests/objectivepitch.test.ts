/**
 * The objective figure does not open at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 523 the figure shipped with.
 * The rest stays 659, 784. Duration stays 0.16. Gain stays 0.07. The gap stays 0.11.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_OBJECTIVE, objectivePitch, GameAudio } from "../client/audio";
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

describe("each district opens the objective figure at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_OBJECTIVE).toBe(523);
    expect(objectivePitch(undefined)).toBe(STREET_OBJECTIVE);
    expect(objectivePitch("lease_row")).toBe(STREET_OBJECTIVE);
    expect(objectivePitch("drainage_yard")).toBe(STREET_OBJECTIVE);
    expect(objectivePitch("deadletter_office")).toBe(STREET_OBJECTIVE);
    expect(objectivePitch("white_office")).toBe(STREET_OBJECTIVE);
    const pitches = CITY_DISTRICTS.map((id) => objectivePitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(objectivePitch("night_market")).toBeGreaterThan(STREET_OBJECTIVE);
    expect(objectivePitch("deadletter_docks")).toBeLessThan(objectivePitch("relay_heights"));
    for (const id of CITY_DISTRICTS) expect(objectivePitch(id)).toBeGreaterThan(40);
  });

  it("opens on that pitch and keeps the rest of the figure", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.objective("lease_row");
    expect(freqs).toEqual([STREET_OBJECTIVE, 659, 784]);
    expect(gains[0]).toBeCloseTo(0.07);
    expect(gains[1]).toBeCloseTo(0.07);
    expect(gains[2]).toBeCloseTo(0.07);
    freqs.length = 0;
    gains.length = 0;
    live.objective("night_market");
    expect(freqs[0]).toBe(objectivePitch("night_market"));
    expect(freqs.slice(1)).toEqual([659, 784]);
    expect(gains[0]).toBeCloseTo(0.07);
    freqs.length = 0;
    live.objective("deadletter_docks");
    expect(freqs[0]).toBe(objectivePitch("deadletter_docks"));
    expect(freqs.slice(1)).toEqual([659, 784]);
    freqs.length = 0;
    live.objective("relay_heights");
    expect(freqs[0]).toBeGreaterThan(objectivePitch("deadletter_docks"));
    expect(freqs.slice(1)).toEqual([659, 784]);
  });

  it("fails closed if the read is removed from the figure", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const campaign = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(audio).toContain("function objectivePitch");
    expect(audio).toContain('for (const [i, f] of [objectivePitch(place), 659, 784].entries()) this.tone({ dur: 0.16, from: f, gain: 0.07, type: "triangle", delay: 0.11 * i });');
    expect(campaign.split("this.game.audio.objective(this.game.world.level.name)").length - 1).toBe(3);
    expect(campaign).not.toContain("this.game.audio.objective()");
  });
});
