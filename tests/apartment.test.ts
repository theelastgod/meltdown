/**
 * The file apartment is one indoor room. It loads, it has a spawn, and it
 * is not one of the twenty districts.
 */
import { describe, expect, it } from "vitest";
import { campaignOf } from "../shared/campaign/save";
import { CITY_DISTRICTS } from "../shared/net/city";
import { createAccount } from "../shared/progression/account";
import { APARTMENT_DECOR, APARTMENT_DOOR_M, apartmentDoorSpot, buyApartmentDecor, FILE_APARTMENT_ID, placeApartmentDecor } from "../shared/sim/apartment";
import { LEVEL_INFO, levelById } from "../shared/sim/level";

describe("the file apartment", () => {
  it("loads a room with a spawn and stays off the city list", () => {
    const level = levelById(FILE_APARTMENT_ID);
    expect(level.name).toBe(FILE_APARTMENT_ID);
    expect(level.spawns.length).toBeGreaterThan(0);
    expect(level.spawns[0]!.pos).toBeDefined();
    expect(CITY_DISTRICTS).not.toContain(FILE_APARTMENT_ID);
    expect(LEVEL_INFO.find((l) => l.id === FILE_APARTMENT_ID)?.kind).not.toBe("district");
    expect(level.boxes.filter((b) => b.tag === "wall")).toHaveLength(4);
    expect(level.boxes.some((b) => b.tag === "floor")).toBe(true);
    expect(level.tram).toBeUndefined();
    expect(level.exits ?? []).toEqual([]);
  });

  it("buys a crate with scrip, refuses a second crate, and refuses a cot the file cannot pay for", () => {
    const a = createAccount("decor");
    a.wallet.scrip = 100;
    expect(buyApartmentDecor(a, "crate").ok).toBe(true);
    expect(a.wallet.scrip).toBe(60);
    expect(campaignOf(a).decor).toEqual(["crate"]);
    expect(buyApartmentDecor(a, "crate").ok).toBe(false);
    expect(a.wallet.scrip).toBe(60);
    const poor = createAccount("broke");
    poor.wallet.scrip = 0;
    expect(buyApartmentDecor(poor, "cot").ok).toBe(false);
    expect(poor.wallet.scrip).toBe(0);
    expect(campaignOf(poor).decor).toEqual([]);
    const old = createAccount("old");
    old.campaign = { faction: null, testimony: {}, missionsDone: [], gigsDone: [], protocols: [], worn: [], weapons: [], ending: null };
    expect(campaignOf(old).decor).toEqual([]);
    expect(CITY_DISTRICTS).not.toContain(FILE_APARTMENT_ID);
    const apt = levelById(FILE_APARTMENT_ID);
    placeApartmentDecor(apt, APARTMENT_DECOR.map((d) => d.id));
    expect(apt.boxes.filter((b) => b.tag === "crate")).toHaveLength(1);
    expect(apt.boxes.filter((b) => b.tag === "bench")).toHaveLength(1);
    expect(apt.boxes.filter((b) => APARTMENT_DECOR.some((d) => d.id === b.tag))).toHaveLength(5);
    const spot = apartmentDoorSpot(apt)!;
    const spawn = apt.spawns[0]!.pos;
    for (const b of apt.boxes.filter((x) => APARTMENT_DECOR.some((d) => d.id === x.tag))) {
      const near = (x: number, z: number, r: number) => {
        const nx = Math.max(b.min.x, Math.min(x, b.max.x));
        const nz = Math.max(b.min.z, Math.min(z, b.max.z));
        return Math.hypot(nx - x, nz - z) < r;
      };
      expect(near(spawn.x, spawn.z, 0.4)).toBe(false);
      expect(near(spot.x, spot.z, APARTMENT_DOOR_M)).toBe(false);
    }
    const lease = levelById("lease_row");
    const n = lease.boxes.length;
    placeApartmentDecor(lease, ["cot", "lamp", "crate", "plant", "bench"]);
    expect(lease.boxes).toHaveLength(n);
  });

  it("sells a bench for scrip and does not raise a stat", () => {
    const a = createAccount("bench");
    a.wallet.scrip = 50;
    const before = { scrip: a.wallet.scrip, protocols: [...campaignOf(a).protocols], weapons: [...campaignOf(a).weapons], worn: [...campaignOf(a).worn] };
    expect(APARTMENT_DECOR.find((d) => d.id === "bench")?.scrip).toBe(50);
    expect(buyApartmentDecor(a, "bench").ok).toBe(true);
    expect(a.wallet.scrip).toBe(before.scrip - 50);
    expect(campaignOf(a).decor).toEqual(["bench"]);
    expect(campaignOf(a).protocols).toEqual(before.protocols);
    expect(campaignOf(a).weapons).toEqual(before.weapons);
    expect(campaignOf(a).worn).toEqual(before.worn);
    expect(buyApartmentDecor(a, "bench")).toEqual({ ok: false, reason: "ALREADY OWNED" });
    expect(a.wallet.scrip).toBe(0);
  });
});
