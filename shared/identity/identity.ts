/**
 * What others see of a file — and a scanner that proves it carries nothing
 * mechanical. The dossier flash, the over-the-head tag, the Debt banner and
 * the Chapter rite are all built from `PublicIdentity` and nothing else;
 * `mechanicalLeaks` walks any object about to leave the server on those
 * channels and names every key or value that would tell an opponent what
 * you are running. CI, the room (a dev-time guard) and the probe all use it.
 */
import type { Account } from "../progression/account";
import { glyphSeed } from "./glyph";
import { chapterFor, MONIKERS, monikerById, wornMoniker } from "./monikers";
import { ALL_ITEMS } from "../manifest/items";
import { CHIPS } from "../manifest/chips";
import { FIRMWARES } from "../manifest/firmwares";
import { STAT_KEYS } from "../manifest/stats";
import { WEAPON_LIST } from "../weapons/manifest";

export interface PublicIdentity {
  /** glyph seed (the client regenerates the glyph from seed + chapter) */
  glyph: number;
  /** 0–3: how many Chapter rites the file has passed */
  chapter: number;
  /** equipped moniker id, if earned */
  moniker: string | null;
  /** what the killfeed prints: the moniker (or BLANK) until Chapter III, then the name */
  display: string;
  /** how many attestation stamps read in the clear — a count, never which */
  stamps: number;
  /** true when this file is the viewer's Debt (the one who killed them most last match) */
  debt: boolean;
}

/** The only keys an identity may carry on the wire. */
export const IDENTITY_KEYS: readonly string[] = ["id", "team", "glyph", "chapter", "moniker", "display", "stamps", "debt"];

export function displayName(a: Account | null, handle: string): string {
  if (!a) return handle;
  if (chapterFor(a.depth) >= 3) return a.name || handle;
  return wornMoniker(a, a.moniker)?.text ?? "BLANK";
}

export function publicIdentity(a: Account | null, handle: string, debt = false): PublicIdentity {
  if (!a) return { glyph: glyphSeed(handle), chapter: 0, moniker: null, display: handle, stamps: 0, debt };
  return { glyph: glyphSeed(a.id), chapter: chapterFor(a.depth), moniker: wornMoniker(a, a.moniker)?.id ?? null, display: displayName(a, handle), stamps: a.stamps.length, debt };
}

/** Compact wire form for the snapshot: `seed.chapter.monikerIndex.debt`. */
export function identityTag(pi: PublicIdentity): string {
  const mi = pi.moniker ? MONIKERS.findIndex((m) => m.id === pi.moniker) : -1;
  return `${pi.glyph.toString(36)}.${pi.chapter}.${mi}.${pi.debt ? 1 : 0}`;
}

export function parseTag(tag: string, display: string): PublicIdentity {
  const [s, c, mi, d] = tag.split(".");
  const idx = Number(mi ?? -1);
  return { glyph: parseInt(s ?? "0", 36) >>> 0, chapter: Number(c ?? 0) || 0, moniker: idx >= 0 ? (MONIKERS[idx]?.id ?? null) : null, display, stamps: 0, debt: d === "1" };
}

// ---------------------------------------------------------------------------
// The leak scanner.

const MECHANICAL_KEYS = new Set<string>(["loadout", "attested", "keystone", "chips", "firmware", "mastery", "rank", "ranks", "xp", "depth", "scrip", "salvage", "wakelight", "owned", "nodes", "counters", "kit", "mods", "stats", "health", "shield", "damage", "primary", "secondary", "weapon", "weapons", "ledger", "wallet", "challenges", "done", ...STAT_KEYS]);
const MECHANICAL_VALUES = new Set<string>([...ALL_ITEMS.map((i) => i.id), ...ALL_ITEMS.map((i) => i.name.toUpperCase()), ...CHIPS.map((c) => c.id), ...FIRMWARES.map((f) => f.id), ...WEAPON_LIST.map((w) => w.id), ...STAT_KEYS]);

/**
 * Every path in `obj` whose key is a mechanical field or whose string value
 * names an item, chip, firmware, weapon or stat. Empty means clean. Moniker
 * texts are exempt (a name like LEASE-BREAKER is fiction, not a loadout).
 */
export function mechanicalLeaks(obj: unknown, path = "$"): string[] {
  const out: string[] = [];
  const walk = (v: unknown, p: string, key: string | null) => {
    if (key && MECHANICAL_KEYS.has(key)) out.push(`${p}: key "${key}"`);
    if (typeof v === "string") {
      const s = v.trim();
      if (MECHANICAL_VALUES.has(s) && !monikerById(s) && !MONIKERS.some((m) => m.text === s)) out.push(`${p}: value "${s}"`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`, null));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, `${p}.${k}`, k);
  };
  walk(obj, path, null);
  return out;
}

/** Throws in development if a social payload would leak. The room calls this before every send. */
export function assertClean(obj: unknown, what: string): void {
  const leaks = mechanicalLeaks(obj);
  if (leaks.length) throw new Error(`${what} leaks mechanical data: ${leaks.join("; ")}`);
}
