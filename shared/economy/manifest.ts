/**
 * Economy manifest shapes. Shared by client, server, and CI so the fairness
 * doctrine is a type and a lint, not a convention. See docs/TOKENOMICS.md.
 */

export const CAPITAL = {
  symbol: "CAPITAL",
  name: "$CAPITAL",
  decimals: 18,
  /** Fixed cap: 1,000,000,000 $CAPITAL, minted once at genesis. */
  cap: 1_000_000_000n * 10n ** 18n,
  /** Ledger Market fee in basis points and its split. */
  marketFeeBps: 500,
  marketFeeSplit: { burnBps: 200, treasuryBps: 200, creatorBps: 100 },
  /** Forge primary sale split. */
  forgeSplit: { creatorBps: 7000, treasuryBps: 2000, burnBps: 1000 },
  /** Emission schedule: year-1 amount, yearly decay, years. */
  emissions: { year1: 97_000_000n * 10n ** 18n, decay: 0.75, years: 8 },
} as const;

/** Allocation of the fixed supply, in basis points (sums to 10_000). */
export const ALLOCATION = {
  emissions: 3500,
  treasury: 2000,
  creatorFund: 1500,
  team: 1500,
  investors: 1000,
  launchDistribution: 500,
} as const;

/** Every item kind that can appear in any manifest. */
export type ItemKind =
  // progression (Scrip, off-chain, never priced in $CAPITAL)
  | "node"
  | "chip"
  | "keystone"
  | "firmware"
  // campaign-only power: lives in the Kernel Protocols module and never here
  | "kernel_protocol"
  // identity and community (the only $CAPITAL-touching kinds)
  | "cosmetic"
  | "name"
  | "theme"
  | "room_credit"
  | "season_buyout"
  | "rewrite_certificate";

/** A paired trade: the Ghostfile's `+X A / −Y B`. */
export interface StatTrade {
  stat: string;
  delta: number;
}

export interface MechanicalBlock {
  benefits: StatTrade[];
  /** Must be non-empty for every PvP-legal item (a trade-less buff cannot ship). */
  costs: StatTrade[];
}

export interface MarketBlock {
  /** Price in whole $CAPITAL, or null when not sold for $CAPITAL. */
  capital: number | null;
  onChain: boolean;
  tradable: boolean;
  /** The only randomness a purchasable item may carry. */
  randomness: "none" | "wear_seed";
}

export interface EconomyItem {
  id: string;
  kind: ItemKind;
  /** null for anything with zero gameplay effect. */
  mechanical: MechanicalBlock | null;
  /** null for anything that never touches $CAPITAL or the chain. */
  market: MarketBlock | null;
  /** Scrip price, for progression items only. */
  scrip?: number;
}

export const PROGRESSION_KINDS: ReadonlySet<ItemKind> = new Set(["node", "chip", "keystone", "firmware"]);
export const CAPITAL_KINDS: ReadonlySet<ItemKind> = new Set(["cosmetic", "name", "theme", "room_credit", "season_buyout", "rewrite_certificate"]);
