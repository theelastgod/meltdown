/**
 * AUDITS: weekly server-seeded mutator playlists with leaderboards — the
 * buildcraft gym. A playlist changes the rules for everyone in the room
 * the same way (weapons allowed, a sheet mutator, gravity) so breadth of
 * ownership and mastery matters; the score is the match's XP. Rules are
 * symmetric, so the Fairness Lint's guarantees hold inside a playlist.
 */
import type { StatKey } from "../manifest/stats";
import type { WeaponId } from "../weapons/manifest";
import type { Loadout } from "../manifest/loadout";
import { weekIndex } from "./clock";

export interface AuditDef {
  id: string;
  name: string;
  line: string;
  /** weapons a loadout may bring (primary and secondary); empty = any */
  weapons: WeaponId[];
  /** a keystone may not be attested */
  noKeystone?: boolean;
  /** only nodes of this ring may be attested */
  ringOnly?: number;
  /** a symmetric sheet mutator for every file in the room */
  sheet: Partial<Record<StatKey, number>>;
  gravityMult: number;
}

const a = (id: string, name: string, line: string, weapons: WeaponId[], sheet: AuditDef["sheet"], gravityMult = 1, extra: Partial<AuditDef> = {}): AuditDef => ({ id, name, line, weapons, sheet, gravityMult, ...extra });

export const AUDITS: readonly AuditDef[] = [
  a("pellet_week", "PELLET WEEK", "Repo Hammer and Clockeater only. Every file is a shotgun file.", ["repo_hammer", "clockeater", "shock_baton"], {}),
  a("glass", "GLASS", "Shields off, +20% move. Every shot counts twice.", [], { maxShield: -100, moveSpeed: 1.2 }),
  a("long_lease", "LONG LEASE", "Longwave and the Directive only; range ×1.3. The streets get long.", ["longwave", "directive", "shock_baton"], { range: 1.3 }),
  a("no_keystone", "NO KEYSTONE", "Keystones are not attested this week. Nodes carry the file.", [], {}, 1, { noKeystone: true }),
  a("ring_one", "RING ONE", "Only ring-one nodes may be attested. Back to the first ledger.", [], {}, 1, { ringOnly: 1 }),
  a("low_lease", "LOW LEASE", "Gravity ×0.6, slide boost +25%. The city floats.", [], { slideBoost: 1.25 }, 0.6),
  a("heavy_air", "HEAVY AIR", "Gravity ×1.4, reload ×1.15. Nothing hangs.", [], { reloadSpeed: 1.15 }, 1.4),
  a("stack_and_phage", "STACK & PHAGE", "Stack SMG and Phage only, grenades +1.", ["stack_smg", "phage", "shock_baton"], { grenades: 1 }),
];

export function auditFor(week: number): AuditDef {
  return AUDITS[((week % AUDITS.length) + AUDITS.length) % AUDITS.length]!;
}

export const currentAudit = (now = Date.now()): { week: number; audit: AuditDef } => ({ week: weekIndex(now), audit: auditFor(weekIndex(now)) });

export interface AuditError {
  rule: string;
  detail: string;
}

/** The playlist's own loadout rules, on top of the normal validation. */
export function auditErrors(lo: Loadout, audit: AuditDef, ringOf: (id: string) => number | undefined): AuditError[] {
  const errs: AuditError[] = [];
  if (audit.weapons.length) for (const w of [lo.primary, lo.secondary]) if (!audit.weapons.includes(w)) errs.push({ rule: "audit-weapon", detail: `${w} is not in ${audit.name} (${audit.weapons.join(", ")})` });
  if (audit.noKeystone && lo.keystone) errs.push({ rule: "audit-keystone", detail: `${audit.name}: no keystone this week` });
  if (audit.ringOnly) for (const id of lo.attested) if ((ringOf(id) ?? 0) !== audit.ringOnly) errs.push({ rule: "audit-ring", detail: `${id} is not a ring-${audit.ringOnly} node` });
  return errs;
}

export interface AuditEntry {
  account: string;
  display: string;
  score: number;
  at: number;
}

/** A leaderboard: best score per file, top N. */
export function leaderboard(entries: readonly AuditEntry[], n = 20): AuditEntry[] {
  const best = new Map<string, AuditEntry>();
  for (const e of entries) {
    const cur = best.get(e.account);
    if (!cur || e.score > cur.score) best.set(e.account, e);
  }
  return [...best.values()].sort((x, y) => y.score - x.score || x.at - y.at).slice(0, n);
}
