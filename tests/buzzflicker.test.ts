/**
 * The neon buzz breathes at a different rate on every street.
 * Lease Row, the yard, and the indoor rooms keep the rate the bed shipped with.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { STREET_FLICKER, buzzFlicker, GameAudio } from "../client/audio";
import { CITY_DISTRICTS } from "../shared/net/city";

function stubWebAudio(): void {
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
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

beforeEach(() => stubWebAudio());
afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window; });

describe("the neon buzz breathes with the street", () => {
  it("keeps Lease Row at the shipped rate and gives every other district its own", () => {
    expect(STREET_FLICKER).toBe(7.3);
    expect(buzzFlicker(undefined)).toBe(STREET_FLICKER);
    expect(buzzFlicker("lease_row")).toBe(STREET_FLICKER);
    expect(buzzFlicker("drainage_yard")).toBe(STREET_FLICKER);
    expect(buzzFlicker("deadletter_office")).toBe(STREET_FLICKER);
    expect(buzzFlicker("white_office")).toBe(STREET_FLICKER);
    const rates = CITY_DISTRICTS.map((id) => buzzFlicker(id));
    expect(new Set(rates).size).toBe(CITY_DISTRICTS.length);
    expect(buzzFlicker("night_market")).not.toBe(buzzFlicker("lease_row"));
    expect(buzzFlicker("deadletter_docks")).not.toBe(buzzFlicker("relay_heights"));
    expect(buzzFlicker("night_market")).toBeGreaterThan(STREET_FLICKER);
    expect(buzzFlicker("deadletter_docks")).toBeLessThan(STREET_FLICKER);
  });

  it("applies when the bed starts, and again when the file changes streets", () => {
    const early = new GameAudio();
    early.tune("night_market");
    expect(early.flickerNow()).toBeNull();
    early.resume();
    expect(early.flickerNow()).toBe(buzzFlicker("night_market"));
    const live = new GameAudio();
    live.resume();
    expect(live.flickerNow()).toBe(STREET_FLICKER);
    live.tune("relay_heights");
    expect(live.flickerNow()).toBe(buzzFlicker("relay_heights"));
    live.tune("lease_row");
    expect(live.flickerNow()).toBe(STREET_FLICKER);
  });
});
