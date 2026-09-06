/**
 * The full economy manifest: every item the game has, in the one shape the lint understands.
 * Progression items (nodes, keystones, chips, firmwares) carry their mechanical trades and no
 * market. Wakelight cosmetics (Stage 11) carry neither a stat nor a market — they are off-chain
 * prestige. The $CAPITAL items below are the only things that touch the chain, and none of them has
 * a mechanical block: `lintEconomy(economyManifest())` runs in CI.
 */
import { ALL_ITEMS } from "../manifest/items";
import { CHIPS } from "../manifest/chips";
import { FIRMWARES } from "../manifest/firmwares";
import { COSMETICS } from "../endgame/rewrite";
import type { EconomyItem, MarketBlock } from "./manifest";
import { ROOM_HOUR_PRICE, SEASON_PASS_PRICE } from "./sinks";

/** An on-chain cosmetic: an ERC-1155 token id, a $CAPITAL price, a wear seed, and a palette the renderer tints with. Nothing else. */
export interface SkinDef {
  /** ERC-1155 token id (the only thing that travels in a match snapshot) */
  token: number;
  id: string;
  name: string;
  line: string;
  capital: number;
  /** the deterministic wear seed the metadata carries */
  wearSeed: number;
  /** tint for the rig: remote body emissive + the local viewmodel strip */
  tint: string;
}

const skin = (token: number, id: string, name: string, line: string, capital: number, wearSeed: number, tint: string): SkinDef => ({ token, id, name, line, capital, wearSeed, tint });

export const SKINS: readonly SkinDef[] = [
  skin(1, "skin_rust", "RUST LEASE", "a rig that has been rained on since the Estate stopped counting", 40, 0x5a17, "#d86a2a"),
  skin(2, "skin_phosphor", "PHOSPHOR TRIM", "the first CRT's green on every edge", 60, 0x1b3f, "#5cff9a"),
  skin(3, "skin_kernel", "KERNEL PLATE", "red filament without the filament", 120, 0x77e1, "#ff2a4a"),
  skin(4, "skin_deadletter", "DEADLETTER WHITE", "the office's own paint, cut from a sealed door", 200, 0x0c02, "#f2f4ff"),
];

/**
 * What a Deep Wake pass grants (Stage 19). Off-chain on purpose: the pass is burned, and what it
 * hands back is not resellable — a season pass that minted a tradable token would turn the game's
 * biggest sink into a trading vehicle, and "no wagering or staking mechanics of any kind" is a rule
 * the brief states first. They are a theme and two slots: no stat, no token, nothing the sim reads.
 * The lint's `identity-is-cosmetic` rule refuses a mechanical block on any of them.
 */
export const SEASON_PASS_COSMETICS: readonly { id: string; kind: "theme" | "alias" | "preset"; name: string; line: string }[] = [
  { id: "theme_deep_wake", kind: "theme", name: "DEEP WAKE", line: "the colour the graph goes when a season ends and nobody wins" },
  { id: "alias_4", kind: "alias", name: "ALIAS SLOT IV", line: "a fourth saved name, for the season you paid to sit out of" },
  { id: "preset_6", kind: "preset", name: "PRESET SLOT VI", line: "a sixth saved loadout" },
] as const;

export const SEASON_PASS_GRANTS: readonly string[] = SEASON_PASS_COSMETICS.map((c) => c.id);

export const skinByToken = (token: number): SkinDef | undefined => SKINS.find((s) => s.token === token);
export const skinById = (id: string): SkinDef | undefined => SKINS.find((s) => s.id === id);

const onChain = (capital: number, tradable: boolean, randomness: MarketBlock["randomness"] = "none"): MarketBlock => ({ capital, onChain: true, tradable, randomness });

/** Everything, in one list. */
export function economyManifest(): EconomyItem[] {
  const out: EconomyItem[] = [];
  for (const it of ALL_ITEMS) out.push({ id: it.id, kind: it.kind, mechanical: { benefits: it.benefits, costs: it.costs }, market: null, scrip: it.cost });
  for (const c of CHIPS) out.push({ id: c.id, kind: "chip", mechanical: { benefits: c.benefits, costs: c.costs }, market: null });
  // a firmware is a sidegrade certified in band by the Fairness Lint; its trade is the patch itself, recorded here as the band
  for (const f of FIRMWARES) out.push({ id: f.id, kind: "firmware", mechanical: { benefits: [{ stat: "firmware", delta: 1 }], costs: [{ stat: "firmware", delta: -1 }] }, market: null });
  // Wakelight prestige: off-chain, never priced in $CAPITAL, never a stat
  for (const c of COSMETICS) out.push({ id: c.id, kind: c.kind === "theme" ? "theme" : "cosmetic", mechanical: null, market: null });
  for (const s of SKINS) out.push({ id: s.id, kind: "cosmetic", mechanical: null, market: onChain(s.capital, true, "wear_seed") });
  out.push({ id: "name_registry", kind: "name", mechanical: null, market: onChain(150, false) });
  out.push({ id: "room_hour", kind: "room_credit", mechanical: null, market: onChain(ROOM_HOUR_PRICE, false) });
  out.push({ id: "lease_buyout", kind: "season_buyout", mechanical: null, market: onChain(SEASON_PASS_PRICE, false) });
  // what the pass hands back: cosmetics only, and not on chain, so the pass cannot be resold
  for (const c of SEASON_PASS_COSMETICS) out.push({ id: c.id, kind: c.kind === "theme" ? "theme" : "cosmetic", mechanical: null, market: null });
  out.push({ id: "rewrite_certificate", kind: "rewrite_certificate", mechanical: null, market: { capital: null, onChain: true, tradable: false, randomness: "none" } });
  return out;
}
