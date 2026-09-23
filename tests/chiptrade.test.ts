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
    expect(choke.line).toBe("CHOKE: −12% RECOIL / −12% ADS STRAFE");
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
    expect(c.line).toBe("CHOKE: −8.5% SPREAD / +8.5% RECOIL");
    expect(c.line).not.toMatch(/−12%/);
  });

  it("the SMG's CHOKE names recoil, not the spread it no longer has", () => {
    const c = CHIPS.find((x) => x.id === "stack_smg:choke")!;
    expect(c.line).toBe("CHOKE: −12% RECOIL / −12% ADS STRAFE");
    expect(c.line).not.toMatch(/spread/);
  });

  it("the SMG's COUNTERWEIGHT does not sell a cone it does not move", () => {
    const c = CHIPS.find((x) => x.id === "stack_smg:counterweight")!;
    expect(c.benefits.every((b) => b.stat === "recoil")).toBe(true);
    expect(c.line).not.toMatch(/spread/);
    expect(c.line).toMatch(/RECOIL/);
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

  it("the FILE kit names ADS STRAFE, not ADS strafe", () => {
    const src = readFileSync(new URL("../shared/manifest/chips.ts", import.meta.url), "utf8");
    const line = CHIPS.find((c) => c.id === "stack_smg:choke")!.line;
    expect(line).toBe("CHOKE: −12% RECOIL / −12% ADS STRAFE");
    expect(line).not.toMatch(/ADS strafe/);
    expect(src).toMatch(/adsMove: "ADS STRAFE"/);
    expect(src).not.toMatch(/adsMove: "ADS strafe"/);
  });

  it("the FILE kit names FIRE RATE, not fire rate", () => {
    const src = readFileSync(new URL("../shared/manifest/chips.ts", import.meta.url), "utf8");
    const line = formatChipLine("BUMP STOCK", [{ stat: "fireRate", delta: 0.02 }], [{ stat: "spread", delta: 0.045 }, { stat: "recoil", delta: 0.03 }]);
    expect(line).toBe("BUMP STOCK: +2% FIRE RATE / +4.5% SPREAD, +3% RECOIL");
    expect(line).not.toMatch(/fire rate/);
    expect(src).toMatch(/fireRate: "FIRE RATE"/);
    expect(src).not.toMatch(/fireRate: "fire rate"/);
    expect(lintChipSchema()).toEqual([]);
    expect(lintItemSchema()).toEqual([]);
  });

  it("the FILE kit names DETECTION, not detection", () => {
    const src = readFileSync(new URL("../shared/manifest/chips.ts", import.meta.url), "utf8");
    const line = formatChipLine("SUPPRESSOR", [{ stat: "droneDetect", delta: -0.2 }], [{ stat: "range", delta: -0.03 }, { stat: "reloadSpeed", delta: -0.08 }]);
    expect(line).toBe("SUPPRESSOR: −20% DETECTION / −3% range, −8% RELOAD");
    expect(line).not.toMatch(/−20% detection/);
    expect(src).toMatch(/droneDetect: "DETECTION"/);
    expect(src).not.toMatch(/droneDetect: "detection"/);
    expect(lintChipSchema()).toEqual([]);
    expect(lintItemSchema()).toEqual([]);
  });

  it("the FILE kit names REGEN DELAY, not regen delay", () => {
    const src = readFileSync(new URL("../shared/manifest/chips.ts", import.meta.url), "utf8");
    const line = formatChipLine("COLD FILE", [{ stat: "shieldDelay", delta: -0.2 }], [{ stat: "shieldRegen", delta: -0.15 }]);
    expect(line).toBe("COLD FILE: −20% REGEN DELAY / −15% REGEN");
    expect(line).not.toMatch(/regen delay/);
    expect(src).toMatch(/shieldDelay: "REGEN DELAY"/);
    expect(src).not.toMatch(/shieldDelay: "regen delay"/);
    expect(lintChipSchema()).toEqual([]);
    expect(lintItemSchema()).toEqual([]);
  });

  it("the FILE kit names SLIDE DECAY, not slide decay", () => {
    const src = readFileSync(new URL("../shared/manifest/chips.ts", import.meta.url), "utf8");
    const line = formatChipLine("SLIPFILE", [{ stat: "slideBoost", delta: 0.1 }, { stat: "slideFriction", delta: -0.1 }], [{ stat: "adsMove", delta: -0.12 }]);
    expect(line).toBe("SLIPFILE: +10% SLIDE, −10% SLIDE DECAY / −12% ADS STRAFE");
    expect(line).not.toMatch(/slide decay/);
    expect(src).toMatch(/slideFriction: "SLIDE DECAY"/);
    expect(src).not.toMatch(/slideFriction: "slide decay"/);
    expect(lintChipSchema()).toEqual([]);
    expect(lintItemSchema()).toEqual([]);
  });

  it("the FILE kit names SPREAD, not spread", () => {
    const src = readFileSync(new URL("../shared/manifest/chips.ts", import.meta.url), "utf8");
    const line = formatChipLine("CHOKE", [{ stat: "spread", delta: -0.12 }], [{ stat: "recoil", delta: 0.12 }]);
    expect(line).toBe("CHOKE: −12% SPREAD / +12% RECOIL");
    expect(line).not.toMatch(/−12% spread/);
    expect(src).toMatch(/spread: "SPREAD"/);
    expect(src).not.toMatch(/spread: "spread"/);
    expect(lintChipSchema()).toEqual([]);
    expect(lintItemSchema()).toEqual([]);
  });

  it("the FILE kit names RECOIL, not recoil", () => {
    const src = readFileSync(new URL("../shared/manifest/chips.ts", import.meta.url), "utf8");
    const line = formatChipLine("CHOKE", [{ stat: "spread", delta: -0.12 }], [{ stat: "recoil", delta: 0.12 }]);
    expect(line).toBe("CHOKE: −12% SPREAD / +12% RECOIL");
    expect(line).not.toMatch(/recoil/);
    expect(src).toMatch(/recoil: "RECOIL"/);
    expect(src).not.toMatch(/recoil: "recoil"/);
    expect(lintChipSchema()).toEqual([]);
    expect(lintItemSchema()).toEqual([]);
  });

  it("the FILE kit names RELOAD, not reload", () => {
    const src = readFileSync(new URL("../shared/manifest/chips.ts", import.meta.url), "utf8");
    const line = formatChipLine("FAST MAG", [{ stat: "reloadSpeed", delta: 0.12 }], [{ stat: "spread", delta: 0.14 }]);
    expect(line).toBe("FAST MAG: +12% RELOAD / +14% SPREAD");
    expect(line).not.toMatch(/reload/);
    expect(src).toMatch(/reloadSpeed: "RELOAD"/);
    expect(src).not.toMatch(/reloadSpeed: "reload"/);
    expect(lintChipSchema()).toEqual([]);
    expect(lintItemSchema()).toEqual([]);
  });

  it("the FILE kit names MOVE, not move", () => {
    const src = readFileSync(new URL("../shared/manifest/chips.ts", import.meta.url), "utf8");
    const line = formatChipLine("SLING", [{ stat: "moveSpeed", delta: 0.015 }], [{ stat: "reloadSpeed", delta: -0.035 }]);
    expect(line).toBe("SLING: +1.5% MOVE / −3.5% RELOAD");
    expect(line).not.toMatch(/move/);
    expect(src).toMatch(/moveSpeed: "MOVE"/);
    expect(src).not.toMatch(/moveSpeed: "move"/);
    expect(lintChipSchema()).toEqual([]);
    expect(lintItemSchema()).toEqual([]);
  });

  it("the FILE kit names FOOTSTEPS, not footsteps", () => {
    const src = readFileSync(new URL("../shared/manifest/chips.ts", import.meta.url), "utf8");
    const line = formatChipLine("SILENT LEASE", [{ stat: "footstep", delta: -0.3 }], [{ stat: "reloadSpeed", delta: -0.15 }]);
    expect(line).toBe("SILENT LEASE: −30% FOOTSTEPS / −15% RELOAD");
    expect(line).not.toMatch(/footsteps/);
    expect(src).toMatch(/footstep: "FOOTSTEPS"/);
    expect(src).not.toMatch(/footstep: "footsteps"/);
    expect(lintChipSchema()).toEqual([]);
    expect(lintItemSchema()).toEqual([]);
  });

  it("the FILE kit names FLIP, not flip", () => {
    const src = readFileSync(new URL("../shared/manifest/chips.ts", import.meta.url), "utf8");
    const line = formatChipLine("WAKE-TUNED", [{ stat: "flipRate", delta: 0.12 }], [{ stat: "shieldRegen", delta: -0.24 }]);
    expect(line).toBe("WAKE-TUNED: +12% FLIP / −24% REGEN");
    expect(line).not.toMatch(/flip/);
    expect(src).toMatch(/flipRate: "FLIP"/);
    expect(src).not.toMatch(/flipRate: "flip"/);
    expect(lintChipSchema()).toEqual([]);
    expect(lintItemSchema()).toEqual([]);
  });

  it("the FILE kit names REGEN, not regen", () => {
    const src = readFileSync(new URL("../shared/manifest/chips.ts", import.meta.url), "utf8");
    const line = formatChipLine("WAKE-TUNED", [{ stat: "flipRate", delta: 0.12 }], [{ stat: "shieldRegen", delta: -0.24 }]);
    expect(line).toBe("WAKE-TUNED: +12% FLIP / −24% REGEN");
    expect(line).not.toMatch(/regen/);
    expect(src).toMatch(/shieldRegen: "REGEN"/);
    expect(src).not.toMatch(/shieldRegen: "regen"/);
    expect(lintChipSchema()).toEqual([]);
    expect(lintItemSchema()).toEqual([]);
  });

  it("the FILE kit names HEADSHOT, not headshot", () => {
    const src = readFileSync(new URL("../shared/manifest/chips.ts", import.meta.url), "utf8");
    const line = formatChipLine("SPITE CLAUSE", [{ stat: "headMult", delta: 0.12 }], [{ stat: "reloadSpeed", delta: -0.1 }]);
    expect(line).toBe("SPITE CLAUSE: +12% HEADSHOT / −10% RELOAD");
    expect(line).not.toMatch(/headshot/);
    expect(src).toMatch(/headMult: "HEADSHOT"/);
    expect(src).not.toMatch(/headMult: "headshot"/);
    expect(lintChipSchema()).toEqual([]);
    expect(lintItemSchema()).toEqual([]);
  });

  it("the FILE kit names GRENADE, not grenade", () => {
    const src = readFileSync(new URL("../shared/manifest/chips.ts", import.meta.url), "utf8");
    const line = formatChipLine("ESCROW", [{ stat: "grenades", delta: 1 }], [{ stat: "throwSpeed", delta: -0.1 }]);
    expect(line).toBe("ESCROW: +1 GRENADE / −10% throw");
    expect(line).not.toMatch(/grenade/);
    expect(src).toMatch(/grenades: "GRENADE"/);
    expect(src).not.toMatch(/grenades: "grenade"/);
    expect(lintChipSchema()).toEqual([]);
    expect(lintItemSchema()).toEqual([]);
  });

  it("the FILE kit names MANTLE, not mantle", () => {
    const src = readFileSync(new URL("../shared/manifest/chips.ts", import.meta.url), "utf8");
    const line = formatChipLine("QUICK MANTLE", [{ stat: "mantleTime", delta: -0.15 }], [{ stat: "slideBoost", delta: -0.08 }]);
    expect(line).toBe("QUICK MANTLE: −15% MANTLE / −8% SLIDE");
    expect(line).not.toMatch(/mantle/);
    expect(src).toMatch(/mantleTime: "MANTLE"/);
    expect(src).not.toMatch(/mantleTime: "mantle"/);
    expect(lintChipSchema()).toEqual([]);
    expect(lintItemSchema()).toEqual([]);
  });

  it("the FILE kit names SLIDE, not slide", () => {
    const src = readFileSync(new URL("../shared/manifest/chips.ts", import.meta.url), "utf8");
    const line = formatChipLine("SLIPFILE", [{ stat: "slideBoost", delta: 0.1 }], [{ stat: "adsMove", delta: -0.12 }]);
    expect(line).toBe("SLIPFILE: +10% SLIDE / −12% ADS STRAFE");
    expect(line).not.toMatch(/slide/);
    expect(src).toMatch(/slideBoost: "SLIDE"/);
    expect(src).not.toMatch(/slideBoost: "slide"/);
    expect(lintChipSchema()).toEqual([]);
    expect(lintItemSchema()).toEqual([]);
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
    expect(it.line).toMatch(/−23\.5% RELOAD/);
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
    expect(ledgerTradeText(it)).toBe("+40% REGEN / −2.25% MOVE, −23.5% RELOAD");
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
