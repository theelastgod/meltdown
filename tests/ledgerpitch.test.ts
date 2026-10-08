/**
 * Coming back onto the ledger does not open at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 330 the chime shipped with.
 * It still arrives at 440, then climbs 440 to 660. The 1800 Hz hiss stays.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_LEDGER, ledgerPitch, GameAudio } from "../client/audio";
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

describe("each district opens the ledger at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_LEDGER).toBe(330);
    expect(ledgerPitch(undefined)).toBe(STREET_LEDGER);
    expect(ledgerPitch("lease_row")).toBe(STREET_LEDGER);
    expect(ledgerPitch("drainage_yard")).toBe(STREET_LEDGER);
    expect(ledgerPitch("deadletter_office")).toBe(STREET_LEDGER);
    expect(ledgerPitch("white_office")).toBe(STREET_LEDGER);
    const pitches = CITY_DISTRICTS.map((id) => ledgerPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(ledgerPitch("night_market")).toBeGreaterThan(STREET_LEDGER);
    expect(ledgerPitch("deadletter_docks")).toBeLessThan(ledgerPitch("relay_heights"));
  });

  it("plays that pitch, and the arrival, the second climb, the hiss, and the gains stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.respawn("lease_row");
    expect(freqs[0]).toBe(STREET_LEDGER);
    expect(freqs[1]).toBe(440);
    expect(freqs[2]).toBe(1800);
    expect(gains[0]).toBe(0.12);
    expect(gains[1]).toBe(0.1);
    expect(gains[2]).toBe(0.08);
    freqs.length = 0;
    live.respawn("night_market");
    expect(freqs[0]).toBe(ledgerPitch("night_market"));
    expect(freqs[1]).toBe(440);
    expect(freqs[2]).toBe(1800);
    freqs.length = 0;
    live.respawn("deadletter_docks");
    expect(freqs[0]).toBe(ledgerPitch("deadletter_docks"));
    freqs.length = 0;
    live.respawn("relay_heights");
    expect(freqs[0]).toBeGreaterThan(ledgerPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the ledger", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function ledgerPitch");
    expect(audio).toContain('dur: 0.12, from: ledgerPitch(place), to: 440, gain: 0.12, type: "triangle"');
    expect(audio).toContain('dur: 0.18, from: 440, to: 660, gain: 0.1, type: "triangle", delay: 0.1');
    expect(audio).toContain('dur: 0.35, freq: 1800, q: 0.4, gain: 0.08, type: "highpass"');
    expect(game).toContain("this.audio.respawn(this.world.level.name)");
  });
});
