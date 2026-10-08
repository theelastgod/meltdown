/**
 * A node thud does not open at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 110 the chunk shipped with.
 * It still lands at 50. Duration stays 0.25. Gain stays 0.5. The chord stays 440 or 330.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_NODE, nodePitch, GameAudio } from "../client/audio";
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

describe("each district opens a node thud at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_NODE).toBe(110);
    expect(nodePitch(undefined)).toBe(STREET_NODE);
    expect(nodePitch("lease_row")).toBe(STREET_NODE);
    expect(nodePitch("drainage_yard")).toBe(STREET_NODE);
    expect(nodePitch("deadletter_office")).toBe(STREET_NODE);
    expect(nodePitch("white_office")).toBe(STREET_NODE);
    const pitches = CITY_DISTRICTS.map((id) => nodePitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(nodePitch("night_market")).toBeGreaterThan(STREET_NODE);
    expect(nodePitch("deadletter_docks")).toBeLessThan(nodePitch("relay_heights"));
  });

  it("plays that pitch, and the landing, the gain, and the chord stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.nodeFlip(true, "lease_row");
    expect(freqs[0]).toBe(STREET_NODE);
    expect(freqs[1]).toBe(440);
    expect(freqs[2]).toBe(440 * 1.25);
    expect(freqs[3]).toBe(440 * 1.5);
    expect(freqs[4]).toBe(880);
    expect(gains[0]).toBeCloseTo(0.5);
    expect(gains[1]).toBeCloseTo(0.08);
    freqs.length = 0;
    gains.length = 0;
    live.nodeFlip(false, "night_market");
    expect(freqs[0]).toBe(nodePitch("night_market"));
    expect(freqs[1]).toBe(330);
    expect(gains[0]).toBeCloseTo(0.5);
    freqs.length = 0;
    live.nodeFlip(true, "deadletter_docks");
    expect(freqs[0]).toBe(nodePitch("deadletter_docks"));
    freqs.length = 0;
    live.nodeFlip(true, "relay_heights");
    expect(freqs[0]).toBeGreaterThan(nodePitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the thud", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function nodePitch");
    expect(audio).toContain("from: nodePitch(place), to: 50, gain: 0.5");
    expect(audio).toContain("const base = mine ? 440 : 330");
    expect(game).toContain("this.audio.nodeFlip(ev.b === this.player.team, this.world.level.name)");
    expect(game).toContain("this.audio.nodeFlip(ev.team === this.player.team, this.world.level.name)");
    expect(game).toContain("this.audio.nodeFlip(true, this.world.level.name)");
  });
});
