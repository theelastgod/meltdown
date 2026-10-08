/**
 * A choke does not rack on at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 1800 the click shipped with.
 * The off click stays 1300. The follow stays 900 when on and 650 when off.
 * Duration stays 0.03 then 0.05. Q stays 2.5 then 1.2. Gain stays 0.12 then 0.1.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_CHOKE, chokePitch, GameAudio } from "../client/audio";
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

describe("each district racks a choke on at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_CHOKE).toBe(1800);
    expect(chokePitch(undefined)).toBe(STREET_CHOKE);
    expect(chokePitch("lease_row")).toBe(STREET_CHOKE);
    expect(chokePitch("drainage_yard")).toBe(STREET_CHOKE);
    expect(chokePitch("deadletter_office")).toBe(STREET_CHOKE);
    expect(chokePitch("white_office")).toBe(STREET_CHOKE);
    const pitches = CITY_DISTRICTS.map((id) => chokePitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(chokePitch("night_market")).toBeGreaterThan(STREET_CHOKE);
    expect(chokePitch("deadletter_docks")).toBeLessThan(chokePitch("relay_heights"));
  });

  it("plays that pitch, and the off click, the follow, and the gain stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.altToggle(true, "lease_row");
    expect(freqs[0]).toBe(STREET_CHOKE);
    expect(freqs[1]).toBe(900);
    expect(gains[0]).toBeCloseTo(0.12);
    expect(gains[1]).toBeCloseTo(0.1);
    freqs.length = 0;
    live.altToggle(false, "lease_row");
    expect(freqs[0]).toBe(1300);
    expect(freqs[1]).toBe(650);
    freqs.length = 0;
    live.altToggle(true, "night_market");
    expect(freqs[0]).toBe(chokePitch("night_market"));
    expect(freqs[1]).toBe(900);
    freqs.length = 0;
    live.altToggle(true, "deadletter_docks");
    expect(freqs[0]).toBe(chokePitch("deadletter_docks"));
    freqs.length = 0;
    live.altToggle(true, "relay_heights");
    expect(freqs[0]).toBeGreaterThan(chokePitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the click", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function chokePitch");
    expect(audio).toContain("freq: on ? chokePitch(place) : 1300");
    expect(audio).toContain('freq: on ? 900 : 650, q: 1.2, gain: 0.1, type: "lowpass", delay: 0.05');
    expect(game).toContain("this.audio.altToggle(ev.on, this.world.level.name)");
  });
});
