import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { lintEconomy, lintTokenConstants } from "../shared/economy/lint";
import type { EconomyItem } from "../shared/economy/manifest";
import { itemName } from "../shared/manifest/items";
import { SKINS } from "../shared/economy/catalog";

const cosmetic = (id: string, extra: Partial<EconomyItem> = {}): EconomyItem => ({
  id,
  kind: "cosmetic",
  mechanical: null,
  market: { capital: 120, onChain: true, tradable: true, randomness: "wear_seed" },
  ...extra,
});

describe("economy lint — $CAPITAL never touches a stat", () => {
  it("accepts a clean manifest", () => {
    const items: EconomyItem[] = [
      cosmetic("skin_leasebreaker_rust"),
      { id: "name_registry", kind: "name", mechanical: null, market: { capital: 500, onChain: true, tradable: false, randomness: "none" } },
      { id: "room_hour", kind: "room_credit", mechanical: null, market: { capital: 5, onChain: true, tradable: false, randomness: "none" } },
      { id: "node_slipfile", kind: "node", mechanical: { benefits: [{ stat: "slideDistance", delta: 0.1 }], costs: [{ stat: "adsStrafe", delta: -0.08 }] }, market: null, scrip: 400 },
    ];
    expect(lintEconomy(items)).toEqual([]);
  });

  it("rejects paid power", () => {
    const v = lintEconomy([cosmetic("skin_with_stats", { mechanical: { benefits: [{ stat: "damage", delta: 0.05 }], costs: [{ stat: "recoil", delta: 0.05 }] } })]);
    expect(v.map((x) => x.rule)).toContain("no-paid-power");
  });

  it("rejects paid progression", () => {
    const v = lintEconomy([
      { id: "node_for_sale", kind: "node", mechanical: { benefits: [{ stat: "x", delta: 1 }], costs: [{ stat: "y", delta: -1 }] }, market: { capital: 10, onChain: false, tradable: false, randomness: "none" } },
    ]);
    expect(v.map((x) => x.rule)).toContain("no-paid-progression");
  });

  it("rejects a trade-less progression buff", () => {
    const v = lintEconomy([{ id: "free_buff", kind: "chip", mechanical: { benefits: [{ stat: "x", delta: 1 }], costs: [] }, market: null }]);
    expect(v.map((x) => x.rule)).toContain("non-empty-costs");
  });

  it("quarantines Kernel Protocols entirely", () => {
    const v = lintEconomy([{ id: "kp_filament", kind: "kernel_protocol", mechanical: null, market: null }]);
    expect(v.map((x) => x.rule)).toContain("kernel-protocol-quarantine");
  });

  it("rejects paid randomness other than a wear seed", () => {
    const v = lintEconomy([cosmetic("crate", { market: { capital: 50, onChain: true, tradable: true, randomness: "loot" as never } })]);
    expect(v.map((x) => x.rule)).toContain("no-paid-randomness");
  });

  it("token constants reconcile", () => {
    expect(lintTokenConstants()).toEqual([]);
  });
});

describe("the join line names the ledger, not the id", () => {
  it("BAD DEBT and LONG LEASE are names, not BAD_DEBT and long_lease", () => {
    expect(itemName("bad_debt")).toBe("BAD DEBT");
    expect(itemName("long_lease")).toBe("LONG LEASE");
    expect(itemName("quiet_ledger")).toBe("QUIET LEDGER");
    expect(itemName("debtless")).toBe("DEBTLESS");
    expect(itemName("bad_debt")).not.toBe("BAD_DEBT");
  });

  it("the CRT interpolates itemName for attested nodes and the keystone", () => {
    const src = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(src).toMatch(/attested\.map\(itemName\)/);
    expect(src).toMatch(/itemName\(f\.loadout\.keystone\)/);
    expect(src).not.toMatch(/keystone\.toUpperCase\(\)/);
  });
});

