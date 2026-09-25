import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

const pending = vi.hoisted(() => new Map<string, (texture: unknown) => void>());
vi.mock("../client/render/assets", () => ({
  texture: (id: string) => new Promise((resolve) => pending.set(id, resolve)),
}));

import { VfxPool } from "../client/render/vfx";
import { WARM_FRAMES } from "../client/render/warmup";

afterEach(() => pending.clear());

describe("late art on pooled effects", () => {
  it.each(["tex_lamp", "tex_spark"])("warms %s after it arrives without waiting for a shot", async (id) => {
    const pool = new VfxPool(new THREE.Scene());
    const plate = new THREE.Texture();
    try {
      for (let i = 0; i <= WARM_FRAMES; i++) pool.update(1);
      expect(pool.tracers.visible).toBe(false);
      expect(pool.sparks.visible).toBe(false);
      pending.get(id)!(plate);
      await Promise.resolve();
      const effect = id === "tex_lamp" ? pool.tracers : pool.sparks;
      expect((effect.material as THREE.MeshBasicMaterial).map).toBe(plate);
      expect(pool.live(1)).toBe(0);
      for (let i = 0; i < WARM_FRAMES; i++) {
        pool.update(1);
        expect(effect.visible, "draw the new mapped material before firing").toBe(true);
      }
      pool.update(1);
      expect(pool.tracers.visible).toBe(false);
      expect(pool.sparks.visible).toBe(false);
    } finally {
      pool.dispose();
      plate.dispose();
    }
  });
});
