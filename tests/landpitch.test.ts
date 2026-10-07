/**
 * A landing does not thump at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 300 the land shipped with.
 * The drop stays 120 to 50. Duration stays 0.08, Q stays 0.6, and gain stays 0.12.
 * Speed still adds the same cap on the drop.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_LAND, landPitch, GameAudio } from "../client/audio";
import { CITY_DISTRICTS } from "../shared/net/city";

const freqs: number[] = [];
const qs: number[] = [];
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
  const node = () => ({ connect(n: unknown) { return n; }, disconnect() {}, start() {}, stop() {}, frequency: param(freqs), gain: param(gains), Q: param(qs), detune: param(), type: "", buffer: null, loop: false, playbackRate: param(), threshold: param(), ratio: param(), attack: param(), release: param(), knee: param(), pan: param(), delayTime: param() });
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

beforeEach(() => { freqs.length = 0; qs.length = 0; gains.length = 0; stubWebAudio(); });
afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window; });

describe("each district thumps a landing at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_LAND).toBe(300);
    expect(landPitch(undefined)).toBe(STREET_LAND);
    expect(landPitch("lease_row")).toBe(STREET_LAND);
    expect(landPitch("drainage_yard")).toBe(STREET_LAND);
    expect(landPitch("deadletter_office")).toBe(STREET_LAND);
    expect(landPitch("white_office")).toBe(STREET_LAND);
    const pitches = CITY_DISTRICTS.map((id) => landPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(landPitch("night_market")).toBeGreaterThan(STREET_LAND);
    expect(landPitch("deadletter_docks")).toBeLessThan(landPitch("relay_heights"));
  });

  it("plays that pitch, and the drop, duration, Q, and gain stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    qs.length = 0;
    gains.length = 0;
    live.land(2, "lease_row");
    expect(freqs[0]).toBe(120);
    expect(freqs.at(-1)).toBe(STREET_LAND);
    expect(qs.at(-1)).toBe(0.6);
    expect(gains[0]).toBe(0.15 + Math.min(0.2, 2 * 0.02));
    expect(gains.at(-1)).toBe(0.12);
    freqs.length = 0;
    live.land(2, "night_market");
    expect(freqs.at(-1)).toBe(landPitch("night_market"));
    freqs.length = 0;
    live.land(2, "deadletter_docks");
    expect(freqs.at(-1)).toBe(landPitch("deadletter_docks"));
    freqs.length = 0;
    live.land(2, "relay_heights");
    expect(freqs.at(-1)).toBeGreaterThan(landPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the landing", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function landPitch");
    expect(audio).toContain("freq: landPitch(place)");
    expect(audio).toContain("from: 120, to: 50");
    expect(audio).toContain("dur: 0.08, freq: landPitch(place), q: 0.6, gain: 0.12");
    expect(game).toContain("this.audio.land(ev.speed, this.world.level.name)");
  });
});
