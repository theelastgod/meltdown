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
  /**
   * The file's own secret (Stage 26). The id names the file; this proves the caller is its owner.
   * It travels in on a request and never travels out on a response: every payload bound for a
   * client goes through `publicFile` (Stage 28). The client cannot need it back, because the only
   * client that ever holds it is the one that generated it.
   */
  secret?: string;
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
  /** last known $CAPITAL balance, as a decimal string (display only) */
  capital: string;
  /** THE RUN (Stage 14): the day's banked units against the cap, units owed to the wallet, units paid out */
  run?: { day: number; banked: number; owed: number; paid: number };
  /** The sinks (Stage 19), read from the chain: Deep Wake seasons the wallet has bought out, and unspent private room-hours. */
  seasons?: number[];
  roomHours?: number;
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

/**
 * A file's own secret, issued once and held by the client beside the id.
 *
 * Before Stage 26 the id alone was enough to load a file and mutate it, and the id was published:
 * the prize board named the winning files and the dev host's `/stats` named every file in every
 * room. Anyone could read the richest file off a leaderboard and Rewrite it back to Depth 1.
 *
 * The id is a name; this is the proof. 24 characters from a 32-symbol alphabet is 120 bits, which
 * is not guessable, and it never appears in any public payload.
 */
export function newFileSecret(random: () => number = Math.random): string {
  const A = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 24; i++) out += A[Math.floor(random() * A.length)]!;
  return out;
}

/**
 * Does `presented` speak for this file?
 *
 * A file created before secrets existed has none, and the first caller to present one adopts it —
 * trust on first use. That is the honest trade for a save file: the alternative locks every
 * existing player out of their own progression to defend against an attacker who would have had to
 * arrive first. New files are created *with* a secret by the client that made them, so the window
 * only ever existed for files that predate this.
 */
export function fileAuth(a: Account, presented: string | undefined | null): { ok: boolean; adopted: boolean } {
  const have = a.secret ?? "";
  const given = (presented ?? "").trim();
  if (!have) {
    if (!given) return { ok: true, adopted: false }; // no secret either side: an anonymous file, as before
    a.secret = given.slice(0, 64);
    return { ok: true, adopted: true };
  }
  return { ok: given === have, adopted: false };
}

/**
 * What a public board may say about a file.
 *
 * A prize board has to name its winners, and it used to name them by file id — which was also the
 * credential for mutating that file. So the board published a list of the richest files and how to
 * find them. The id is now a secret's partner rather than a display name, so boards get a stable,
 * non-reversible label instead: enough for a player to recognise their own row, useless to anyone
 * else.
 */
export function publicLabel(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `FILE-${h.toString(36).toUpperCase().padStart(7, "0").slice(-7)}`;
}

/** The file as everyone but the host may see it: everything except the one field that is a credential. */
export type PublicAccount = Omit<Account, "secret">;

/**
 * The file on its way out of the host (Stage 28).
 *
 * Stage 26 gave a file a secret so that its id would be a name rather than a bearer credential. It
 * then stored that secret *in the file*, and every read path answers with the whole file — so
 * `GET /file/<id>` handed the secret to anyone who asked for it, and the gate it guarded could be
 * walked through by reading it first. The credential was published by the thing it protected.
 *
 * The rule that closes it, and the reason this is a function rather than a checklist: **the secret
 * travels in on a request and never travels out on a response.** A client cannot need it back,
 * because a client can only ever be the one that generated it. So every payload that leaves for a
 * client goes through here, and no reader has to be trusted to remember.
 *
 * The one path this must NOT be used on is the host's own writes — `PlayerFile`'s `/save` and the
 * D1 row — because those are the host talking to its own storage, and redacting there would erase
 * the secret rather than hide it. Those are server-to-server; nothing on that path reaches a
 * client.
 */
export function publicFile<T extends Account | null | undefined>(a: T): T extends Account ? PublicAccount : null {
  if (!a) return null as never;
  const { secret: _secret, ...rest } = a;
  return rest as never;
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
