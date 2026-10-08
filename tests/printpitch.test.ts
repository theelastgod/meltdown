/**
 * A receipt line does not open at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 2600 the chatter shipped with.
 * The step stays 300. Duration stays 0.02. Q stays 3. Gain stays 0.08.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_PRINT, printPitch, GameAudio } from "../client/audio";
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

describe("each district opens a receipt line at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_PRINT).toBe(2600);
    expect(printPitch(undefined)).toBe(STREET_PRINT);
    expect(printPitch("lease_row")).toBe(STREET_PRINT);
    expect(printPitch("drainage_yard")).toBe(STREET_PRINT);
    expect(printPitch("deadletter_office")).toBe(STREET_PRINT);
    expect(printPitch("white_office")).toBe(STREET_PRINT);
    const pitches = CITY_DISTRICTS.map((id) => printPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(printPitch("night_market")).toBeGreaterThan(STREET_PRINT);
    expect(printPitch("deadletter_docks")).toBeLessThan(printPitch("relay_heights"));
  });

  it("plays that pitch, and the step, the gain, and the later dots stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.printTick("lease_row");
    expect(freqs[0]).toBe(STREET_PRINT);
    expect(freqs[1]).toBe(STREET_PRINT + 300);
    expect(freqs[2]).toBe(STREET_PRINT + 600);
    expect(freqs[3]).toBe(STREET_PRINT + 900);
    expect(gains[0]).toBeCloseTo(0.08);
    freqs.length = 0;
    live.printTick("night_market");
    expect(freqs[0]).toBe(printPitch("night_market"));
    expect(freqs[1]).toBe(printPitch("night_market") + 300);
    freqs.length = 0;
    live.printTick("deadletter_docks");
    expect(freqs[0]).toBe(printPitch("deadletter_docks"));
    freqs.length = 0;
    live.printTick("relay_heights");
    expect(freqs[0]).toBeGreaterThan(printPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the chatter", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    const campaign = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(audio).toContain("function printPitch");
    expect(audio).toContain("freq: printPitch(place) + i * 300, q: 3, gain: 0.08, delay: i * 0.03");
    expect(game).toContain("this.audio.printTick(this.world.level.name)");
    expect(campaign).toContain("this.game.audio.printTick(this.game.world.level.name)");
  });
});
