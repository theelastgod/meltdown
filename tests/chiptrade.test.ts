/**
 * A chip's trade has to be a trade (Stage 171).
 *
 * The SMG's spread BENEFITS are converted to recoil benefits of the same weight, because a tighter
 * cone on a sprayer is worth far more than the trade charges for. The conversion is one-sided by
 * design — and where it landed a benefit on a stat the chip's own cost already occupied, the two
 * cancelled. CHOKE read "−12% spread / +12% recoil" and delivered a net recoil change of exactly
 * 0.0000. `lintChipSchema` could not see it: it compares the total WEIGHT of the two sides, and
 * they weighed the same precisely because they cancelled.
 */
import { describe, expect, it } from "vitest";
import { CHIPS, lintChipSchema, type ChipDef } from "../shared/manifest/chips";

describe("no chip trades a stat against itself", () => {
  it("holds across the whole manifest", () => {
    const colliding = CHIPS.filter((c) => c.benefits.some((b) => c.costs.some((k) => k.stat === b.stat)));
    expect(colliding.map((c) => c.id)).toEqual([]);
  });

  it("and every chip still moves the stats it claims to move", () => {
    // the collision made the NET zero while both sides were present, so presence is not the test
    for (const c of CHIPS) {
      for (const b of c.benefits) {
        const net = b.delta + c.costs.filter((k) => k.stat === b.stat).reduce((a, k) => a + k.delta, 0);
        expect(Math.abs(net), `${c.id}: ${b.stat} nets to zero`).toBeGreaterThan(1e-9);
      }
    }
  });
});

describe("the lint that certified two dead chips", () => {
  it("now refuses a chip whose benefit and cost sit on one stat", () => {
    // the rule must be shown to fire, or it is only a green light with no bulb
    const dead: ChipDef = { ...CHIPS[0]!, id: "test:dead", benefits: [{ stat: "recoil", delta: -0.12 }], costs: [{ stat: "recoil", delta: 0.12 }] };
    const found = lintChipSchema([dead]);
    expect(found.map((f) => f.rule)).toContain("same-stat-trade");
    expect(found.find((f) => f.rule === "same-stat-trade")!.detail).toContain("cancel");
  });

  it("still passes the manifest it ships", () => {
    expect(lintChipSchema()).toEqual([]);
  });

  it("does not fire on an honest trade on the same axis in opposite directions", () => {
    // recoil traded for spread is a real trade; only the SAME stat on both sides is the defect
    const fine: ChipDef = { ...CHIPS[0]!, id: "test:fine", benefits: [{ stat: "recoil", delta: -0.12 }], costs: [{ stat: "spread", delta: 0.12 }] };
    expect(lintChipSchema([fine]).map((f) => f.rule)).not.toContain("same-stat-trade");
  });
});

describe("the conversion is scoped to the weapon that needs it", () => {
  it("leaves a weapon outside the conversion set alone", () => {
    const c = CHIPS.find((x) => x.id === "lease_breaker:choke")!;
    expect(c.benefits).toEqual([{ stat: "spread", delta: -0.12 }]);
    expect(c.costs).toEqual([{ stat: "recoil", delta: 0.12 }]);
  });

  it("gives the converting weapon a cost on the axis its benefit vacated", () => {
    const c = CHIPS.find((x) => x.id === "stack_smg:choke")!;
    expect(c.benefits.map((b) => b.stat)).toEqual(["recoil"]);
    expect(c.costs.map((k) => k.stat)).toEqual(["spread"]);
  });

  it("keeps a multi-part chip's other half intact", () => {
    // FLASH CUT is "−8% spread, quieter / +8% recoil, −4.5% reload": only the recoil pair collided
    const c = CHIPS.find((x) => x.id === "stack_smg:flash_cut")!;
    expect(c.benefits.map((b) => b.stat).sort()).toEqual(["droneDetect", "recoil"]);
    expect(c.costs.map((k) => k.stat).sort()).toEqual(["reloadSpeed", "spread"]);
  });
});
