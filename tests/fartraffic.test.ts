/**
 * Lease Row's far traffic stays a 0.37 rumble through a 180 Hz lowpass, swelling at 0.09.
 * Nineteen districts each keep their own rate, cut, and swell.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_TRAFFIC, farTraffic, GameAudio } from "../client/audio";

const IDS = [
  "lease_row",
  "deadletter_docks",
  "repo_depot",
  "night_market",
  "relay_heights",
  "ash_canal",
  "glass_mile",
  "bone_market",
  "cold_vault",
  "neon_chapel",
  "slag_pit",
  "wire_garden",
  "red_kiln",
  "paper_wharf",
  "velvet_court",
  "rust_crown",
  "salt_stairs",
  "lamp_bazaar",
  "debt_orchard",
  "black_relay",
] as const;

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

describe("each district hears its own far traffic", () => {
  it("the street rumble stays, and the twenty districts do not share a triple", () => {
    const row = { rate: 0.37, cut: 180, swell: 0.09 };
    expect(farTraffic("lease_row")).toEqual(row);
    expect(farTraffic(undefined)).toEqual(row);
    expect(farTraffic(undefined)).toEqual(STREET_TRAFFIC);
    expect(farTraffic("drainage_yard")).toEqual(row);
    expect(farTraffic("deadletter_office")).toEqual(row);
    expect(farTraffic("white_office")).toEqual(row);
    const triples = IDS.map((id) => JSON.stringify(farTraffic(id)));
    expect(new Set(triples).size).toBe(20);
    expect(IDS.length).toBe(20);
  });

  it("tune assigns the traffic filter from farTraffic", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    expect(audio).toContain("const far = farTraffic(levelName)");
    expect(audio).toContain("n.trafficFilter.frequency.value = far.cut");
    const live = new GameAudio();
    live.resume();
    live.tune("glass_mile");
    const n = (live as unknown as { bedNodes: { trafficFilter: { frequency: { value: number } }; traffic: { playbackRate: { value: number } }; swell: { frequency: { value: number } } } }).bedNodes;
    const far = farTraffic("glass_mile");
    expect(n.trafficFilter.frequency.value).toBe(far.cut);
    expect(n.traffic.playbackRate.value).toBe(far.rate);
    expect(n.swell.frequency.value).toBe(far.swell);
    live.tune(undefined);
    expect(n.trafficFilter.frequency.value).toBe(farTraffic(undefined).cut);
  });
});
