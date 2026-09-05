/** Scrip: soft, off-chain, buys Ledger Graph nodes. Wakelight: prestige only. Salvage: crafting input. */
export const SCRIP_PER_XP = 0.12;
export const NODE_REFUND = 0.5;

export interface Wallet {
  scrip: number;
  wakelight: number;
  salvage: number;
}

export const emptyWallet = (): Wallet => ({ scrip: 0, wakelight: 0, salvage: 0 });

export function scripForMatch(xp: number, salvageMult = 1): { scrip: number; salvage: number } {
  return { scrip: Math.round(xp * SCRIP_PER_XP), salvage: Math.round((xp / 400) * salvageMult) };
}
