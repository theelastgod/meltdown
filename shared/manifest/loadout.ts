/**
 * A loadout is what a Blank attests for a match. Legality is validated
 * server-side at spawn: at most 7 attested nodes, all owned, forming a
 * connected subgraph; at most one keystone, linked to the attestation;
 * Depth-gated weapons; nothing else. Unknown fields (a Kernel Protocol, say)
 * are refused, not stripped silently.
 */
import { ALL_ITEMS, MAX_ATTESTED, MAX_KEYSTONES, itemById } from "./items";
import { applyMods, baseSheet, modWeight, type StatSheet } from "./stats";
import { WEAPONS, WEAPON_LIST, type WeaponDef, type WeaponId, CAMPAIGN_WEAPONS } from "../weapons/manifest";
import { chipById, type ChipMechanic, type Socket } from "./chips";
import { firmwareById, weaponWithFirmware } from "./firmwares";

/** Per-weapon sockets: chip ids by socket. */
export type ChipSlots = Partial<Record<Socket, string>>;

export interface Loadout {
  primary: WeaponId;
  secondary: WeaponId;
  attested: string[];
  keystone: string | null;
  /** chips socketed per weapon (validated against mastery rank); absent = none */
  chips?: Partial<Record<WeaponId, ChipSlots>>;
  /** firmware flashed per weapon (rank 20 / 28); absent = stock */
  firmware?: Partial<Record<WeaponId, string>>;
}

export const DEFAULT_LOADOUT: Loadout = { primary: "lease_breaker", secondary: "shock_baton", attested: [], keystone: null, chips: {}, firmware: {} };

/** Mastery ranks the validator checks chips and firmwares against (rank 1 everywhere for a fresh file). */
export type Ranks = Partial<Record<WeaponId, number>>;
export const SANDBOX_RANKS: Ranks = Object.fromEntries(WEAPON_LIST.map((w) => [w.id, 30])) as Ranks;

/** Depth at which each weapon becomes available. Everything baseline is in by Depth 5. */
export const WEAPON_DEPTH: Record<WeaponId, number> = { lease_breaker: 1, stack_smg: 1, shock_baton: 1, repo_hammer: 2, longwave: 3, phage: 5, directive: 1, clockeater: 1 };

