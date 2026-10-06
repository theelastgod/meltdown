/**
 * The scrip pit pays wallet scrip once for a dead dummy, and it is not a district.
 */
import { describe, expect, it } from "vitest";
import { CITY_DISTRICTS } from "../shared/net/city";
import { createAccount } from "../shared/progression/account";
import { PIT_SCRIP, pitPurse, SCRIP_PIT_ID } from "../shared/sim/pit";
import { LEVEL_INFO, levelById } from "../shared/sim/level";

describe("the scrip pit", () => {
  it("pays 25 scrip once when the dummy is dead", () => {
    const a = createAccount("pit");
    const before = a.wallet.scrip;
    expect(pitPurse(a, false)).toBe(true);
    expect(a.wallet.scrip).toBe(before + PIT_SCRIP);
    expect(PIT_SCRIP).toBe(25);
    expect(a.chits).toBe(0);
    expect(a.depth).toBe(1);
    expect(a.xp).toBe(0);
  });

  it("a second call does not pay again", () => {
    const a = createAccount("again");
    expect(pitPurse(a, false)).toBe(true);
    const paid = a.wallet.scrip;
    expect(pitPurse(a, false)).toBe(false);
    expect(a.wallet.scrip).toBe(paid);
  });

  it("a living dummy pays nothing", () => {
    const a = createAccount("live");
    const before = a.wallet.scrip;
    expect(pitPurse(a, true)).toBe(false);
    expect(a.wallet.scrip).toBe(before);
    expect(pitPurse(a, true)).toBe(false);
    expect(a.wallet.scrip).toBe(before);
  });

  it("stays off the city list", () => {
    expect(CITY_DISTRICTS).not.toContain(SCRIP_PIT_ID);
    expect(CITY_DISTRICTS).toHaveLength(20);
    expect(LEVEL_INFO.find((l) => l.id === SCRIP_PIT_ID)?.kind).not.toBe("district");
    const level = levelById(SCRIP_PIT_ID);
    expect(level.name).toBe(SCRIP_PIT_ID);
    expect(level.spawns.length).toBeGreaterThan(0);
    expect(level.dummies).toHaveLength(1);
    expect(level.boxes.filter((b) => b.tag === "wall")).toHaveLength(4);
    expect(level.boxes.some((b) => b.tag === "floor")).toBe(true);
  });
});
