/**
 * A charge spool does not open at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 300 the saw shipped with.
 * The step stays 900. The rise stays 20. Duration stays 0.08. Gain stays 0.06.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_SPOOL, spoolPitch, GameAudio } from "../client/audio";
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

describe("each district opens a charge spool at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_SPOOL).toBe(300);
    expect(spoolPitch(undefined)).toBe(STREET_SPOOL);
    expect(spoolPitch("lease_row")).toBe(STREET_SPOOL);
    expect(spoolPitch("drainage_yard")).toBe(STREET_SPOOL);
    expect(spoolPitch("deadletter_office")).toBe(STREET_SPOOL);
    expect(spoolPitch("white_office")).toBe(STREET_SPOOL);
    const pitches = CITY_DISTRICTS.map((id) => spoolPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(spoolPitch("night_market")).toBeGreaterThan(STREET_SPOOL);
    expect(spoolPitch("deadletter_docks")).toBeLessThan(spoolPitch("relay_heights"));
  });

  it("plays that pitch, and the step, the rise, and the gain stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.charge(0, "lease_row");
    expect(freqs[0]).toBe(STREET_SPOOL);
    expect(gains[0]).toBeCloseTo(0.06);
    freqs.length = 0;
    live.charge(1, "lease_row");
    expect(freqs[0]).toBe(STREET_SPOOL + 900);
    freqs.length = 0;
    live.charge(0, "night_market");
    expect(freqs[0]).toBe(spoolPitch("night_market"));
    freqs.length = 0;
    live.charge(0, "deadletter_docks");
    expect(freqs[0]).toBe(spoolPitch("deadletter_docks"));
    freqs.length = 0;
    live.charge(0, "relay_heights");
    expect(freqs[0]).toBeGreaterThan(spoolPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the saw", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function spoolPitch");
    expect(audio).toContain("const open = spoolPitch(place) + level * 900");
    expect(audio).toContain('dur: 0.08, from: open, to: open + 20, gain: 0.06, type: "sawtooth"');
    expect(game).toContain("this.audio.charge(this.player.weapon.charge, this.world.level.name)");
    expect(game.match(/this\.audio\.charge\(1, this\.world\.level\.name\)/g)?.length).toBe(2);
  });
});
