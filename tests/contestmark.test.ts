/**
 * The contest block is painted on the street. It is not a new wall.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CampaignFx } from "../client/render/campaign";

describe("the contest block is a square on the ground", () => {
  it("a half of 6 paints 12 metres, and stepping in runs the paint hot", () => {
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillText() {} }) }),
    };
    const fx = new CampaignFx(new THREE.Scene(), new THREE.PerspectiveCamera());
    expect(fx.contestSpan()).toBe(0);
    fx.setContest({ x: 10, z: -4, half: 6 });
    expect(fx.contestSpan()).toBe(12);
    const box = new THREE.Box3().setFromObject(fx["contest"] as THREE.Object3D);
    expect(box.max.x - box.min.x).toBeGreaterThan(11.5);
    expect(box.max.x - box.min.x).toBeLessThan(13);
    expect(box.max.z - box.min.z).toBeGreaterThan(11.5);
    expect(box.getCenter(new THREE.Vector3()).x).toBeCloseTo(10, 3);
    expect(box.getCenter(new THREE.Vector3()).z).toBeCloseTo(-4, 3);
    fx.setContestHot(true);
    fx.setContest(null);
    expect(fx.contestSpan()).toBe(0);
  });
});
