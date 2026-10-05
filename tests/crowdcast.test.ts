/**
 * Lease Row and Night Market share a cast. They do not share a crowd.
 * The docks and Relay Heights share a cast. They do not share one either.
 * Same meshes. The people are the height, the coat, the lamp, and whether they stop.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { Crowd, crowdCast } from "../client/render/life";
import { PALETTE } from "../client/render/city";

const PLACES = ["lease_row", "deadletter_docks", "repo_depot", "night_market", "relay_heights"] as const;

describe("a district has its own people", () => {
  it("the five crowds are not one tune, and an unnamed room keeps lease row", () => {
    const casts = PLACES.map((name) => crowdCast(name));
    const key = (c: ReturnType<typeof crowdCast>) => `${c.h0}:${c.bulk}:${c.umbrella}:${c.idle}:${c.coat}:${c.lamp}`;
    expect(new Set(casts.map(key)).size).toBe(PLACES.length);
    expect(crowdCast(undefined)).toEqual(crowdCast("lease_row"));
    expect(crowdCast("lease_row").lamp).toBe(PALETTE.amber);
    expect(crowdCast("lease_row").bulk).toBe(1);
    expect(crowdCast("night_market").h0).toBeLessThan(crowdCast("lease_row").h0);
    expect(crowdCast("night_market").idle).toBeGreaterThan(crowdCast("lease_row").idle);
    expect(crowdCast("deadletter_docks").umbrella).toBeGreaterThan(crowdCast("relay_heights").umbrella);
    expect(crowdCast("relay_heights").h0).toBeGreaterThan(crowdCast("deadletter_docks").h0);
    expect(crowdCast("relay_heights").bulk).toBeLessThan(1);
    expect(crowdCast("deadletter_docks").bulk).toBeGreaterThan(1);
  });

  it("the lamps on the chest are the cast, and the city builds the crowd for the level it is in", () => {
    const lampOf = (place: string) => {
      const crowd = new Crowd([{ x0: -4, z0: 0, x1: 4, z1: 0 }], 1, 3, place);
      const lamp = new THREE.Color();
      crowd.group.traverse((o) => {
        const mesh = o as THREE.InstancedMesh;
        if (mesh.isInstancedMesh && mesh.material instanceof THREE.MeshBasicMaterial && mesh.instanceColor) mesh.getColorAt(0, lamp);
      });
      return lamp.getHex();
    };
    expect(lampOf("lease_row")).toBe(PALETTE.amber);
    expect(lampOf("deadletter_docks")).toBe(crowdCast("deadletter_docks").lamp);
    expect(lampOf("night_market")).not.toBe(lampOf("lease_row"));
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("new Crowd(level.walks, level.pedestrians, (level.skylineSeed ?? 1) + 7, level.name)");
  });
});
