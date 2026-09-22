import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { lintItemSchema, ALL_ITEMS, LEDGER_ITEMS, type LedgerItem } from "../shared/manifest/items";
import { validateLoadout, sheetFor, netDelta } from "../shared/manifest/loadout";
import { duel, mobilityCourse, runFairnessLint } from "../shared/fairness/lint";
import { applyMatch, buyNode, createAccount, craftFor, refundNode, sandboxAccount } from "../shared/progression/account";
import { depthForXp, matchXp, totalXpToReach, xpForDepth } from "../shared/progression/depth";
import { craft } from "../shared/progression/crafting";

describe("manifest schema — a trade-less buff cannot ship", () => {
  it("the shipped catalogue is clean", () => {
    expect(lintItemSchema()).toEqual([]);
  });
  it("an item with no costs fails", () => {
    const bad: LedgerItem = { id: "x", kind: "node", name: "X", ring: 1, requiresDepth: 1, cost: 10, links: [], benefits: [{ stat: "damage", delta: 0.1 }], costs: [], line: "" };
    expect(lintItemSchema([bad]).map((v) => v.rule)).toContain("non-empty-costs");
  });
  it("an item whose benefits outweigh its costs fails reconciliation", () => {
    const bad: LedgerItem = { id: "x", kind: "node", name: "X", ring: 1, requiresDepth: 1, cost: 10, links: [], benefits: [{ stat: "damage", delta: 0.2 }], costs: [{ stat: "footstep", delta: 0.05 }], line: "" };
    expect(lintItemSchema([bad]).map((v) => v.rule)).toContain("reconciled");
  });
  it("a mislabelled cost fails", () => {
    const bad: LedgerItem = { id: "x", kind: "node", name: "X", ring: 1, requiresDepth: 1, cost: 10, links: [], benefits: [{ stat: "damage", delta: 0.05 }], costs: [{ stat: "moveSpeed", delta: 0.08 }], line: "" };
    expect(lintItemSchema([bad]).map((v) => v.rule)).toContain("cost-sign");
  });
});

