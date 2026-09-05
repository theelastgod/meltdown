/**
 * PvP items: Ledger Graph nodes and keystones. Every item is a paired trade;
 * the schema refuses an item without costs. 48 nodes in three rings (Stage 7)
 * and the three launch keystones.
 */
import { ADDITIVE, BUDGET_PER_PERCENT, isBenefit, modWeight, type StatMod } from "./stats";

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
/**
 * Stats no PvP node may touch: effective health and damage are flat, so every
 * weapon's shot count holds for every build (a damage cost stacked along a
 * chain crosses breakpoints; the lint proved it). Headshot multipliers are
 * paid with handling, shield and mobility instead — growth you have to aim.
 */
export const NODE_FORBIDDEN_STATS = new Set(["maxHealth", "maxShield", "damage"]);

const node = (id: string, name: string, ring: number, requiresDepth: number, cost: number, links: string[], benefits: StatMod[], costs: StatMod[], line: string): LedgerItem => ({ id, kind: "node", name, ring, requiresDepth, cost, links, benefits, costs, line });

/**
 * Author a reconciled node: the last cost is scaled so the ledger balances
 * exactly (to a quarter percent). Every trade is still hand-chosen; the
 * Auditor only settles the change.
 */
/** What the Auditor settled on each node: authored benefit/cost weights and the scale applied to the costs. */
export const RECONCILE_LOG: { id: string; benefits: number; costs: number; scale: number }[] = [];

function reconciled(id: string, name: string, ring: number, requiresDepth: number, cost: number, benefits: StatMod[], costs: StatMod[], line: string): LedgerItem {
  const b = benefits.reduce((a, m) => a + modWeight(m), 0);
  const c0 = costs.reduce((a, m) => a + modWeight(m), 0);
  RECONCILE_LOG.push({ id, benefits: b, costs: c0, scale: b / c0 });
  // scale the authored costs to the benefits (keeps the trade's shape), rounding to a quarter percent
  const q = (stat: StatMod["stat"], delta: number) => (ADDITIVE.has(stat) ? Math.max(1, Math.round(Math.abs(delta))) : Math.max(0.0025, Math.round((Math.abs(delta) * 100) / 0.25) * 0.0025)) * Math.sign(delta);
  const scaled = costs.map((m) => ({ stat: m.stat, delta: q(m.stat, m.delta * (b / c0)) }));
  // settle the rounding residue on the last cost
  const fixed = scaled.slice(0, -1).reduce((a, m) => a + modWeight(m), 0);
  const last = scaled[scaled.length - 1]!;
  const need = Math.max(0, b - fixed);
  const per = BUDGET_PER_PERCENT[last.stat];
  const unit = ADDITIVE.has(last.stat) ? 1 : 0.0025;
  const units = Math.max(1, Math.round(need / per / (ADDITIVE.has(last.stat) ? 1 : 0.25)));
  last.delta = units * unit * Math.sign(last.delta);
  return node(id, name, ring, requiresDepth, cost, [], benefits, scaled, line);
}

const m = (stat: StatMod["stat"], delta: number): StatMod => ({ stat, delta });

/**
 * The Ledger Graph: 48 nodes in three rings. Ring 1 is the first district
 * (Depth 1–4), ring 2 the trades a working Blank makes (Depth 6–14), ring 3
 * the market's own language (Depth 16–30). Links are generated below as a
 * hex constellation: neighbours around each ring and the nearest nodes in
 * the adjacent rings, so path-carving is a real build decision.
 */
