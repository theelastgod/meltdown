/**
 * Chips: weapon-scoped socketables unlocked by mastery rank. Three sockets
 * per weapon — Muzzle (range / recoil / audio trades), Kinetic (handling /
 * mobility trades), Protocol (fiction-mechanic trades). Every chip is a
 * paired trade on the same ledger as the Ledger Graph; a chip's mods apply
 * only while that weapon is held. ~120 at launch: 20 per weapon.
 */
import { WEAPON_LIST, type WeaponId } from "../weapons/manifest";
import { isBenefit, modWeight, type StatMod } from "./stats";

export type Socket = "muzzle" | "kinetic" | "protocol";

/** Fiction mechanics a Protocol chip can carry (resolved in the world, not the sheet). */
export type ChipMechanic =
  | "contagion_kill" // a kill boosts the nearest node's pull for 4 s
  | "escrow_kill" // a kill restores 10 shield
  | "vantage_bane"; // +25% damage to VANTAGE units

export interface ChipDef {
  id: string;
  weapon: WeaponId;
  socket: Socket;
  name: string;
  /** mastery rank that unlocks it (1–30) */
  rank: number;
  benefits: StatMod[];
  costs: StatMod[];
  mechanic?: ChipMechanic;
  line: string;
}

const m = (stat: StatMod["stat"], delta: number): StatMod => ({ stat, delta });

interface Template {
  key: string;
  socket: Socket;
  name: string;
  rank: number;
  benefits: StatMod[];
  costs: StatMod[];
  mechanic?: ChipMechanic;
  line: string;
}

/** Twenty trades per weapon; the numbers are shared, the names are the weapon's. */
const TEMPLATES: Template[] = [
  // ---- muzzle: range / recoil / audio ----
  { key: "long_barrel", socket: "muzzle", name: "LONG BARREL", rank: 2, benefits: [m("range", 0.03)], costs: [m("recoil", 0.04)], line: "+3% range / +4% recoil" },
  { key: "suppressor", socket: "muzzle", name: "SUPPRESSOR", rank: 4, benefits: [m("droneDetect", -0.2)], costs: [m("range", -0.03), m("reloadSpeed", -0.08)], line: "−20% drone detection / −3% range, −8% reload" },
  { key: "compensator", socket: "muzzle", name: "COMPENSATOR", rank: 6, benefits: [m("recoil", -0.12)], costs: [m("spread", 0.12)], line: "−12% recoil / +12% spread" },
  { key: "choke", socket: "muzzle", name: "CHOKE", rank: 9, benefits: [m("spread", -0.12)], costs: [m("recoil", 0.12)], line: "−12% spread / +12% recoil" },
  { key: "ported", socket: "muzzle", name: "PORTED", rank: 12, benefits: [m("recoil", -0.08)], costs: [m("droneDetect", 0.12)], line: "−8% recoil / louder on the model" },
  { key: "heavy_barrel", socket: "muzzle", name: "HEAVY BARREL", rank: 16, benefits: [m("range", 0.03), m("spread", -0.05)], costs: [m("adsMove", -0.09)], line: "+3% range, −5% spread / −9% ADS strafe" },
  { key: "flash_cut", socket: "muzzle", name: "FLASH CUT", rank: 22, benefits: [m("spread", -0.08), m("droneDetect", -0.08)], costs: [m("recoil", 0.08), m("reloadSpeed", -0.045)], line: "−8% spread, quieter / +8% recoil, −4.5% reload" },
  // ---- kinetic: handling / mobility ----
  { key: "light_stock", socket: "kinetic", name: "LIGHT STOCK", rank: 3, benefits: [m("adsMove", 0.1)], costs: [m("recoil", 0.1)], line: "+10% ADS strafe / +10% recoil" },
  { key: "fast_mag", socket: "kinetic", name: "FAST MAG", rank: 5, benefits: [m("reloadSpeed", 0.12)], costs: [m("spread", 0.14)], line: "+12% reload / +14% spread" },
  { key: "grip_tape", socket: "kinetic", name: "GRIP TAPE", rank: 8, benefits: [m("recoil", -0.1)], costs: [m("reloadSpeed", -0.085)], line: "−10% recoil / −8.5% reload" },
  { key: "sling", socket: "kinetic", name: "SLING", rank: 11, benefits: [m("moveSpeed", 0.015)], costs: [m("reloadSpeed", -0.035)], line: "+1.5% move while held / −3.5% reload" },
  { key: "counterweight", socket: "kinetic", name: "COUNTERWEIGHT", rank: 14, benefits: [m("spread", -0.1), m("recoil", -0.04)], costs: [m("moveSpeed", -0.015), m("adsMove", -0.1)], line: "−10% spread, −4% recoil / −1.5% move, −10% ADS strafe" },
  { key: "quick_seat", socket: "kinetic", name: "QUICK SEAT", rank: 18, benefits: [m("reloadSpeed", 0.2)], costs: [m("recoil", 0.14), m("spread", 0.09)], line: "+20% reload / +14% recoil, +9% spread" },
  { key: "bump_stock", socket: "kinetic", name: "BUMP STOCK", rank: 25, benefits: [m("fireRate", 0.02)], costs: [m("spread", 0.045), m("recoil", 0.03)], line: "+2% fire rate / +4.5% spread, +3% recoil" },
  // ---- protocol: fiction mechanics ----
  { key: "contagion_round", socket: "protocol", name: "CONTAGION ROUND", rank: 7, benefits: [m("flipRate", 0.06)], costs: [m("headMult", -0.075)], mechanic: "contagion_kill", line: "kills pull the nearest node +6% for 4 s, +6% flip / −7.5% headshot" },
  { key: "escrow_lock", socket: "protocol", name: "ESCROW LOCK", rank: 10, benefits: [m("shieldRegen", 0.1)], costs: [m("reloadSpeed", -0.115)], mechanic: "escrow_kill", line: "kills restore 10 shield, +10% regen / −11.5% reload" },
  { key: "vantage_bane", socket: "protocol", name: "VANTAGE BANE", rank: 13, benefits: [m("droneDetect", -0.1)], costs: [m("footstep", 0.2)], mechanic: "vantage_bane", line: "+25% damage to VANTAGE units, −10% detection / +20% footsteps" },
  { key: "silent_lease", socket: "protocol", name: "SILENT LEASE", rank: 17, benefits: [m("footstep", -0.3)], costs: [m("reloadSpeed", -0.15)], line: "−30% footsteps while held / −15% reload" },
  { key: "wake_tuned", socket: "protocol", name: "WAKE-TUNED", rank: 21, benefits: [m("flipRate", 0.12)], costs: [m("shieldRegen", -0.24)], line: "+12% flip while held / −24% regen" },
  { key: "audit_trail", socket: "protocol", name: "AUDIT TRAIL", rank: 27, benefits: [m("droneDetect", -0.25), m("footstep", -0.1)], costs: [m("range", -0.045), m("reloadSpeed", -0.14)], line: "−25% detection, quieter / −4.5% range, −14% reload" },
];

