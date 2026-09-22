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
import type { Account } from "../progression/account";

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
  /**
   * An optional asset id for the rig's plate (Stage 43). Cosmetic like the tint beside it: the
   * renderer looks it up, the sim never sees it, and a skin with no texture — or one whose file
   * fails to load — falls back to the tint alone, which is what every skin did before this existed.
   */
  texture?: string;
}

const skin = (token: number, id: string, name: string, line: string, capital: number, wearSeed: number, tint: string, texture?: string): SkinDef => ({ token, id, name, line, capital, wearSeed, tint, ...(texture ? { texture } : {}) });

export const SKINS: readonly SkinDef[] = [
  skin(1, "skin_rust", "RUST LEASE", "A RIG THAT HAS BEEN RAINED ON SINCE THE ESTATE STOPPED COUNTING", 40, 0x5a17, "#d86a2a", "skin_rust_plate"),
  skin(2, "skin_phosphor", "PHOSPHOR TRIM", "THE FIRST CRT'S GREEN ON EVERY EDGE", 60, 0x1b3f, "#5cff9a", "skin_phosphor_plate"),
  skin(3, "skin_kernel", "KERNEL PLATE", "RED FILAMENT WITHOUT THE FILAMENT", 120, 0x77e1, "#ff2a4a", "skin_kernel_plate"),
  skin(4, "skin_deadletter", "DEADLETTER WHITE", "THE OFFICE'S OWN PAINT, CUT FROM A SEALED DOOR", 200, 0x0c02, "#f2f4ff", "skin_deadletter_plate"),
  skin(5, "skin_wake", "WAKE TRIM", "GREEN EDGE-LIGHT ON WET STEEL, THE COLOUR A NODE GOES WHEN IT FLIPS", 50, 0x3e91, "#37ff8b", "skin_wake_plate"),
  skin(6, "skin_estate", "ESTATE PLATE", "CYAN ANODIZED LEDGER-GRID, THE CONTRACTOR'S OWN PAINT", 70, 0x11d8, "#35f2ff", "skin_estate_plate"),
  skin(7, "skin_clockeater", "CLOCKEATER BRASS", "GEARS THAT RUN FASTER THAN THE CITY CAN COUNT", 90, 0xa2c4, "#ffd27a", "skin_clockeater_plate"),
  skin(8, "skin_ledger", "LEDGER BREAK", "MAGENTA STAMP OVER A CRT THAT STILL SAYS PENDING", 110, 0x6f0b, "#ff3ec9", "skin_ledger_plate"),
  skin(9, "skin_vantage", "VANTAGE AMBER", "CONTRACTOR CHEVRONS, THE COLOUR OF A SEARCHLIGHT", 80, 0x4c2a, "#ffb02e", "skin_vantage_plate"),
  skin(10, "skin_blank", "UNLISTED BLACK", "NEAR-BLACK, ONE PINHOLE OF CYAN", 45, 0x90e1, "#35f2ff", "skin_blank_plate"),
  skin(11, "skin_rain", "RAIN LEASE", "ANODIZED BLACK THAT NEVER DRIED", 55, 0x2b17, "#8fd8ff", "skin_rain_plate"),
  skin(12, "skin_metro", "METRO PLATE", "GREY-GREEN TUNNEL TILE, CYAN BARS", 75, 0x71a0, "#37ff8b", "skin_metro_plate"),
  skin(13, "skin_violet", "ECHO VIOLET", "GHOSTING PLATE, SHORT-RANGE WALLSENSE LOOK", 95, 0x5d33, "#8f4dff", "skin_violet_plate"),
  skin(14, "skin_forged", "FORGED TRIM", "AMBER SERVO LIGHT ON WET STEEL", 85, 0x18c4, "#ffb02e", "skin_amber_trim"),
  skin(15, "skin_grid", "ESTATE GRID", "CYAN MONITOR GRID", 65, 0x0e91, "#35f2ff", "skin_cyan_grid"),
  skin(16, "skin_black_lease", "BLACK LEASE", "CRT PHOSPHOR ON A SEALED FILE", 100, 0x6a0b, "#7dffb0", "skin_black_lease"),
  skin(17, "skin_phage", "PHAGE PLATE", "GREEN-BLACK CONTAGION PAINT, THE LAUNCHER'S OWN STAIN", 88, 0x4e2c, "#37ff8b", "skin_phage_plate"),
  skin(18, "skin_longwave", "LONGWAVE ICE", "COLD CYAN RAIL, THE COLOUR A CHARGE HOWLS", 105, 0x7b19, "#8fd8ff", "skin_longwave_plate"),
  skin(19, "skin_hammer", "HAMMER RUST", "SHOTGUN STEEL THAT NEVER LEFT THE RAIN", 72, 0x2c80, "#e0561e", "skin_hammer_plate"),
  skin(20, "skin_baton", "BATON VIOLET", "SHOCK-VIOLET TRIM ON A CLOSE-IN STICK", 68, 0x91d4, "#8f4dff", "skin_baton_plate"),
  skin(21, "skin_stack", "STACK PLATE", "STACKED POLYMER, THE SMG'S OWN RAIN", 58, 0x3a55, "#37ff8b", "tex_smg_stack"),
  skin(22, "skin_directive", "DIRECTIVE CORE", "RED FILAMENT ON THE OPTIC, THE LEASE THAT NEVER MISSED", 130, 0x8c12, "#ff2a4a", "tex_directive_core"),
  skin(23, "skin_breaker", "LEASE STEEL", "ANODIZED SHOTGUN STEEL, AMBER CHEVRONS IN THE RAIN", 78, 0x1f70, "#ffb02e", "tex_lease_steel"),
  skin(24, "skin_arc", "ARC VIOLET", "SHOCK-ARC PLATE, THE BATON'S OWN LIGHT", 82, 0x62aa, "#8f4dff", "tex_shock_arc"),
  skin(25, "skin_chevron", "REPO CHEVRON", "CONTRACTOR HAZARD STRIPES, THE SHOTGUN'S OWN RAIN", 76, 0x51c8, "#ffb02e", "tex_repo_chevron"),
  skin(26, "skin_filament", "LONGWAVE FILAMENT", "CYAN WAVE-TRACES ON BLACK ALLOY, THE RAIL'S OWN HOWL", 108, 0x0af3, "#35f2ff", "tex_longwave_filament"),
  skin(27, "skin_vein", "PHAGE VEIN", "IRIDESCENT SPORE-VEIN POLYMER, THE LAUNCHER'S OWN STAIN", 92, 0x7e46, "#37ff8b", "tex_phage_vein"),
  skin(28, "skin_gear", "CLOCK GEAR", "BRASS GEARS ON WET STEEL, FASTER THAN THE CITY CAN COUNT", 98, 0x2d9b, "#ffd27a", "tex_clock_gear"),
];

