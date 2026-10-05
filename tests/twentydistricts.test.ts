/**
 * Twenty districts. The original five stay the places they were. The fifteen after them are
 * other streets: other blocks, other air, other crowds, other horizons. A room that is not a
 * district still has no place air and still wears Lease Row's bed.
 */
import { describe, expect, it } from "vitest";
import { DISTRICT_SPECS, districtGrid } from "../shared/sim/city";
import { placeAir } from "../client/render/renderer";
import { bedTune, stepSurface } from "../client/audio";
import { crowdCast } from "../client/render/life";
import { lampRead, skylineRead, vistaRead } from "../client/render/city";
import { PLACE_FEEL } from "../client/render/places";

const MORE = ["ash_canal", "glass_mile", "bone_market", "cold_vault", "neon_chapel", "slag_pit", "wire_garden", "red_kiln", "paper_wharf", "velvet_court", "rust_crown", "salt_stairs", "lamp_bazaar", "debt_orchard", "black_relay"] as const;

describe("twenty districts, none of them the same street", () => {
  it("the registry is the original five and then these fifteen, each a 3×3 with one plaza", () => {
    expect(DISTRICT_SPECS.map((d) => d.id)).toEqual(["lease_row", "deadletter_docks", "repo_depot", "night_market", "relay_heights", ...MORE]);
    for (const id of MORE) {
      const s = DISTRICT_SPECS.find((d) => d.id === id)!;
      expect(districtGrid(s), id).toBe(3);
      expect(s.blocks, id).toHaveLength(9);
      expect(s.blocks[4], id).toBe("plaza");
      expect(s.pedestrians, id).toBeGreaterThan(40);
      expect(s.pedestrians, id).toBeLessThan(100);
      expect(s.carDensity, id).toBeGreaterThan(0.15);
    }
  });

  it("no two districts share a name, a seed, or a block mix", () => {
    const names = DISTRICT_SPECS.map((d) => d.displayName);
    const seeds = DISTRICT_SPECS.map((d) => d.seed);
    const blocks = DISTRICT_SPECS.map((d) => [...d.blocks].sort().join(","));
    expect(new Set(names).size).toBe(20);
    expect(new Set(seeds).size).toBe(20);
    expect(new Set(blocks).size).toBe(20);
  });

  it("every district has its own night, bed, crowd, outside, lamp, and horizon", () => {
    const ids = DISTRICT_SPECS.map((d) => d.id);
    const airs = ids.map((id) => placeAir(id)!);
    expect(airs.every(Boolean)).toBe(true);
    expect(new Set(airs.map((a) => a.fog)).size).toBe(20);
    expect(new Set(airs.map((a) => a.density)).size).toBe(20);
    expect(new Set(airs.map((a) => a.sky)).size).toBe(20);
    expect(new Set(airs.map((a) => a.fall)).size).toBe(20);
    for (const a of airs) {
      expect(a.density).toBeGreaterThanOrEqual(0.0045);
      expect(a.density).toBeLessThanOrEqual(0.009);
    }
    expect(placeAir("drainage_yard")).toBeNull();
    const beds = ids.map((id) => JSON.stringify(bedTune(id)));
    expect(new Set(beds).size).toBe(20);
    expect(bedTune("drainage_yard")).toEqual(bedTune("lease_row"));
    const crowds = ids.map((id) => JSON.stringify(crowdCast(id)));
    expect(new Set(crowds).size).toBe(20);
    expect(crowdCast(undefined)).toEqual(crowdCast("lease_row"));
    expect(new Set(ids.map((id) => vistaRead(id).rise)).size).toBe(20);
    expect(vistaRead("lease_row").rise).toBe(1);
    expect(new Set(ids.map((id) => lampRead(id).color)).size).toBe(20);
    // Lease Row, the market, the depot, and the heights still share the tower horizon they had.
    // The fifteen new streets do not, and they do not share it with each other or with the docks.
    const towers = JSON.stringify(skylineRead("lease_row"));
    const harbor = JSON.stringify(skylineRead("deadletter_docks"));
    const horizons = MORE.map((id) => JSON.stringify(skylineRead(id)));
    expect(new Set(horizons).size).toBe(MORE.length);
    expect(horizons).not.toContain(towers);
    expect(horizons).not.toContain(harbor);
    expect(JSON.stringify(skylineRead("relay_heights"))).toBe(towers);
    const steps = ids.map((id) => JSON.stringify(stepSurface(id)));
    expect(new Set(steps).size).toBeGreaterThanOrEqual(8);
    expect(Object.keys(PLACE_FEEL).sort()).toEqual([...MORE].sort());
  });
});
