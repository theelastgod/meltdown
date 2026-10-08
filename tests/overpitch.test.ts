/**
 * The round-over drone does not open at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 55 the drone shipped with.
 * It still lands at 40. Duration stays 1.4. Gain stays 0.35. The figure stays the outcome's notes.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_OVER, overPitch, GameAudio } from "../client/audio";
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

describe("each district opens the round-over drone at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_OVER).toBe(55);
    expect(overPitch(undefined)).toBe(STREET_OVER);
    expect(overPitch("lease_row")).toBe(STREET_OVER);
    expect(overPitch("drainage_yard")).toBe(STREET_OVER);
    expect(overPitch("deadletter_office")).toBe(STREET_OVER);
    expect(overPitch("white_office")).toBe(STREET_OVER);
    const pitches = CITY_DISTRICTS.map((id) => overPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(overPitch("night_market")).toBeGreaterThan(STREET_OVER);
    expect(overPitch("deadletter_docks")).toBeLessThan(overPitch("relay_heights"));
    for (const id of CITY_DISTRICTS) expect(overPitch(id)).toBeGreaterThan(40);
  });

  it("opens on that pitch and keeps the figure", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.roundOver("won", "lease_row");
    expect(freqs.slice(0, 4)).toEqual([392, 494, 587, 784]);
    expect(freqs[4]).toBe(STREET_OVER);
    expect(gains[4]).toBeCloseTo(0.35);
    expect(gains[0]).toBeCloseTo(0.09);
    freqs.length = 0;
    gains.length = 0;
    live.roundOver("won", "night_market");
    expect(freqs.slice(0, 4)).toEqual([392, 494, 587, 784]);
    expect(freqs[4]).toBe(overPitch("night_market"));
    expect(gains[4]).toBeCloseTo(0.35);
    freqs.length = 0;
    live.roundOver("lost", "deadletter_docks");
    expect(freqs.slice(0, 4)).toEqual([523, 440, 349, 262]);
    expect(freqs[4]).toBe(overPitch("deadletter_docks"));
    freqs.length = 0;
    live.roundOver("none", "relay_heights");
    expect(freqs.slice(0, 3)).toEqual([440, 440, 440]);
    expect(freqs[3]).toBeGreaterThan(overPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the drone", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function overPitch");
    expect(audio).toContain("this.tone({ dur: 1.4, from: overPitch(place), to: 40, gain: 0.35 });");
    expect(game.split('this.audio.roundOver(').length - 1).toBe(2);
    expect(game).toContain('this.audio.roundOver(ev.b === 0 ? "none" : ev.b === this.player.team ? "won" : "lost", this.world.level.name)');
    expect(game).toContain('this.audio.roundOver(ev.winner === 0 ? "none" : ev.winner === this.player.team ? "won" : "lost", this.world.level.name)');
    expect(game).not.toContain('this.audio.roundOver(ev.b === 0 ? "none" : ev.b === this.player.team ? "won" : "lost")');
    expect(game).not.toContain('this.audio.roundOver(ev.winner === 0 ? "none" : ev.winner === this.player.team ? "won" : "lost")');
  });
});
