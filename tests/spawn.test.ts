/**
 * The respawn was a cut (Stage 96): the spawn-in's shape and the edge that starts it.
 */
import { describe, expect, it } from "vitest";
import { spawnCurve, spawnEdge, SPAWN_CRT, SPAWN_FOV, SPAWN_TIME } from "../client/render/spawn";

describe("the spawn-in", () => {
  it("starts heavy and pulled in, and is exactly nothing at the end", () => {
    const start = spawnCurve(0);
    expect(start.crt).toBeCloseTo(SPAWN_CRT, 6);
    expect(start.fov).toBeCloseTo(-SPAWN_FOV, 6);
    expect(start.live).toBe(true);
    const end = spawnCurve(SPAWN_TIME);
    expect(end).toEqual({ crt: 0, fov: 0, live: false });
    expect(spawnCurve(SPAWN_TIME * 3)).toEqual({ crt: 0, fov: 0, live: false });
  });

  it("only ever settles: never rises again, never overshoots", () => {
    let prev = spawnCurve(0);
    for (let t = 0.01; t <= SPAWN_TIME; t += 0.01) {
      const s = spawnCurve(t);
      expect(s.crt).toBeLessThanOrEqual(prev.crt + 1e-9);
      expect(s.fov).toBeGreaterThanOrEqual(prev.fov - 1e-9);
      expect(s.crt).toBeGreaterThanOrEqual(0);
      expect(s.fov).toBeLessThanOrEqual(0);
      prev = s;
    }
  });

  it("is steep at the start and flat at the end: a picture arriving, not drifting", () => {
    const early = spawnCurve(0).crt - spawnCurve(0.1).crt;
    const late = spawnCurve(SPAWN_TIME - 0.1).crt - spawnCurve(SPAWN_TIME - 1e-6).crt;
    expect(early).toBeGreaterThan(late * 3);
  });

  it("has nothing to say before the file has come back", () => {
    expect(spawnCurve(-0.5)).toEqual({ crt: 0, fov: 0, live: false });
  });
});

describe("the edge that starts it", () => {
  it("fires on the frame a dead file is alive again, and on no other", () => {
    expect(spawnEdge(false, true)).toBe(true);
    expect(spawnEdge(true, true)).toBe(false);
    expect(spawnEdge(true, false)).toBe(false);
    expect(spawnEdge(false, false)).toBe(false);
  });
});
