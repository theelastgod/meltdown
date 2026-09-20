/**
 * The opening crawl asked for sound before there was anywhere to make it (Stage 177).
 *
 * A browser will not build an AudioContext without a user gesture, so `GameAudio.resume()` has to
 * be called from one. It was wired to a click on the canvas — and the crawl's overlay sits over
 * the canvas and calls `stopPropagation()` on its own clicks. For the whole ~35 s crawl nothing
 * ever reached that listener, so `crawlHum`, `crawlTick` and `tear` each counted themselves and
 * returned at `if (!this.ctx) return`. Measured in a real browser, before and after this stage, on
 * the same dev server: one key press over the crawl built **0** AudioContexts before, **1** after;
 * one click on the overlay, the same.
 *
 * The hum is the part that can be recovered. It is edge-triggered at the moment the first
 * paragraph starts typing — long before any gesture — so the request has to outlive the missing
 * context. A tick and a tear are one-shots and are simply gone; a hum that runs for half a minute
 * is not.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { GameAudio } from "../client/audio";
import { readFileSync } from "node:fs";

/** The smallest WebAudio the constructor path touches, and a count of how many were built. */
function stubWebAudio(): { built: () => number; started: () => number; stopped: () => number } {
  let built = 0, started = 0, stopped = 0;
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
  const node = () => ({ connect(n: unknown) { return n; }, disconnect() {}, start() { started++; }, stop() { stopped++; }, frequency: param(), gain: param(), Q: param(), detune: param(), type: "", buffer: null, loop: false, playbackRate: param(), threshold: param(), ratio: param(), attack: param(), release: param(), knee: param(), pan: param(), delayTime: param() });
  class FakeContext {
    state = "running";
    currentTime = 0;
    sampleRate = 48000;
    destination = node();
    constructor() { built++; }
    createGain() { return node(); }
    createOscillator() { return node(); }
    createBiquadFilter() { return node(); }
    createDynamicsCompressor() { return node(); }
    createBufferSource() { return node(); }
    createStereoPanner() { return node(); }
    createDelay() { return node(); }
    createWaveShaper() { return node(); }
    createConvolver() { return node(); }
    createBuffer() { return { getChannelData: () => new Float32Array(16) }; }
    resume() { return Promise.resolve(); }
  }
  (globalThis as unknown as { window: unknown }).window = { AudioContext: FakeContext };
  return { built: () => built, started: () => started, stopped: () => stopped };
}

let stub: ReturnType<typeof stubWebAudio>;
beforeEach(() => { stub = stubWebAudio(); });
afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window; });

describe("crawl audio — a cue asked for before the gesture", () => {
  it("counts itself and makes no sound, because there is nowhere to make one", () => {
    const a = new GameAudio();
    a.crawlHum(true);
    a.crawlTick();
    a.tear();
    expect(stub.built(), "an AudioContext was built without a gesture").toBe(0);
    expect(a.fired.crawlHumOn).toBe(1);
    expect(a.fired.crawlTick).toBe(1);
    expect(a.fired.tear).toBe(1);
    expect(a.crawlHumming, "a hum with no context cannot be sounding").toBe(false);
  });

  it("and the hum starts as soon as the gesture arrives, because it was still wanted", () => {
    const a = new GameAudio();
    a.crawlHum(true);
    expect(a.crawlHumming).toBe(false);
    a.resume();
    expect(stub.built()).toBe(1);
    expect(a.crawlHumming, "the hum the crawl asked for never started").toBe(true);
    expect(stub.started(), "no oscillator was started").toBeGreaterThan(0);
  });

  it("a hum that was turned off again does not start on the gesture", () => {
    const a = new GameAudio();
    a.crawlHum(true);
    a.crawlHum(false); // the cut, before anyone touched anything
    a.resume();
    expect(a.crawlHumming, "a hum the crawl had already stopped came back").toBe(false);
  });

  it("a gesture with no hum wanted starts no hum", () => {
    const a = new GameAudio();
    a.resume();
    expect(a.crawlHumming).toBe(false);
  });

  it("resume is idempotent: a second gesture builds no second context and no second hum", () => {
    const a = new GameAudio();
    a.crawlHum(true);
    a.resume();
    a.resume();
    a.resume();
    expect(stub.built()).toBe(1);
    expect(a.crawlHumming).toBe(true);
    const started = stub.started();
    a.resume();
    expect(stub.started(), "resume restarted the hum it already had").toBe(started);
  });

  it("the hum still stops dead at the cut once it is sounding", () => {
    const a = new GameAudio();
    a.crawlHum(true);
    a.resume();
    expect(a.crawlHumming).toBe(true);
    a.crawlHum(false);
    expect(a.crawlHumming).toBe(false);
    expect(stub.stopped()).toBeGreaterThan(0);
  });
});

describe("crawl audio — the gesture the game listens for", () => {
  const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");

  it("a gesture anywhere in the document wakes the audio, in capture phase", () => {
    // The crawl overlay calls stopPropagation() on its own clicks, so a bubbling listener on the
    // canvas — which is what this was — never hears them. Capture is what makes it unblockable.
    const line = game.split("\n").find((l) => l.includes("addEventListener(ev, () => this.audio.resume()"));
    expect(line, "nothing wakes the audio on a document-level gesture").toBeDefined();
    expect(line).toMatch(/capture:\s*true/);
    for (const ev of ["pointerdown", "keydown", "touchstart"]) expect(line, `${ev} is not one of the waking gestures`).toContain(ev);
  });

  it("the crawl overlay still stops its own clicks from reaching the game underneath", () => {
    // the fix must not have been "stop swallowing the click": the crawl owns its clicks
    const crawl = readFileSync(new URL("../client/crawl.ts", import.meta.url), "utf8");
    expect(crawl).toContain("e.stopPropagation()");
  });
});
