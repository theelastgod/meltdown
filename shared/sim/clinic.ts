/**
 * The street clinic: scrip buys health back, never a higher maximum.
 * Not a district. Not chits. Not $CAPITAL.
 */

export const CLINIC_SCRIP = 30;
export const CLINIC_HEAL = 40;

/**
 * Spend 30 scrip to restore 40 health, clamped to maxHealth.
 * A file that cannot pay is unchanged. A file already at max health does not pay.
 * A heal that would pass the maximum stops there and still costs 30 if any health was missing.
 */
export function streetClinic(
  account: { wallet: { scrip: number } },
  health: number,
  maxHealth: number,
): { health: number; spent: number } {
  if (health >= maxHealth || account.wallet.scrip < CLINIC_SCRIP) return { health, spent: 0 };
  account.wallet.scrip -= CLINIC_SCRIP;
  return { health: Math.min(maxHealth, health + CLINIC_HEAL), spent: CLINIC_SCRIP };
}
