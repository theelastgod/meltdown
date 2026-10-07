/**
 * The neon buzz does not share a breath depth.
 * Lease Row, the yard, and the indoor rooms keep the 0.006 the bed shipped with.
 * The rate stays buzzFlicker. Lease Row still breathes at 7.3 Hz.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_DEPTH, STREET_FLICKER, buzzDepth, buzzFlicker, GameAudio } from "../client/audio";
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

describe("each district breathes the neon buzz at its own depth", () => {
  it("keeps the street depth and gives the other nineteen their own", () => {
    expect(STREET_DEPTH).toBe(0.006);
    expect(buzzDepth(undefined)).toBe(STREET_DEPTH);
    expect(buzzDepth("lease_row")).toBe(STREET_DEPTH);
    expect(buzzDepth("drainage_yard")).toBe(STREET_DEPTH);
    expect(buzzDepth("deadletter_office")).toBe(STREET_DEPTH);
    expect(buzzDepth("white_office")).toBe(STREET_DEPTH);
    const depths = CITY_DISTRICTS.map((id) => buzzDepth(id));
    expect(new Set(depths).size).toBe(CITY_DISTRICTS.length);
    expect(buzzDepth("night_market")).toBeGreaterThan(STREET_DEPTH);
    expect(buzzDepth("deadletter_docks")).toBeLessThan(buzzDepth("relay_heights"));
    expect(buzzFlicker("lease_row")).toBe(STREET_FLICKER);
  });

  it("applies when the bed starts, and again when the file changes streets", () => {
    const early = new GameAudio();
    early.tune("night_market");
    expect(early.depthNow()).toBeNull();
    early.resume();
    expect(early.depthNow()).toBe(buzzDepth("night_market"));
    expect(early.flickerNow()).toBe(buzzFlicker("night_market"));
    const live = new GameAudio();
    live.resume();
    expect(live.depthNow()).toBe(STREET_DEPTH);
    expect(live.flickerNow()).toBe(STREET_FLICKER);
    live.tune("relay_heights");
    expect(live.depthNow()).toBe(buzzDepth("relay_heights"));
    expect(live.flickerNow()).toBe(buzzFlicker("relay_heights"));
    live.tune("lease_row");
    expect(live.depthNow()).toBe(STREET_DEPTH);
    expect(live.flickerNow()).toBe(STREET_FLICKER);
  });

  it("fails closed if the read is removed from the buzz", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    expect(audio).toContain("function buzzDepth");
    expect(audio).toContain("lg.gain.value = buzzDepth(this.bedName)");
    expect(audio).toContain("n.buzzLfoGain.gain.value = buzzDepth(levelName)");
    expect(audio).toContain("lfo.frequency.value = buzzFlicker(this.bedName)");
    expect(audio).toContain("n.buzzLfo.frequency.value = buzzFlicker(levelName)");
  });
});
