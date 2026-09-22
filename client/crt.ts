/**
 * CRT-case a reason or tag: NO WALLET, not no wallet.
 *
 * Lives outside client/counter.ts so FILE can use it without pulling viem into the first download
 * (Stage 48 / Stage 494).
 */
export function crtPhrase(s: string): string {
  return s.replace(/_/g, " ").toUpperCase();
}
