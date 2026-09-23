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
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHIPS, formatChipLine, lintChipSchema, type ChipDef } from "../shared/manifest/chips";
import { LEDGER_ITEMS, ledgerTradeText, lintItemSchema, type LedgerItem } from "../shared/manifest/items";

describe("a chip is named by the weapon, not its article", () => {
  it("THE DIRECTIVE's CHOKE is DIRECTIVE CHOKE, not THE CHOKE", () => {
    const c = CHIPS.find((x) => x.id === "directive:choke")!;
    expect(c.name).toBe("DIRECTIVE CHOKE");
    expect(c.name).not.toMatch(/^THE /);
  });

  it("the name is built with weaponShortLabel, not the first token of w.name", () => {
    const src = readFileSync(new URL("../shared/manifest/chips.ts", import.meta.url), "utf8");
    expect(src).toMatch(/weaponShortLabel\(w\.name\)/);
    expect(src).not.toMatch(/w\.name\.split\(" "\)\[0\]/);
  });
});

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

  it("the SMG CHOKE is not a copy of COMPENSATOR", () => {
    const choke = CHIPS.find((x) => x.id === "stack_smg:choke")!;
    const comp = CHIPS.find((x) => x.id === "stack_smg:compensator")!;
    expect(choke.benefits).toEqual([{ stat: "recoil", delta: -0.12 }]);
    expect(choke.costs).toEqual([{ stat: "adsMove", delta: -0.12 }]);
    expect(comp.costs).toEqual([{ stat: "spread", delta: 0.12 }]);
    expect(choke.costs).not.toEqual(comp.costs);
    expect(choke.line).toBe("CHOKE: −12% recoil / −12% ADS strafe");
  });

  it("keeps a multi-part chip's other half intact", () => {
    // FLASH CUT on the SMG converted the spread benefit to recoil; the quieter half stayed
    const c = CHIPS.find((x) => x.id === "stack_smg:flash_cut")!;
    expect(c.benefits.map((b) => b.stat).sort()).toEqual(["droneDetect", "recoil"]);
    expect(c.costs.map((k) => k.stat).sort()).toEqual(["reloadSpeed", "spread"]);
  });
});