const RING1: LedgerItem[] = [
  // ordered so mobility trades alternate sign around the ring (chains of neighbours net out)
  reconciled("slipfile", "SLIPFILE", 1, 1, 400, [m("slideBoost", 0.1), m("slideFriction", -0.1)], [m("adsMove", -0.12), m("recoil", 0.05)], "SLIPFILE: +10% slide / −12% ADS strafe, +5% recoil"),
  reconciled("static_skin", "STATIC SKIN", 1, 1, 400, [m("droneDetect", -0.3)], [m("footstep", 0.2), m("reloadSpeed", -0.07)], "STATIC SKIN: −30% drone detection / footsteps +20% louder, −7% reload"),
  reconciled("curb_weight", "CURB WEIGHT", 1, 3, 420, [m("mantleTime", -0.15), m("adsMove", 0.06)], [m("slideBoost", -0.08), m("throwSpeed", -0.06), m("reloadSpeed", -0.06)], "CURB WEIGHT: faster mantle, +6% ADS strafe / −8% slide, weaker throw, −6% reload"),
  reconciled("contagion_rider", "CONTAGION RIDER", 1, 1, 450, [m("flipRate", 0.2)], [m("shieldRegen", -0.25), m("shieldDelay", 0.15)], "CONTAGION RIDER: +20% node flip / −25% shield regen, later shield"),
  reconciled("long_lease", "LONG LEASE", 1, 2, 450, [m("range", 0.03), m("spread", -0.08)], [m("fireRate", -0.02), m("reloadSpeed", -0.04)], "LONG LEASE: +3% range, −8% spread / −2% fire rate, −4% reload"),
  reconciled("quiet_ledger", "QUIET LEDGER", 1, 2, 400, [m("footstep", -0.3), m("mantleTime", -0.05)], [m("moveSpeed", -0.02), m("shieldDelay", 0.12), m("reloadSpeed", -0.04)], "QUIET LEDGER: −30% footsteps, faster mantle / −2% move, later shield, −4% reload"),
  reconciled("night_fare", "NIGHT FARE", 1, 3, 420, [m("throwSpeed", 0.15), m("slideBoost", 0.06)], [m("footstep", 0.12), m("shieldRegen", -0.1)], "NIGHT FARE: +15% throw, +6% slide / louder, −10% regen"),
  reconciled("spite_clause", "SPITE CLAUSE", 1, 3, 500, [m("headMult", 0.12)], [m("reloadSpeed", -0.1), m("shieldRegen", -0.15)], "SPITE CLAUSE: +12% headshot / −10% reload, −15% regen"),
  reconciled("collateral", "COLLATERAL", 1, 3, 500, [m("shieldRegen", 0.4)], [m("moveSpeed", -0.02), m("reloadSpeed", -0.2)], "COLLATERAL: +40% shield regen / −2% move, −20% reload"),
  reconciled("hair_trigger", "HAIR TRIGGER", 1, 4, 500, [m("reloadSpeed", 0.08), m("recoil", -0.1)], [m("spread", 0.19)], "HAIR TRIGGER: +8% reload, −10% recoil / +19% spread"),
  reconciled("cold_file", "COLD FILE", 1, 2, 420, [m("shieldDelay", -0.2), m("slideBoost", 0.05)], [m("shieldRegen", -0.15), m("footstep", 0.1)], "COLD FILE: shield returns sooner, +5% slide / slower regen, louder"),
  reconciled("paper_trail", "PAPER TRAIL", 1, 4, 450, [m("droneDetect", -0.15), m("range", 0.02)], [m("reloadSpeed", -0.08), m("mantleTime", 0.06)], "PAPER TRAIL: −15% drone detection, +2% range / −8% reload, slower mantle"),
];

