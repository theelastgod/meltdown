/**
 * The distant-traffic floor does not share a loudness.
 * Lease Row, the yard, and the indoor rooms keep the 0.16 the rumble shipped with.
 * Rate, cut, and swell stay farTraffic. The swell depth stays 0.11.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_BODY, STREET_TRAFFIC, trafficBody, farTraffic, GameAudio } from "../client/audio";
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

describe("each district hears its own distant-traffic floor", () => {
  it("keeps the street floor and gives the other nineteen their own", () => {
    expect(STREET_BODY).toBe(0.16);
    expect(trafficBody(undefined)).toBe(STREET_BODY);
    expect(trafficBody("lease_row")).toBe(STREET_BODY);
    expect(trafficBody("drainage_yard")).toBe(STREET_BODY);
    expect(trafficBody("deadletter_office")).toBe(STREET_BODY);
    expect(trafficBody("white_office")).toBe(STREET_BODY);
    const bodies = CITY_DISTRICTS.map((id) => trafficBody(id));
    expect(new Set(bodies).size).toBe(CITY_DISTRICTS.length);
    expect(trafficBody("night_market")).toBeGreaterThan(STREET_BODY);
    expect(trafficBody("deadletter_docks")).toBeLessThan(trafficBody("relay_heights"));
    expect(farTraffic("lease_row")).toEqual(STREET_TRAFFIC);
  });

  it("applies when the bed starts, and again when the file changes streets", () => {
    const early = new GameAudio();
    early.tune("night_market");
    expect(early.bodyNow()).toBeNull();
    early.resume();
    expect(early.bodyNow()).toBe(trafficBody("night_market"));
    const live = new GameAudio();
    live.resume();
    expect(live.bodyNow()).toBe(STREET_BODY);
    live.tune("relay_heights");
    expect(live.bodyNow()).toBe(trafficBody("relay_heights"));
    live.tune("lease_row");
    expect(live.bodyNow()).toBe(STREET_BODY);
    const n = (live as unknown as { bedNodes: { swell: { frequency: { value: number } }; traffic: { playbackRate: { value: number } } } }).bedNodes;
    expect(n.swell.frequency.value).toBe(STREET_TRAFFIC.swell);
    expect(n.traffic.playbackRate.value).toBe(STREET_TRAFFIC.rate);
  });

  it("fails closed if the read is removed from the rumble", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    expect(audio).toContain("function trafficBody");
    expect(audio).toContain("tg.gain.value = trafficBody(this.bedName)");
    expect(audio).toContain("n.trafficGain.gain.value = trafficBody(levelName)");
    expect(audio).toContain("n.traffic.playbackRate.value = far.rate");
    expect(audio).toContain("n.swell.frequency.value = far.swell");
    expect(audio).toContain("sg.gain.value = 0.11");
  });
});