/**
 * What a Deep Wake pass grants (Stage 19). Off-chain on purpose: the pass is burned, and what it
 * hands back is not resellable — a season pass that minted a tradable token would turn the game's
 * biggest sink into a trading vehicle, and "no wagering or staking mechanics of any kind" is a rule
 * the brief states first. They are a theme and two slots: no stat, no token, nothing the sim reads.
 * The lint's `identity-is-cosmetic` rule refuses a mechanical block on any of them.
 */
export const SEASON_PASS_COSMETICS: readonly {
  id: string;
  kind: "theme" | "alias" | "preset";
  name: string;
  line: string;
  palette?: { cy: string; gr: string; mg: string; ye: string; am: string };
}[] = [
  { id: "theme_deep_wake", kind: "theme", name: "DEEP WAKE", line: "THE COLOUR THE GRAPH GOES WHEN A SEASON ENDS AND NOBODY WINS", palette: { cy: "#7ad4ff", gr: "#4aa8a0", mg: "#b070e8", ye: "#d4dde8", am: "#7c90b0" } },
  { id: "alias_4", kind: "alias", name: "ALIAS SLOT IV", line: "A FOURTH SAVED NAME, FOR THE SEASON YOU PAID TO SIT OUT OF" },
  { id: "preset_6", kind: "preset", name: "PRESET SLOT VI", line: "a sixth saved loadout" },
] as const;

export const SEASON_PASS_GRANTS: readonly string[] = SEASON_PASS_COSMETICS.map((c) => c.id);

/** HUD palette for a pass theme. Shop themes live on COSMETICS; this is the 400 $CAPITAL grant. */
export function passThemePalette(id: string | null | undefined): { cy: string; gr: string; mg: string; ye: string; am: string } | null {
  if (!id) return null;
  const c = SEASON_PASS_COSMETICS.find((x) => x.id === id);
  return c?.kind === "theme" ? c.palette ?? null : null;
}

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

/**
 * Put a held Deep Wake pass's grants on the file (Stage 176).
 *
 * The pass is the game's largest sink: 400 $CAPITAL, burned, for a theme and two slots. Until this
 * existed the counter-ledger wrote those three ids to `a.owned` — the progression list for nodes,
 * chips and weapons — and every consumer of them reads `a.cosmetics`. The theme would not apply
 * and both slots stayed locked. Idempotent, because a reconcile runs on every counter refresh.
 */
export function grantSeasonPass(a: Account): string[] {
  a.cosmetics = a.cosmetics ?? [];
  const added: string[] = [];
  for (const c of SEASON_PASS_COSMETICS) if (!a.cosmetics.includes(c.id)) { a.cosmetics.push(c.id); added.push(c.id); }
  return added;
}