const RING2: LedgerItem[] = [
  reconciled("escrow", "ESCROW", 2, 8, 800, [m("grenades", 1)], [m("throwSpeed", -0.1), m("droneDetect", 0.12)], "ESCROW: +1 grenade / weaker throw, easier to spot"),
  reconciled("wake_lung", "WAKE LUNG", 2, 10, 900, [m("moveSpeed", 0.025)], [m("shieldDelay", 0.08)], "WAKE LUNG: +2.5% move / later shield"),
  reconciled("repo_grip", "REPO GRIP", 2, 8, 800, [m("recoil", -0.15), m("spread", -0.1)], [m("reloadSpeed", -0.22)], "REPO GRIP: −15% recoil, −10% spread / −22% reload speed"),
  reconciled("lease_lapse", "LEASE LAPSE", 2, 7, 750, [m("shieldRegen", 0.25), m("shieldDelay", -0.1)], [m("moveSpeed", -0.02), m("slideBoost", -0.05), m("reloadSpeed", -0.1), m("footstep", 0.14)], "LEASE LAPSE: shield back faster / −2% move, −5% slide, −10% reload, louder"),
  reconciled("dead_drop", "DEAD DROP", 2, 6, 700, [m("footstep", -0.4)], [m("adsMove", -0.1), m("reloadSpeed", -0.06), m("throwSpeed", -0.12)], "DEAD DROP: −40% footsteps / −10% ADS strafe, −6% reload, weaker throw"),
  reconciled("float", "FLOAT", 2, 10, 900, [m("slideBoost", 0.12), m("slideFriction", -0.1)], [m("shieldDelay", 0.2), m("footstep", 0.1)], "FLOAT: long slides / late shield, louder"),
  reconciled("grey_market", "GREY MARKET", 2, 6, 700, [m("reloadSpeed", 0.12)], [m("recoil", 0.08), m("spread", 0.06)], "GREY MARKET: +12% reload / +8% recoil, +6% spread"),
  reconciled("sunk_cost", "SUNK COST", 2, 11, 950, [m("shieldRegen", 0.5)], [m("slideBoost", -0.1), m("mantleTime", 0.1), m("throwSpeed", -0.08), m("reloadSpeed", -0.14), m("spread", 0.06)], "SUNK COST: +50% regen / −10% slide, slower mantle, weaker throw, −14% reload, +6% spread"),
  reconciled("ghost_receipt", "GHOST RECEIPT", 2, 7, 750, [m("droneDetect", -0.25), m("footstep", -0.1)], [m("flipRate", -0.1), m("throwSpeed", -0.05)], "GHOST RECEIPT: hard to model / −10% node flip, weaker throw"),
  reconciled("kite", "KITE", 2, 13, 1050, [m("moveSpeed", 0.02), m("mantleTime", -0.08)], [m("shieldRegen", -0.08), m("shieldDelay", 0.05)], "KITE: +2% move, faster mantle / slower, later shield"),
  reconciled("burn_notice", "BURN NOTICE", 2, 8, 800, [m("throwSpeed", 0.2), m("grenades", 1)], [m("shieldRegen", -0.16), m("droneDetect", 0.15)], "BURN NOTICE: +1 grenade, +20% throw / −16% regen, loud on the model"),
  reconciled("arrears", "ARREARS", 2, 10, 900, [m("spread", -0.12), m("recoil", -0.08)], [m("moveSpeed", -0.02), m("reloadSpeed", -0.1)], "ARREARS: tighter, steadier / −2% move, −10% reload"),
  reconciled("double_entry", "DOUBLE ENTRY", 2, 9, 850, [m("flipRate", 0.15), m("mantleTime", -0.1)], [m("adsMove", -0.15), m("recoil", 0.06), m("reloadSpeed", -0.09)], "DOUBLE ENTRY: +15% flip, faster mantle / −15% ADS strafe, +6% recoil, −9% reload"),
  reconciled("red_ink", "RED INK", 2, 9, 850, [m("headMult", 0.08), m("range", 0.02)], [m("shieldRegen", -0.16), m("reloadSpeed", -0.06)], "RED INK: +8% headshot, +2% range / −16% regen, −6% reload"),
  reconciled("short_squeeze", "SHORT SQUEEZE", 2, 12, 1000, [m("adsMove", 0.18), m("slideBoost", 0.05)], [m("spread", 0.1), m("recoil", 0.05), m("reloadSpeed", -0.06)], "SHORT SQUEEZE: +18% ADS strafe, +5% slide / +10% spread, +5% recoil, −6% reload"),
  reconciled("wire_fraud", "WIRE FRAUD", 2, 11, 950, [m("droneDetect", -0.35)], [m("range", -0.03), m("footstep", 0.15), m("moveSpeed", -0.01), m("reloadSpeed", -0.05)], "WIRE FRAUD: −35% drone detection / −3% range, louder, −1% move, −5% reload"),
  reconciled("bad_paper", "BAD PAPER", 2, 12, 1000, [m("reloadSpeed", 0.15), m("throwSpeed", 0.08)], [m("shieldRegen", -0.2), m("droneDetect", 0.1)], "BAD PAPER: +15% reload, +8% throw / −20% regen, easier to spot"),
  reconciled("hollow_point", "HOLLOW POINT", 2, 14, 1100, [m("headMult", 0.15)], [m("shieldDelay", 0.15), m("range", -0.03), m("slideBoost", -0.05), m("reloadSpeed", -0.08)], "HOLLOW POINT: +15% headshot / later shield, −3% range, −5% slide, −8% reload"),
];

