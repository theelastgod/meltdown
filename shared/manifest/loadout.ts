/**
 * A loadout is what a Blank attests for a match. Legality is validated
 * server-side at spawn: at most 7 attested nodes, all owned, forming a
 * connected subgraph; at most one keystone, linked to the attestation;
 * Depth-gated weapons; nothing else. Unknown fields (a Kernel Protocol, say)
 * are refused, not stripped silently.
 */
import { ALL_ITEMS, MAX_ATTESTED, MAX_KEYSTONES, itemById } from "./items";
import { applyMods, baseSheet, modWeight, type StatSheet } from "./stats";
import { WEAPONS, type WeaponId } from "../weapons/manifest";

export interface Loadout {
  primary: WeaponId;
  secondary: WeaponId;
  attested: string[];
  keystone: string | null;
}

export const DEFAULT_LOADOUT: Loadout = { primary: "lease_breaker", secondary: "shock_baton", attested: [], keystone: null };

/** Depth at which each weapon becomes available. Everything baseline is in by Depth 5. */
export const WEAPON_DEPTH: Record<WeaponId, number> = { lease_breaker: 1, stack_smg: 1, shock_baton: 1, repo_hammer: 2, longwave: 3, phage: 5 };

export interface LoadoutError {
  rule: string;
  detail: string;
}

const KNOWN_FIELDS = new Set(["primary", "secondary", "attested", "keystone"]);

export function validateLoadout(raw: unknown, owned: readonly string[], depth: number): { ok: boolean; errors: LoadoutError[]; loadout: Loadout } {
  const errors: LoadoutError[] = [];
  const lo = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  for (const k of Object.keys(lo)) if (!KNOWN_FIELDS.has(k)) errors.push({ rule: "unknown-field", detail: `field "${k}" is not part of a PvP loadout` });
  const primary = typeof lo.primary === "string" && lo.primary in WEAPONS ? (lo.primary as WeaponId) : null;
  const secondary = typeof lo.secondary === "string" && lo.secondary in WEAPONS ? (lo.secondary as WeaponId) : null;
  if (!primary) errors.push({ rule: "weapon", detail: `unknown primary ${String(lo.primary)}` });
  if (!secondary) errors.push({ rule: "weapon", detail: `unknown secondary ${String(lo.secondary)}` });
  for (const w of [primary, secondary]) if (w && WEAPON_DEPTH[w] > depth) errors.push({ rule: "weapon-depth", detail: `${w} needs Depth ${WEAPON_DEPTH[w]} (you are ${depth})` });
  const attested = Array.isArray(lo.attested) ? lo.attested.filter((x): x is string => typeof x === "string") : [];
  if (!Array.isArray(lo.attested) && lo.attested !== undefined) errors.push({ rule: "attested-shape", detail: "attested must be a list of node ids" });
  if (attested.length > MAX_ATTESTED) errors.push({ rule: "attest-limit", detail: `${attested.length} attested, max ${MAX_ATTESTED}` });
  const seen = new Set<string>();
  for (const id of attested) {
    if (seen.has(id)) errors.push({ rule: "duplicate", detail: `${id} attested twice` });
    seen.add(id);
    const it = itemById(id);
    if (!it) errors.push({ rule: "unknown-node", detail: id });
    else if (it.kind !== "node") errors.push({ rule: "not-a-node", detail: `${id} is a ${it.kind}` });
    else if (!owned.includes(id)) errors.push({ rule: "not-owned", detail: `${id} is not in your file` });
  }
  // connectivity over the attested subgraph
  const set = new Set(attested.filter((id) => itemById(id)?.kind === "node"));
  if (set.size > 1) {
    const start = [...set][0]!;
    const reach = new Set<string>([start]);
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const l of itemById(cur)?.links ?? []) if (set.has(l) && !reach.has(l)) {
        reach.add(l);
        stack.push(l);
      }
    }
    if (reach.size !== set.size) errors.push({ rule: "connected", detail: `attestation is not a connected subgraph (${reach.size} of ${set.size} reachable from ${start})` });
  }
  let keystone: string | null = null;
  if (lo.keystone !== undefined && lo.keystone !== null) {
    if (typeof lo.keystone !== "string") errors.push({ rule: "keystone-shape", detail: "keystone must be an id" });
    else {
      const k = itemById(lo.keystone);
      if (!k || k.kind !== "keystone") errors.push({ rule: "unknown-keystone", detail: lo.keystone });
      else if (!owned.includes(k.id)) errors.push({ rule: "not-owned", detail: `${k.id} is not in your file` });
      else if (set.size > 0 && !k.links.some((l) => set.has(l))) errors.push({ rule: "keystone-linked", detail: `${k.id} must touch an attested node (${k.links.join(", ")})` });
      else keystone = k.id;
    }
  }
  if (Array.isArray(lo.keystone)) errors.push({ rule: "keystone-limit", detail: `max ${MAX_KEYSTONES} keystone` });
  return {
    ok: errors.length === 0,
    errors,
    loadout: { primary: primary ?? "lease_breaker", secondary: secondary ?? "shock_baton", attested: [...set], keystone },
  };
}

/** The stat sheet a loadout produces. Client and server call this with the same validated loadout. */
export function sheetFor(loadout: Loadout): StatSheet {
  let sheet = baseSheet();
  for (const id of loadout.attested) {
    const it = itemById(id);
    if (it) sheet = applyMods(sheet, [...it.benefits, ...it.costs]);
  }
  if (loadout.keystone) {
    const k = itemById(loadout.keystone);
    if (k) sheet = applyMods(sheet, [...k.benefits, ...k.costs]);
  }
  return sheet;
}

/** Weighted budget delta of a loadout on the Auditor's ledger: benefits minus costs (≤ 0 when every item reconciles). */
export function netDelta(loadout: Loadout): number {
  let d = 0;
  for (const id of [...loadout.attested, ...(loadout.keystone ? [loadout.keystone] : [])]) {
    const it = ALL_ITEMS.find((x) => x.id === id);
    if (!it) continue;
    for (const m of it.benefits) d += modWeight(m);
    for (const m of it.costs) d -= modWeight(m);
  }
  return d;
}
