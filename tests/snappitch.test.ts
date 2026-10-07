/**
 * A round going past does not snap at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 4200 the snap shipped with.
 * The air closing behind it stays 1900. Duration, Q, and gain stay put.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_SNAP, snapPitch, GameAudio } from "../client/audio";
import { CITY_DISTRICTS } from "../shared/net/city";

const freqs: number[] = [];

function stubWebAudio(): void {
  const param = (bucket?: number[]) => {
    let v = 0;
    return {
      get value() { return v; },
      set value(n: number) { v = n; bucket?.push(n); },
      setValueAtTime(n: number) { v = n; },
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {},
      cancelScheduledValues() {},
    };
  };
  const node = () => ({ connect(n: unknown) { return n; }, disconnect() {}, start() {}, stop() {}, frequency: param(freqs), gain: param(), Q: param(), detune: param(), type: "", buffer: null, loop: false, playbackRate: param(), threshold: param(), ratio: param(), attack: param(), release: param(), knee: param(), pan: param(), delayTime: param() });
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

beforeEach(() => { freqs.length = 0; stubWebAudio(); });
afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window; });

const cue = { gain: 1, pan: 0.4, distance: 0.4 };

describe("each district snaps a near miss at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_SNAP).toBe(4200);
    expect(snapPitch(undefined)).toBe(STREET_SNAP);
    expect(snapPitch("lease_row")).toBe(STREET_SNAP);
    expect(snapPitch("drainage_yard")).toBe(STREET_SNAP);
    expect(snapPitch("deadletter_office")).toBe(STREET_SNAP);
    expect(snapPitch("white_office")).toBe(STREET_SNAP);
    const pitches = CITY_DISTRICTS.map((id) => snapPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(snapPitch("night_market")).toBeGreaterThan(STREET_SNAP);
    expect(snapPitch("deadletter_docks")).toBeLessThan(snapPitch("relay_heights"));
  });

  it("plays that pitch, and the air behind it stays 1900", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    live.snap(cue, "lease_row");
    expect(freqs).toEqual([STREET_SNAP, 1900]);
    freqs.length = 0;
    live.snap(cue, "night_market");
    expect(freqs).toEqual([snapPitch("night_market"), 1900]);
    freqs.length = 0;
    live.snap(cue, "deadletter_docks");
    expect(freqs[0]).toBe(snapPitch("deadletter_docks"));
    expect(freqs[1]).toBe(1900);
    freqs.length = 0;
    live.snap(cue, "relay_heights");
    expect(freqs[0]).toBeGreaterThan(snapPitch("deadletter_docks"));
    expect(freqs[1]).toBe(1900);
    freqs.length = 0;
    live.snap({ gain: 0, pan: 0, distance: 0.1 }, "night_market");
    expect(freqs).toEqual([]);
  });

  it("fails closed if the read is removed from the snap", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function snapPitch");
    expect(audio).toContain("freq: snapPitch(place)");
    expect(audio).toContain("freq: 1900");
    expect(audio).toContain("delay: 0.012");
    expect(game).toContain("this.audio.snap(cue, this.world.level.name)");
  });
});
