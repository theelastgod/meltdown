/**
 * A footstep does not share a base loudness.
 * Lease Row, the yard, and the indoor rooms keep the 0.05 the step shipped with.
 * The surface stays stepSurface. Speed still adds the same cap.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_HEFT, stepHeft, stepSurface, GameAudio } from "../client/audio";
import { CITY_DISTRICTS } from "../shared/net/city";

function stubWebAudio(hits: number[]): void {
  const param = () => ({
    value: 0,
    setValueAtTime(v: number) { hits.push(v); },
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
  });
  const node = () => ({ connect(n: unknown) { return n; }, disconnect() {}, start() {}, stop() {}, frequency: param(), gain: param(), Q: param(), detune: param(), type: "", buffer: null, loop: false, playbackRate: param(), threshold: param(), ratio: param(), attack: param(), release: param(), knee: param(), pan: param(), delayTime: param() });
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

const hits: number[] = [];
beforeEach(() => { hits.length = 0; stubWebAudio(hits); });
afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window; });

describe("each district steps at its own heft", () => {
  it("keeps the street heft and gives the other nineteen their own", () => {
    expect(STREET_HEFT).toBe(0.05);
    expect(stepHeft(undefined)).toBe(STREET_HEFT);
    expect(stepHeft("lease_row")).toBe(STREET_HEFT);
    expect(stepHeft("drainage_yard")).toBe(STREET_HEFT);
    expect(stepHeft("deadletter_office")).toBe(STREET_HEFT);
    expect(stepHeft("white_office")).toBe(STREET_HEFT);
    const hefts = CITY_DISTRICTS.map((id) => stepHeft(id));
    expect(new Set(hefts).size).toBe(CITY_DISTRICTS.length);
    expect(stepHeft("night_market")).toBeGreaterThan(STREET_HEFT);
    expect(stepHeft("deadletter_docks")).toBeLessThan(stepHeft("relay_heights"));
    expect(stepSurface("lease_row")).toEqual({ hz: 260, dur: 0.06, q: 0.7, type: "lowpass" });
    expect(stepSurface("night_market").hz).toBe(920);
  });

  it("applies that base when a boot hits, and speed still adds the same cap", () => {
    const live = new GameAudio();
    live.resume();
    hits.length = 0;
    live.footstep(0, 0, "lease_row");
    expect(hits[0]).toBe(STREET_HEFT);
    hits.length = 0;
    live.footstep(0, 0, "night_market");
    expect(hits[0]).toBe(stepHeft("night_market"));
    hits.length = 0;
    live.footstep(10, 0.25, "relay_heights");
    expect(hits[0]).toBeCloseTo(stepHeft("relay_heights") + 0.12);
    hits.length = 0;
    live.footstep(0, 0, "deadletter_docks");
    expect(hits[0]).toBe(stepHeft("deadletter_docks"));
  });

  it("fails closed if the read is removed from the step", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    expect(audio).toContain("function stepHeft");
    expect(audio).toContain("const g = stepHeft(place) + Math.min(0.12, speed * 0.012)");
    expect(audio).toContain("const face = stepSurface(place)");
  });
});
