/**
 * Lease Row's crowd murmur stays a 420 Hz band and a 760 Hz band.
 * Nineteen districts each keep their own pair.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_MURMUR, bedTune, crowdMurmur, murmurQ, GameAudio } from "../client/audio";

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

const LEASE = { aHz: 420, aRate: 0.23, aGain: 0.05, bHz: 760, bRate: 0.31, bGain: 0.035 };

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

type MurmurNodes = {
  murmurA: { frequency: { value: number }; Q: { value: number } };
  murmurAGain: { gain: { value: number } };
  murmurALfo: { frequency: { value: number } };
  murmurADepth: { gain: { value: number } };
  murmurB: { frequency: { value: number }; Q: { value: number } };
  murmurBGain: { gain: { value: number } };
  murmurBLfo: { frequency: { value: number } };
  murmurBDepth: { gain: { value: number } };
};

describe("each district hears its own crowd murmur", () => {
  it("the street pair stays, and the twenty districts do not share a pair", () => {
    expect(crowdMurmur("lease_row")).toEqual(LEASE);
    expect(crowdMurmur(undefined)).toEqual(LEASE);
    expect(crowdMurmur(undefined)).toEqual(STREET_MURMUR);
    expect(crowdMurmur("drainage_yard")).toEqual(LEASE);
    expect(crowdMurmur("deadletter_office")).toEqual(LEASE);
    expect(crowdMurmur("white_office")).toEqual(LEASE);
    const pairs = IDS.map((id) => JSON.stringify(crowdMurmur(id)));
    expect(new Set(pairs).size).toBe(20);
    expect(IDS.length).toBe(20);
  });

  it("tune assigns both bandpass frequencies from crowdMurmur", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    expect(audio).toContain("const murmur = crowdMurmur(levelName)");
    expect(audio).toContain("n.murmurA.frequency.value = murmur.aHz");
    expect(audio).toContain("n.murmurB.frequency.value = murmur.bHz");
    expect(audio).toContain("playbackRate.value = 0.8");
    expect(audio).toContain("bp.Q.value = 2.2");
    const live = new GameAudio();
    live.resume();
    live.tune("glass_mile");
    const n = (live as unknown as { bedNodes: MurmurNodes }).bedNodes;
    const murmur = crowdMurmur("glass_mile");
    expect(n.murmurA.frequency.value).toBe(murmur.aHz);
    expect(n.murmurB.frequency.value).toBe(murmur.bHz);
    expect(n.murmurALfo.frequency.value).toBe(murmur.aRate);
    expect(n.murmurBLfo.frequency.value).toBe(murmur.bRate);
    expect(n.murmurAGain.gain.value).toBe(murmur.aGain);
    expect(n.murmurBGain.gain.value).toBe(murmur.bGain);
    expect(n.murmurADepth.gain.value).toBe(murmur.aGain * 0.7);
    expect(n.murmurBDepth.gain.value).toBe(murmur.bGain * 0.7);
    expect(n.murmurA.Q.value).toBe(murmurQ("glass_mile"));
    expect(n.murmurB.Q.value).toBe(murmurQ("glass_mile"));
    const held = live.bedNow();
    expect(held).toEqual(bedTune("glass_mile"));
    expect(Object.keys(held ?? {}).sort()).toEqual(["buzz", "buzzCut", "buzzHz", "hum", "humHz", "rain", "rainHz", "rainQ"]);
    live.tune(undefined);
    expect(n.murmurA.frequency.value).toBe(crowdMurmur(undefined).aHz);
    expect(n.murmurB.frequency.value).toBe(crowdMurmur(undefined).bHz);
    expect(n.murmurA.Q.value).toBe(2.2);
    expect(n.murmurB.Q.value).toBe(2.2);
  });
});
