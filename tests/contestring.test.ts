/**
 * The shooting contest stands up on the street. The posts are the same block
 * the sim already uses. They are not dressed into the level, and the mirror
 * does not draw them.
 */
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CityLife } from "../client/render/life";
import { FAR_LAYER } from "../client/render/renderer";
import { contestOf } from "../shared/city/contest";
import { CITY_DISTRICTS } from "../shared/net/city";
import { drainageYard, levelById } from "../shared/sim/level";

function districtWithContest(): string {
  for (const id of CITY_DISTRICTS) if (contestOf(levelById(id))) return id;
  throw new Error("no district has a contest block");
}

function named(root: THREE.Object3D, name: string): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.name === name) out.push(o as THREE.Mesh);
  });
  return out;
}

describe("the contest ring", () => {
  it("stands on the contest block, and an indoor yard has none", () => {
    const id = districtWithContest();
    const level = levelById(id);
    const vol = contestOf(level)!;
    // ads and steam want a canvas; the ring does not, and it still reads this level's contest block
    const shown = { ...level, ads: [], vents: [], pedestrians: 0, tram: undefined };
    const life = new CityLife(shown, new THREE.Group());
    const ring = life.group.getObjectByName("contest-ring");
    expect(ring, id).toBeTruthy();
    expect(ring!.position.x).toBeCloseTo(vol.x, 5);
    expect(ring!.position.z).toBeCloseTo(vol.z, 5);
    expect(ring!.position.y).toBe(0);
    const posts = named(ring!, "contest-post");
    const beams = named(ring!, "contest-beam");
    expect(posts).toHaveLength(4);
    expect(beams).toHaveLength(4);
    for (const p of posts) {
      expect(p.position.y).toBeGreaterThan(2);
      expect(Math.abs(Math.abs(p.position.x) - vol.half)).toBeLessThan(0.001);
      expect(Math.abs(Math.abs(p.position.z) - vol.half)).toBeLessThan(0.001);
    }
    for (const b of beams) expect(b.position.y).toBeGreaterThan(4);
    const mirror = new THREE.Layers();
    const street = new THREE.Layers();
    street.enable(FAR_LAYER);
    for (const m of [...posts, ...beams]) {
      expect(m.layers.test(mirror)).toBe(false);
      expect(m.layers.test(street)).toBe(true);
    }
    const yardLevel = drainageYard();
    const yard = new CityLife({ ...yardLevel, ads: [], vents: [], pedestrians: 0, tram: undefined }, new THREE.Group());
    expect(contestOf(yardLevel), "the yard has wake posts, and still is not a stadium").not.toBeNull();
    expect(yard.group.getObjectByName("contest-ring")).toBeUndefined();
  });

  it("is drawn by the city life, not by the dressed level", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    const dressed = readFileSync(new URL("../client/render/city.ts", import.meta.url), "utf8");
    expect(life).toMatch(/CITY_DISTRICTS\.includes\(level\.name\)/);
    expect(life).toMatch(/contestOf\(level\)/);
    expect(life).toMatch(/contest-ring/);
    expect(dressed).not.toMatch(/contest-ring/);
    expect(dressed).not.toMatch(/contestOf\(/);
  });
});
