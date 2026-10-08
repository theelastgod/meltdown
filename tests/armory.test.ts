import { describe, expect, it } from "vitest";
import { ARMORY, buyArmory } from "../shared/city/armory";
import { campaignRequest } from "../shared/campaign/endpoint";
import { campaignOf } from "../shared/campaign/save";
import { createAccount } from "../shared/progression/account";

describe("the street bag", () => {
  it("is forty pieces, bought once with scrip, and it does not move xp", () => {
    expect(ARMORY).toHaveLength(40);
    expect(new Set(ARMORY.map((p) => p.id)).size).toBe(40);
    for (const p of ARMORY) expect(Object.keys(p).sort()).toEqual(["district", "id", "line", "name", "scrip"]);
    const a = createAccount("bag", "B");
    a.wallet.scrip = 100;
    const xp = a.xp;
    expect(buyArmory(a, "nope").reason).toBe("UNKNOWN PIECE");
    expect(buyArmory(a, "row_slip").ok).toBe(true);
    expect(a.wallet.scrip).toBe(60);
    expect(campaignOf(a).armory).toEqual(["row_slip"]);
    expect(buyArmory(a, "row_slip").reason).toBe("ALREADY OWNED");
    expect(a.wallet.scrip).toBe(60);
    a.wallet.scrip = 10;
    expect(buyArmory(a, "dock_hook").reason).toBe("NEEDS SCRIP");
    expect(a.xp).toBe(xp);
    expect(campaignRequest(a, { op: "armory", id: "rust_nail" }).ok).toBe(false);
    a.wallet.scrip = 15;
    expect(campaignRequest(a, { op: "armory", id: "rust_nail" }).ok).toBe(true);
    expect(campaignOf(a).armory).toEqual(["row_slip", "rust_nail"]);
  });
});