/** Fields a campaign client may carry that a PvP loadout must not: stripped at room join, then re-validated. */
export const CAMPAIGN_ONLY_FIELDS: readonly string[] = ["protocols", "campaign"];
export function stripCampaignFields(raw: unknown): { raw: unknown; stripped: string[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { raw, stripped: [] };
  const out: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  const stripped: string[] = [];
  for (const k of CAMPAIGN_ONLY_FIELDS) if (k in out) {
    delete out[k];
    stripped.push(k);
  }
  return { raw: out, stripped };
}

export interface LoadoutError {
  rule: string;
  detail: string;
}

const KNOWN_FIELDS = new Set(["primary", "secondary", "attested", "keystone", "chips", "firmware"]);
const SOCKETS: Socket[] = ["muzzle", "kinetic", "protocol"];

export function validateLoadout(raw: unknown, owned: readonly string[], depth: number, ranks: Ranks = {}): { ok: boolean; errors: LoadoutError[]; loadout: Loadout } {
  const errors: LoadoutError[] = [];
  const lo = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  for (const k of Object.keys(lo)) if (!KNOWN_FIELDS.has(k)) errors.push({ rule: "unknown-field", detail: `field "${k}" is not part of a PvP loadout` });
  const primary = typeof lo.primary === "string" && lo.primary in WEAPONS ? (lo.primary as WeaponId) : null;
  const secondary = typeof lo.secondary === "string" && lo.secondary in WEAPONS ? (lo.secondary as WeaponId) : null;
  if (!primary) errors.push({ rule: "weapon", detail: `unknown primary ${String(lo.primary)}` });
  if (!secondary) errors.push({ rule: "weapon", detail: `unknown secondary ${String(lo.secondary)}` });
  for (const w of [primary, secondary]) if (w && WEAPON_DEPTH[w] > depth) errors.push({ rule: "weapon-depth", detail: `${w} needs Depth ${WEAPON_DEPTH[w]} (you are ${depth})` });
  for (const w of [primary, secondary]) if (w && CAMPAIGN_WEAPONS.includes(w) && !owned.includes(`weapon:${w}`)) errors.push({ rule: "weapon-locked", detail: `${w} unlocks in the campaign` });
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
  // chips: one per socket, for that weapon, unlocked by its mastery rank
  const chips: Loadout["chips"] = {};
  if (lo.chips !== undefined) {
    if (!lo.chips || typeof lo.chips !== "object" || Array.isArray(lo.chips)) errors.push({ rule: "chips-shape", detail: "chips must map weapon → socket → chip id" });
    else {
      for (const [wid, slots] of Object.entries(lo.chips as Record<string, unknown>)) {
        if (!(wid in WEAPONS)) {
          errors.push({ rule: "chip-weapon", detail: `unknown weapon ${wid}` });
          continue;
        }
        if (!slots || typeof slots !== "object" || Array.isArray(slots)) {
          errors.push({ rule: "chips-shape", detail: `${wid}: sockets must be an object` });
          continue;
        }
        const out: ChipSlots = {};
        for (const [socket, id] of Object.entries(slots as Record<string, unknown>)) {
          if (!SOCKETS.includes(socket as Socket)) {
            errors.push({ rule: "chip-socket", detail: `${wid}: no socket "${socket}"` });
            continue;
          }
          if (id === null || id === undefined) continue;
          if (typeof id !== "string") {
            errors.push({ rule: "chip-shape", detail: `${wid}.${socket}: chip must be an id` });
            continue;
          }
          const c = chipById(id);
          if (!c) errors.push({ rule: "unknown-chip", detail: id });
          else if (c.weapon !== wid) errors.push({ rule: "chip-weapon", detail: `${id} is a ${c.weapon} chip` });
          else if (c.socket !== socket) errors.push({ rule: "chip-socket", detail: `${id} is a ${c.socket} chip, not ${socket}` });
          else if ((ranks[wid as WeaponId] ?? 1) < c.rank) errors.push({ rule: "chip-rank", detail: `${id} needs ${wid} mastery ${c.rank} (you are ${ranks[wid as WeaponId] ?? 1})` });
          else out[socket as Socket] = id;
        }
        chips[wid as WeaponId] = out;
      }
    }
  }
  const firmware: Loadout["firmware"] = {};
  if (lo.firmware !== undefined) {
    if (!lo.firmware || typeof lo.firmware !== "object" || Array.isArray(lo.firmware)) errors.push({ rule: "firmware-shape", detail: "firmware must map weapon → firmware id" });
    else {
      for (const [wid, id] of Object.entries(lo.firmware as Record<string, unknown>)) {
        if (id === null || id === undefined) continue;
        if (!(wid in WEAPONS)) {
          errors.push({ rule: "firmware-weapon", detail: `unknown weapon ${wid}` });
          continue;
        }
        if (typeof id !== "string") {
          errors.push({ rule: "firmware-shape", detail: `${wid}: firmware must be an id` });
          continue;
        }
        const f = firmwareById(id);
        if (!f) errors.push({ rule: "unknown-firmware", detail: id });
        else if (f.weapon !== wid) errors.push({ rule: "firmware-weapon", detail: `${id} is a ${f.weapon} firmware` });
        else if ((ranks[wid as WeaponId] ?? 1) < f.rank) errors.push({ rule: "firmware-rank", detail: `${id} needs ${wid} mastery ${f.rank} (you are ${ranks[wid as WeaponId] ?? 1})` });
        else firmware[wid as WeaponId] = id;
      }
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    loadout: { primary: primary ?? "lease_breaker", secondary: secondary ?? "shock_baton", attested: [...set], keystone, chips, firmware },
  };
}

/** What a weapon becomes under a loadout: its (firmware-patched) definition, chip mods, and mechanics. */
export interface WeaponKit {
  def: WeaponDef;
  mods: StatSheet;
  mechanics: ChipMechanic[];
}

export function kitFor(loadout: Loadout): Record<WeaponId, WeaponKit> {
  const out = {} as Record<WeaponId, WeaponKit>;
  for (const w of WEAPON_LIST) {
    const def = weaponWithFirmware(w.id, loadout.firmware?.[w.id]);
    let mods = baseSheet();
    const mechanics: ChipMechanic[] = [];
    for (const id of Object.values(loadout.chips?.[w.id] ?? {})) {
      const c = id ? chipById(id) : undefined;
      if (!c) continue;
      mods = applyMods(mods, [...c.benefits, ...c.costs]);
      if (c.mechanic) mechanics.push(c.mechanic);
    }
    out[w.id] = { def, mods, mechanics };
  }
  return out;
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
  for (const slots of Object.values(loadout.chips ?? {})) {
    for (const id of Object.values(slots ?? {})) {
      const c = id ? chipById(id) : undefined;
      if (!c) continue;
      for (const m of c.benefits) d += modWeight(m);
      for (const m of c.costs) d -= modWeight(m);
      if (c.mechanic) d += 3;
    }
  }
  return d;
}