describe("a chip line is the mods it applies (Stage 188)", () => {
  it("the hammer's CHOKE prints the scaled cone, not the template −12%", () => {
    const c = CHIPS.find((x) => x.id === "repo_hammer:choke")!;
    expect(c.benefits).toEqual([{ stat: "spread", delta: -0.085 }]);
    expect(c.costs).toEqual([{ stat: "recoil", delta: 0.085 }]);
    expect(c.line).toBe("CHOKE: −8.5% spread / +8.5% recoil");
    expect(c.line).not.toMatch(/−12%/);
  });

  it("the SMG's CHOKE names recoil, not the spread it no longer has", () => {
    const c = CHIPS.find((x) => x.id === "stack_smg:choke")!;
    expect(c.line).toBe("CHOKE: −12% recoil / −12% ADS strafe");
    expect(c.line).not.toMatch(/spread/);
  });

  it("the SMG's COUNTERWEIGHT does not sell a cone it does not move", () => {
    const c = CHIPS.find((x) => x.id === "stack_smg:counterweight")!;
    expect(c.benefits.every((b) => b.stat === "recoil")).toBe(true);
    expect(c.line).not.toMatch(/spread/);
    expect(c.line).toMatch(/recoil/);
  });

  it("every shipped line rebuilds from the settled mods", () => {
    expect(lintChipSchema().filter((v) => v.rule === "line-matches-mods")).toEqual([]);
  });

  it("CONTAGION ROUND's FILE lead is CRT, not kills pull the nearest node", () => {
    const src = readFileSync(new URL("../shared/manifest/chips.ts", import.meta.url), "utf8");
    const line = CHIPS.find((c) => c.id === "lease_breaker:contagion_round")!.line;
    expect(line.startsWith("CONTAGION ROUND: KILLS PULL THE NEAREST NODE FOR 4 S,")).toBe(true);
    expect(line).not.toMatch(/kills pull the nearest node for 4 s/);
    expect(src).toMatch(/contagion_kill: "KILLS PULL THE NEAREST NODE FOR 4 S"/);
    expect(src).not.toMatch(/contagion_kill: "kills pull the nearest node for 4 s"/);
  });

  it("ESCROW LOCK's FILE lead is CRT, not kills restore 10 shield", () => {
    const src = readFileSync(new URL("../shared/manifest/chips.ts", import.meta.url), "utf8");
    const line = CHIPS.find((c) => c.id === "lease_breaker:escrow_lock")!.line;
    expect(line.startsWith("ESCROW LOCK: KILLS RESTORE 10 SHIELD,")).toBe(true);
    expect(line).not.toMatch(/kills restore 10 shield/);
    expect(src).toMatch(/escrow_kill: "KILLS RESTORE 10 SHIELD"/);
    expect(src).not.toMatch(/escrow_kill: "kills restore 10 shield"/);
  });

  it("VANTAGE BANE's FILE lead is CRT, not bonus damage to VANTAGE units", () => {
    const src = readFileSync(new URL("../shared/manifest/chips.ts", import.meta.url), "utf8");
    const line = CHIPS.find((c) => c.id === "lease_breaker:vantage_bane")!.line;
    expect(line.startsWith("VANTAGE BANE: BONUS DAMAGE TO VANTAGE UNITS,")).toBe(true);
    expect(line).not.toMatch(/bonus damage to VANTAGE units/);
    expect(src).toMatch(/vantage_bane: "BONUS DAMAGE TO VANTAGE UNITS"/);
    expect(src).not.toMatch(/vantage_bane: "bonus damage to VANTAGE units"/);
  });

  it("and the lint fires when a line is the template the mods left behind", () => {
    const c = CHIPS.find((x) => x.id === "repo_hammer:choke")!;
    const lying: ChipDef = { ...c, line: "CHOKE: −12% spread / +12% recoil" };
    expect(lintChipSchema([lying]).map((v) => v.rule)).toContain("line-matches-mods");
  });
});

describe("a ledger node line is the mods after reconciliation (Stage 190)", () => {
  it("COLLATERAL prints −23.5% reload, not the authored −20%", () => {
    const it = LEDGER_ITEMS.find((x) => x.id === "collateral")!;
    expect(it.costs.find((c) => c.stat === "reloadSpeed")!.delta).toBeCloseTo(-0.235, 5);
    expect(it.line).toMatch(/−23\.5% reload/);
    expect(it.line).not.toMatch(/−20% reload/);
  });

  it("every node line rebuilds from the settled mods", () => {
    expect(lintItemSchema().filter((v) => v.rule === "line-matches-mods")).toEqual([]);
    for (const it of LEDGER_ITEMS) {
      expect(it.line, it.id).toBe(formatChipLine(it.name, it.benefits, it.costs));
    }
  });

  it("and the lint fires when a node still quotes the pre-scale cost", () => {
    const it = LEDGER_ITEMS.find((x) => x.id === "collateral")!;
    const lying: LedgerItem = { ...it, line: "COLLATERAL: +40% shield regen / −2% move, −20% reload" };
    expect(lintItemSchema([lying]).map((v) => v.rule)).toContain("line-matches-mods");
  });

  it("the Ghostfile row quotes that same trade, not a rounded camelCase second copy", () => {
    const it = LEDGER_ITEMS.find((x) => x.id === "collateral")!;
    expect(ledgerTradeText(it)).toBe("+40% regen / −2.25% move, −23.5% reload");
    expect(ledgerTradeText(it)).not.toMatch(/reloadSpeed/);
    expect(ledgerTradeText(it)).not.toMatch(/−24%/);
  });
});

describe("the FILE panel reads ledgerTradeText", () => {
  it("does not rebuild the trade with Math.round and the camelCase key", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/ledgerTradeText\(it\)/);
    expect(src).not.toMatch(/Math\.round\(Math\.abs\(m\.delta\) \* 100\)/);
  });
});