const RING3: LedgerItem[] = [
  reconciled("meltdown_clause", "MELTDOWN CLAUSE", 3, 16, 1400, [m("flipRate", 0.3)], [m("shieldRegen", -0.35), m("droneDetect", 0.2), m("footstep", 0.15)], "MELTDOWN CLAUSE: +30% node flip / −35% regen, loud on the model"),
  reconciled("acceleration", "ACCELERATION", 3, 18, 1500, [m("moveSpeed", 0.03)], [m("shieldRegen", -0.06), m("footstep", 0.05)], "ACCELERATION: +3% move / −6% regen, a little louder"),
  reconciled("counterparty", "COUNTERPARTY", 3, 16, 1400, [m("shieldRegen", 0.4), m("shieldDelay", -0.1)], [m("moveSpeed", -0.02), m("slideBoost", -0.06), m("reloadSpeed", -0.18), m("spread", 0.06), m("throwSpeed", -0.08)], "COUNTERPARTY: shield like a wall / −2% move, −6% slide, −18% reload, +6% spread, weak throw"),
  reconciled("runaway", "RUNAWAY", 3, 17, 1450, [m("slideBoost", 0.15), m("slideFriction", -0.15)], [m("adsMove", -0.15), m("shieldDelay", 0.12)], "RUNAWAY: the longest slides / −15% ADS strafe, late shield"),
  reconciled("margin_call", "MARGIN CALL", 3, 17, 1450, [m("reloadSpeed", 0.25)], [m("spread", 0.12), m("recoil", 0.1), m("mantleTime", 0.06)], "MARGIN CALL: +25% reload / +12% spread, +10% recoil, slower mantle"),
  reconciled("capital_flight", "CAPITAL FLIGHT", 3, 19, 1550, [m("mantleTime", -0.2), m("adsMove", 0.1)], [m("slideBoost", -0.12), m("throwSpeed", -0.1), m("reloadSpeed", -0.07)], "CAPITAL FLIGHT: fast mantle, +10% ADS strafe / −12% slide, weak throw, −7% reload"),
  reconciled("clearing_house", "CLEARING HOUSE", 3, 18, 1500, [m("grenades", 1), m("throwSpeed", 0.1)], [m("shieldDelay", 0.12), m("reloadSpeed", -0.07)], "CLEARING HOUSE: +1 grenade, +10% throw / late shield, −7% reload"),
  reconciled("front_run", "FRONT RUN", 3, 24, 1800, [m("moveSpeed", 0.02), m("slideBoost", 0.08)], [m("shieldDelay", 0.08), m("droneDetect", 0.08)], "FRONT RUN: +2% move, +8% slide / late shield, easier to spot"),
  reconciled("dark_pool", "DARK POOL", 3, 19, 1550, [m("droneDetect", -0.45), m("footstep", -0.2)], [m("flipRate", -0.15), m("range", -0.03), m("reloadSpeed", -0.1)], "DARK POOL: nearly off the model / −15% flip, −3% range, −10% reload"),
  reconciled("yield", "YIELD", 3, 28, 2000, [m("shieldRegen", 0.35), m("flipRate", 0.1)], [m("moveSpeed", -0.02), m("mantleTime", 0.1), m("reloadSpeed", -0.16), m("spread", 0.08), m("footstep", 0.12)], "YIELD: +35% regen, +10% flip / −2% move, slower mantle, −16% reload, +8% spread, louder"),
  reconciled("liquidation", "LIQUIDATION", 3, 20, 1600, [m("headMult", 0.18)], [m("shieldRegen", -0.25), m("reloadSpeed", -0.08), m("adsMove", -0.06)], "LIQUIDATION: +18% headshot / −25% regen, −8% reload, −6% ADS strafe"),
  reconciled("black_swan", "BLACK SWAN", 3, 30, 2200, [m("droneDetect", -0.5), m("mantleTime", -0.1), m("slideBoost", 0.05)], [m("shieldRegen", -0.3), m("flipRate", -0.1), m("reloadSpeed", -0.06)], "BLACK SWAN: invisible to the model, quick over walls / −30% regen, −10% flip, −6% reload"),
  reconciled("haircut", "HAIRCUT", 3, 20, 1600, [m("recoil", -0.2), m("spread", -0.12)], [m("reloadSpeed", -0.15), m("moveSpeed", -0.015), m("shieldDelay", 0.12)], "HAIRCUT: −20% recoil, −12% spread / −15% reload, −1.5% move, later shield"),
  reconciled("circuit_breaker", "CIRCUIT BREAKER", 3, 22, 1700, [m("shieldDelay", -0.3), m("slideBoost", 0.06)], [m("shieldRegen", -0.2), m("adsMove", -0.08)], "CIRCUIT BREAKER: shield returns at once, +6% slide / regens slower, −8% ADS strafe"),
  reconciled("stop_loss", "STOP LOSS", 3, 22, 1700, [m("range", 0.03), m("spread", -0.06)], [m("fireRate", -0.02), m("reloadSpeed", -0.02), m("mantleTime", 0.05)], "STOP LOSS: +3% range, −6% spread / −2% fire rate, −2% reload, slower mantle"),
  reconciled("leverage", "LEVERAGE", 3, 24, 1800, [m("throwSpeed", 0.25), m("grenades", 1), m("slideBoost", 0.05)], [m("shieldRegen", -0.22), m("footstep", 0.2)], "LEVERAGE: +1 grenade, +25% throw, +5% slide / −22% regen, loud"),
  reconciled("wash_trade", "WASH TRADE", 3, 26, 1900, [m("flipRate", 0.2), m("footstep", -0.15)], [m("adsMove", -0.15), m("throwSpeed", -0.1), m("moveSpeed", -0.01), m("reloadSpeed", -0.12), m("spread", 0.06)], "WASH TRADE: +20% flip, quieter / −15% ADS strafe, weak throw, −1% move, −12% reload, +6% spread"),
  reconciled("default_swap", "DEFAULT SWAP", 3, 26, 1900, [m("reloadSpeed", 0.2), m("recoil", -0.1), m("mantleTime", -0.06)], [m("spread", 0.15), m("range", -0.03), m("shieldDelay", 0.12), m("droneDetect", 0.1)], "DEFAULT SWAP: +20% reload, −10% recoil, faster mantle / +15% spread, −3% range, later shield, easier to spot"),
];

/** Hex constellation links: neighbours around each ring, plus the nearest nodes in the adjacent rings by angle. */
function linkRings(rings: LedgerItem[][]): void {
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r]!;
    const n = ring.length;
    for (let k = 0; k < n; k++) {
      const it = ring[k]!;
      const add = (id: string) => {
        if (id === it.id) return;
        if (!it.links.includes(id)) it.links.push(id);
        const other = rings.flat().find((x) => x.id === id)!;
        if (!other.links.includes(it.id)) other.links.push(it.id); // links are always mutual
      };
      add(ring[(k + 1) % n]!.id);
      add(ring[(k - 1 + n) % n]!.id);
      const ang = k / n;
      for (const rr of [r - 1, r + 1]) {
        const other = rings[rr];
        if (!other) continue;
        // nearest by angle (one link outward/inward; ring 2 nodes also reach a second ring-3 node)
        const j = Math.round(ang * other.length) % other.length;
        add(other[j]!.id);
        if (rr > r && r === 1 && other.length > n) add(other[(j + 1) % other.length]!.id);
      }
    }
  }
}
linkRings([RING1, RING2, RING3]);

export const LEDGER_ITEMS: LedgerItem[] = [...RING1, ...RING2, ...RING3];

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
