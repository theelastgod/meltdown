/**
 * A mech beam does not open on the same note on every street.
 * Lease Row, the yard, and the indoor rooms keep the 55 the beam shipped with.
 * It still lands at 45. The crack stays 1600. Duration and gain stay.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_BEAM, beamPitch, GameAudio } from "../client/audio";
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

describe("each district opens a mech beam at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_BEAM).toBe(55);
    expect(beamPitch(undefined)).toBe(STREET_BEAM);
    expect(beamPitch("lease_row")).toBe(STREET_BEAM);
    expect(beamPitch("drainage_yard")).toBe(STREET_BEAM);
    expect(beamPitch("deadletter_office")).toBe(STREET_BEAM);
    expect(beamPitch("white_office")).toBe(STREET_BEAM);
    const pitches = CITY_DISTRICTS.map((id) => beamPitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(beamPitch("night_market")).toBeGreaterThan(STREET_BEAM);
    expect(beamPitch("deadletter_docks")).toBeLessThan(beamPitch("relay_heights"));
    for (const id of CITY_DISTRICTS) expect(beamPitch(id)).toBeGreaterThan(45);
  });

  it("plays that pitch, and the landing, the crack, and the gain stay put", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.mechBeam("lease_row");
    expect(freqs[0]).toBe(STREET_BEAM);
    expect(freqs).toContain(1600);
    expect(gains[0]).toBe(0.5);
    freqs.length = 0;
    live.mechBeam("night_market");
    expect(freqs[0]).toBe(beamPitch("night_market"));
    expect(freqs).toContain(1600);
    freqs.length = 0;
    live.mechBeam("deadletter_docks");
    expect(freqs[0]).toBe(beamPitch("deadletter_docks"));
    freqs.length = 0;
    live.mechBeam("relay_heights");
    expect(freqs[0]).toBeGreaterThan(beamPitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the beam", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function beamPitch");
    expect(audio).toContain("dur: 0.3, from: beamPitch(place), to: 45, gain: 0.5, type: \"sawtooth\"");
    expect(audio).toContain("dur: 0.25, freq: 1600, q: 0.5, gain: 0.3");
    expect(game).toContain("this.audio.mechBeam(this.world.level.name)");
    expect(game.match(/this\.audio\.mechBeam\(this\.world\.level\.name\)/g)?.length).toBe(2);
  });
});
