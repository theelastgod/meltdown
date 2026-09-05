/**
 * PvP items: Ledger Graph nodes and keystones. Every item is a paired trade;
 * the schema refuses an item without costs. Stage 6 ships the schema, the
 * first ring, and the three launch keystones; Stage 7 fills all 48 nodes.
 */
import { isBenefit, modWeight, type StatMod } from "./stats";

export type ItemKind = "node" | "keystone";

export interface LedgerItem {
  id: string;
  kind: ItemKind;
  name: string;
  /** Ring 1–3; deeper rings gate on Depth. */
  ring: number;
  /** Depth required to buy. */
  requiresDepth: number;
  /** Scrip price. */
  cost: number;
  /** Graph neighbours (attested nodes must form a connected subgraph). */
  links: string[];
  benefits: StatMod[];
  costs: StatMod[];
  /** Ghostfile line rendered when the node is attested. */
  line: string;
}

export const MAX_ATTESTED = 7;
export const MAX_KEYSTONES = 1;
/** Reconciliation tolerance on the Auditor's ledger (budget points). */
export const RECONCILE_TOLERANCE = 1.5;
/** Stats no PvP node may touch: effective health is flat, so every weapon's shot count holds for every build. */
export const NODE_FORBIDDEN_STATS = new Set(["maxHealth", "maxShield"]);

const node = (id: string, name: string, ring: number, requiresDepth: number, cost: number, links: string[], benefits: StatMod[], costs: StatMod[], line: string): LedgerItem => ({ id, kind: "node", name, ring, requiresDepth, cost, links, benefits, costs, line });

export const LEDGER_ITEMS: LedgerItem[] = [
  // ---- ring 1: the first district ----
  node("slipfile", "SLIPFILE", 1, 1, 400, ["static_skin", "contagion_rider", "long_lease"], [{ stat: "slideBoost", delta: 0.1 }, { stat: "slideFriction", delta: -0.1 }], [{ stat: "adsMove", delta: -0.12 }, { stat: "recoil", delta: 0.05 }], "SLIPFILE: +10% slide / −12% ADS strafe"),
  node("static_skin", "STATIC SKIN", 1, 1, 400, ["slipfile", "quiet_ledger", "spite_clause"], [{ stat: "droneDetect", delta: -0.3 }], [{ stat: "footstep", delta: 0.2 }, { stat: "reloadSpeed", delta: -0.07 }], "STATIC SKIN: −30% drone detection / footsteps +20% louder"),
  node("contagion_rider", "CONTAGION RIDER", 1, 1, 450, ["slipfile", "long_lease", "collateral"], [{ stat: "flipRate", delta: 0.2 }], [{ stat: "shieldRegen", delta: -0.25 }, { stat: "shieldDelay", delta: 0.15 }], "CONTAGION RIDER: +20% node flip / −25% shield regen"),
  node("long_lease", "LONG LEASE", 1, 2, 450, ["slipfile", "contagion_rider", "hair_trigger"], [{ stat: "range", delta: 0.05 }, { stat: "spread", delta: -0.08 }], [{ stat: "fireRate", delta: -0.02 }, { stat: "reloadSpeed", delta: -0.06 }], "LONG LEASE: +5% range, −8% spread / −2% fire rate, −6% reload"),
  node("quiet_ledger", "QUIET LEDGER", 1, 2, 400, ["static_skin", "spite_clause"], [{ stat: "footstep", delta: -0.3 }, { stat: "mantleTime", delta: -0.05 }], [{ stat: "moveSpeed", delta: -0.025 }, { stat: "shieldDelay", delta: 0.12 }, { stat: "reloadSpeed", delta: -0.04 }], "QUIET LEDGER: −30% footsteps, faster mantle / −2.5% move, slower shield, −4% reload"),
  node("spite_clause", "SPITE CLAUSE", 1, 3, 500, ["static_skin", "quiet_ledger", "collateral"], [{ stat: "headMult", delta: 0.12 }], [{ stat: "damage", delta: -0.06 }], "SPITE CLAUSE: +12% headshot / −6% damage"),
  node("collateral", "COLLATERAL", 1, 3, 500, ["contagion_rider", "spite_clause", "hair_trigger"], [{ stat: "shieldRegen", delta: 0.4 }], [{ stat: "moveSpeed", delta: -0.03 }, { stat: "reloadSpeed", delta: -0.22 }], "COLLATERAL: +40% shield regen / −3% move, −22% reload"),
  node("hair_trigger", "HAIR TRIGGER", 1, 4, 500, ["long_lease", "collateral", "escrow"], [{ stat: "reloadSpeed", delta: 0.08 }, { stat: "recoil", delta: -0.1 }], [{ stat: "spread", delta: 0.19 }], "HAIR TRIGGER: +8% reload, −10% recoil / +19% spread"),
  // ---- ring 2 (partial; Stage 7 completes) ----
  node("escrow", "ESCROW", 2, 8, 800, ["hair_trigger", "repo_grip"], [{ stat: "grenades", delta: 1 }], [{ stat: "throwSpeed", delta: -0.1 }, { stat: "droneDetect", delta: 0.12 }], "ESCROW: +1 grenade / weaker throw, easier to spot"),
  node("repo_grip", "REPO GRIP", 2, 8, 800, ["escrow", "wake_lung"], [{ stat: "recoil", delta: -0.15 }, { stat: "spread", delta: -0.1 }], [{ stat: "reloadSpeed", delta: -0.22 }], "REPO GRIP: −15% recoil, −10% spread / −22% reload speed"),
  node("wake_lung", "WAKE LUNG", 2, 10, 900, ["repo_grip"], [{ stat: "moveSpeed", delta: 0.04 }], [{ stat: "shieldDelay", delta: 0.13 }], "WAKE LUNG: +4% move / slower shield"),
];

