/**
 * The crowd murmur does not share a band width.
 * Lease Row, the yard, and the indoor rooms keep the 2.2 the bands shipped with.
 * The vowel pair stays crowdMurmur. Both filters take the same Q.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_MURMUR, STREET_Q, crowdMurmur, murmurQ, GameAudio } from "../client/audio";
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

describe("each district narrows its crowd murmur at its own Q", () => {
  it("keeps the street width and gives the other nineteen their own", () => {
    expect(STREET_Q).toBe(2.2);
    expect(murmurQ(undefined)).toBe(STREET_Q);
    expect(murmurQ("lease_row")).toBe(STREET_Q);
    expect(murmurQ("drainage_yard")).toBe(STREET_Q);
    expect(murmurQ("deadletter_office")).toBe(STREET_Q);
    expect(murmurQ("white_office")).toBe(STREET_Q);
    const widths = CITY_DISTRICTS.map((id) => murmurQ(id));
    expect(new Set(widths).size).toBe(CITY_DISTRICTS.length);
    expect(murmurQ("night_market")).toBeGreaterThan(STREET_Q);
    expect(murmurQ("deadletter_docks")).toBeLessThan(murmurQ("relay_heights"));
    expect(crowdMurmur("lease_row")).toEqual(STREET_MURMUR);
  });

  it("applies when the bed starts, and again when the file changes streets", () => {
    const early = new GameAudio();
    early.tune("night_market");
    expect(early.narrowNow()).toBeNull();
    early.resume();
    const night = murmurQ("night_market");
    expect(early.narrowNow()).toEqual({ a: night, b: night });
    const live = new GameAudio();
    live.resume();
    expect(live.narrowNow()).toEqual({ a: STREET_Q, b: STREET_Q });
    live.tune("relay_heights");
    const relay = murmurQ("relay_heights");
    expect(live.narrowNow()).toEqual({ a: relay, b: relay });
    live.tune("lease_row");
    expect(live.narrowNow()).toEqual({ a: STREET_Q, b: STREET_Q });
    expect(crowdMurmur("relay_heights").aHz).toBe(680);
  });

  it("fails closed if the read is removed from the murmur", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    expect(audio).toContain("function murmurQ");
    expect(audio).toContain("const narrow = murmurQ(levelName)");
    expect(audio).toContain("n.murmurA.Q.value = narrow");
    expect(audio).toContain("n.murmurB.Q.value = narrow");
    expect(audio).toContain("bp.Q.value = 2.2");
    expect(audio).toContain("const murmur = crowdMurmur(levelName)");
  });
});
