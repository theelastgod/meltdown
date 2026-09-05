/**
 * Deterministic crafting: the same inputs always produce the same output.
 * The only randomness anywhere PvP-legal is the cosmetic wear seed, and it
 * is derived, not rolled.
 */
export interface Recipe {
  id: string;
  name: string;
  salvage: number;
  scrip: number;
  /** what it makes: an owned item id (chips arrive in Stage 7) or a cosmetic wear */
  output: { kind: "item" | "wear"; id: string };
}

export const RECIPES: Recipe[] = [
  { id: "wear_rust", name: "WEAR: RUST FILE", salvage: 6, scrip: 120, output: { kind: "wear", id: "rust" } },
  { id: "wear_ash", name: "WEAR: ASH LEDGER", salvage: 8, scrip: 160, output: { kind: "wear", id: "ash" } },
  { id: "wear_neon", name: "WEAR: NEON BLEED", salvage: 12, scrip: 240, output: { kind: "wear", id: "neon" } },
];

export interface CraftResult {
  recipe: string;
  output: { kind: "item" | "wear"; id: string; wearSeed: number };
  /** digest of (recipe, account, craftCount): identical inputs ⇒ identical result */
  digest: string;
}

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function craft(recipeId: string, accountId: string, craftCount: number): CraftResult | null {
  const r = RECIPES.find((x) => x.id === recipeId);
  if (!r) return null;
  const key = `${recipeId}|${accountId}|${craftCount}`;
  const digest = fnv(key).toString(16).padStart(8, "0");
  return { recipe: r.id, output: { ...r.output, wearSeed: fnv("wear:" + key) }, digest };
}