export const KEYSTONES: LedgerItem[] = [
  { id: "debtless", kind: "keystone", name: "DEBTLESS", ring: 1, requiresDepth: 6, cost: 1500, links: ["slipfile", "quiet_ledger"], benefits: [{ stat: "moveSpeed", delta: 0.12 }, { stat: "slideBoost", delta: 0.25 }, { stat: "footstep", delta: -0.6 }], costs: [{ stat: "maxShield", delta: -30 }, { stat: "shieldRegen", delta: -1 }], line: "DEBTLESS: no shield; +12% move, +25% slide, silent" },
  { id: "auditor", kind: "keystone", name: "AUDITOR", ring: 1, requiresDepth: 6, cost: 1500, links: ["spite_clause", "long_lease"], benefits: [{ stat: "headMult", delta: 0.25 }, { stat: "range", delta: 0.05 }], costs: [{ stat: "fireRate", delta: -0.08 }, { stat: "moveSpeed", delta: -0.03 }, { stat: "reloadSpeed", delta: -0.1 }], line: "AUDITOR: +25% headshot, +5% range / −8% fire rate, −3% move, −10% reload" },
  { id: "bad_debt", kind: "keystone", name: "BAD DEBT", ring: 1, requiresDepth: 6, cost: 1500, links: ["collateral", "contagion_rider"], benefits: [{ stat: "flipRate", delta: 0.15 }, { stat: "grenades", delta: 1 }, { stat: "reloadSpeed", delta: 0.2 }], costs: [{ stat: "moveSpeed", delta: -0.08 }, { stat: "throwSpeed", delta: -0.1 }, { stat: "droneDetect", delta: 0.35 }], line: "BAD DEBT: +15% flip, +1 grenade, +20% reload / −8% move, loud on the model" },
];

export const ALL_ITEMS: LedgerItem[] = [...LEDGER_ITEMS, ...KEYSTONES];
export const itemById = (id: string): LedgerItem | undefined => ALL_ITEMS.find((i) => i.id === id);

export interface SchemaViolation {
  itemId: string;
  rule: string;
  detail: string;
}

/** Schema lint: paired trades only, reconciled budgets, symmetric links, sane numbers. */
export function lintItemSchema(items: readonly LedgerItem[] = ALL_ITEMS): SchemaViolation[] {
  const out: SchemaViolation[] = [];
  const ids = new Set(items.map((i) => i.id));
  for (const it of items) {
    if (it.costs.length === 0) out.push({ itemId: it.id, rule: "non-empty-costs", detail: "a trade-less buff cannot ship" });
    if (it.benefits.length === 0) out.push({ itemId: it.id, rule: "non-empty-benefits", detail: "a pure cost is not a trade" });
    for (const m of it.benefits) if (!isBenefit(m)) out.push({ itemId: it.id, rule: "benefit-sign", detail: `${m.stat} ${m.delta} listed as a benefit is a cost` });
    for (const m of it.costs) if (isBenefit(m)) out.push({ itemId: it.id, rule: "cost-sign", detail: `${m.stat} ${m.delta} listed as a cost is a benefit` });
    const b = it.benefits.reduce((a, m) => a + modWeight(m), 0);
    const c = it.costs.reduce((a, m) => a + modWeight(m), 0);
    // nodes reconcile exactly; a keystone may over-pay (the violent trade) but never come out ahead
    const tol = it.kind === "keystone" ? RECONCILE_TOLERANCE * 6 : RECONCILE_TOLERANCE;
    const bad = it.kind === "keystone" ? b > c + tol : Math.abs(b - c) > tol;
    if (bad) out.push({ itemId: it.id, rule: "reconciled", detail: `benefits weigh ${b.toFixed(1)}, costs ${c.toFixed(1)} (tolerance ${tol})` });
    if (it.kind === "node") for (const m of [...it.benefits, ...it.costs]) if (NODE_FORBIDDEN_STATS.has(m.stat)) out.push({ itemId: it.id, rule: "flat-health", detail: `${m.stat} is not tradeable on a node` });
    for (const l of it.links) {
      if (!ids.has(l)) out.push({ itemId: it.id, rule: "link-exists", detail: `links to unknown ${l}` });
      else if (it.kind === "node") {
        const other = items.find((x) => x.id === l)!;
        if (other.kind === "node" && !other.links.includes(it.id)) out.push({ itemId: it.id, rule: "link-symmetric", detail: `${l} does not link back` });
      }
    }
    if (it.cost <= 0) out.push({ itemId: it.id, rule: "positive-price", detail: "Scrip price must be positive" });
    for (const m of [...it.benefits, ...it.costs]) {
      const limit = m.stat === "maxHealth" || m.stat === "maxShield" ? 60 : m.stat === "grenades" ? 3 : 2;
      if (!Number.isFinite(m.delta) || Math.abs(m.delta) > limit) out.push({ itemId: it.id, rule: "sane-delta", detail: `${m.stat} ${m.delta}` });
    }
  }
  return out;
}
