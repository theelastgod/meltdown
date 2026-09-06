/**
 * REWRITE: prestige at Depth 50. Burn the file — XP, Depth, Scrip, the
 * nodes and the loadout go — keep the stamps and the glyph's age, earn
 * Wakelight. Wakelight buys CRT themes, alias slots and preset slots.
 * Never power: nothing here touches a stat.
 */
import type { Account } from "../progression/account";
import { DEFAULT_LOADOUT } from "../manifest/loadout";
import { emptyMasteries } from "../progression/mastery";
import { MAX_DEPTH } from "../progression/depth";

export const REWRITE_WAKELIGHT = 500;

export interface CosmeticDef {
  id: string;
  kind: "theme" | "alias" | "preset";
  name: string;
  line: string;
  wakelight: number;
  /** themes: the HUD palette (cyan, green, magenta, yellow, amber) */
  palette?: { cy: string; gr: string; mg: string; ye: string; am: string };
}

export const COSMETICS: readonly CosmeticDef[] = [
  { id: "theme_phosphor", kind: "theme", name: "PHOSPHOR", line: "green-on-black terminal, the first CRT you ever saw", wakelight: 120, palette: { cy: "#7dffb0", gr: "#37ff8b", mg: "#c8ff5a", ye: "#e9ffb0", am: "#9dff6e" } },
  { id: "theme_amber", kind: "theme", name: "AMBER", line: "the Estate's own monitors", wakelight: 120, palette: { cy: "#ffd27a", gr: "#ffb02e", mg: "#ff8a3c", ye: "#ffe34a", am: "#ff9a1e" } },
  { id: "theme_ice", kind: "theme", name: "ICE", line: "Deadletter Docks in January", wakelight: 160, palette: { cy: "#bfefff", gr: "#8fd8ff", mg: "#d9b8ff", ye: "#ffffff", am: "#a8c8ff" } },
  { id: "theme_bloodline", kind: "theme", name: "BLOODLINE", line: "Kernel red on black; for files that have taken the chair", wakelight: 300, palette: { cy: "#ff6b7a", gr: "#ff1e3c", mg: "#ff3ec9", ye: "#ffd6da", am: "#ff5a3c" } },
  { id: "alias_2", kind: "alias", name: "ALIAS SLOT II", line: "a second saved name the city may call you", wakelight: 90 },
  { id: "alias_3", kind: "alias", name: "ALIAS SLOT III", line: "a third", wakelight: 140 },
  { id: "preset_2", kind: "preset", name: "PRESET SLOT II", line: "a second saved loadout", wakelight: 60 },
  { id: "preset_3", kind: "preset", name: "PRESET SLOT III", line: "a third", wakelight: 90 },
  { id: "preset_4", kind: "preset", name: "PRESET SLOT IV", line: "a fourth", wakelight: 120 },
  { id: "preset_5", kind: "preset", name: "PRESET SLOT V", line: "a fifth", wakelight: 160 },
];

export const cosmeticById = (id: string): CosmeticDef | undefined => COSMETICS.find((c) => c.id === id);

export function canRewrite(a: Account): { ok: boolean; reason?: string } {
  if (a.depth < MAX_DEPTH) return { ok: false, reason: `Depth ${a.depth} — Rewrite opens at ${MAX_DEPTH}` };
  return { ok: true };
}

/** Burn the file. Keeps: id, name, stamps, counters (the glyph's age), moniker, chapters, cosmetics, campaign. */
export function rewrite(a: Account): { ok: boolean; reason?: string; wakelight?: number } {
  const can = canRewrite(a);
  if (!can.ok) return can;
  a.rewrites = (a.rewrites ?? 0) + 1;
  a.xp = 0;
  a.depth = 1;
  a.wallet.scrip = 0;
  a.wallet.salvage = 0;
  a.owned = a.owned.filter((id) => id.startsWith("weapon:")); // campaign weapon unlocks are earned, not bought
  a.loadout = { ...DEFAULT_LOADOUT, attested: [], keystone: null, chips: {}, firmware: {} };
  a.mastery = emptyMasteries();
  a.wears = [];
  a.matches = 0;
  a.debt = null;
  a.wallet.wakelight += REWRITE_WAKELIGHT;
  a.counters["rewrites"] = a.rewrites;
  a.ledger.push(`REWRITE ${a.rewrites} · THE FILE BURNS · ${a.stamps.length} STAMPS KEPT · +${REWRITE_WAKELIGHT} WAKELIGHT`);
  return { ok: true, wakelight: REWRITE_WAKELIGHT };
}

/** Slots a file has: one alias and one preset for free, more from the shop. */
export function slotsOf(a: Account): { aliases: number; presets: number } {
  const owned = a.cosmetics ?? [];
  return { aliases: 1 + owned.filter((id) => id.startsWith("alias_")).length, presets: 1 + owned.filter((id) => id.startsWith("preset_")).length };
}

export function buyCosmetic(a: Account, id: string): { ok: boolean; reason?: string } {
  const c = cosmeticById(id);
  if (!c) return { ok: false, reason: "unknown cosmetic" };
  a.cosmetics = a.cosmetics ?? [];
  if (a.cosmetics.includes(id)) return { ok: false, reason: "already owned" };
  // slots come in order
  if (c.kind !== "theme") {
    const n = Number(id.split("_")[1]);
    if (n > 2 && !a.cosmetics.includes(`${c.kind}_${n - 1}`)) return { ok: false, reason: `needs ${c.kind} slot ${n - 1} first` };
  }
  if (a.wallet.wakelight < c.wakelight) return { ok: false, reason: `needs ${c.wakelight} Wakelight` };
  a.wallet.wakelight -= c.wakelight;
  a.cosmetics.push(id);
  a.ledger.push(`WAKELIGHT · ${c.name} · −${c.wakelight}`);
  return { ok: true };
}

export function setTheme(a: Account, id: string | null): boolean {
  if (id && !(a.cosmetics ?? []).includes(id)) return false;
  a.theme = id;
  return true;
}

/** Save a loadout preset into an owned slot (raw JSON; validated like any loadout when it is applied). */
export function savePreset(a: Account, slot: number, name: string, loadout: unknown): { ok: boolean; reason?: string } {
  const slots = slotsOf(a).presets;
  if (slot < 1 || slot > slots) return { ok: false, reason: `slot ${slot} not owned (${slots} slots)` };
  a.presets = a.presets ?? [];
  a.presets[slot - 1] = { name: String(name).slice(0, 24).toUpperCase() || `PRESET ${slot}`, loadout: JSON.parse(JSON.stringify(loadout ?? {})) };
  return { ok: true };
}

export function setAlias(a: Account, slot: number, alias: string): { ok: boolean; reason?: string } {
  const slots = slotsOf(a).aliases;
  if (slot < 1 || slot > slots) return { ok: false, reason: `slot ${slot} not owned (${slots} slots)` };
  const clean = alias.replace(/[^\x20-\x7e]/g, "").trim().slice(0, 16).toUpperCase();
  if (!clean) return { ok: false, reason: "empty alias" };
  a.aliases = a.aliases ?? [];
  a.aliases[slot - 1] = clean;
  return { ok: true };
}
