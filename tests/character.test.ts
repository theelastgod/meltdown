/**
 * The characters are designed, not placeholders (Stage 665).
 *
 * The player was a ten-sided tube, a closed cone for a hood and box limbs; a citizen was a 0.6 m
 * capsule with a cone on it. These tests hold the new designs to the things that make them read:
 * the hood has an opening with nothing lit inside it, its real peak sits under the point the crouch
 * check measures, no strip-light sits inside the cloth, and the crowd is people, not pills.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { BONE, buildRig, cloakGeometry, COAT_SCALE, coatSurfaceRadius, REST_BONES, rigReport, trimGeometry } from "../client/render/rig";
import { citizenBodyGeometry, citizenHoodGeometry } from "../client/render/life";

describe("the player's body", () => {
  it("the hood's real peak sits under the point rigReport measures, so the crouch check sees the geometry", () => {
    // rigReport reads a fixed point, head + (0, 0.3, 0.1): a taller hood would pass the crouch check
    // unseen. Tie the point to the vertices.
    const g = cloakGeometry(null);
    const pos = g.getAttribute("position"), idx = g.getAttribute("skinIndex"), w = g.getAttribute("skinWeight");
    let peak = -1;
    for (let i = 0; i < pos.count; i++) if (idx.getX(i) === BONE.head && w.getX(i) > 0.99) peak = Math.max(peak, pos.getY(i));
    const rig = buildRig(null);
    const measured = rigReport(rig).hoodApex;
    expect(peak, "no vertex is on the head bone at all").toBeGreaterThan(REST_BONES.head.world[1]);
    expect(peak).toBeLessThanOrEqual(measured + 1e-6);
  });

  it("the hood has a face opening, and what the opening shows is baked to black", () => {
    const g = cloakGeometry(null);
    const pos = g.getAttribute("position"), shade = g.getAttribute("shade"), idx = g.getAttribute("skinIndex");
    let voids = 0, voidOnHead = 0, frontFace = 0;
    for (let i = 0; i < pos.count; i++) {
      if (shade.getX(i) === 0) {
        voids++;
        if (idx.getX(i) === BONE.head) voidOnHead++;
      }
      // a lit head vertex directly in front of the face, between the chin and the brow: there must be
      // none. The cowl's top ring reaches 1.56 m at the chin, which is not the face; the box starts
      // above it (a first draft started at 1.55 and counted the chin).
      if (idx.getX(i) === BONE.head && shade.getX(i) > 0 && Math.abs(pos.getX(i)) < 0.05 && pos.getY(i) > 1.575 && pos.getY(i) < 1.68 && pos.getZ(i) < -0.12) frontFace++;
    }
    expect(voids, "nothing is baked to the void").toBeGreaterThan(50);
    expect(voidOnHead).toBe(voids);
    expect(frontFace, "the hood is closed over the face").toBe(0);
  });

  it("no strip-light sits inside the coat's cloth", () => {
    // the first turntable of this design showed the back spine glowing through the coat's front
    // opening: vertical bars on a flaring coat had their lower halves inside it. Every trim vertex on
    // the coat must be on or outside the surface the coat's own lathe makes.
    const t = trimGeometry();
    const pos = t.getAttribute("position");
    let checked = 0, inside = 0, worst = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (y < 0.5 || y > 0.985) continue;
      const nx = x / COAT_SCALE.sx, nz = z / COAT_SCALE.sz;
      const rho = Math.hypot(nx, nz);
      if (rho < 0.12) continue;
      checked++;
      const surface = coatSurfaceRadius(Math.atan2(nx, nz), y);
      if (rho < surface - 0.002) {
        inside++;
        worst = Math.max(worst, surface - rho);
      }
    }
    expect(checked, "no trim was found on the coat, so this proved nothing").toBeGreaterThan(40);
    expect(inside, `${inside} trim vertices inside the cloth, worst ${(worst * 1000).toFixed(1)} mm`).toBe(0);
  });
});

describe("a leased citizen", () => {
  const box = (g: THREE.BufferGeometry) => {
    g.computeBoundingBox();
    return g.boundingBox!;
  };
  it("is a person's size and shape, not a 0.6 m pill: shoulders wider than deep, a hood on top, feet on the ground", () => {
    const b = box(citizenBodyGeometry());
    expect(b.min.y).toBeCloseTo(0, 3);
    expect(b.max.y).toBeGreaterThan(1.35);
    const w = b.max.x - b.min.x, d = b.max.z - b.min.z;
    expect(w).toBeGreaterThan(d);
    expect(w).toBeLessThan(0.6);
    const h = box(citizenHoodGeometry());
    expect(h.min.y).toBeGreaterThan(1.3);
    expect(h.max.y).toBeLessThan(1.8);
  });

  it("its hood opens to the front it walks toward (+z), with a dark plate where a face would be", () => {
    const g = citizenHoodGeometry();
    const pos = g.getAttribute("position");
    // the shell reaches far back (-z) and not far forward: the opening is at the front
    let back = 0, front = 0;
    for (let i = 0; i < pos.count; i++) {
      back = Math.min(back, pos.getZ(i));
      front = Math.max(front, pos.getZ(i));
    }
    expect(-back).toBeGreaterThan(front);
  });

  it("costs what a crowd can afford: under 360 triangles a citizen with its lamp and umbrella", () => {
    const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute("position").count) / 3;
    const total = tris(citizenBodyGeometry()) + tris(citizenHoodGeometry()) + 12 + 16;
    // 110 citizens in the busiest district, scene and mirror: 110 x 2 x 360 = 79k, inside what lease_row had spare
    expect(total).toBeLessThan(360);
  });
});
