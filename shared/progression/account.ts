/** The Ghostfile: a self-authored file. Hot state lives in the Player DO; durable rows in D1. */
import { depthForXp, matchXp, type MatchContribution } from "./depth";
import { emptyWallet, scripForMatch, NODE_REFUND, type Wallet } from "./currency";
import { craft, RECIPES, type CraftResult } from "./crafting";
import { DEFAULT_LOADOUT, type Loadout } from "../manifest/loadout";
import { ALL_ITEMS, itemById } from "../manifest/items";
import { CURRICULA, emptyMasteries, type Mastery } from "./mastery";
import type { WeaponId } from "../weapons/manifest";

export interface Account {
  id: string;
  name: string;
  xp: number;
  depth: number;
  wallet: Wallet;
  owned: string[];
  loadout: Loadout;
  wears: string[];
  crafts: number;
  matches: number;
  /** Ghostfile ledger lines (rituals read these). */
  ledger: string[];
  /** weapon mastery per weapon (use-XP, rank, challenge counters) */
  mastery: Record<WeaponId, Mastery>;
  /** un-redacted attestation stamps (ids) and lifetime counters behind them */
  stamps: string[];
  counters: Record<string, number>;
  /** equipped moniker id (Stage 8 identity; zero gameplay effect) */
  moniker: string | null;
  /** Chapter rites already performed (1, 2, 3) */
  chapters: number[];
  /** nemesis-lite: the enemy file that killed you most last match, until you settle it */
  debt: Debt | null;
  /** social-earning velocity caps: `pair:<file>:<day>` → clears credited */
  social: Record<string, number>;
  /** range ghosts: best recorded run per range course (positions at 10 Hz) */
  ghosts: Record<string, GhostRun>;
  /** the campaign save (Stage 10): plain data; the power it names lives in shared/campaign, which the PvP room never imports */
  campaign?: CampaignRecord;
  /** endgame (Stage 11): the day's contracts, the week's Audit, Rewrite count, Wakelight cosmetics */
  daily?: { day: number; base: Record<string, number>; claimed: string[] };
  audits?: { week: number; best: number; played: number };
  rewrites?: number;
  cosmetics?: string[];
  theme?: string | null;
  presets?: { name: string; loadout: unknown }[];
  aliases?: string[];
  /** the counter-ledger (Stage 11b): wallet link, Ghostfile token, on-chain stamps, name, rig cache, worn skin — plain data, identity and ownership only */
  counter?: CounterRecord | null;
}

export interface CounterRecord {
  address: string | null;
  linkedAt: number;
  /** Ghostfile token id (0 = not minted) */
  ghostfile: number;
  /** stamp ids attested on chain */
  stamps: string[];
  name: string | null;
  /** owned cosmetic token ids, cached from the chain (equipping never waits on a read) */
  rig: number[];
  /** worn cosmetic token id (0 = none): the only thing that travels in a match snapshot */
  worn: number;
  /** last known WAKE balance, as a decimal string (display only) */
  wake: string;
}

export interface CampaignRecord {
  faction: string | null;
  testimony: Record<string, string>;
  missionsDone: string[];
  gigsDone: string[];
  protocols: string[];
  worn: string[];
  weapons: string[];
  ending: string | null;
}

export interface Debt {
  account: string;
  display: string;
  kills: number;
}

export interface GhostRun {
  level: string;
  seconds: number;
  /** flat [x, y, z, yaw] per sample at GHOST_HZ */
  samples: number[];
  at: number;
}

export const GHOST_HZ = 10;
/** the longest run a ghost keeps: two minutes at GHOST_HZ */
export const GHOST_MAX_SAMPLES = 120 * GHOST_HZ + 2;

/** A ghost run as the client posts it, checked for shape and size; null when malformed. */
export function validGhost(raw: unknown): GhostRun | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<GhostRun>;
  if (typeof r.level !== "string" || !/^[a-z_]{1,32}$/.test(r.level)) return null;
  if (typeof r.seconds !== "number" || !(r.seconds > 0.5 && r.seconds < 600)) return null;
  if (!Array.isArray(r.samples) || r.samples.length < 8 || r.samples.length % 4 !== 0 || r.samples.length > GHOST_MAX_SAMPLES * 4) return null;
  if (!r.samples.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  return { level: r.level, seconds: r.seconds, samples: r.samples.map((v) => Math.round(v * 100) / 100), at: typeof r.at === "number" ? r.at : Date.now() };
}

/** Keep a run on the file if it is the best for its course. */
export function recordGhost(a: Account, run: GhostRun): boolean {
  const cur = a.ghosts[run.level];
  if (cur && cur.seconds <= run.seconds) return false;
  a.ghosts[run.level] = run;
  a.ledger.push(`RANGE · ${run.level.toUpperCase().replace(/_/g, " ")} · ${run.seconds.toFixed(2)}s${cur ? ` (−${(cur.seconds - run.seconds).toFixed(2)}s)` : " · FIRST RUN"}`);
  return true;
}

export function createAccount(id: string, name = "BLANK"): Account {
  return { id, name, xp: 0, depth: 1, wallet: emptyWallet(), owned: [], loadout: { ...DEFAULT_LOADOUT, attested: [], chips: {}, firmware: {} }, wears: [], crafts: 0, matches: 0, ledger: [], mastery: emptyMasteries(), stamps: [], counters: {}, moniker: null, chapters: [], debt: null, social: {}, ghosts: {} };
}

