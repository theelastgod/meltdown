/**
 * A chit is not Scrip and not a room-hour. PvE pays none. Depth 9 cannot exchange into the pot.
 * A price on a stat fails the economy lint. Burning is named by the buyer and never credited from a POST.
 */
import { describe, expect, it } from "vitest";
import { createAccount } from "../shared/progression/account";
import { creditCityEvent, creditStreetRun } from "../shared/city/reward";
import { canExchange, chitBuysStat, chitsFromBurn, creditBurnedChits, exchangeChits, fileChits, PVE_CHITS } from "../shared/city/chit";
import { lintEconomy } from "../shared/economy/lint";
import { counterRequest } from "../shared/economy/endpoint";
import { campaignOf, canLaunch, completeContract, nextMission, pickFaction } from "../shared/campaign/save";

const ops = {
  reconcile: async () => ({ ok: false }),
  attestStamps: async () => ({ ok: false, attested: [] as string[] }),
  nameVoucher: async () => ({ ok: false }),
  payout: async () => ({ ok: false }),
  prizes: async () => [],
  claimPrize: async () => ({ ok: false }),
};

describe("PvE pays no chits", () => {
  it("an event and a street run leave the balance at zero", () => {
    const a = createAccount("pve");
    const ev = creditCityEvent(a, { kind: "hold", title: "T" }, 1_700_000_000_000);
    const run = creditStreetRun(a, { id: "lease_row:0", name: "HIGH LINE" }, 12);
    expect(ev.chits).toBe(PVE_CHITS);
    expect(run.chits).toBe(0);
    expect(fileChits(a)).toBe(0);
    expect(ev.xp).toBeGreaterThan(0);
  });

  it("a contract keeps its arc settlement and does not touch chits", () => {
    const a = createAccount("arc");
    a.chits = 5;
    pickFaction(a, "estate");
    const id = nextMission(campaignOf(a))!.id;
    expect(canLaunch(a, campaignOf(a), id).ok).toBe(true);
    const before = a.xp;
    const done = completeContract(a, id, {});
    expect(done.ok).toBe(true);
    expect(fileChits(a)).toBe(5);
    expect(a.xp).toBeGreaterThanOrEqual(before);
  });
});

describe("the exchange", () => {
  it("Depth 9 is paid Scrip and is not a unit", () => {
    const a = createAccount("nine");
    a.depth = 9;
    a.chits = 4;
    expect(canExchange(9)).toBe(false);
    const ex = exchangeChits(a, 20713);
    expect(ex.units).toBe(0);
    expect(ex.scrip).toBe(40);
    expect(a.wallet.scrip).toBe(40);
    expect(fileChits(a)).toBe(0);
    expect(a.counter?.run).toBeUndefined();
  });

  it("Depth 10 adds units and does not name a price", () => {
    const a = createAccount("ten");
    a.depth = 10;
    a.chits = 4;
    const ex = exchangeChits(a, 20713);
    expect(ex.units).toBe(4);
    expect(ex.scrip).toBe(0);
    expect(ex).not.toHaveProperty("price");
    expect(a.counter?.run).toMatchObject({ day: 20713, banked: 4, owed: 4 });
    expect(fileChits(a)).toBe(0);
  });

  it("a chit does not buy health, and a priced stat fails the lint", () => {
    expect(chitBuysStat(70)).toBe(70);
    const violations = lintEconomy([
      {
        id: "paid-health",
        kind: "cosmetic",
        mechanical: { benefits: [{ stat: "health", delta: 10 }], costs: [{ stat: "shield", delta: -1 }] },
        market: { capital: 5, onChain: true, tradable: false, randomness: "none" },
      },
    ]);
    expect(violations.some((v) => v.rule === "no-paid-power" || v.rule === "identity-is-cosmetic")).toBe(true);
  });

  it("a burn is 1:1 and a POST does not credit", async () => {
    expect(chitsFromBurn(0)).toEqual({ burn: 0, chits: 0 });
    expect(chitsFromBurn(3.9)).toEqual({ burn: 3, chits: 3 });
    const a = createAccount("burn");
    const r = await counterRequest(a, { op: "burnchits", name: "5" }, ops);
    expect(r.ok).toBe(false);
    expect(fileChits(a)).toBe(0);
    expect(creditBurnedChits(a, 0)).toBe(0);
  });
});
