/**
 * Kernel Protocols: campaign-only power. Real +damage / +health / +rate
 * co-op gear, visually corrupted with blood-red Kernel filament so it can
 * never be mistaken for PvP-legal. This module is never imported by the
 * PvP room, the match Durable Object, or the loadout validator; a loadout
 * that carries a `protocols` field is stripped at PvP join and re-validated.
 */
import type { StatKey } from "../manifest/stats";

export interface ProtocolDef {
  id: string;
  name: string;
  line: string;
  /** multiplicative on the stat sheet (additive stats add) */
  mods: Partial<Record<StatKey, number>>;
  /** always true: the renderer draws the filament from this */
  corrupted: true;
}

const p = (id: string, name: string, line: string, mods: ProtocolDef["mods"]): ProtocolDef => ({ id, name, line, mods, corrupted: true });

export const PROTOCOLS: readonly ProtocolDef[] = [
  p("filament_core", "FILAMENT CORE", "+15% damage. The filament runs down the barrel and into your wrist.", { damage: 1.15 }),
  p("red_lease", "RED LEASE", "+35 health. Your file is written in Wern's ink now.", { maxHealth: 35 }),
  p("wern_pulse", "WERN PULSE", "+12% fire rate, +10% reload. The rhythm of the Directive.", { fireRate: 1.12, reloadSpeed: 1.1 }),
  p("blood_ledger", "BLOOD LEDGER", "shield regen ×1.5. The model heals what it prices.", { shieldRegen: 1.5 }),
  p("directive_optic", "DIRECTIVE OPTIC", "+15% range, +20% headshot multiplier. See the city the way the Kernel does.", { range: 1.15, headMult: 1.2 }),
];

export const protocolById = (id: string): ProtocolDef | undefined => PROTOCOLS.find((x) => x.id === id);

/** The combined campaign sheet for a set of equipped protocols (unknown ids ignored). At most three are worn. */
export const MAX_PROTOCOLS = 3;
export function protocolMods(ids: readonly string[]): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};
  for (const id of ids.slice(0, MAX_PROTOCOLS)) {
    const d = protocolById(id);
    if (!d) continue;
    for (const [k, v] of Object.entries(d.mods) as [StatKey, number][]) {
      if (k === "maxHealth" || k === "maxShield" || k === "grenades") out[k] = (out[k] ?? 0) + v;
      else out[k] = (out[k] ?? 1) * v;
    }
  }
  return out;
}
