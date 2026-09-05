/** The Ghostfile: a self-authored file. Hot state lives in the Player DO; durable rows in D1. */
import { depthForXp, matchXp, type MatchContribution } from "./depth";
import { emptyWallet, scripForMatch, NODE_REFUND, type Wallet } from "./currency";
import { craft, RECIPES, type CraftResult } from "./crafting";
import { DEFAULT_LOADOUT, type Loadout } from "../manifest/loadout";
import { ALL_ITEMS, itemById } from "../manifest/items";

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
}

export function createAccount(id: string, name = "BLANK"): Account {
  return { id, name, xp: 0, depth: 1, wallet: emptyWallet(), owned: [], loadout: { ...DEFAULT_LOADOUT, attested: [] }, wears: [], crafts: 0, matches: 0, ledger: [] };
}

/** Sandbox account used offline and by probes: Depth 50, every node in the file. */
export function sandboxAccount(id = "sandbox"): Account {
  const a = createAccount(id, "BLANK");
  a.depth = 50;
  a.xp = 2_000_000;
  a.wallet.scrip = 20000;
  a.owned = ALL_ITEMS.map((i) => i.id);
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
