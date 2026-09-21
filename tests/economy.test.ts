import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { lintEconomy, lintTokenConstants } from "../shared/economy/lint";
import type { EconomyItem } from "../shared/economy/manifest";
import { itemName } from "../shared/manifest/items";

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
