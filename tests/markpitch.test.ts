/**
 * A landed body does not mark at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 1100 the body marker shipped with.
 * The tone still lasts 0.07 seconds, falls to 0.6 of its start, and stays gain 0.22 triangle.
 * Head stays 2200. Legs stay 600. The crack stays 1.5 times the tone.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_MARK, markPitch, GameAudio } from "../client/audio";
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

describe("each district marks a body at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_MARK).toBe(1100);
    expect(markPitch(undefined)).toBe(STREET_MARK);
    expect(markPitch("lease_row")).toBe(STREET_MARK);
    expect(markPitch("drainage_yard")).toBe(STREET_MARK);
    expect(markPitch("deadletter_office")).toBe(STREET_MARK);
    expect(markPitch("white_office")).toBe(STREET_MARK);
    const pitches = CITY_DISTRICTS.map((id) => markPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(markPitch("night_market")).toBeGreaterThan(STREET_MARK);
    expect(markPitch("deadletter_docks")).toBeLessThan(markPitch("relay_heights"));
  });

  it("plays that pitch, and the head, the legs, the fall, and the crack stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.hit("body", "lease_row");
    expect(freqs[0]).toBe(STREET_MARK);
    expect(gains[0]).toBe(0.22);
    expect(freqs[1]).toBe(STREET_MARK * 1.5);
    freqs.length = 0;
    gains.length = 0;
    live.hit("body", "night_market");
    expect(freqs[0]).toBe(markPitch("night_market"));
    expect(freqs[1]).toBe(markPitch("night_market") * 1.5);
    freqs.length = 0;
    live.hit("body", "deadletter_docks");
    expect(freqs[0]).toBe(markPitch("deadletter_docks"));
    freqs.length = 0;
    live.hit("body", "relay_heights");
    expect(freqs[0]).toBeGreaterThan(markPitch("deadletter_docks"));
    freqs.length = 0;
    live.hit("head", "night_market");
    expect(freqs[0]).toBe(2200);
    freqs.length = 0;
    live.hit("legs", "night_market");
    expect(freqs[0]).toBe(600);
  });

  it("fails closed if the read is removed from the hit", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function markPitch");
    expect(audio).toContain("markPitch(place)");
    expect(audio).toContain("zone === \"head\" ? 2200 : zone === \"body\" ? markPitch(place) : 600");
    expect(audio).toContain("dur: 0.07, from: f, to: f * 0.6, gain: 0.22, type: \"triangle\"");
    expect(audio).toContain("dur: 0.05, freq: f * 1.5, q: 2, gain: 0.12");
    expect(game.match(/this\.audio\.hit\([^)]*this\.world\.level\.name\)/g)?.length).toBe(4);
  });
});
