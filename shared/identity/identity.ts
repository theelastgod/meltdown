/**
 * What others see of a file — and a scanner that proves it carries nothing
 * mechanical. The dossier flash, the over-the-head tag, the Debt banner and
 * the Chapter rite are all built from `PublicIdentity` and nothing else;
 * `mechanicalLeaks` walks any object about to leave the server on those
 * channels and names every key or value that would tell an opponent what
 * you are running. CI, the room (a dev-time guard) and the probe all use it.
 */
import { sanitizeLookCode } from "./look";
import type { Account } from "../progression/account";
import { glyphSeed } from "./glyph";
import { chapterFor, MONIKERS, monikerById, wornMoniker } from "./monikers";
import { ALL_ITEMS } from "../manifest/items";
import { CHIPS } from "../manifest/chips";
import { FIRMWARES } from "../manifest/firmwares";
import { STAT_KEYS } from "../manifest/stats";
import { WEAPON_LIST, type WeaponId } from "../weapons/manifest";
import { MAX_RANK } from "../progression/mastery";

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
  /** worn cosmetic token id (0 = none): an ID only — the palette it names lives in the client's catalog */
  skin: number;
  /**
   * The mastery finish (Stage 675) as others see it: bit i is set when the file's record on the
   * server has WEAPON_LIST[i] at the rank cap. Never taken from the client. Cosmetic: it draws the
   * inlays on the weapon in the file's hand and names nothing it is running.
   */
  finish: number;
  /** the look the file wears (Stage 689): body, build, coat, shoulder, as one code (shared/identity/look.ts). Cloth only; 0 is the Blank as it was */
  look: number;
}

/** The only keys an identity may carry on the wire. */
export const IDENTITY_KEYS: readonly string[] = ["id", "team", "glyph", "chapter", "moniker", "display", "stamps", "debt", "skin", "finish", "look"];

/** One file is FILE, not FILES. */
export function filesWord(n: number): string {
  return `${n} FILE${n === 1 ? "" : "S"}`;
}

/** One stamp is STAMP, not STAMPS. */
export function stampsWord(n: number): string {
  return `${n} STAMP${n === 1 ? "" : "S"}`;
}

export function displayName(a: Account | null, handle: string): string {
  if (!a) return handle;
  if (chapterFor(a.depth) >= 3) return a.name || handle;
  return wornMoniker(a, a.moniker)?.text ?? "BLANK";
}

export function publicIdentity(a: Account | null, handle: string, debt = false, look: number = a?.look ?? 0): PublicIdentity {
  const lk = sanitizeLookCode(look);
  if (!a) return { glyph: glyphSeed(handle), chapter: 0, moniker: null, display: handle, stamps: 0, debt, skin: 0, finish: 0, look: lk };
  return { glyph: glyphSeed(a.id), chapter: chapterFor(a.depth), moniker: wornMoniker(a, a.moniker)?.id ?? null, display: displayName(a, handle), stamps: a.stamps.length, debt, skin: a.counter?.worn ?? 0, finish: finishMask(a), look: lk };
}

/** which weapons the file's record has at the rank cap: one bit per WEAPON_LIST index */
export function finishMask(a: Account): number {
  let mask = 0;
  WEAPON_LIST.forEach((w, i) => {
    if ((a.mastery?.[w.id]?.rank ?? 1) >= MAX_RANK) mask |= 1 << i;
  });
  return mask;
}

/** whether a finish mask carries the finish for this weapon */
export function wearsFinish(mask: number, id: WeaponId): boolean {
  const i = WEAPON_LIST.findIndex((w) => w.id === id);
  return i >= 0 && ((mask >>> i) & 1) === 1;
}

/**
 * Compact wire form for the snapshot: `seed.chapter.monikerIndex.debt[.skin[.finish[.look]]]`. A
 * segment appears when it or one after it is set; the finish and the look (Stage 689) are base 36.
 */
export function identityTag(pi: PublicIdentity): string {
  const mi = pi.moniker ? MONIKERS.findIndex((m) => m.id === pi.moniker) : -1;
  const extra = [String(pi.skin), pi.finish.toString(36), (pi.look ?? 0).toString(36)];
  while (extra.length && extra[extra.length - 1] === "0") extra.pop();
  const tail = extra.length ? `.${extra.join(".")}` : "";
  return `${pi.glyph.toString(36)}.${pi.chapter}.${mi}.${pi.debt ? 1 : 0}${tail}`;
}

export function parseTag(tag: string, display: string): PublicIdentity {
  const [s, c, mi, d, sk, fin, lk] = tag.split(".");
  const idx = Number(mi ?? -1);
  return { glyph: parseInt(s ?? "0", 36) >>> 0, chapter: Number(c ?? 0) || 0, moniker: idx >= 0 ? (MONIKERS[idx]?.id ?? null) : null, display, stamps: 0, debt: d === "1", skin: Number(sk ?? 0) || 0, finish: parseInt(fin ?? "0", 36) >>> 0 || 0, look: sanitizeLookCode(parseInt(lk ?? "0", 36)) };
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