describe("the Ledger Market names the skins in CRT", () => {
  it("RUST LEASE's market line is CRT, not a rig that has been rained on", () => {
    const src = readFileSync(new URL("../shared/economy/catalog.ts", import.meta.url), "utf8");
    const line = SKINS.find((s) => s.id === "skin_rust")!.line;
    expect(line).toBe("A RIG THAT HAS BEEN RAINED ON SINCE THE ESTATE STOPPED COUNTING");
    expect(line).not.toBe("a rig that has been rained on since the Estate stopped counting");
    expect(src).toMatch(/skin\(1, "skin_rust", "RUST LEASE", "A RIG THAT HAS BEEN RAINED ON SINCE THE ESTATE STOPPED COUNTING"/);
    expect(src).not.toMatch(/skin\(1, "skin_rust", "RUST LEASE", "a rig that has been rained on since the Estate stopped counting"/);
  });

  it("PHOSPHOR TRIM's market line is CRT, not the first CRT's green on every edge", () => {
    const src = readFileSync(new URL("../shared/economy/catalog.ts", import.meta.url), "utf8");
    const line = SKINS.find((s) => s.id === "skin_phosphor")!.line;
    expect(line).toBe("THE FIRST CRT'S GREEN ON EVERY EDGE");
    expect(line).not.toBe("the first CRT's green on every edge");
    expect(src).toMatch(/skin\(2, "skin_phosphor", "PHOSPHOR TRIM", "THE FIRST CRT'S GREEN ON EVERY EDGE"/);
    expect(src).not.toMatch(/skin\(2, "skin_phosphor", "PHOSPHOR TRIM", "the first CRT's green on every edge"/);
  });

  it("KERNEL PLATE's market line is CRT, not red filament without the filament", () => {
    const src = readFileSync(new URL("../shared/economy/catalog.ts", import.meta.url), "utf8");
    const line = SKINS.find((s) => s.id === "skin_kernel")!.line;
    expect(line).toBe("RED FILAMENT WITHOUT THE FILAMENT");
    expect(line).not.toBe("red filament without the filament");
    expect(src).toMatch(/skin\(3, "skin_kernel", "KERNEL PLATE", "RED FILAMENT WITHOUT THE FILAMENT"/);
    expect(src).not.toMatch(/skin\(3, "skin_kernel", "KERNEL PLATE", "red filament without the filament"/);
  });

  it("DEADLETTER WHITE's market line is CRT, not the office's own paint", () => {
    const src = readFileSync(new URL("../shared/economy/catalog.ts", import.meta.url), "utf8");
    const line = SKINS.find((s) => s.id === "skin_deadletter")!.line;
    expect(line).toBe("THE OFFICE'S OWN PAINT, CUT FROM A SEALED DOOR");
    expect(line).not.toBe("the office's own paint, cut from a sealed door");
    expect(src).toMatch(/skin\(4, "skin_deadletter", "DEADLETTER WHITE", "THE OFFICE'S OWN PAINT, CUT FROM A SEALED DOOR"/);
    expect(src).not.toMatch(/skin\(4, "skin_deadletter", "DEADLETTER WHITE", "the office's own paint, cut from a sealed door"/);
  });

  it("WAKE TRIM's market line is CRT, not green edge-light on wet steel", () => {
    const src = readFileSync(new URL("../shared/economy/catalog.ts", import.meta.url), "utf8");
    const line = SKINS.find((s) => s.id === "skin_wake")!.line;
    expect(line).toBe("GREEN EDGE-LIGHT ON WET STEEL, THE COLOUR A NODE GOES WHEN IT FLIPS");
    expect(line).not.toBe("green edge-light on wet steel, the colour a node goes when it flips");
    expect(src).toMatch(/skin\(5, "skin_wake", "WAKE TRIM", "GREEN EDGE-LIGHT ON WET STEEL, THE COLOUR A NODE GOES WHEN IT FLIPS"/);
    expect(src).not.toMatch(/skin\(5, "skin_wake", "WAKE TRIM", "green edge-light on wet steel, the colour a node goes when it flips"/);
  });

  it("ESTATE PLATE's market line is CRT, not cyan anodized ledger-grid", () => {
    const src = readFileSync(new URL("../shared/economy/catalog.ts", import.meta.url), "utf8");
    const line = SKINS.find((s) => s.id === "skin_estate")!.line;
    expect(line).toBe("CYAN ANODIZED LEDGER-GRID, THE CONTRACTOR'S OWN PAINT");
    expect(line).not.toBe("cyan anodized ledger-grid, the contractor's own paint");
    expect(src).toMatch(/skin\(6, "skin_estate", "ESTATE PLATE", "CYAN ANODIZED LEDGER-GRID, THE CONTRACTOR'S OWN PAINT"/);
    expect(src).not.toMatch(/skin\(6, "skin_estate", "ESTATE PLATE", "cyan anodized ledger-grid, the contractor's own paint"/);
  });

  it("CLOCKEATER BRASS's market line is CRT, not gears that run faster", () => {
    const src = readFileSync(new URL("../shared/economy/catalog.ts", import.meta.url), "utf8");
    const line = SKINS.find((s) => s.id === "skin_clockeater")!.line;
    expect(line).toBe("GEARS THAT RUN FASTER THAN THE CITY CAN COUNT");
    expect(line).not.toBe("gears that run faster than the city can count");
    expect(src).toMatch(/skin\(7, "skin_clockeater", "CLOCKEATER BRASS", "GEARS THAT RUN FASTER THAN THE CITY CAN COUNT"/);
    expect(src).not.toMatch(/skin\(7, "skin_clockeater", "CLOCKEATER BRASS", "gears that run faster than the city can count"/);
  });

  it("LEDGER BREAK's market line is CRT, not magenta stamp over a CRT", () => {
    const src = readFileSync(new URL("../shared/economy/catalog.ts", import.meta.url), "utf8");
    const line = SKINS.find((s) => s.id === "skin_ledger")!.line;
    expect(line).toBe("MAGENTA STAMP OVER A CRT THAT STILL SAYS PENDING");
    expect(line).not.toBe("magenta stamp over a CRT that still says pending");
    expect(src).toMatch(/skin\(8, "skin_ledger", "LEDGER BREAK", "MAGENTA STAMP OVER A CRT THAT STILL SAYS PENDING"/);
    expect(src).not.toMatch(/skin\(8, "skin_ledger", "LEDGER BREAK", "magenta stamp over a CRT that still says pending"/);
  });

  it("VANTAGE AMBER's market line is CRT, not contractor chevrons", () => {
    const src = readFileSync(new URL("../shared/economy/catalog.ts", import.meta.url), "utf8");
    const line = SKINS.find((s) => s.id === "skin_vantage")!.line;
    expect(line).toBe("CONTRACTOR CHEVRONS, THE COLOUR OF A SEARCHLIGHT");
    expect(line).not.toBe("contractor chevrons, the colour of a searchlight");
    expect(src).toMatch(/skin\(9, "skin_vantage", "VANTAGE AMBER", "CONTRACTOR CHEVRONS, THE COLOUR OF A SEARCHLIGHT"/);
    expect(src).not.toMatch(/skin\(9, "skin_vantage", "VANTAGE AMBER", "contractor chevrons, the colour of a searchlight"/);
  });

  it("UNLISTED BLACK's market line is CRT, not near-black", () => {
    const src = readFileSync(new URL("../shared/economy/catalog.ts", import.meta.url), "utf8");
    const line = SKINS.find((s) => s.id === "skin_blank")!.line;
    expect(line).toBe("NEAR-BLACK, ONE PINHOLE OF CYAN");
    expect(line).not.toBe("near-black, one pinhole of cyan");
    expect(src).toMatch(/skin\(10, "skin_blank", "UNLISTED BLACK", "NEAR-BLACK, ONE PINHOLE OF CYAN"/);
    expect(src).not.toMatch(/skin\(10, "skin_blank", "UNLISTED BLACK", "near-black, one pinhole of cyan"/);
  });

  it("RAIN LEASE's market line is CRT, not anodized black that never dried", () => {
    const src = readFileSync(new URL("../shared/economy/catalog.ts", import.meta.url), "utf8");
    const line = SKINS.find((s) => s.id === "skin_rain")!.line;
    expect(line).toBe("ANODIZED BLACK THAT NEVER DRIED");
    expect(line).not.toBe("anodized black that never dried");
    expect(src).toMatch(/skin\(11, "skin_rain", "RAIN LEASE", "ANODIZED BLACK THAT NEVER DRIED"/);
    expect(src).not.toMatch(/skin\(11, "skin_rain", "RAIN LEASE", "anodized black that never dried"/);
  });

  it("METRO PLATE's market line is CRT, not grey-green tunnel tile", () => {
    const src = readFileSync(new URL("../shared/economy/catalog.ts", import.meta.url), "utf8");
    const line = SKINS.find((s) => s.id === "skin_metro")!.line;
    expect(line).toBe("GREY-GREEN TUNNEL TILE, CYAN BARS");
    expect(line).not.toBe("grey-green tunnel tile, cyan bars");
    expect(src).toMatch(/skin\(12, "skin_metro", "METRO PLATE", "GREY-GREEN TUNNEL TILE, CYAN BARS"/);
    expect(src).not.toMatch(/skin\(12, "skin_metro", "METRO PLATE", "grey-green tunnel tile, cyan bars"/);
  });

  it("ECHO VIOLET's market line is CRT, not ghosting plate", () => {
    const src = readFileSync(new URL("../shared/economy/catalog.ts", import.meta.url), "utf8");
    const line = SKINS.find((s) => s.id === "skin_violet")!.line;
    expect(line).toBe("GHOSTING PLATE, SHORT-RANGE WALLSENSE LOOK");
    expect(line).not.toBe("ghosting plate, short-range wallsense look");
    expect(src).toMatch(/skin\(13, "skin_violet", "ECHO VIOLET", "GHOSTING PLATE, SHORT-RANGE WALLSENSE LOOK"/);
    expect(src).not.toMatch(/skin\(13, "skin_violet", "ECHO VIOLET", "ghosting plate, short-range wallsense look"/);
  });

  it("FORGED TRIM's market line is CRT, not amber servo light on wet steel", () => {
    const src = readFileSync(new URL("../shared/economy/catalog.ts", import.meta.url), "utf8");
    const line = SKINS.find((s) => s.id === "skin_forged")!.line;
    expect(line).toBe("AMBER SERVO LIGHT ON WET STEEL");
    expect(line).not.toBe("amber servo light on wet steel");
    expect(src).toMatch(/skin\(14, "skin_forged", "FORGED TRIM", "AMBER SERVO LIGHT ON WET STEEL"/);
    expect(src).not.toMatch(/skin\(14, "skin_forged", "FORGED TRIM", "amber servo light on wet steel"/);
  });

  it("ESTATE GRID's market line is CRT, not cyan monitor grid", () => {
    const src = readFileSync(new URL("../shared/economy/catalog.ts", import.meta.url), "utf8");
    const line = SKINS.find((s) => s.id === "skin_grid")!.line;
    expect(line).toBe("CYAN MONITOR GRID");
    expect(line).not.toBe("cyan monitor grid");
    expect(src).toMatch(/skin\(15, "skin_grid", "ESTATE GRID", "CYAN MONITOR GRID"/);
    expect(src).not.toMatch(/skin\(15, "skin_grid", "ESTATE GRID", "cyan monitor grid"/);
  });

  it("BLACK LEASE's market line is CRT, not CRT phosphor on a sealed file", () => {
    const src = readFileSync(new URL("../shared/economy/catalog.ts", import.meta.url), "utf8");
    const line = SKINS.find((s) => s.id === "skin_black_lease")!.line;
    expect(line).toBe("CRT PHOSPHOR ON A SEALED FILE");
    expect(line).not.toBe("CRT phosphor on a sealed file");
    expect(src).toMatch(/skin\(16, "skin_black_lease", "BLACK LEASE", "CRT PHOSPHOR ON A SEALED FILE"/);
    expect(src).not.toMatch(/skin\(16, "skin_black_lease", "BLACK LEASE", "CRT phosphor on a sealed file"/);
  });

  it("PHAGE PLATE's market line is CRT, not green-black contagion paint", () => {
    const src = readFileSync(new URL("../shared/economy/catalog.ts", import.meta.url), "utf8");
    const line = SKINS.find((s) => s.id === "skin_phage")!.line;
    expect(line).toBe("GREEN-BLACK CONTAGION PAINT, THE LAUNCHER'S OWN STAIN");
    expect(line).not.toBe("green-black contagion paint, the launcher's own stain");
    expect(src).toMatch(/skin\(17, "skin_phage", "PHAGE PLATE", "GREEN-BLACK CONTAGION PAINT, THE LAUNCHER'S OWN STAIN"/);
    expect(src).not.toMatch(/skin\(17, "skin_phage", "PHAGE PLATE", "green-black contagion paint, the launcher's own stain"/);
  });

  it("LONGWAVE ICE's market line is CRT, not cold cyan rail", () => {
    const src = readFileSync(new URL("../shared/economy/catalog.ts", import.meta.url), "utf8");
    const line = SKINS.find((s) => s.id === "skin_longwave")!.line;
    expect(line).toBe("COLD CYAN RAIL, THE COLOUR A CHARGE HOWLS");
    expect(line).not.toBe("cold cyan rail, the colour a charge howls");
    expect(src).toMatch(/skin\(18, "skin_longwave", "LONGWAVE ICE", "COLD CYAN RAIL, THE COLOUR A CHARGE HOWLS"/);
    expect(src).not.toMatch(/skin\(18, "skin_longwave", "LONGWAVE ICE", "cold cyan rail, the colour a charge howls"/);
  });

  it("HAMMER RUST's market line is CRT, not shotgun steel that never left the rain", () => {
    const src = readFileSync(new URL("../shared/economy/catalog.ts", import.meta.url), "utf8");
    const line = SKINS.find((s) => s.id === "skin_hammer")!.line;
    expect(line).toBe("SHOTGUN STEEL THAT NEVER LEFT THE RAIN");
    expect(line).not.toBe("shotgun steel that never left the rain");
    expect(src).toMatch(/skin\(19, "skin_hammer", "HAMMER RUST", "SHOTGUN STEEL THAT NEVER LEFT THE RAIN"/);
    expect(src).not.toMatch(/skin\(19, "skin_hammer", "HAMMER RUST", "shotgun steel that never left the rain"/);
  });

  it("BATON VIOLET's market line is CRT, not shock-violet trim", () => {
    const src = readFileSync(new URL("../shared/economy/catalog.ts", import.meta.url), "utf8");
    const line = SKINS.find((s) => s.id === "skin_baton")!.line;
    expect(line).toBe("SHOCK-VIOLET TRIM ON A CLOSE-IN STICK");
    expect(line).not.toBe("shock-violet trim on a close-in stick");
    expect(src).toMatch(/skin\(20, "skin_baton", "BATON VIOLET", "SHOCK-VIOLET TRIM ON A CLOSE-IN STICK"/);
    expect(src).not.toMatch(/skin\(20, "skin_baton", "BATON VIOLET", "shock-violet trim on a close-in stick"/);
  });

  it("STACK PLATE's market line is CRT, not stacked polymer", () => {
    const src = readFileSync(new URL("../shared/economy/catalog.ts", import.meta.url), "utf8");
    const line = SKINS.find((s) => s.id === "skin_stack")!.line;
    expect(line).toBe("STACKED POLYMER, THE SMG'S OWN RAIN");
    expect(line).not.toBe("stacked polymer, the SMG's own rain");
    expect(src).toMatch(/skin\(21, "skin_stack", "STACK PLATE", "STACKED POLYMER, THE SMG'S OWN RAIN"/);
    expect(src).not.toMatch(/skin\(21, "skin_stack", "STACK PLATE", "stacked polymer, the SMG's own rain"/);
  });
});