/** Rows written before mastery/stamps existed come back without them. */
export function upgradeAccount(a: Partial<Account> & { id: string }): Account {
  const base = createAccount(a.id, a.name ?? "BLANK");
  const out = { ...base, ...a } as Account;
  if (!out.mastery) out.mastery = emptyMasteries();
  for (const w of Object.keys(base.mastery) as WeaponId[]) if (!out.mastery[w]) out.mastery[w] = base.mastery[w];
  if (!out.stamps) out.stamps = [];
  if (!out.counters) out.counters = {};
  if (out.moniker === undefined) out.moniker = null;
  if (!out.chapters) out.chapters = [];
  if (out.debt === undefined) out.debt = null;
  if (!out.social) out.social = {};
  if (!out.ghosts) out.ghosts = {};
  if (out.rewrites === undefined) out.rewrites = 0;
  if (!out.cosmetics) out.cosmetics = [];
  if (out.theme === undefined) out.theme = null;
  if (!out.presets) out.presets = [];
  if (!out.aliases) out.aliases = [];
  if (out.counter === undefined) out.counter = null;
  if (!out.loadout.chips) out.loadout.chips = {};
  if (!out.loadout.firmware) out.loadout.firmware = {};
  return out;
}

/** Mastery ranks as the loadout validator wants them. */
export function ranksOf(a: Account): Partial<Record<WeaponId, number>> {
  const out: Partial<Record<WeaponId, number>> = {};
  for (const [w, m] of Object.entries(a.mastery)) out[w as WeaponId] = m.rank;
  return out;
}

/** Sandbox account used offline and by probes: Depth 50, every node in the file. */
export function sandboxAccount(id = "sandbox"): Account {
  const a = createAccount(id, "BLANK");
  a.depth = 50;
  a.xp = 2_000_000;
  a.wallet.scrip = 20000;
  a.owned = [...ALL_ITEMS.map((i) => i.id), "weapon:directive", "weapon:clockeater"];
  for (const [w, m] of Object.entries(a.mastery)) {
    // rank 30 holds only past every gate: the sandbox has done the whole curriculum
    m.rank = 30;
    m.xp = 70000;
    m.done = (CURRICULA[w as WeaponId] ?? []).map((c) => c.id);
  }
  return a;
}

export interface LedgerEntry {
  xp: ReturnType<typeof matchXp>;
  scrip: number;
  salvage: number;
  depthBefore: number;
  depthAfter: number;
  lines: string[];
}

/** Apply a match result: XP, Depth, Scrip, salvage, ledger lines. Deterministic. */
export function applyMatch(a: Account, c: MatchContribution): LedgerEntry {
  const xp = matchXp(c);
  const { scrip, salvage } = scripForMatch(xp.total);
  const depthBefore = a.depth;
  a.xp += xp.total;
  a.depth = depthForXp(a.xp);
  a.wallet.scrip += scrip;
  a.wallet.salvage += salvage;
  a.matches++;
  const lines = [
    `MATCH ${String(a.matches).padStart(4, "0")} · ${c.won ? "WOKE" : "LEASED"}`,
    `OBJECTIVE ${xp.objective} · COMBAT ${xp.combat} · SUPPORT ${xp.support}`,
    `XP +${xp.total} · SCRIP +${scrip} · SALVAGE +${salvage}`,
  ];
  if (a.depth > depthBefore) lines.push(`DEPTH ${depthBefore} → ${a.depth}`);
  a.ledger.push(...lines);
  return { xp, scrip, salvage, depthBefore, depthAfter: a.depth, lines };
}

export function buyNode(a: Account, id: string, discount = 1): { ok: boolean; reason?: string } {
  const it = itemById(id);
  if (!it) return { ok: false, reason: "unknown item" };
  if (a.owned.includes(id)) return { ok: false, reason: "already in your file" };
  if (a.depth < it.requiresDepth) return { ok: false, reason: `needs Depth ${it.requiresDepth}` };
  const price = Math.round(it.cost * discount);
  if (a.wallet.scrip < price) return { ok: false, reason: `needs ${price} Scrip` };
  a.wallet.scrip -= price;
  a.owned.push(id);
  a.ledger.push(`BOUGHT ${it.name} · −${price} SCRIP`);
  return { ok: true };
}

export function refundNode(a: Account, id: string): { ok: boolean; reason?: string } {
  const it = itemById(id);
  if (!it || !a.owned.includes(id)) return { ok: false, reason: "not in your file" };
  a.owned = a.owned.filter((x) => x !== id);
  a.loadout.attested = a.loadout.attested.filter((x) => x !== id);
  if (a.loadout.keystone === id) a.loadout.keystone = null;
  a.wallet.scrip += Math.round(it.cost * NODE_REFUND);
  return { ok: true };
}

export function craftFor(a: Account, recipeId: string): CraftResult | { error: string } {
  const r = RECIPES.find((x) => x.id === recipeId);
  if (!r) return { error: "unknown recipe" };
  if (a.wallet.salvage < r.salvage || a.wallet.scrip < r.scrip) return { error: "insufficient salvage or Scrip" };
  a.wallet.salvage -= r.salvage;
  a.wallet.scrip -= r.scrip;
  a.crafts++;
  const out = craft(recipeId, a.id, a.crafts)!;
  if (out.output.kind === "wear") a.wears.push(`${out.output.id}#${out.output.wearSeed.toString(16)}`);
  return out;
}
