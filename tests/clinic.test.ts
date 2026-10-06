/**
 * The street clinic spends scrip to heal, and it never raises the maximum.
 */
import { describe, expect, it } from "vitest";
import { createAccount } from "../shared/progression/account";
import { CLINIC_HEAL, CLINIC_SCRIP, streetClinic } from "../shared/sim/clinic";

describe("the street clinic", () => {
  it("spends 30 scrip to heal 40, from 50 of 110 to 90", () => {
    const a = createAccount("clinic");
    a.wallet.scrip = 100;
    const r = streetClinic(a, 50, 110);
    expect(r.health).toBe(90);
    expect(r.spent).toBe(CLINIC_SCRIP);
    expect(a.wallet.scrip).toBe(70);
    expect(CLINIC_HEAL).toBe(40);
    expect(CLINIC_SCRIP).toBe(30);
    expect(a.chits).toBe(0);
    expect(a.depth).toBe(1);
  });

  it("a file already at max health does not pay", () => {
    const a = createAccount("whole");
    a.wallet.scrip = 100;
    const r = streetClinic(a, 110, 110);
    expect(r).toEqual({ health: 110, spent: 0 });
    expect(a.wallet.scrip).toBe(100);
  });

  it("a file that cannot pay does not heal", () => {
    const a = createAccount("broke");
    a.wallet.scrip = 0;
    const r = streetClinic(a, 50, 110);
    expect(r).toEqual({ health: 50, spent: 0 });
    expect(a.wallet.scrip).toBe(0);
  });

  it("a heal that would pass the maximum stops there and still costs 30", () => {
    const a = createAccount("clamp");
    a.wallet.scrip = 30;
    const max = 110;
    const r = streetClinic(a, 90, max);
    expect(r).toEqual({ health: max, spent: 30 });
    expect(a.wallet.scrip).toBe(0);
    expect(max).toBe(110);
  });
});
