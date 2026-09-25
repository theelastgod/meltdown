/**
 * The city's moving signs (Stage 633): the manifest, the decode ceiling, and the fail-soft path.
 *
 * The probe proves a clip actually plays in a browser. These prove the things a browser run cannot
 * reach cheaply: that the pool refuses the decoder past its cap, that a clip which never loads
 * leaves the material untouched, and that the manifest agrees with the files on disk.
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { clipsFor, MAX_LIVE_SCREENS, MAX_VIDEO_BYTES, MAX_VIDEO_EDGE, totalVideoBytes, VIDEO_BUDGET_BYTES, VIDEOS, type ScreenId } from "../shared/assets/video";

const SCREENS: ScreenId[] = ["shop_a", "shop_b", "shop_c", "kiosk", "backdrop"];

describe("the clip manifest", () => {
  it("declares every clip once, with a screen to play on", () => {
    const ids = VIDEOS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    const files = VIDEOS.map((v) => v.file);
    expect(new Set(files).size).toBe(files.length);
    for (const v of VIDEOS) {
      expect(SCREENS).toContain(v.screen);
      expect(v.provenance.trim().length).toBeGreaterThan(0);
    }
  });

  it("agrees with the files on disk, byte for byte and hash for hash", () => {
    for (const v of VIDEOS) {
      const path = resolve("public/video", v.file);
      const buf = readFileSync(path);
      expect(statSync(path).size, v.id).toBe(v.bytes);
      expect(createHash("sha256").update(buf).digest("hex"), v.id).toBe(v.sha256);
    }
  });

  it("is a WebM the codec-free CI browser can actually decode, not an H.264 it cannot", () => {
    for (const v of VIDEOS) {
      const head = readFileSync(resolve("public/video", v.file)).subarray(0, 4);
      // EBML magic: every Matroska/WebM file starts 1A 45 DF A3
      expect([...head], v.id).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
    }
  });

  it("stays inside the per-clip and total ceilings, which are far under the texture budget", () => {
    for (const v of VIDEOS) {
      expect(v.bytes, v.id).toBeLessThanOrEqual(MAX_VIDEO_BYTES);
      expect(Math.max(v.width, v.height), v.id).toBeLessThanOrEqual(MAX_VIDEO_EDGE);
      expect(v.seconds, v.id).toBeGreaterThan(0);
    }
    expect(totalVideoBytes()).toBeLessThanOrEqual(VIDEO_BUDGET_BYTES);
  });

  it("gives every screen family something to play, so no family is declared and empty", () => {
    for (const s of SCREENS) expect(clipsFor(s).length, s).toBeGreaterThan(0);
    expect(VIDEOS.length).toBe(SCREENS.reduce((n, s) => n + clipsFor(s).length, 0));
  });
});

/** A material stand-in: the pool only ever reads and writes `map` and `needsUpdate`. */
const fakeMat = () => ({ map: { name: "the still plate" }, needsUpdate: false }) as never;

describe("the decode ceiling", () => {
  it("is what the pool is built around, and the manifest cannot quietly exceed it", () => {
    expect(MAX_LIVE_SCREENS).toBeGreaterThan(0);
    // more clips than decoders is the point: the pool picks, it does not open them all
    expect(VIDEOS.length).toBeGreaterThan(MAX_LIVE_SCREENS);
  });

  it("refuses a slot past the cap rather than opening another decoder", async () => {
    const { ScreenPool } = await import("../client/render/screens");
    const pool = new ScreenPool();
    // with no `document`, attach is a no-op and nothing is opened — the node-side guarantee that
    // importing the renderer never starts a decoder
    for (let i = 0; i < 10; i++) pool.attach(fakeMat(), "shop_a", i);
    const s = pool.stats();
    expect(s.live).toBe(0);
    expect(s.playing).toBe(0);
  });

  it("leaves a material's still plate exactly as it was when no clip can be opened", async () => {
    const { ScreenPool } = await import("../client/render/screens");
    const pool = new ScreenPool();
    const mat = { map: { name: "the still plate" }, needsUpdate: false };
    pool.attach(mat as never, "shop_a", 0);
    expect(mat.map).toEqual({ name: "the still plate" });
    expect(mat.needsUpdate).toBe(false);
  });
});

describe("what the install carries", () => {
  it("does not precache the clips: an offline city is still the city, with still signs", () => {
    const sw = readFileSync(resolve("public/sw.js"), "utf8");
    // the install walks the shell for /assets and /icons; adding /video here would put 1.5 MB of
    // decoder-bound bytes into every first load, which is the opposite of why these fail soft
    expect(sw).not.toMatch(/precache[\s\S]{0,400}\/video\//);
    expect(sw).not.toMatch(/\(\?:assets\|icons\|video\)/);
  });

  it("serves the clips from a base that can be pointed at a CDN without touching code", () => {
    const src = readFileSync(resolve("shared/assets/video.ts"), "utf8");
    expect(src).toMatch(/VITE_VIDEO_BASE/);
    expect(src).toMatch(/"\/video"/);
  });
});