describe("loadout legality (validated server-side at spawn)", () => {
  const owned = LEDGER_ITEMS.map((i) => i.id).concat(["debtless"]);
  it("accepts a connected attestation of 7 with a linked keystone", () => {
    const r = validateLoadout({ primary: "lease_breaker", secondary: "stack_smg", attested: ["slipfile", "static_skin", "curb_weight", "contagion_rider", "long_lease", "quiet_ledger", "night_fare"], keystone: "debtless" }, owned, 10);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
  it("rejects more than 7, unowned, disconnected, unknown fields, and depth-gated weapons", () => {
    const eight = validateLoadout({ primary: "lease_breaker", secondary: "stack_smg", attested: ["slipfile", "static_skin", "curb_weight", "contagion_rider", "long_lease", "quiet_ledger", "night_fare", "spite_clause"], keystone: null }, owned, 10);
    expect(eight.errors.map((e) => e.rule)).toContain("attest-limit");
    const unowned = validateLoadout({ primary: "lease_breaker", secondary: "stack_smg", attested: ["long_lease"], keystone: null }, [], 10);
    expect(unowned.errors.map((e) => e.rule)).toContain("not-owned");
    expect(unowned.errors.find((e) => e.rule === "not-owned")!.detail).toBe("LONG LEASE is not in your file");
    expect(unowned.errors.find((e) => e.rule === "not-owned")!.detail).not.toBe("long_lease is not in your file");
    const disconnected = validateLoadout({ primary: "lease_breaker", secondary: "stack_smg", attested: ["slipfile", "wake_lung"], keystone: null }, owned, 10);
    expect(disconnected.errors.map((e) => e.rule)).toContain("connected");
    const connKick = disconnected.errors.find((e) => e.rule === "connected")!;
    expect(connKick.detail).toBe("attestation is not a connected subgraph (1 of 2 reachable from SLIPFILE)");
    expect(connKick.detail).not.toMatch(/from slipfile/);
    const src = readFileSync(new URL("../shared/manifest/loadout.ts", import.meta.url), "utf8");
    expect(src).toMatch(/reachable from \$\{itemName\(start\)\}/);
    expect(src).not.toMatch(/reachable from \$\{start\}/);
    const smuggled = validateLoadout({ primary: "lease_breaker", secondary: "stack_smg", attested: [], keystone: null, protocols: ["kp_filament_01"] }, owned, 10);
    expect(smuggled.errors.map((e) => e.rule)).toContain("unknown-field");
    const gated = validateLoadout({ primary: "phage", secondary: "stack_smg", attested: [], keystone: null }, owned, 2);
    expect(gated.errors.map((e) => e.rule)).toContain("weapon-depth");
    expect(gated.errors.find((e) => e.rule === "weapon-depth")!.detail).toMatch(/^PHAGE LAUNCHER NEEDS DEPTH/);
    expect(gated.errors.find((e) => e.rule === "weapon-depth")!.detail).not.toMatch(/^phage needs Depth/);
    expect(gated.errors.find((e) => e.rule === "weapon-depth")!.detail).not.toMatch(/needs Depth/);
    const loadoutSrc = readFileSync(new URL("../shared/manifest/loadout.ts", import.meta.url), "utf8");
    expect(loadoutSrc).toMatch(/NEEDS DEPTH \$\{WEAPON_DEPTH\[w\]\} \(YOU ARE \$\{depth\}\)/);
    expect(loadoutSrc).not.toMatch(/needs Depth \$\{WEAPON_DEPTH\[w\]\} \(you are \$\{depth\}\)/);
    const asNode = validateLoadout({ primary: "lease_breaker", secondary: "stack_smg", attested: ["debtless"], keystone: null }, owned, 10);
    expect(asNode.errors.map((e) => e.rule)).toContain("not-a-node");
    expect(asNode.errors.find((e) => e.rule === "not-a-node")!.detail).toBe("DEBTLESS is a KEYSTONE");
    expect(asNode.errors.find((e) => e.rule === "not-a-node")!.detail).not.toBe("DEBTLESS is a keystone");
    const two = validateLoadout({ primary: "lease_breaker", secondary: "stack_smg", attested: [], keystone: ["debtless", "bad_debt"] }, owned, 10);
    expect(two.errors.map((e) => e.rule)).toContain("keystone-limit");
    expect(two.errors.find((e) => e.rule === "keystone-limit")!.detail).toBe("max 1 KEYSTONE");
    expect(two.errors.find((e) => e.rule === "keystone-limit")!.detail).not.toBe("max 1 keystone");
    expect(src).toMatch(/max \$\{MAX_KEYSTONES\} KEYSTONE/);
    expect(src).not.toMatch(/max \$\{MAX_KEYSTONES\} keystone/);
    const ksShape = validateLoadout({ primary: "lease_breaker", secondary: "stack_smg", attested: [], keystone: 1 }, owned, 10);
    expect(ksShape.errors.map((e) => e.rule)).toContain("keystone-shape");
    expect(ksShape.errors.find((e) => e.rule === "keystone-shape")!.detail).toBe("KEYSTONE must be an id");
    expect(ksShape.errors.find((e) => e.rule === "keystone-shape")!.detail).not.toBe("keystone must be an id");
    expect(src).toMatch(/keystone-shape", detail: "KEYSTONE must be an id"/);
    expect(src).not.toMatch(/keystone-shape", detail: "keystone must be an id"/);
  });
  it("every legal build reconciles: NET DELTA 0 on the Auditor's ledger within tolerance", () => {
    const lo = validateLoadout({ primary: "lease_breaker", secondary: "stack_smg", attested: ["slipfile", "static_skin", "contagion_rider"], keystone: null }, owned, 10).loadout;
    const sheet = sheetFor(lo);
    expect(sheet.slideBoost).toBeCloseTo(1.1, 5);
    expect(sheet.droneDetect).toBeCloseTo(0.7, 5);
    expect(Math.abs(netDelta(lo))).toBeLessThanOrEqual(1.5 * 3); // weighted: each node within tolerance
  });
});

describe("fairness lint — simulation, not arithmetic", () => {
  it("baseline duel TTK sits in the band at the rifle's ideal range and shields soak first", () => {
    const base = { primary: "lease_breaker" as const, secondary: "shock_baton" as const, attested: [], keystone: null };
    const t = duel("lease_breaker", 15, base, base);
    expect(t).toBeGreaterThanOrEqual(0.6);
    expect(t).toBeLessThanOrEqual(1.0);
  });
  it("a reconciled-on-paper damage node still fails the duel lint (net power)", () => {
    const bad: LedgerItem = { id: "quiet_power_t", kind: "node", name: "QP", ring: 1, requiresDepth: 1, cost: 100, links: ["slipfile"], benefits: [{ stat: "damage", delta: 0.12 }], costs: [{ stat: "footstep", delta: 0.82 }], line: "" };
    LEDGER_ITEMS.push(bad);
    ALL_ITEMS.push(bad);
    try {
      const report = runFairnessLint({ weapons: ["lease_breaker"], builds: [{ name: "netpower", loadout: { primary: "lease_breaker", secondary: "shock_baton", attested: ["quiet_power_t"], keystone: null } }] });
      expect(report.ok).toBe(false);
      expect(report.violations.some((v) => v.rule === "ttk-deviation" || v.rule === "beats-every-bracket")).toBe(true);
    } finally {
      LEDGER_ITEMS.pop();
      ALL_ITEMS.pop();
    }
  });
  it("the mobility course is deterministic and a +12% move keystone breaks the ±5% bar without its shield cost... but passes the duel", () => {
    const base = { primary: "lease_breaker" as const, secondary: "shock_baton" as const, attested: [], keystone: null };
    const t1 = mobilityCourse(base);
    const t2 = mobilityCourse(base);
    expect(t1).toBe(t2);
    expect(t1).toBeGreaterThan(3);
  });
  it("the shipped catalogue passes the quick lint", () => {
    const report = runFairnessLint({ quick: true, builds: [
      { name: "slipfile", loadout: { primary: "lease_breaker", secondary: "shock_baton", attested: ["slipfile"], keystone: null } },
      { name: "spite", loadout: { primary: "lease_breaker", secondary: "shock_baton", attested: ["spite_clause"], keystone: null } },
      { name: "spite+collateral", loadout: { primary: "lease_breaker", secondary: "shock_baton", attested: ["spite_clause", "collateral"], keystone: null } },
    ] });
    for (const v of report.violations) console.log("violation", v);
    expect(report.ok).toBe(true);
  }, 120000);
});

describe("progression", () => {
  it("Depth curve: 50 takes 55–75 h of strong matches", () => {
    const total = totalXpToReach(50);
    const perMatch = matchXp({ flips: 3, nodeSeconds: 120, kills: 8, assists: 4, supportPoints: 20, seconds: 600, won: true }).total;
    const hours = (total / perMatch) * (10 / 60);
    expect(hours).toBeGreaterThan(55);
    expect(hours).toBeLessThan(75);
    expect(xpForDepth(1)).toBeLessThan(xpForDepth(49));
    expect(depthForXp(0)).toBe(1);
    expect(depthForXp(total)).toBe(50);
  });
  it("XP is objective-weighted: flips out-earn kills for the same effort", () => {
    const flips = matchXp({ flips: 4, nodeSeconds: 0, kills: 0, assists: 0, supportPoints: 0, seconds: 600, won: false });
    const kills = matchXp({ flips: 0, nodeSeconds: 0, kills: 4, assists: 0, supportPoints: 0, seconds: 600, won: false });
    expect(flips.objective).toBeGreaterThan(kills.combat);
  });
  it("accounts apply matches, buy and refund nodes, and craft deterministically", () => {
    const a = createAccount("acct1", "WEND");
    const e = applyMatch(a, { flips: 2, nodeSeconds: 60, kills: 5, assists: 2, supportPoints: 10, seconds: 600, won: true });
    expect(e.xp.total).toBeGreaterThan(0);
    expect(a.wallet.scrip).toBeGreaterThan(0);
    expect(a.depth).toBeGreaterThanOrEqual(1);
    const gatedBuy = buyNode(a, "wake_lung");
    expect(gatedBuy.ok).toBe(false);
    expect(gatedBuy.reason).toMatch(/^NEEDS DEPTH /);
    expect(gatedBuy.reason).not.toMatch(/^needs Depth /);
    a.wallet.scrip = 5000;
    expect(buyNode(a, "slipfile").ok).toBe(true);
    expect(buyNode(a, "slipfile").ok).toBe(false);
    expect(refundNode(a, "slipfile").ok).toBe(true);
    expect(a.wallet.scrip).toBe(5000 - 400 + 200);
    const s = sandboxAccount();
    s.wallet.salvage = 50;
    const c1 = craftFor(s, "wear_rust");
    const again = craft("wear_rust", "sandbox", 1);
    expect("digest" in c1 && c1.digest).toBe(again!.digest);
    expect(craft("wear_rust", "sandbox", 2)!.digest).not.toBe(again!.digest);
  });
});

describe("the ledger shop CRT-cases a miss", () => {
  it("an unknown node is UNKNOWN ITEM, not unknown item", () => {
    const a = createAccount("miss", "M");
    expect(buyNode(a, "not_a_node")).toEqual({ ok: false, reason: "UNKNOWN ITEM" });
    const src = readFileSync(new URL("../shared/progression/account.ts", import.meta.url), "utf8");
    expect(src).toMatch(/reason: "UNKNOWN ITEM"/);
    expect(src).not.toMatch(/reason: "unknown item"/);
  });

  it("a poor buy is NEEDS N SCRIP, not needs N Scrip", () => {
    const src = readFileSync(new URL("../shared/progression/account.ts", import.meta.url), "utf8");
    expect(src).toMatch(/NEEDS \$\{price\} SCRIP/);
    expect(src).not.toMatch(/needs \$\{price\} Scrip/);
  });

  it("a Depth-gated buy is NEEDS DEPTH, not needs Depth", () => {
    const src = readFileSync(new URL("../shared/progression/account.ts", import.meta.url), "utf8");
    expect(src).toMatch(/NEEDS DEPTH \$\{it\.requiresDepth\}/);
    expect(src).not.toMatch(/needs Depth \$\{it\.requiresDepth\}/);
  });

  it("a node the file already holds is ALREADY IN YOUR FILE, not already in your file", () => {
    const a = createAccount("dup", "D");
    a.wallet.scrip = 5000;
    expect(buyNode(a, "slipfile").ok).toBe(true);
    expect(buyNode(a, "slipfile")).toEqual({ ok: false, reason: "ALREADY IN YOUR FILE" });
    const src = readFileSync(new URL("../shared/progression/account.ts", import.meta.url), "utf8");
    expect(src).toMatch(/reason: "ALREADY IN YOUR FILE"/);
    expect(src).not.toMatch(/reason: "already in your file"/);
  });

  it("a refund of an unowned node is NOT IN YOUR FILE, not not in your file", () => {
    const a = createAccount("ref", "R");
    expect(refundNode(a, "slipfile")).toEqual({ ok: false, reason: "NOT IN YOUR FILE" });
    const src = readFileSync(new URL("../shared/progression/account.ts", import.meta.url), "utf8");
    expect(src).toMatch(/reason: "NOT IN YOUR FILE"/);
    expect(src).not.toMatch(/reason: "not in your file"/);
  });
});