/**
 * Spread means more on a weapon that sprays: the SMG's hip cone turns any
 * tighter-cone chip into faster kills at range (the lint measured −6..−8% TTK
 * at 25–40 m even from a −6% cone — one fewer missed round is a whole cycle),
 * so the SMG's spread benefits become recoil benefits of the same weight
 * (handling you feel, not misses you don't), and the hammer's are scaled.
 */
const SPREAD_SCALE: Partial<Record<WeaponId, number>> = { repo_hammer: 0.7 };
const SPREAD_TO_RECOIL = new Set<WeaponId>(["stack_smg"]);

function settle(benefits: StatMod[], costs: StatMod[], mechanic: boolean): StatMod[] {
  const b = benefits.reduce((a, x) => a + modWeight(x), 0) + (mechanic ? 3 : 0);
  const c = costs.reduce((a, x) => a + modWeight(x), 0);
  if (c === 0) return costs;
  const k = b / c;
  return costs.map((x) => ({ stat: x.stat, delta: Math.round(x.delta * k * 400) / 400 }));
}

export const CHIPS: ChipDef[] = WEAPON_LIST.flatMap((w) =>
  TEMPLATES.map((t) => {
    const k = SPREAD_SCALE[w.id] ?? 1;
    const benefits = t.benefits.map((x) => (x.stat === "spread" && SPREAD_TO_RECOIL.has(w.id) ? { stat: "recoil" as const, delta: x.delta } : { stat: x.stat, delta: x.stat === "spread" ? Math.round(x.delta * k * 400) / 400 : x.delta }));
    const costs = settle(benefits, t.costs.map((x) => ({ ...x })), !!t.mechanic);
    return {
      id: `${w.id}:${t.key}`,
      weapon: w.id,
      socket: t.socket,
      name: `${w.name.split(" ")[0]} ${t.name}`,
      rank: t.rank,
      benefits,
      costs,
      mechanic: t.mechanic,
      line: `${t.name}: ${t.line}`,
    };
  }),
);

export const chipById = (id: string): ChipDef | undefined => CHIPS.find((c) => c.id === id);
export const chipsFor = (weapon: WeaponId): ChipDef[] => CHIPS.filter((c) => c.weapon === weapon);

/** Schema lint for chips: paired, reconciled (mechanics are priced by the Auditor at 3 points), sane ranks. */
export function lintChipSchema(chips: readonly ChipDef[] = CHIPS): { itemId: string; rule: string; detail: string }[] {
  const out: { itemId: string; rule: string; detail: string }[] = [];
  for (const c of chips) {
    if (c.costs.length === 0) out.push({ itemId: c.id, rule: "non-empty-costs", detail: "a trade-less chip cannot ship" });
    for (const x of c.benefits) if (!isBenefit(x)) out.push({ itemId: c.id, rule: "benefit-sign", detail: `${x.stat} ${x.delta}` });
    for (const x of c.costs) if (isBenefit(x)) out.push({ itemId: c.id, rule: "cost-sign", detail: `${x.stat} ${x.delta}` });
    const b = c.benefits.reduce((a, x) => a + modWeight(x), 0) + (c.mechanic ? 3 : 0);
    const cc = c.costs.reduce((a, x) => a + modWeight(x), 0);
    if (Math.abs(b - cc) > 1.5) out.push({ itemId: c.id, rule: "reconciled", detail: `benefits weigh ${b.toFixed(1)}, costs ${cc.toFixed(1)}` });
    if (c.rank < 1 || c.rank > 30) out.push({ itemId: c.id, rule: "rank", detail: String(c.rank) });
    for (const x of [...c.benefits, ...c.costs]) if (x.stat === "damage" || x.stat === "maxHealth" || x.stat === "maxShield") out.push({ itemId: c.id, rule: "flat-damage", detail: `${x.stat} is not tradeable on a chip` });
  }
  return out;
}
