/**
 * The desk sells the Neon Edge for scrip. The sword already exists.
 * Scrip does not buy a stat, and this does not add a weapon slot.
 */
import type { Account } from "../progression/account";
import { campaignOf } from "../campaign/save";

export const EDGE_SCRIP = 600;

/** Spend 600 scrip once for neon_edge. Already owned, or short, spends nothing. */
export function buyNeonEdge(a: Account): { ok: boolean; reason?: string } {
  const c = campaignOf(a);
  if (c.weapons.includes("neon_edge")) return { ok: false, reason: "ALREADY OWNED" };
  if (a.wallet.scrip < EDGE_SCRIP) return { ok: false, reason: "NEEDS SCRIP" };
  a.wallet.scrip -= EDGE_SCRIP;
  c.weapons.push("neon_edge");
  const item = "weapon:neon_edge";
  if (!a.owned.includes(item)) a.owned.push(item);
  return { ok: true };
}
