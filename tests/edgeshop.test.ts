/**
 * The desk sells the existing Neon Edge for scrip. No new slot. No stat.
 */
import { describe, expect, it } from "vitest";
import { campaignOf } from "../shared/campaign/save";
import { createAccount } from "../shared/progression/account";
import { buyNeonEdge, EDGE_SCRIP } from "../shared/sim/edgeshop";

describe("the neon edge counter", () => {
  it("spends 600 scrip once and grants the existing sword", () => {
    const a = createAccount("edge");
    a.wallet.scrip = 600;
    expect(buyNeonEdge(a)).toEqual({ ok: true });
    expect(campaignOf(a).weapons).toEqual(["neon_edge"]);
    expect(a.owned).toContain("weapon:neon_edge");
    expect(a.wallet.scrip).toBe(0);
    expect(EDGE_SCRIP).toBe(600);
    expect(a.chits).toBe(0);
    expect(a.depth).toBe(1);
    expect(buyNeonEdge(a).ok).toBe(false);
    expect(a.wallet.scrip).toBe(0);
    expect(campaignOf(a).weapons).toEqual(["neon_edge"]);
  });

  it("599 scrip does not grant it", () => {
    const a = createAccount("short");
    a.wallet.scrip = 599;
    expect(buyNeonEdge(a)).toEqual({ ok: false, reason: "NEEDS SCRIP" });
    expect(campaignOf(a).weapons).toEqual([]);
    expect(a.owned).not.toContain("weapon:neon_edge");
    expect(a.wallet.scrip).toBe(599);
  });
});
