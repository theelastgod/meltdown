/**
 * The reflector's bed is a tone, not a surface (Stage 736).
 *
 * Sampling the plaza slab on the pass that already draws the street adds no draw call.
 * Dividing by the plate's average luma keeps the bed where Stage 657 put it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SLAB_LUMA, SLAB_TILE_M, stoneGain } from "../client/render/wetfloor";

describe("the wet floor's stone", () => {
  const src = readFileSync(new URL("../client/render/wetfloor.ts", import.meta.url), "utf8");

  it("multiplies the bed by the slab and divides that average back out", () => {
    expect(src).toMatch(/uniform sampler2D tAlbedo/);
    expect(src).toMatch(/texture2D\(tAlbedo, vWorld\.xz \/ \$\{SLAB_TILE_M\}\.0\)/);
    expect(src).toMatch(/float stone = lum \/ albedoMean/);
    expect(src).toMatch(/base \*= stone/);
    expect(src).toMatch(/assetTexture\("tex_plaza_slab"\)/);
    expect(src).toMatch(/mat\.uniforms\.albedoMean\.value = SLAB_LUMA/);
    // the Stage 657 tone is still the bed under the stone
    expect(src).toMatch(/vec3\(0\.024, 0\.029, 0\.041\)/);
    expect(SLAB_TILE_M).toBe(8);
    expect(stoneGain(SLAB_LUMA)).toBeCloseTo(1);
    expect(stoneGain(SLAB_LUMA * 0.5)).toBeCloseTo(0.5);
    // a plate that has not arrived is white over a mean of 1, which is the old bed
    expect(src).toMatch(/albedoMean: \{ value: 1 \}/);
  });
});
