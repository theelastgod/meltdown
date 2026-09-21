/**
 * Explosion lights fade on the same clock as the sphere (Stage 192).
 *
 * intensity *= 0.85 per update made a 0.45 s blast 0.62 bright at 144 Hz and 13.4 at 60 Hz
 * at the halfway mark. The mesh already used (clock - born) / life.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ArsenalFx } from "../client/render/weapons";

describe("an explosion light ages in seconds, not frames", () => {
  it("is the same brightness after the same clock at 60 Hz and 144 Hz", () => {
    const run = (dt: number, n: number) => {
      const fx = new ArsenalFx(new THREE.Scene());
      fx.explosion({ x: 0, y: 1, z: 0 }, 4, 0xffb02e, true);
      for (let i = 0; i < n; i++) fx.update(dt);
      return fx.blastLights()[0] ?? 0;
    };
    const at144 = run(1 / 144, 32); // ≈ 0.222 s of a 0.45 s life → about half
    const at60 = run(1 / 60, 13); // ≈ 0.217 s
    expect(at144).toBeGreaterThan(50);
    expect(at60).toBeGreaterThan(50);
    expect(Math.abs(at144 - at60), `144 Hz ${at144.toFixed(2)} vs 60 Hz ${at60.toFixed(2)}`).toBeLessThan(3);
    // the per-frame 0.85 fade was 0.62 at 144 Hz and 13.4 at 60 Hz here
    expect(at144).toBeGreaterThan(40);
  });
});
