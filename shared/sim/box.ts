import { type Vec3, v3 } from "../math/vec3";

export interface Box {
  min: Vec3;
  max: Vec3;
  /** Semantic tag, used by the renderer for tint and by tests. */
  tag?: string;
}

export const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tag?: string): Box => ({
  min: v3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
  max: v3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)),
  tag,
});
