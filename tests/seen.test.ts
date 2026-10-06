/**
 * Fast travel opens after the first visit, and a visit is not a purchase.
 */
import { describe, expect, it } from "vitest";
import { campaignRequest } from "../shared/campaign/endpoint";
import { campaignOf } from "../shared/campaign/save";
import { noteSeen } from "../shared/campaign/seen";
import { CITY_DISTRICTS } from "../shared/net/city";
import { createAccount } from "../shared/progression/account";
import { fastTravelOpen } from "../client/worldmap";

describe("a district opens on the map after the first visit", () => {
  it("records the district once and refuses anything off the city list", () => {
    const a = createAccount("seen");
    expect(noteSeen(a, "lease_row")).toEqual({ ok: true, fresh: true });
    expect(campaignOf(a).seen).toEqual(["lease_row"]);
    expect(noteSeen(a, "lease_row")).toEqual({ ok: true, fresh: false });
    expect(campaignOf(a).seen).toEqual(["lease_row"]);
    expect(noteSeen(a, "green_hold")).toEqual({ ok: false, fresh: false, reason: "NOT A DISTRICT" });
    expect(a.wallet.scrip).toBe(0);
    expect(a.chits).toBe(0);
    expect(a.depth).toBe(1);
  });

  it("an old file with no seen list still takes a visit", () => {
    const a = createAccount("old");
    a.campaign = { faction: null, testimony: {}, missionsDone: [], gigsDone: [], protocols: [], worn: [], weapons: [], ending: null };
    expect(noteSeen(a, "night_market").fresh).toBe(true);
    expect(campaignOf(a).seen).toEqual(["night_market"]);
  });

  it("the file endpoint records a district and refuses a room", () => {
    const a = createAccount("wire");
    expect(campaignRequest(a, { op: "seen", id: "deadletter_docks" }).ok).toBe(true);
    expect(campaignOf(a).seen).toEqual(["deadletter_docks"]);
    expect(campaignRequest(a, { op: "seen", id: "file_apartment" }).ok).toBe(false);
    expect(campaignOf(a).seen).toEqual(["deadletter_docks"]);
    expect(CITY_DISTRICTS).toHaveLength(20);
  });

  it("fast travel is the districts already entered, not the one underfoot", () => {
    expect(fastTravelOpen({ here: "lease_row", seen: ["lease_row"] }, "night_market")).toBe(false);
    expect(fastTravelOpen({ here: "lease_row", seen: ["lease_row", "night_market"] }, "night_market")).toBe(true);
    expect(fastTravelOpen({ here: "lease_row", seen: ["lease_row", "night_market"] }, "lease_row")).toBe(false);
  });
});
