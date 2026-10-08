/**
 * A debt sting does not open at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 1047 the sting shipped with.
 * The rest stays 1319, 1568. Duration stays 0.3. Gain stays 0.07. The gap stays 0.12.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_OWE, owePitch, GameAudio } from "../client/audio";
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

describe("each district opens the debt sting at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_OWE).toBe(1047);
    expect(owePitch(undefined)).toBe(STREET_OWE);
    expect(owePitch("lease_row")).toBe(STREET_OWE);
    expect(owePitch("drainage_yard")).toBe(STREET_OWE);
    expect(owePitch("deadletter_office")).toBe(STREET_OWE);
    expect(owePitch("white_office")).toBe(STREET_OWE);
    const pitches = CITY_DISTRICTS.map((id) => owePitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(owePitch("night_market")).toBeGreaterThan(STREET_OWE);
    expect(owePitch("deadletter_docks")).toBeLessThan(owePitch("relay_heights"));
    for (const id of CITY_DISTRICTS) expect(owePitch(id)).toBeGreaterThan(40);
  });

  it("opens on that pitch and keeps the rest of the sting", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.debtOwed("lease_row");
    expect(freqs).toEqual([STREET_OWE, 1319, 1568]);
    expect(gains[0]).toBeCloseTo(0.07);
    expect(gains[1]).toBeCloseTo(0.07);
    expect(gains[2]).toBeCloseTo(0.07);
    freqs.length = 0;
    gains.length = 0;
    live.debtOwed("night_market");
    expect(freqs[0]).toBe(owePitch("night_market"));
    expect(freqs.slice(1)).toEqual([1319, 1568]);
    expect(gains[0]).toBeCloseTo(0.07);
    freqs.length = 0;
    live.debtOwed("deadletter_docks");
    expect(freqs[0]).toBe(owePitch("deadletter_docks"));
    expect(freqs.slice(1)).toEqual([1319, 1568]);
    freqs.length = 0;
    live.debtOwed("relay_heights");
    expect(freqs[0]).toBeGreaterThan(owePitch("deadletter_docks"));
    expect(freqs.slice(1)).toEqual([1319, 1568]);
  });

  it("fails closed if the read is removed from the sting", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    const campaign = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(audio).toContain("function owePitch");
    expect(audio).toContain('for (const [i, f] of [owePitch(place), 1319, 1568].entries()) this.tone({ dur: 0.3, from: f, gain: 0.07, type: "square", delay: i * 0.12 });');
    expect(game).toContain("this.audio.debtOwed(this.world.level.name)");
    expect(game).not.toContain("this.audio.debtOwed()");
    expect(campaign.split("this.game.audio.debtOwed(this.game.world.level.name)").length - 1).toBe(3);
    expect(campaign).not.toContain("this.game.audio.debtOwed()");
  });
});
