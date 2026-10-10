/**
 * One scrip skill. It changes the Neon Edge in a fight.
 * It does not raise max health, and it does not touch any other gun.
 */
import type { Account } from "../progression/account";
import { campaignOf } from "../campaign/save";

export const DRILL_SCRIP = 400;

/** Spend 400 scrip once. Already drilled, or short, spends nothing. */
export function buyEdgeDrill(a: Account): { ok: boolean; reason?: string } {
  const c = campaignOf(a);
  if (c.edgeDrill) return { ok: false, reason: "ALREADY DRILLED" };
  if (a.wallet.scrip < DRILL_SCRIP) return { ok: false, reason: "NEEDS SCRIP" };
  a.wallet.scrip -= DRILL_SCRIP;
  c.edgeDrill = true;
  return { ok: true };
}
