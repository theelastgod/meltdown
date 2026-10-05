/**
 * The five districts do not share a bed. Lease Row keeps the one the city already had.
 * The yard, the hub, and the white office keep it too.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { bedTune, GameAudio } from "../client/audio";

const NAMES = ["lease_row", "deadletter_docks", "repo_depot", "night_market", "relay_heights"] as const;

function stubWebAudio(): void {
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
  const node = () => ({ connect(n: unknown) { return n; }, disconnect() {}, start() {}, stop() {}, frequency: param(), gain: param(), Q: param(), detune: param(), type: "", buffer: null, loop: false, playbackRate: param(), threshold: param(), ratio: param(), attack: param(), release: param(), knee: param(), pan: param(), delayTime: param() });
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

beforeEach(() => stubWebAudio());
afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window; });

describe("each district has its own bed", () => {
  it("the five tunes are not equal, and the rooms that are not districts keep Lease Row", () => {
    const tunes = NAMES.map((n) => bedTune(n));
    for (let i = 0; i < tunes.length; i++) {
      for (let j = i + 1; j < tunes.length; j++) expect(tunes[i]).not.toEqual(tunes[j]);
    }
    const row = bedTune("lease_row");
    expect(row).toEqual({ rainHz: 3200, rainQ: 0.5, rain: 0.16, humHz: 48, hum: 0.12, buzzHz: 120, buzzCut: 900, buzz: 0.012 });
    expect(bedTune(undefined)).toEqual(row);
    expect(bedTune("drainage_yard")).toEqual(row);
    expect(bedTune("deadletter_office")).toEqual(row);
    expect(bedTune("white_office")).toEqual(row);
    const docks = bedTune("deadletter_docks");
    expect(docks.rainHz).toBeLessThan(row.rainHz);
    expect(docks.rain).toBeGreaterThan(row.rain);
    expect(docks.humHz).toBeLessThan(row.humHz);
    const depot = bedTune("repo_depot");
    expect(depot.humHz).toBeGreaterThan(row.humHz);
    expect(depot.rain).toBeLessThan(row.rain);
    const market = bedTune("night_market");
    expect(market.rainHz).toBeGreaterThan(row.rainHz);
    expect(market.buzz).toBeGreaterThan(row.buzz);
    expect(market.buzzCut).toBeGreaterThan(row.buzzCut);
    const heights = bedTune("relay_heights");
    expect(heights.humHz).toBeGreaterThan(row.humHz);
    expect(heights.buzzHz).toBeGreaterThan(row.buzzHz);
    expect(heights.rain).toBeLessThan(row.rain * 0.25);
  });

  it("applies when the bed starts, and again when the file is already inside one", () => {
    const early = new GameAudio();
    early.tune("deadletter_docks");
    expect(early.bedNow()).toBeNull();
    early.resume();
    expect(early.bedNow()).toEqual(bedTune("deadletter_docks"));
    const live = new GameAudio();
    live.resume();
    expect(live.bedNow()).toEqual(bedTune("lease_row"));
    live.tune("relay_heights");
    expect(live.bedNow()).toEqual(bedTune("relay_heights"));
    live.tune("night_market");
    expect(live.bedNow()).toEqual(bedTune("night_market"));
  });

  it("the client tunes the bed from the level it built", () => {
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toContain("this.audio.tune(this.world.level.name)");
  });
});
