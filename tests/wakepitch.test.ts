/**
 * The wake fanfare does not open at the same pitch on every street.
 * Lease Row, the yard, and the indoor rooms keep the 330 the figure shipped with.
 * The rest stays 415, 494, 660. Duration stays 0.22. Gain stays 0.08. The gap stays 0.09.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_WAKE, wakePitch, GameAudio } from "../client/audio";
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

describe("each district opens the wake fanfare at its own pitch", () => {
  it("keeps the street pitch and gives the other nineteen their own", () => {
    expect(STREET_WAKE).toBe(330);
    expect(wakePitch(undefined)).toBe(STREET_WAKE);
    expect(wakePitch("lease_row")).toBe(STREET_WAKE);
    expect(wakePitch("drainage_yard")).toBe(STREET_WAKE);
    expect(wakePitch("deadletter_office")).toBe(STREET_WAKE);
    expect(wakePitch("white_office")).toBe(STREET_WAKE);
    const pitches = CITY_DISTRICTS.map((id) => wakePitch(id));
    expect(new Set(pitches).size).toBe(CITY_DISTRICTS.length);
    expect(wakePitch("night_market")).toBeGreaterThan(STREET_WAKE);
    expect(wakePitch("deadletter_docks")).toBeLessThan(wakePitch("relay_heights"));
    for (const id of CITY_DISTRICTS) expect(wakePitch(id)).toBeGreaterThan(160);
  });

  it("opens on that pitch and keeps the rest of the figure", () => {
    const live = new GameAudio();
    live.resume();
    freqs.length = 0;
    gains.length = 0;
    live.wakeBegins("lease_row");
    expect(freqs[0]).toBe(STREET_WAKE);
    expect(freqs).toEqual([330, 415, 494, 660]);
    expect(gains[0]).toBeCloseTo(0.08);
    freqs.length = 0;
    gains.length = 0;
    live.wakeBegins("night_market");
    expect(freqs[0]).toBe(wakePitch("night_market"));
    expect(freqs.slice(1)).toEqual([415, 494, 660]);
    expect(gains[0]).toBeCloseTo(0.08);
    freqs.length = 0;
    live.wakeBegins("deadletter_docks");
    expect(freqs[0]).toBe(wakePitch("deadletter_docks"));
    freqs.length = 0;
    live.wakeBegins("relay_heights");
    expect(freqs[0]).toBeGreaterThan(wakePitch("deadletter_docks"));
  });

  it("fails closed if the read is removed from the fanfare", () => {
    const audio = readFileSync(new URL("../client/audio.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(audio).toContain("function wakePitch");
    expect(audio).toContain("for (const [i, f] of [wakePitch(place), 415, 494, 660].entries()) this.tone({ dur: 0.22, from: f, gain: 0.08, type: \"triangle\", delay: 0.09 * i });");
    expect(game.split("this.audio.wakeBegins(this.world.level.name)").length - 1).toBe(2);
    expect(game).not.toContain("this.audio.wakeBegins()");
  });
});
